/**
 * Migration 011: Commute Transport and Disruption Data Layer
 *
 * Provisions relational SQLite tables for:
 * 1. transport_services - Transit lines, services, and modes (WR, CR, Metro, BEST, Auto Shuttles)
 * 2. transport_stops - Ordered stations/stops along lines with coarse area landmarks
 * 3. transport_schedules - Timetable departures, arrivals, durations, and operating days
 * 4. commute_disruptions - Real-time and scheduled disruption intelligence with 4-tier provenance
 */

module.exports = {
  name: '011_commute_transport_and_disruptions',

  up(db) {
    db.exec(`
      -- 1. Transport Services (Lines, Corridors & Feeder Shuttles)
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
      CREATE INDEX IF NOT EXISTS idx_transport_services_provenance ON transport_services(provenance_tier);

      -- 2. Transport Stops (Stations, Halts, and Landmark Meeting Points)
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
      CREATE INDEX IF NOT EXISTS idx_transport_stops_stop_id ON transport_stops(stop_id);
      CREATE INDEX IF NOT EXISTS idx_transport_stops_seq ON transport_stops(service_id, stop_sequence ASC);

      -- 3. Transport Schedules (Departure / Arrival Timetable Segments)
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
      CREATE INDEX IF NOT EXISTS idx_schedules_dep_time ON transport_schedules(departure_time ASC);

      -- 4. Commute Disruptions (Transit delays, waterlogging, maintenance & alerts)
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
      CREATE INDEX IF NOT EXISTS idx_disruptions_type ON commute_disruptions(type);
      CREATE INDEX IF NOT EXISTS idx_disruptions_provenance ON commute_disruptions(provenance_tier);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS commute_disruptions;
      DROP TABLE IF EXISTS transport_schedules;
      DROP TABLE IF EXISTS transport_stops;
      DROP TABLE IF EXISTS transport_services;
    `);
  }
};
