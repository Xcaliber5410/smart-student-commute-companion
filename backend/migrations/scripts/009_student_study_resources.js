/**
 * Migration 009: Student Study Resources Domain
 *
 * Implements relational SQLite table for:
 * study_resources - Student-owned study materials (notes, reference materials, links, documents)
 * with relational links to courses, assignments, goals, and study sessions.
 */

module.exports = {
  name: '009_student_study_resources',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS study_resources (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
        goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
        study_session_id TEXT REFERENCES study_sessions(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        resource_type TEXT NOT NULL DEFAULT 'note',
        url TEXT,
        content TEXT,
        file_name TEXT,
        file_size INTEGER,
        mime_type TEXT,
        tags TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_study_resources_user_id ON study_resources(user_id);
      CREATE INDEX IF NOT EXISTS idx_study_resources_user_type ON study_resources(user_id, resource_type);
      CREATE INDEX IF NOT EXISTS idx_study_resources_user_archived ON study_resources(user_id, archived);
      CREATE INDEX IF NOT EXISTS idx_study_resources_user_favorite ON study_resources(user_id, is_favorite);
      CREATE INDEX IF NOT EXISTS idx_study_resources_course_id ON study_resources(course_id);
      CREATE INDEX IF NOT EXISTS idx_study_resources_assignment_id ON study_resources(assignment_id);
      CREATE INDEX IF NOT EXISTS idx_study_resources_goal_id ON study_resources(goal_id);
      CREATE INDEX IF NOT EXISTS idx_study_resources_study_session_id ON study_resources(study_session_id);
      CREATE INDEX IF NOT EXISTS idx_study_resources_user_created ON study_resources(user_id, created_at DESC);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_study_resources_user_created;
      DROP INDEX IF EXISTS idx_study_resources_study_session_id;
      DROP INDEX IF EXISTS idx_study_resources_goal_id;
      DROP INDEX IF EXISTS idx_study_resources_assignment_id;
      DROP INDEX IF EXISTS idx_study_resources_course_id;
      DROP INDEX IF EXISTS idx_study_resources_user_favorite;
      DROP INDEX IF EXISTS idx_study_resources_user_archived;
      DROP INDEX IF EXISTS idx_study_resources_user_type;
      DROP INDEX IF EXISTS idx_study_resources_user_id;
      DROP TABLE IF EXISTS study_resources;
    `);
  }
};
