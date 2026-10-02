/**
 * Migration 008: Goal Workflow Associations
 *
 * Links goals with student academic tasks (assignments) and study sessions.
 * Allows tracking completed work and study time to drive goal progress.
 */

module.exports = {
  name: '008_goal_workflow_associations',

  up(db) {
    // 1. Add goal_id to assignments if not already present
    const assignmentColumns = db.prepare("PRAGMA table_info(assignments)").all().map(c => c.name);
    if (!assignmentColumns.includes('goal_id')) {
      db.exec(`
        ALTER TABLE assignments ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
      `);
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_assignments_goal_id ON assignments(goal_id);
    `);

    // 2. Add goal_id to study_sessions if not already present
    const studyColumns = db.prepare("PRAGMA table_info(study_sessions)").all().map(c => c.name);
    if (!studyColumns.includes('goal_id')) {
      db.exec(`
        ALTER TABLE study_sessions ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
      `);
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_study_sessions_goal_id ON study_sessions(goal_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_study_sessions_goal_id;
      DROP INDEX IF EXISTS idx_assignments_goal_id;
    `);
  }
};
