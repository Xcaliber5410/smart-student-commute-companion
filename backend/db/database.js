const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getConnection, closeConnection, ping, getConnectionStatus } = require('./connection');

const db = getConnection();

function initDb() {
  // 1. Geocoding Cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS geocoding_cache (
      query TEXT PRIMARY KEY,
      lat REAL,
      lon REAL,
      display_name TEXT,
      created_at INTEGER
    );
  `);

  // 2. Live Commute Reports
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  `);

  // 8. GTFS Tables
  db.exec(`
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
  const stopsCount = db.prepare('SELECT COUNT(*) as cnt FROM gtfs_stops').get().cnt;
  if (stopsCount === 0) {
    seedGtfsData();
  }

  // Seed Demo Reports if empty
  const reportsCount = db.prepare('SELECT COUNT(*) as cnt FROM live_commute_reports').get().cnt;
  if (reportsCount === 0) {
    seedDemoReports();
  }

  // Seed Demo Ride Groups if empty
  const groupsCount = db.prepare('SELECT COUNT(*) as cnt FROM ride_groups').get().cnt;
  if (groupsCount === 0) {
    seedDemoRideGroups();
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

function seedGtfsData() {
  const gtfsDir = path.join(__dirname, '../../data/gtfs');
  if (!fs.existsSync(gtfsDir)) return;

  console.log('Ingesting Mumbai GTFS data into SQLite...');

  // Agencies
  const agencyFile = path.join(gtfsDir, 'agency.txt');
  if (fs.existsSync(agencyFile)) {
    const rows = parseCsv(fs.readFileSync(agencyFile, 'utf-8'));
    const stmt = db.prepare('INSERT OR REPLACE INTO gtfs_agency VALUES (?, ?, ?, ?, ?)');
    const insertMany = db.transaction((list) => {
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
    const stmt = db.prepare('INSERT OR REPLACE INTO gtfs_routes VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((list) => {
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
    const stmt = db.prepare('INSERT OR REPLACE INTO gtfs_stops VALUES (?, ?, ?, ?, ?)');
    const insertMany = db.transaction((list) => {
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
    const stmt = db.prepare('INSERT OR REPLACE INTO gtfs_trips VALUES (?, ?, ?, ?, ?)');
    const insertMany = db.transaction((list) => {
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
    const stmt = db.prepare('INSERT OR REPLACE INTO gtfs_stop_times VALUES (?, ?, ?, ?, ?)');
    const insertMany = db.transaction((list) => {
      for (const r of list) {
        stmt.run(r.trip_id, r.arrival_time, r.departure_time, r.stop_id, parseInt(r.stop_sequence));
      }
    });
    insertMany(rows);
  }

  console.log('Mumbai GTFS data indexed successfully!');
}

function seedDemoReports() {
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

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO live_commute_reports 
    (id, pseudonym, area, route_name, route_id, mode, message, impact, status, created_at, expires_at, confirmation_count, contradiction_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of demoReports) {
    stmt.run(r.id, r.pseudonym, r.area, r.route_name, r.route_id, r.mode, r.message, r.impact, r.status, r.created_at, r.expires_at, r.confirmation_count, r.contradiction_count);
  }
}

function seedDemoRideGroups() {
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

  const stmt = db.prepare(`
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
