/**
 * Migration 004: Notifications and Reminders
 *
 * Provisions relational student notification and reminder tables with indexes:
 * - notifications: student-specific notification records, read states, payloads, priorities
 * - reminders: student commute and schedule reminders with status lifecycle
 * - supporting indexes on user_id, read status, and scheduled_time
 */

module.exports = {
  name: '004_notifications_and_reminders',

  up(db) {
    db.exec(`
      -- 1. Student Notifications Table
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'reminder',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        read INTEGER NOT NULL DEFAULT 0,
        read_at INTEGER,
        related_resource_type TEXT,
        related_resource_id TEXT,
        payload TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_id
        ON notifications(user_id);

      CREATE INDEX IF NOT EXISTS idx_notifications_user_read
        ON notifications(user_id, read, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications(user_id, created_at DESC);

      -- 2. Student Reminders Table
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT,
        scheduled_time INTEGER NOT NULL,
        reminder_type TEXT NOT NULL DEFAULT 'commute',
        status TEXT NOT NULL DEFAULT 'scheduled',
        related_resource_type TEXT,
        related_resource_id TEXT,
        triggered_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reminders_user_id
        ON reminders(user_id);

      CREATE INDEX IF NOT EXISTS idx_reminders_user_status
        ON reminders(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_status
        ON reminders(status, scheduled_time ASC);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_reminders_scheduled_status;
      DROP INDEX IF EXISTS idx_reminders_user_status;
      DROP INDEX IF EXISTS idx_reminders_user_id;
      DROP TABLE IF EXISTS reminders;

      DROP INDEX IF EXISTS idx_notifications_user_created;
      DROP INDEX IF EXISTS idx_notifications_user_read;
      DROP INDEX IF EXISTS idx_notifications_user_id;
      DROP TABLE IF EXISTS notifications;
    `);
  }
};
