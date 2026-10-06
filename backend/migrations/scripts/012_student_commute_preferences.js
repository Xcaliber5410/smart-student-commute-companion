/**
 * Migration 012: Student Commute Preferences
 *
 * Provisions relational SQLite storage for student commute preferences (P9):
 * - preferred_modes (JSON array of allowed transit modes)
 * - walking_tolerance_minutes (5-60 min)
 * - max_transfers (0-5)
 * - max_budget_rupees (0-2000)
 * - route_preference ('balanced', 'fastest', 'cheapest', 'rain-safe', 'reliable')
 * - default_arrival_time (HH:MM format)
 * - allow_shared_rides (boolean flag for shared-travel opportunities)
 * - require_wheelchair_access (boolean accessibility flag)
 * - default_origin_area (coarse landmark only, zero residential street addresses)
 * - default_destination_college (coarse college landmark)
 *
 * Foreign Keys & Privacy:
 * - user_id references users(id) ON DELETE CASCADE
 * - Zero precise continuous GPS telemetry or house/flat numbers stored
 */

module.exports = {
  name: '012_student_commute_preferences',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS student_commute_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        preferred_modes TEXT NOT NULL DEFAULT '["train","metro","bus","auto","walk"]',
        walking_tolerance_minutes INTEGER NOT NULL DEFAULT 20,
        max_transfers INTEGER NOT NULL DEFAULT 3,
        max_budget_rupees INTEGER NOT NULL DEFAULT 100,
        route_preference TEXT NOT NULL DEFAULT 'balanced',
        default_arrival_time TEXT DEFAULT '09:00',
        allow_shared_rides INTEGER NOT NULL DEFAULT 1,
        require_wheelchair_access INTEGER NOT NULL DEFAULT 0,
        default_origin_area TEXT DEFAULT '',
        default_destination_college TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_commute_preferences_user_id
        ON student_commute_preferences(user_id);

      CREATE INDEX IF NOT EXISTS idx_commute_preferences_route_pref
        ON student_commute_preferences(route_preference);

      -- Seed from existing student profiles if present
      INSERT OR IGNORE INTO student_commute_preferences (
        user_id,
        preferred_modes,
        walking_tolerance_minutes,
        max_transfers,
        max_budget_rupees,
        route_preference,
        default_arrival_time,
        allow_shared_rides,
        require_wheelchair_access,
        default_origin_area,
        default_destination_college,
        created_at,
        updated_at
      )
      SELECT
        user_id,
        preferred_modes,
        walking_tolerance_minutes,
        3,
        max_budget_rupees,
        'balanced',
        default_arrival_time,
        1,
        0,
        COALESCE(home_area, ''),
        COALESCE(default_college, ''),
        created_at,
        updated_at
      FROM student_profiles;
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_commute_preferences_route_pref;
      DROP INDEX IF EXISTS idx_commute_preferences_user_id;
      DROP TABLE IF EXISTS student_commute_preferences;
    `);
  }
};
