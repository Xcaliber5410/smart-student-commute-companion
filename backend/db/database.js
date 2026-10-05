const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getConnection, closeConnection, ping, getConnectionStatus } = require('./connection');

const db = getConnection();

/**
 * Defensively ensures a column exists on a table before creating indexes or executing queries.
 * Prevents schema mismatches and SqliteError on pre-existing database files.
 *
 * @param {object} database - SQLite database instance
 * @param {string} tableName - Name of target table
 * @param {string} columnName - Name of column to check
 * @param {string} columnDef - Column definition for ALTER TABLE
 */
function ensureColumnExists(database, tableName, columnName, columnDef) {
  try {
    const tableExists = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    if (!tableExists) return;
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
    if (!columns.includes(columnName)) {
      database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
    }
  } catch (err) {
    // Non-fatal if table or column alteration is redundant
  }
}

function initDb(overrideDb) {
  const activeDb = overrideDb || db;

  // 1. Geocoding Cache
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS geocoding_cache (
      query TEXT PRIMARY KEY,
      lat REAL,
      lon REAL,
      display_name TEXT,
      created_at INTEGER
    );
  `);

  // 2. Live Commute Reports
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS live_commute_reports (
      id TEXT PRIMARY KEY,
      pseudonym TEXT,
      area TEXT,
      route_name TEXT,
      route_id TEXT,
      mode TEXT,
      message TEXT,
      impact TEXT,
      status TEXT,
      created_at INTEGER,
      expires_at INTEGER,
      confirmation_count INTEGER DEFAULT 0,
      contradiction_count INTEGER DEFAULT 0
    );
  `);

  // 3. Live Report Confirmations
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS live_report_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT,
      user_token TEXT,
      action TEXT,
      created_at INTEGER,
      UNIQUE(report_id, user_token)
    );
  `);

  // 4. Ride Groups (Travel Together)
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS ride_groups (
      id TEXT PRIMARY KEY,
      creator_pseudonym TEXT,
      origin_area TEXT,
      destination_college TEXT,
      departure_time TEXT,
      mode TEXT,
      max_members INTEGER,
      current_members INTEGER DEFAULT 1,
      notes TEXT,
      created_at INTEGER
    );
  `);

  // 5. Feedback
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      recommendation_id TEXT,
      is_useful INTEGER,
      tags TEXT,
      comment TEXT,
      created_at INTEGER
    );
  `);

  // 6. Users Table
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      college_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

  // 7. Student Domain Relationships (Day 6)
  activeDb.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON student_profiles(user_id);

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
    CREATE INDEX IF NOT EXISTS idx_student_schedules_user_id ON student_schedules(user_id);
    CREATE INDEX IF NOT EXISTS idx_student_schedules_active ON student_schedules(user_id, active);

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
    CREATE INDEX IF NOT EXISTS idx_saved_routes_user_id ON saved_routes(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_routes_user_mode ON saved_routes(user_id, preferred_mode);
    CREATE INDEX IF NOT EXISTS idx_saved_routes_user_created ON saved_routes(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ride_group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      UNIQUE(group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rg_members_group_id ON ride_group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_rg_members_user_id ON ride_group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_rg_members_user_role ON ride_group_members(user_id, role);
    CREATE INDEX IF NOT EXISTS idx_student_schedules_user_active_time ON student_schedules(user_id, active, target_arrival_time);

    -- 8. Notifications & Reminders (Day 7)
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
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_resource ON notifications(user_id, related_resource_type, related_resource_id);

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
    CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON reminders(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_status ON reminders(status, scheduled_time ASC);

    -- 9. Academic Courses & Assignments (Day 8)
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
    CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);
    CREATE INDEX IF NOT EXISTS idx_courses_user_archived ON courses(user_id, archived);

    -- 10. Student Goals & Progress (Day 11)
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

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
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
    CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_user_status ON assignments(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_assignments_user_due ON assignments(user_id, due_date ASC);
    CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);

    -- 11. Student Planning: Calendar Events & Study Sessions (Day 9)
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

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
      goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
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

    -- 12. Student Study Resources (Day 12)
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
    CREATE INDEX IF NOT EXISTS idx_study_resources_user_created ON study_resources(user_id, created_at DESC);

    -- 13. Student Study Plans (Day 13)
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

  // Defensively ensure columns added across Day 7-13 migrations exist on pre-existing database tables
  ensureColumnExists(activeDb, 'assignments', 'goal_id', 'TEXT REFERENCES goals(id) ON DELETE SET NULL');
  ensureColumnExists(activeDb, 'study_sessions', 'goal_id', 'TEXT REFERENCES goals(id) ON DELETE SET NULL');
  ensureColumnExists(activeDb, 'study_resources', 'goal_id', 'TEXT REFERENCES goals(id) ON DELETE SET NULL');
  ensureColumnExists(activeDb, 'study_resources', 'study_session_id', 'TEXT REFERENCES study_sessions(id) ON DELETE SET NULL');
  ensureColumnExists(activeDb, 'study_resources', 'course_id', 'TEXT REFERENCES courses(id) ON DELETE SET NULL');
  ensureColumnExists(activeDb, 'study_resources', 'assignment_id', 'TEXT REFERENCES assignments(id) ON DELETE SET NULL');

  // Create indexes on migration-added columns now that columns are guaranteed to exist
  activeDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_assignments_goal_id ON assignments(goal_id);
    CREATE INDEX IF NOT EXISTS idx_study_sessions_goal_id ON study_sessions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_study_resources_goal_id ON study_resources(goal_id);
    CREATE INDEX IF NOT EXISTS idx_study_resources_study_session_id ON study_resources(study_session_id);
  `);

  // Automatically execute schema migrations to synchronize schema_migrations table
  try {
    const { runMigrations } = require('../migrations/migrationRunner');
    runMigrations(activeDb);
  } catch (migErr) {
    // Non-fatal if runner has already executed or running in an isolated context
  }

  // 14. GTFS Tables
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS gtfs_agency (
      agency_id TEXT PRIMARY KEY,
      agency_name TEXT,
      agency_url TEXT,
      agency_timezone TEXT,
      agency_lang TEXT
    );

    CREATE TABLE IF NOT EXISTS gtfs_routes (
      route_id TEXT PRIMARY KEY,
      agency_id TEXT,
      route_short_name TEXT,
      route_long_name TEXT,
      route_type INTEGER,
      route_color TEXT,
      route_text_color TEXT
    );

    CREATE TABLE IF NOT EXISTS gtfs_stops (
      stop_id TEXT PRIMARY KEY,
      stop_name TEXT,
      stop_lat REAL,
      stop_lon REAL,
      location_type INTEGER
    );

    CREATE TABLE IF NOT EXISTS gtfs_trips (
      route_id TEXT,
      service_id TEXT,
      trip_id TEXT PRIMARY KEY,
      trip_headsign TEXT,
      direction_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS gtfs_stop_times (
      trip_id TEXT,
      arrival_time TEXT,
      departure_time TEXT,
      stop_id TEXT,
      stop_sequence INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_gtfs_stops_coords ON gtfs_stops(stop_lat, stop_lon);
    CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times_stop ON gtfs_stop_times(stop_id);
    CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times_trip ON gtfs_stop_times(trip_id);
    CREATE INDEX IF NOT EXISTS idx_gtfs_trips_route ON gtfs_trips(route_id);
  `);

  // Seed GTFS if empty
  const stopsCount = activeDb.prepare('SELECT COUNT(*) as cnt FROM gtfs_stops').get().cnt;
  if (stopsCount === 0) {
    seedGtfsData(activeDb);
  }

  // Seed Demo Reports if empty
  const reportsCount = activeDb.prepare('SELECT COUNT(*) as cnt FROM live_commute_reports').get().cnt;
  if (reportsCount === 0) {
    seedDemoReports(activeDb);
  }

  // Seed Demo Ride Groups if empty
  const groupsCount = activeDb.prepare('SELECT COUNT(*) as cnt FROM ride_groups').get().cnt;
  if (groupsCount === 0) {
    seedDemoRideGroups(activeDb);
  }

  // 15. Commute Transport & Disruption Data Tables (Day 14)
  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS transport_services (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      line_identifier TEXT NOT NULL,
      name TEXT NOT NULL,
      agency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPERATIONAL',
      origin_area TEXT NOT NULL,
      destination_area TEXT NOT NULL,
      headsign TEXT,
      fare_type TEXT DEFAULT 'FLAT',
      base_fare REAL DEFAULT 0,
      provenance_tier TEXT NOT NULL DEFAULT 'VERIFIED',
      provider TEXT NOT NULL DEFAULT 'Official Transit Timetable',
      confidence TEXT NOT NULL DEFAULT 'HIGH',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transport_services_mode ON transport_services(mode);
    CREATE INDEX IF NOT EXISTS idx_transport_services_line ON transport_services(line_identifier);
    CREATE INDEX IF NOT EXISTS idx_transport_services_status ON transport_services(status);

    CREATE TABLE IF NOT EXISTS transport_stops (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES transport_services(id) ON DELETE CASCADE,
      stop_id TEXT NOT NULL,
      stop_name TEXT NOT NULL,
      area TEXT NOT NULL,
      stop_sequence INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      is_transit_hub INTEGER NOT NULL DEFAULT 0,
      provenance_tier TEXT NOT NULL DEFAULT 'VERIFIED',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transport_stops_service ON transport_stops(service_id);
    CREATE INDEX IF NOT EXISTS idx_transport_stops_area ON transport_stops(area);

    CREATE TABLE IF NOT EXISTS transport_schedules (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES transport_services(id) ON DELETE CASCADE,
      trip_identifier TEXT NOT NULL,
      from_stop_id TEXT NOT NULL,
      to_stop_id TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      duration_minutes REAL NOT NULL,
      operating_days TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
      status TEXT NOT NULL DEFAULT 'OPERATIONAL',
      provenance_tier TEXT NOT NULL DEFAULT 'VERIFIED',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_service ON transport_schedules(service_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_od ON transport_schedules(from_stop_id, to_stop_id);

    CREATE TABLE IF NOT EXISTS commute_disruptions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      affected_mode TEXT NOT NULL,
      affected_route_id TEXT,
      affected_area TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'moderate',
      description TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      estimated_delay_minutes INTEGER NOT NULL DEFAULT 0,
      provenance_tier TEXT NOT NULL DEFAULT 'USER_REPORTED',
      provider TEXT NOT NULL DEFAULT 'Community Feed',
      confidence TEXT NOT NULL DEFAULT 'MEDIUM',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_disruptions_status_time ON commute_disruptions(status, end_time);
    CREATE INDEX IF NOT EXISTS idx_disruptions_mode_area ON commute_disruptions(affected_mode, affected_area);
  `);

  // Seed Prototype Transport & Disruption Data
  try {
    const { transportRepository } = require('../repositories/TransportRepository');
    transportRepository.seedInitialTransportData();
    const { disruptionRepository } = require('../repositories/DisruptionRepository');
    disruptionRepository.seedInitialDisruptions();
  } catch (seedErr) {
    // Non-fatal if isolated context
  }
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Basic CSV line parser handling quotes
    const row = [];
    let inQuote = false;
    let currentToken = '';
    const line = lines[i];
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const c = line[charIdx];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        row.push(currentToken.trim());
        currentToken = '';
      } else {
        currentToken += c;
      }
    }
    row.push(currentToken.trim());
    if (row.length === headers.length) {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx].replace(/^"|"$/g, '');
      });
      rows.push(obj);
    }
  }
  return rows;
}

function seedGtfsData(targetDb = db) {
  const gtfsDir = path.join(__dirname, '../../data/gtfs');
  if (!fs.existsSync(gtfsDir)) return;

  console.log('Ingesting Mumbai GTFS data into SQLite...');

  // Agencies
  const agencyFile = path.join(gtfsDir, 'agency.txt');
  if (fs.existsSync(agencyFile)) {
    const rows = parseCsv(fs.readFileSync(agencyFile, 'utf-8'));
    const stmt = targetDb.prepare('INSERT OR REPLACE INTO gtfs_agency VALUES (?, ?, ?, ?, ?)');
    const insertMany = targetDb.transaction((list) => {
      for (const r of list) {
        stmt.run(r.agency_id, r.agency_name, r.agency_url, r.agency_timezone, r.agency_lang);
      }
    });
    insertMany(rows);
  }

  // Routes
  const routesFile = path.join(gtfsDir, 'routes.txt');
  if (fs.existsSync(routesFile)) {
    const rows = parseCsv(fs.readFileSync(routesFile, 'utf-8'));
    const stmt = targetDb.prepare('INSERT OR REPLACE INTO gtfs_routes VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertMany = targetDb.transaction((list) => {
      for (const r of list) {
        stmt.run(r.route_id, r.agency_id, r.route_short_name, r.route_long_name, parseInt(r.route_type) || 3, r.route_color, r.route_text_color);
      }
    });
    insertMany(rows);
  }

  // Stops
  const stopsFile = path.join(gtfsDir, 'stops.txt');
  if (fs.existsSync(stopsFile)) {
    const rows = parseCsv(fs.readFileSync(stopsFile, 'utf-8'));
    const stmt = targetDb.prepare('INSERT OR REPLACE INTO gtfs_stops VALUES (?, ?, ?, ?, ?)');
    const insertMany = targetDb.transaction((list) => {
      for (const r of list) {
        stmt.run(r.stop_id, r.stop_name, parseFloat(r.stop_lat), parseFloat(r.stop_lon), parseInt(r.location_type) || 0);
      }
    });
    insertMany(rows);
  }

  // Trips
  const tripsFile = path.join(gtfsDir, 'trips.txt');
  if (fs.existsSync(tripsFile)) {
    const rows = parseCsv(fs.readFileSync(tripsFile, 'utf-8'));
    const stmt = targetDb.prepare('INSERT OR REPLACE INTO gtfs_trips VALUES (?, ?, ?, ?, ?)');
    const insertMany = targetDb.transaction((list) => {
      for (const r of list) {
        stmt.run(r.route_id, r.service_id, r.trip_id, r.trip_headsign, parseInt(r.direction_id) || 0);
      }
    });
    insertMany(rows);
  }

  // Stop Times
  const stopTimesFile = path.join(gtfsDir, 'stop_times.txt');
  if (fs.existsSync(stopTimesFile)) {
    const rows = parseCsv(fs.readFileSync(stopTimesFile, 'utf-8'));
    const stmt = targetDb.prepare('INSERT OR REPLACE INTO gtfs_stop_times VALUES (?, ?, ?, ?, ?)');
    const insertMany = targetDb.transaction((list) => {
      for (const r of list) {
        stmt.run(r.trip_id, r.arrival_time, r.departure_time, r.stop_id, parseInt(r.stop_sequence));
      }
    });
    insertMany(rows);
  }

  console.log('Mumbai GTFS data indexed successfully!');
}

function seedDemoReports(targetDb = db) {
  const now = Date.now();
  const demoReports = [
    {
      id: 'rep-demo-1',
      pseudonym: 'Rohan_VJTI',
      area: 'Andheri Station East',
      route_name: 'Shared Auto Stand',
      route_id: 'AUTO_ANDHERI_E',
      mode: 'auto',
      message: 'Long queues and very low auto availability near Andheri East station towards Saki Naka.',
      impact: 'high',
      status: 'active',
      created_at: now - 5 * 60 * 1000, // 5 mins ago
      expires_at: now + 115 * 60 * 1000,
      confirmation_count: 8,
      contradiction_count: 0
    },
    {
      id: 'rep-demo-2',
      pseudonym: 'Priya_IITB',
      area: 'JVLR - Powai Plaza',
      route_name: 'Bus 418 & Auto corridor',
      route_id: 'BEST_418',
      mode: 'bus',
      message: 'Heavy crawling traffic on JVLR near Powai Plaza due to road repair. Allow +15 mins extra.',
      impact: 'medium',
      status: 'active',
      created_at: now - 18 * 60 * 1000, // 18 mins ago
      expires_at: now + 102 * 60 * 1000,
      confirmation_count: 5,
      contradiction_count: 1
    },
    {
      id: 'rep-demo-3',
      pseudonym: 'Ananya_NMIMS',
      area: 'Dadar Station (WR & CR)',
      route_name: 'Western Line Slow',
      route_id: 'WR_SLOW',
      mode: 'train',
      message: 'Platform 1 & 2 heavily crowded; slow trains running 6-8 mins behind schedule.',
      impact: 'medium',
      status: 'active',
      created_at: now - 28 * 60 * 1000, // 28 mins ago
      expires_at: now + 92 * 60 * 1000,
      confirmation_count: 12,
      contradiction_count: 1
    },
    {
      id: 'rep-demo-4',
      pseudonym: 'Kunal_SPIT',
      area: 'Ghatkopar Metro Station',
      route_name: 'Metro Line 1',
      route_id: 'METRO_1',
      mode: 'metro',
      message: 'Smooth frequency on Metro 1. Automatic AFC gates all functional, AC trains running every 4 mins.',
      impact: 'low',
      status: 'active',
      created_at: now - 12 * 60 * 1000, // 12 mins ago
      expires_at: now + 108 * 60 * 1000,
      confirmation_count: 7,
      contradiction_count: 0
    }
  ];

  const stmt = targetDb.prepare(`
    INSERT OR REPLACE INTO live_commute_reports 
    (id, pseudonym, area, route_name, route_id, mode, message, impact, status, created_at, expires_at, confirmation_count, contradiction_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of demoReports) {
    stmt.run(r.id, r.pseudonym, r.area, r.route_name, r.route_id, r.mode, r.message, r.impact, r.status, r.created_at, r.expires_at, r.confirmation_count, r.contradiction_count);
  }
}

function seedDemoRideGroups(targetDb = db) {
  const now = Date.now();
  const demoGroups = [
    {
      id: 'group-1',
      creator_pseudonym: 'Samir_IITB',
      origin_area: 'Andheri East (Pump House)',
      destination_college: 'IIT Bombay Main Gate',
      departure_time: '08:15 AM',
      mode: 'Shared Auto / Cab',
      max_members: 3,
      current_members: 2,
      notes: 'Meeting near Metro pillar 42. Splitting fare ~₹40 each.',
      created_at: now - 45 * 60 * 1000
    },
    {
      id: 'group-2',
      creator_pseudonym: 'Tanvi_Ruia',
      origin_area: 'Borivali West',
      destination_college: 'Ruia / Podar College',
      departure_time: '07:45 AM',
      mode: 'Local Train (WR Fast)',
      max_members: 4,
      current_members: 3,
      notes: 'Boarding 2nd class ladies coach from Platform 4 at 7:52 AM fast local.',
      created_at: now - 30 * 60 * 1000
    },
    {
      id: 'group-3',
      creator_pseudonym: 'Advait_VJTI',
      origin_area: 'Ghatkopar East',
      destination_college: 'VJTI College Gate',
      departure_time: '08:30 AM',
      mode: 'Metro 1 + Bus 60',
      max_members: 3,
      current_members: 1,
      notes: 'Taking Central line or bus from Dadar/Matunga. Safe commute group.',
      created_at: now - 15 * 60 * 1000
    }
  ];

  const stmt = targetDb.prepare(`
    INSERT OR REPLACE INTO ride_groups
    (id, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, current_members, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const g of demoGroups) {
    stmt.run(g.id, g.creator_pseudonym, g.origin_area, g.destination_college, g.departure_time, g.mode, g.max_members, g.current_members, g.notes, g.created_at);
  }
}

function resetDemo() {
  db.exec('DELETE FROM live_report_confirmations');
  db.exec('DELETE FROM live_commute_reports');
  db.exec('DELETE FROM ride_groups');
  db.exec('DELETE FROM feedback');
  seedDemoReports();
  seedDemoRideGroups();
  return { message: 'Demo environment reset to fresh initial state.' };
}

initDb();

module.exports = {
  db,
  resetDemo,
  initDb,
  getConnection,
  closeConnection,
  ping,
  getConnectionStatus
};
