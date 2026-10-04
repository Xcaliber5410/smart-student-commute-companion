/**
 * Migration 010: Student Study Plans Domain
 *
 * Implements relational SQLite tables for:
 * 1. study_plans - Student study plans / sprint schedules
 * 2. study_plan_items - Planned pieces of study work with target dates, durations,
 *    and relational links to courses, assignments, goals, study sessions, and study resources.
 */

module.exports = {
  name: '010_student_study_plans',

  up(db) {
    db.exec(`
      -- 1. Study Plans Table
      CREATE TABLE IF NOT EXISTS study_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON study_plans(user_id);
      CREATE INDEX IF NOT EXISTS idx_study_plans_user_status ON study_plans(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_study_plans_user_dates ON study_plans(user_id, start_date, end_date);

      -- 2. Study Plan Items Table (Planned study tasks / work)
      CREATE TABLE IF NOT EXISTS study_plan_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id TEXT REFERENCES study_plans(id) ON DELETE CASCADE,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
        goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
        study_session_id TEXT REFERENCES study_sessions(id) ON DELETE SET NULL,
        resource_id TEXT REFERENCES study_resources(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        planned_date INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'planned',
        order_index INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_study_plan_items_user_id ON study_plan_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_plan_id ON study_plan_items(plan_id);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_user_date ON study_plan_items(user_id, planned_date);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_user_status ON study_plan_items(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_course_id ON study_plan_items(course_id);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_assignment_id ON study_plan_items(assignment_id);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_goal_id ON study_plan_items(goal_id);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_study_session_id ON study_plan_items(study_session_id);
      CREATE INDEX IF NOT EXISTS idx_study_plan_items_resource_id ON study_plan_items(resource_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_study_plan_items_resource_id;
      DROP INDEX IF EXISTS idx_study_plan_items_study_session_id;
      DROP INDEX IF EXISTS idx_study_plan_items_goal_id;
      DROP INDEX IF EXISTS idx_study_plan_items_assignment_id;
      DROP INDEX IF EXISTS idx_study_plan_items_course_id;
      DROP INDEX IF EXISTS idx_study_plan_items_user_status;
      DROP INDEX IF EXISTS idx_study_plan_items_user_date;
      DROP INDEX IF EXISTS idx_study_plan_items_plan_id;
      DROP INDEX IF EXISTS idx_study_plan_items_user_id;
      DROP TABLE IF EXISTS study_plan_items;

      DROP INDEX IF EXISTS idx_study_plans_user_dates;
      DROP INDEX IF EXISTS idx_study_plans_user_status;
      DROP INDEX IF EXISTS idx_study_plans_user_id;
      DROP TABLE IF EXISTS study_plans;
    `);
  }
};
