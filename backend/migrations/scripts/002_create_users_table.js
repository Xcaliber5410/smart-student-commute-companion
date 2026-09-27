/**
 * Migration 002: Create Users Table
 *
 * Provisions secure user authentication table with unique email index
 * and role index for student and admin accounts.
 */

module.exports = {
  name: '002_create_users_table',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        college_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email 
        ON users(email);

      CREATE INDEX IF NOT EXISTS idx_users_role 
        ON users(role);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_users_role;
      DROP INDEX IF EXISTS idx_users_email;
      DROP TABLE IF EXISTS users;
    `);
  }
};
