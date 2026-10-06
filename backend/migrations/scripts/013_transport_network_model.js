/**
 * Migration 013: Transport Network Model
 *
 * Provisions relational SQLite storage for multimodal transport network representation (P9):
 * 1. transport_segments - Directed transit and corridor segments along lines
 * 2. transport_connections - Interchanges, walking access links, and feeder transfers
 *
 * Supports graph traversal for route candidate generation, travel-time estimation,
 * and realistic journeys (e.g. Area A → Walk → Metro → Bus Stop → Bus → College → Walk).
 */

module.exports = {
  name: '013_transport_network_model',

  up(db) {
    db.exec(`
      -- 1. Transport Network Segments (Directed Route Edges Along Lines)
      CREATE TABLE IF NOT EXISTS transport_segments (
        id TEXT PRIMARY KEY,
        service_id TEXT REFERENCES transport_services(id) ON DELETE SET NULL,
        mode TEXT NOT NULL,
        line_identifier TEXT NOT NULL,
        from_stop_id TEXT NOT NULL,
        to_stop_id TEXT NOT NULL,
        from_area TEXT NOT NULL,
        to_area TEXT NOT NULL,
        distance_km REAL NOT NULL DEFAULT 0,
        duration_minutes INTEGER NOT NULL DEFAULT 0,
        fare_rupees REAL NOT NULL DEFAULT 0,
        stop_sequence INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        provenance_tier TEXT NOT NULL DEFAULT 'ESTIMATED',
        provider TEXT NOT NULL DEFAULT 'Transit Network Model',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transport_segments_service
        ON transport_segments(service_id);

      CREATE INDEX IF NOT EXISTS idx_transport_segments_from_stop
        ON transport_segments(from_stop_id);

      CREATE INDEX IF NOT EXISTS idx_transport_segments_to_stop
        ON transport_segments(to_stop_id);

      CREATE INDEX IF NOT EXISTS idx_transport_segments_from_area
        ON transport_segments(from_area);

      CREATE INDEX IF NOT EXISTS idx_transport_segments_to_area
        ON transport_segments(to_area);

      CREATE INDEX IF NOT EXISTS idx_transport_segments_mode
        ON transport_segments(mode);

      CREATE INDEX IF NOT EXISTS idx_transport_segments_status
        ON transport_segments(status);

      -- 2. Transport Connections (Transfers, Walking Links, and Feeder Shuttles)
      CREATE TABLE IF NOT EXISTS transport_connections (
        id TEXT PRIMARY KEY,
        from_stop_id TEXT NOT NULL,
        to_stop_id TEXT NOT NULL,
        from_area TEXT NOT NULL,
        to_area TEXT NOT NULL,
        connection_type TEXT NOT NULL DEFAULT 'TRANSFER',
        mode TEXT NOT NULL DEFAULT 'walk',
        duration_minutes INTEGER NOT NULL DEFAULT 5,
        distance_km REAL NOT NULL DEFAULT 0,
        fare_rupees REAL NOT NULL DEFAULT 0,
        is_accessible INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        provenance_tier TEXT NOT NULL DEFAULT 'ESTIMATED',
        provider TEXT NOT NULL DEFAULT 'Transit Network Model',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transport_connections_from_stop
        ON transport_connections(from_stop_id);

      CREATE INDEX IF NOT EXISTS idx_transport_connections_to_stop
        ON transport_connections(to_stop_id);

      CREATE INDEX IF NOT EXISTS idx_transport_connections_type
        ON transport_connections(connection_type);

      CREATE INDEX IF NOT EXISTS idx_transport_connections_status
        ON transport_connections(status);

      CREATE INDEX IF NOT EXISTS idx_transport_connections_mode
        ON transport_connections(mode);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_transport_connections_mode;
      DROP INDEX IF EXISTS idx_transport_connections_status;
      DROP INDEX IF EXISTS idx_transport_connections_type;
      DROP INDEX IF EXISTS idx_transport_connections_to_stop;
      DROP INDEX IF EXISTS idx_transport_connections_from_stop;
      DROP TABLE IF EXISTS transport_connections;

      DROP INDEX IF EXISTS idx_transport_segments_status;
      DROP INDEX IF EXISTS idx_transport_segments_mode;
      DROP INDEX IF EXISTS idx_transport_segments_to_area;
      DROP INDEX IF EXISTS idx_transport_segments_from_area;
      DROP INDEX IF EXISTS idx_transport_segments_to_stop;
      DROP INDEX IF EXISTS idx_transport_segments_from_stop;
      DROP INDEX IF EXISTS idx_transport_segments_service;
      DROP TABLE IF EXISTS transport_segments;
    `);
  }
};
