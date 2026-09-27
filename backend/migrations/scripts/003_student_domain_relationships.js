/**
 * Migration 003: Strengthen Student Domain Relationships
 *
 * Provisions relational student domain tables and indexes:
 * - student_profiles: 1-to-1 profile preferences linked to users(id)
 * - student_schedules: recurring commute schedules linked to users(id)
 * - saved_routes: student favorite route shortcuts linked to users(id)
 * - ride_group_members: M-to-N student ride group membership with role & timestamps
 * - Supporting foreign key indexes to prevent N+1 table scans
 */

module.exports = {
  name: '003_student_domain_relationships',

  up(db) {
    db.exec(`
      -- 1. Student Profiles (Preferences & Commute Defaults)
      CREATE TABLE IF NOT EXISTS student_profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        home_area TEXT,
        default_college TEXT,
        preferred_modes TEXT DEFAULT '["train","metro","bus","auto","walk"]',
        walking_tolerance_minutes INTEGER DEFAULT 20,
        max_budget_rupees INTEGER DEFAULT 100,
        default_arrival_time TEXT DEFAULT '09:00',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id
        ON student_profiles(user_id);

      -- 2. Student Commute Schedules (Recurring Routines)
      CREATE TABLE IF NOT EXISTS student_schedules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        target_arrival_time TEXT NOT NULL,
        days_of_week TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
        reminder_enabled INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_student_schedules_user_id
        ON student_schedules(user_id);

      CREATE INDEX IF NOT EXISTS idx_student_schedules_active
        ON student_schedules(user_id, active);

      -- 3. Student Saved Routes (Favorite Shortcuts)
      CREATE TABLE IF NOT EXISTS saved_routes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        preferred_mode TEXT DEFAULT 'balanced',
        max_budget INTEGER DEFAULT 100,
        summary TEXT,
        tags TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_saved_routes_user_id
        ON saved_routes(user_id);

      CREATE INDEX IF NOT EXISTS idx_saved_routes_user_mode
        ON saved_routes(user_id, preferred_mode);

      CREATE INDEX IF NOT EXISTS idx_saved_routes_user_created
        ON saved_routes(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_student_schedules_user_active_time
        ON student_schedules(user_id, active, target_arrival_time);

      -- 4. Ride Group Members (Student-to-Group Coordination)
      CREATE TABLE IF NOT EXISTS ride_group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at INTEGER NOT NULL,
        UNIQUE(group_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rg_members_group_id
        ON ride_group_members(group_id);

      CREATE INDEX IF NOT EXISTS idx_rg_members_user_id
        ON ride_group_members(user_id);

      CREATE INDEX IF NOT EXISTS idx_rg_members_user_role
        ON ride_group_members(user_id, role);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS ride_group_members;
      DROP TABLE IF EXISTS saved_routes;
      DROP TABLE IF EXISTS student_schedules;
      DROP TABLE IF EXISTS student_profiles;
    `);
  }
};
