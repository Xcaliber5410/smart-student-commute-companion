/**
 * Centralized Database Migration Runner
 *
 * Manages schema versions, migration discovery, repeatable up/down executions, and rollbacks.
 */

const fs = require('fs');
const path = require('path');
const { getConnection } = require('../db/connection');

const SCRIPTS_DIR = path.resolve(__dirname, 'scripts');

/**
 * Ensures the migration tracking table exists.
 *
 * @param {object} db - Database connection instance
 */
function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

/**
 * Retrieves the names of all migrations that have already been applied.
 *
 * @param {object} db - Database connection instance
 * @returns {string[]} Array of applied migration names
 */
function getAppliedMigrations(db) {
  ensureMigrationTable(db);
  const rows = db.prepare('SELECT name FROM schema_migrations ORDER BY id ASC').all();
  return rows.map(r => r.name);
}

/**
 * Discovers and sorts all available migration files in the scripts directory.
 *
 * @returns {Array<{ name: string, filePath: string, up: Function, down: Function }>}
 */
function getAvailableMigrations() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  return files.map(filename => {
    const filePath = path.join(SCRIPTS_DIR, filename);
    const migration = require(filePath);
    return {
      name: migration.name || path.basename(filename, '.js'),
      filePath,
      up: migration.up,
      down: migration.down
    };
  });
}

/**
 * Executes all pending migrations.
 *
 * @param {object} [dbInstance] - Optional DB instance to run migrations on
 * @returns {{ applied: string[], totalPending: number }}
 */
function runMigrations(dbInstance) {
  const db = dbInstance || getConnection();
  ensureMigrationTable(db);

  const applied = getAppliedMigrations(db);
  const available = getAvailableMigrations();
  const pending = available.filter(m => !applied.includes(m.name));

  const appliedNames = [];

  for (const migration of pending) {
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration "${migration.name}" does not export an up() function`);
    }

    // Execute migration inside a transaction
    const executeTransaction = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
        .run(migration.name, Date.now());
    });

    executeTransaction();
    appliedNames.push(migration.name);
  }

  return {
    applied: appliedNames,
    totalPending: pending.length
  };
}

/**
 * Rolls back the most recently applied migration.
 *
 * @param {object} [dbInstance] - Optional DB instance
 * @returns {{ rolledBack: string|null }}
 */
function rollbackMigration(dbInstance) {
  const db = dbInstance || getConnection();
  ensureMigrationTable(db);

  const lastApplied = db.prepare('SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1').get();
  if (!lastApplied) {
    return { rolledBack: null };
  }

  const available = getAvailableMigrations();
  const migration = available.find(m => m.name === lastApplied.name);

  if (!migration) {
    throw new Error(`Cannot rollback: migration file for "${lastApplied.name}" was not found`);
  }

  if (typeof migration.down !== 'function') {
    throw new Error(`Migration "${migration.name}" does not export a down() function`);
  }

  const executeRollback = db.transaction(() => {
    migration.down(db);
    db.prepare('DELETE FROM schema_migrations WHERE name = ?').run(lastApplied.name);
  });

  executeRollback();

  return {
    rolledBack: lastApplied.name
  };
}

/**
 * Returns current status of all migrations.
 *
 * @param {object} [dbInstance]
 * @returns {{ applied: string[], pending: string[] }}
 */
function getMigrationStatus(dbInstance) {
  const db = dbInstance || getConnection();
  ensureMigrationTable(db);

  const applied = getAppliedMigrations(db);
  const available = getAvailableMigrations();
  const pending = available
    .filter(m => !applied.includes(m.name))
    .map(m => m.name);

  return {
    applied,
    pending
  };
}

module.exports = {
  ensureMigrationTable,
  getAppliedMigrations,
  getAvailableMigrations,
  runMigrations,
  rollbackMigration,
  getMigrationStatus
};
