/**
 * Migration 007: Student Goals & Progress Tracking
 *
 * Implements relational SQLite table for:
 * goals - Student academic, skill, and personal goals optionally linked to courses with target dates and measurable progress.
 */

module.exports = {
  name: '007_student_goals_and_progress',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        target_date INTEGER,
        status TEXT NOT NULL DEFAULT 'in_progress',
        progress INTEGER NOT NULL DEFAULT 0,
        target_value REAL,
        current_value REAL NOT NULL DEFAULT 0,
        unit TEXT,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_goals_course_id ON goals(course_id);
      CREATE INDEX IF NOT EXISTS idx_goals_user_target_date ON goals(user_id, target_date);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS goals;
    `);
  }
};
