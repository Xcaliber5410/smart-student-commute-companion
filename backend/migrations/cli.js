#!/usr/bin/env node
/**
 * Migration CLI Script
 *
 * Usage:
 *   node migrations/cli.js up
 *   node migrations/cli.js down
 *   node migrations/cli.js status
 */

const { runMigrations, rollbackMigration, getMigrationStatus } = require('./migrationRunner');
const { closeConnection } = require('../db/connection');

const command = process.argv[2] || 'status';

function main() {
  console.log(`[Database Migration] Executing command: ${command}`);

  try {
    switch (command.toLowerCase()) {
      case 'up':
      case 'migrate': {
        const result = runMigrations();
        if (result.applied.length === 0) {
          console.log('✅ Database is already up to date. No pending migrations.');
        } else {
          console.log(`✅ Successfully applied ${result.applied.length} migration(s):`);
          result.applied.forEach(name => console.log(`   - ${name}`));
        }
        break;
      }

      case 'down':
      case 'rollback': {
        const result = rollbackMigration();
        if (!result.rolledBack) {
          console.log('ℹ️ No applied migrations found to rollback.');
        } else {
          console.log(`✅ Successfully rolled back migration: ${result.rolledBack}`);
        }
        break;
      }

      case 'status': {
        const status = getMigrationStatus();
        console.log('--- Migration Status ---');
        console.log(`Applied (${status.applied.length}):`);
        status.applied.forEach(m => console.log(`  ✓ ${m}`));
        console.log(`Pending (${status.pending.length}):`);
        status.pending.forEach(m => console.log(`  ⏳ ${m}`));
        console.log('------------------------');
        break;
      }

      default:
        console.error(`❌ Unknown command: "${command}". Available commands: up, down, status.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    process.exit(1);
  } finally {
    closeConnection();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
