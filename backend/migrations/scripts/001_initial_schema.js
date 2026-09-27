/**
 * Migration 001: Initial Schema for Foundational Models
 *
 * Provisions core tables for Live Reports, Confirmations, Ride Groups, Feedback, and Geocoding Cache.
 */

module.exports = {
  name: '001_initial_schema',

  up(db) {
    // 1. Geocoding Cache Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS geocoding_cache (
        query TEXT PRIMARY KEY,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        display_name TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `);

    // 2. Live Commute Reports Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS live_commute_reports (
        id TEXT PRIMARY KEY,
        pseudonym TEXT NOT NULL,
        area TEXT NOT NULL,
        route_name TEXT NOT NULL,
        route_id TEXT DEFAULT '',
        mode TEXT NOT NULL,
        message TEXT NOT NULL,
        impact TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        confirmation_count INTEGER DEFAULT 0,
        contradiction_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_live_reports_status_expires 
        ON live_commute_reports(status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_live_reports_area_mode 
        ON live_commute_reports(area, mode);
    `);

    // 3. Live Report Confirmations Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS live_report_confirmations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT NOT NULL,
        user_token TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(report_id, user_token)
      );
      CREATE INDEX IF NOT EXISTS idx_confirmations_report_id 
        ON live_report_confirmations(report_id);
    `);

    // 4. Ride Groups (Travel Together) Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ride_groups (
        id TEXT PRIMARY KEY,
        creator_pseudonym TEXT NOT NULL,
        origin_area TEXT NOT NULL,
        destination_college TEXT NOT NULL,
        departure_time TEXT NOT NULL,
        mode TEXT NOT NULL,
        max_members INTEGER NOT NULL,
        current_members INTEGER DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ride_groups_destination 
        ON ride_groups(destination_college);
      CREATE INDEX IF NOT EXISTS idx_ride_groups_created 
        ON ride_groups(created_at);
    `);

    // 5. Feedback Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        recommendation_id TEXT DEFAULT '',
        is_useful INTEGER NOT NULL,
        tags TEXT DEFAULT '[]',
        comment TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_created 
        ON feedback(created_at);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS feedback;
      DROP TABLE IF EXISTS ride_groups;
      DROP TABLE IF EXISTS live_report_confirmations;
      DROP TABLE IF EXISTS live_commute_reports;
      DROP TABLE IF EXISTS geocoding_cache;
    `);
  }
};
