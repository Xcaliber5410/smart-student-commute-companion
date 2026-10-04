/**
 * Centralized Database Connection Module
 *
 * Manages the SQLite database connection lifecycle for the Smart Student Commute Companion.
 * - Reuses existing database technology (better-sqlite3 with node:sqlite fallback).
 * - Reads validated database path from environment configuration.
 * - Enforces singleton connection to prevent duplicate connection instances or file lock contention.
 * - Configures WAL mode, busy timeout, and foreign key constraints for safe concurrency.
 * - Provides lifecycle hooks: getConnection(), closeConnection(), ping(), and getConnectionStatus().
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');

let currentDbInstance = null;
let currentDbPath = null;
let activeDriverName = null;

/**
 * Instantiates the low-level SQLite driver instance.
 * Transparently falls back to node:sqlite if better-sqlite3 native bindings are unavailable.
 *
 * @param {string} dbFilePath
 * @returns {object} Database instance with unified API
 */
function createDriverInstance(dbFilePath) {
  // Ensure target directory exists for file-based SQLite databases
  if (dbFilePath !== ':memory:') {
    const parentDir = path.dirname(dbFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  // 1. Attempt primary high-performance better-sqlite3 driver
  try {
    const BetterSqlite = require('better-sqlite3');
    const instance = new BetterSqlite(dbFilePath);
    activeDriverName = 'better-sqlite3';
    return instance;
  } catch (betterErr) {
    // 2. Fall back to Node.js built-in node:sqlite (Node 22+)
    try {
      const { DatabaseSync } = require('node:sqlite');
      const nativeDb = new DatabaseSync(dbFilePath);

      // Polyfill pragma method
      nativeDb.pragma = function (pragmaStr) {
        return this.exec(`PRAGMA ${pragmaStr};`);
      };

      // Polyfill transaction method with nested/re-entrant transaction support
      let inTx = false;
      nativeDb.transaction = function (fn) {
        return function (...args) {
          if (inTx) {
            return fn(...args);
          }
          inTx = true;
          nativeDb.exec('BEGIN TRANSACTION;');
          try {
            const result = fn(...args);
            nativeDb.exec('COMMIT;');
            return result;
          } catch (err) {
            nativeDb.exec('ROLLBACK;');
            throw err;
          } finally {
            inTx = false;
          }
        };
      };

      activeDriverName = 'node:sqlite';
      return nativeDb;
    } catch (nativeErr) {
      const errorMsg = `[Database Connection Error] Failed to initialize SQLite connection to "${dbFilePath}": ` +
        `neither 'better-sqlite3' (${betterErr.message}) nor 'node:sqlite' (${nativeErr.message}) could be loaded.`;
      const err = new Error(errorMsg);
      err.name = 'DatabaseInitializationError';
      throw err;
    }
  }
}

/**
 * Gets or creates the centralized SQLite connection singleton.
 *
 * @param {string} [customPath] - Optional override database path (e.g. for isolated test suites)
 * @returns {object} Active SQLite database instance
 */
function getConnection(customPath) {
  const targetPath = customPath || config?.database?.path || path.resolve(__dirname, 'commute.db');

  // Return existing singleton if still open and using identical target path
  if (currentDbInstance && currentDbPath === targetPath) {
    try {
      // Fast sanity check to ensure connection is open
      if (typeof currentDbInstance.open === 'boolean' && !currentDbInstance.open) {
        currentDbInstance = null;
      } else {
        return currentDbInstance;
      }
    } catch (e) {
      currentDbInstance = null;
    }
  }

  // Close previous connection if switching database paths
  if (currentDbInstance && currentDbPath !== targetPath) {
    closeConnection();
  }

  // Create new connection
  currentDbInstance = createDriverInstance(targetPath);
  currentDbPath = targetPath;

  // Apply production-grade concurrency & integrity pragmas
  try {
    currentDbInstance.pragma('journal_mode = WAL');
    currentDbInstance.pragma('busy_timeout = 5000');
    currentDbInstance.pragma('foreign_keys = ON');
    currentDbInstance.pragma('synchronous = NORMAL');
  } catch (pragmaErr) {
    console.warn(`[Database] Warning: Failed to apply PRAGMA optimizations on ${targetPath}:`, pragmaErr.message);
  }

  return currentDbInstance;
}

/**
 * Safely closes the current database connection and releases file locks.
 *
 * @returns {boolean} True if a connection was closed, false if already closed
 */
function closeConnection() {
  if (currentDbInstance) {
    try {
      if (typeof currentDbInstance.close === 'function') {
        currentDbInstance.close();
      }
    } catch (err) {
      console.warn('[Database] Warning: Exception while closing database connection:', err.message);
    } finally {
      currentDbInstance = null;
      currentDbPath = null;
      activeDriverName = null;
    }
    return true;
  }
  return false;
}

/**
 * Performs a lightweight database liveness check.
 *
 * @param {object} [dbInstance] - Optional specific DB instance to test
 * @returns {{ ok: boolean, driver: string, path: string }}
 */
function ping(dbInstance = currentDbInstance || getConnection()) {
  try {
    const row = dbInstance.prepare('SELECT 1 AS alive').get();
    if (!row || row.alive !== 1) {
      throw new Error('Database ping query returned invalid result');
    }
    return {
      ok: true,
      driver: activeDriverName || 'unknown',
      path: currentDbPath || config?.database?.path || 'unknown'
    };
  } catch (err) {
    const pingErr = new Error(`Database ping failed: ${err.message}`);
    pingErr.name = 'DatabasePingError';
    throw pingErr;
  }
}

/**
 * Returns diagnostic metadata regarding the active database connection.
 *
 * @returns {{ isConnected: boolean, path: string|null, driver: string|null, inMemory: boolean }}
 */
function getConnectionStatus() {
  const isConnected = Boolean(currentDbInstance);
  return {
    isConnected,
    path: currentDbPath,
    driver: activeDriverName,
    inMemory: currentDbPath === ':memory:'
  };
}

module.exports = {
  getConnection,
  closeConnection,
  ping,
  getConnectionStatus
};
