/**
 * Migration 005: Academic Courses and Assignments
 *
 * Provisions relational academic management tables with indexes:
 * - courses: student enrolled subjects/courses with codes, instructors, and colors
 * - assignments: academic deliverables and tasks with deadlines, priorities, and status
 * - Supporting foreign key indexes on user_id, course_id, due_date, and status
 */

module.exports = {
  name: '005_academic_courses_and_assignments',

  up(db) {
    db.exec(`
      -- 1. Student Courses / Subjects Table
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT,
        instructor TEXT,
        color TEXT DEFAULT '#4F46E5',
        credits INTEGER DEFAULT 3,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_courses_user_id
        ON courses(user_id);

      CREATE INDEX IF NOT EXISTS idx_courses_user_archived
        ON courses(user_id, archived);

      -- 2. Student Academic Assignments & Tasks Table
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date INTEGER NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'pending',
        reminder_enabled INTEGER NOT NULL DEFAULT 1,
        reminder_lead_time_minutes INTEGER NOT NULL DEFAULT 1440,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assignments_user_id
        ON assignments(user_id);

      CREATE INDEX IF NOT EXISTS idx_assignments_user_status
        ON assignments(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_assignments_user_due
        ON assignments(user_id, due_date ASC);

      CREATE INDEX IF NOT EXISTS idx_assignments_course_id
        ON assignments(course_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_assignments_course_id;
      DROP INDEX IF EXISTS idx_assignments_user_due;
      DROP INDEX IF EXISTS idx_assignments_user_status;
      DROP INDEX IF EXISTS idx_assignments_user_id;
      DROP TABLE IF EXISTS assignments;

      DROP INDEX IF EXISTS idx_courses_user_archived;
      DROP INDEX IF EXISTS idx_courses_user_id;
      DROP TABLE IF EXISTS courses;
    `);
  }
};
