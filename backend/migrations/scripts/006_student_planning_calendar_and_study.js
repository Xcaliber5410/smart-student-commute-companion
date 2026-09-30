/**
 * Migration 006: Student Planning, Calendar Events, and Study Sessions
 *
 * Implements relational SQLite tables for:
 * 1. calendar_events - Scheduled student lectures, exams, labs, extracurriculars, and personal events
 * 2. study_sessions - Structured focused study blocks optionally linked to courses and assignments
 */

module.exports = {
  name: '006_student_planning_calendar_and_study',

  up(db) {
    db.exec(`
      -- 1. Calendar Events Table
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        event_type TEXT NOT NULL DEFAULT 'lecture',
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        reminder_enabled INTEGER NOT NULL DEFAULT 1,
        reminder_lead_time_minutes INTEGER NOT NULL DEFAULT 30,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_user_range ON calendar_events(user_id, start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_user_status ON calendar_events(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_course_id ON calendar_events(course_id);

      -- 2. Study Sessions Table
      CREATE TABLE IF NOT EXISTS study_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        notes TEXT,
        planned_start_time INTEGER NOT NULL,
        planned_duration_minutes INTEGER NOT NULL,
        actual_duration_minutes INTEGER,
        status TEXT NOT NULL DEFAULT 'planned',
        reminder_enabled INTEGER NOT NULL DEFAULT 1,
        reminder_lead_time_minutes INTEGER NOT NULL DEFAULT 15,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_study_sessions_user_time ON study_sessions(user_id, planned_start_time);
      CREATE INDEX IF NOT EXISTS idx_study_sessions_user_status ON study_sessions(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_study_sessions_course_id ON study_sessions(course_id);
      CREATE INDEX IF NOT EXISTS idx_study_sessions_assignment_id ON study_sessions(assignment_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS study_sessions;
      DROP TABLE IF EXISTS calendar_events;
    `);
  }
};
