/**
 * TransportNetworkRepository
 *
 * Data-access operations for multimodal transport network segments and connections.
 * Provides SQLite persistence, spatial/landmark queries, network graph assembly,
 * and realistic prototype network seeding.
 */

const { getConnection } = require('../db/connection');
const { TransportSegment } = require('../models/TransportSegment');
const { TransportConnection } = require('../models/TransportConnection');
const { TransportNetwork } = require('../models/TransportNetwork');
const { transportRepository } = require('./TransportRepository');
const { TRANSPORT_MODES, DataProvenance } = require('../models/CommuteContracts');

class TransportNetworkRepository {
  /**
   * @param {object} [dbInstance] - Optional SQLite connection
   */
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  // ==========================================================================
  // 1. SEGMENTS (TRANSIT CORRIDOR EDGES)
  // ==========================================================================

  saveSegment(segment) {
    const row = segment instanceof TransportSegment ? segment.toRow() : segment;
    const stmt = this.database.prepare(`
      INSERT INTO transport_segments (
        id, service_id, mode, line_identifier, from_stop_id, to_stop_id,
        from_area, to_area, distance_km, duration_minutes, fare_rupees,
        stop_sequence, status, provenance_tier, provider, created_at, updated_at
      ) VALUES (
        @id, @service_id, @mode, @line_identifier, @from_stop_id, @to_stop_id,
        @from_area, @to_area, @distance_km, @duration_minutes, @fare_rupees,
        @stop_sequence, @status, @provenance_tier, @provider, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        service_id = excluded.service_id,
        mode = excluded.mode,
        line_identifier = excluded.line_identifier,
        from_stop_id = excluded.from_stop_id,
        to_stop_id = excluded.to_stop_id,
        from_area = excluded.from_area,
        to_area = excluded.to_area,
        distance_km = excluded.distance_km,
        duration_minutes = excluded.duration_minutes,
        fare_rupees = excluded.fare_rupees,
        stop_sequence = excluded.stop_sequence,
        status = excluded.status,
        provenance_tier = excluded.provenance_tier,
        provider = excluded.provider,
        updated_at = excluded.updated_at
    `);

    stmt.run(row);
    return this.getSegmentById(row.id);
  }

  batchSaveSegments(segments) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) return 0;
    const tx = this.database.transaction(items => {
      for (const seg of items) {
        this.saveSegment(seg);
      }
    });
    tx(segments);
    return segments.length;
  }

  getSegmentById(id) {
    if (!id) return null;
    const row = this.database.prepare('SELECT * FROM transport_segments WHERE id = ?').get(id);
    return row ? TransportSegment.fromRow(row) : null;
  }

  findSegments(filter = {}) {
    const conditions = [];
    const params = [];

    if (filter.serviceId) {
      conditions.push('service_id = ?');
      params.push(filter.serviceId);
    }
    if (filter.mode) {
      conditions.push('mode = ?');
      params.push(filter.mode);
    }
    if (filter.lineIdentifier) {
      conditions.push('LOWER(line_identifier) = LOWER(?)');
      params.push(filter.lineIdentifier);
    }
    if (filter.fromStopId) {
      conditions.push('from_stop_id = ?');
      params.push(filter.fromStopId);
    }
    if (filter.toStopId) {
      conditions.push('to_stop_id = ?');
      params.push(filter.toStopId);
    }
    if (filter.fromArea) {
      conditions.push('LOWER(from_area) LIKE LOWER(?)');
      params.push(`%${filter.fromArea}%`);
    }
    if (filter.toArea) {
      conditions.push('LOWER(to_area) LIKE LOWER(?)');
      params.push(`%${filter.toArea}%`);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM transport_segments ${where} ORDER BY stop_sequence ASC, line_identifier ASC`;
    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => TransportSegment.fromRow(r));
  }

  findSegmentsByService(serviceId) {
    return this.findSegments({ serviceId });
  }

  findSegmentsBetween(fromArea, toArea, options = {}) {
    return this.findSegments({
      fromArea,
      toArea,
      status: options.status || (options.operationalOnly ? 'ACTIVE' : undefined),
      mode: options.mode
    });
  }

  // ==========================================================================
  // 2. CONNECTIONS (TRANSFERS, WALKING ACCESS, AND FEEDER SHUTTLES)
  // ==========================================================================

  saveConnection(connection) {
    const row = connection instanceof TransportConnection ? connection.toRow() : connection;
    const stmt = this.database.prepare(`
      INSERT INTO transport_connections (
        id, from_stop_id, to_stop_id, from_area, to_area,
        connection_type, mode, duration_minutes, distance_km, fare_rupees,
        is_accessible, status, provenance_tier, provider, created_at, updated_at
      ) VALUES (
        @id, @from_stop_id, @to_stop_id, @from_area, @to_area,
        @connection_type, @mode, @duration_minutes, @distance_km, @fare_rupees,
        @is_accessible, @status, @provenance_tier, @provider, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        from_stop_id = excluded.from_stop_id,
        to_stop_id = excluded.to_stop_id,
        from_area = excluded.from_area,
        to_area = excluded.to_area,
        connection_type = excluded.connection_type,
        mode = excluded.mode,
        duration_minutes = excluded.duration_minutes,
        distance_km = excluded.distance_km,
        fare_rupees = excluded.fare_rupees,
        is_accessible = excluded.is_accessible,
        status = excluded.status,
        provenance_tier = excluded.provenance_tier,
        provider = excluded.provider,
        updated_at = excluded.updated_at
    `);

    stmt.run(row);
    return this.getConnectionById(row.id);
  }

  batchSaveConnections(connections) {
    if (!connections || !Array.isArray(connections) || connections.length === 0) return 0;
    const tx = this.database.transaction(items => {
      for (const conn of items) {
        this.saveConnection(conn);
      }
    });
    tx(connections);
    return connections.length;
  }

  getConnectionById(id) {
    if (!id) return null;
    const row = this.database.prepare('SELECT * FROM transport_connections WHERE id = ?').get(id);
    return row ? TransportConnection.fromRow(row) : null;
  }

  findConnections(filter = {}) {
    const conditions = [];
    const params = [];

    if (filter.fromStopId) {
      conditions.push('from_stop_id = ?');
      params.push(filter.fromStopId);
    }
    if (filter.toStopId) {
      conditions.push('to_stop_id = ?');
      params.push(filter.toStopId);
    }
    if (filter.fromArea) {
      conditions.push('LOWER(from_area) LIKE LOWER(?)');
      params.push(`%${filter.fromArea}%`);
    }
    if (filter.toArea) {
      conditions.push('LOWER(to_area) LIKE LOWER(?)');
      params.push(`%${filter.toArea}%`);
    }
    if (filter.connectionType) {
      conditions.push('connection_type = ?');
      params.push(filter.connectionType);
    }
    if (filter.mode) {
      conditions.push('mode = ?');
      params.push(filter.mode);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM transport_connections ${where} ORDER BY duration_minutes ASC`;
    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => TransportConnection.fromRow(r));
  }

  findConnectionsFrom(stopIdOrArea, options = {}) {
    const query = (stopIdOrArea || '').toLowerCase().trim();
    return this.findConnections({
      status: options.operationalOnly ? 'ACTIVE' : undefined,
      mode: options.mode
    }).filter(c => c.fromStopId.toLowerCase() === query || c.fromArea.toLowerCase().includes(query));
  }

  findConnectionsBetween(fromStopIdOrArea, toStopIdOrArea) {
    const fromQuery = (fromStopIdOrArea || '').toLowerCase().trim();
    const toQuery = (toStopIdOrArea || '').toLowerCase().trim();

    return this.findConnections().filter(c => {
      const matchFrom = c.fromStopId.toLowerCase() === fromQuery || c.fromArea.toLowerCase().includes(fromQuery);
      const matchTo = c.toStopId.toLowerCase() === toQuery || c.toArea.toLowerCase().includes(toQuery);
      return matchFrom && matchTo;
    });
  }

  // ==========================================================================
  // 3. GRAPH LOADING & RECONSTRUCTION
  // ==========================================================================

  /**
   * Loads all active transit services, stops, segments, and connections into a TransportNetwork graph.
   * @param {object} [options={}]
   * @returns {TransportNetwork}
   */
  loadNetwork(options = {}) {
    const network = new TransportNetwork(options);

    // 1. Ensure initial prototype lines are seeded
    transportRepository.seedInitialTransportData();
    this.seedPrototypeNetwork();

    // 2. Load services
    const services = transportRepository.findServicesByMode('train')
      .concat(transportRepository.findServicesByMode('metro'))
      .concat(transportRepository.findServicesByMode('bus'))
      .concat(transportRepository.findServicesByMode('shared_auto'));

    for (const service of services) {
      network.addService(service);
      for (const stop of service.stops) {
        network.addStop(stop);
      }
    }

    // 3. Load segments
    const segments = this.findSegments({ status: options.status || 'ACTIVE' });
    for (const seg of segments) {
      network.addSegment(seg);
    }

    // 4. Load connections
    const connections = this.findConnections({ status: options.status || 'ACTIVE' });
    for (const conn of connections) {
      network.addConnection(conn);
    }

    return network;
  }

  // ==========================================================================
  // 4. PROTOTYPE NETWORK SEEDING
  // ==========================================================================

  /**
   * Seeds realistic multimodal network segments and connections representing:
   * Area A → Walk → Metro Station → Metro → Bus Stop → Bus → College Area → Walk
   *
   * @param {boolean} [force=false]
   * @returns {number} Count of seeded segments and connections
   */
  seedPrototypeNetwork(force = false) {
    const segCount = this.database.prepare('SELECT COUNT(*) as cnt FROM transport_segments').get().cnt;
    if (segCount > 0 && !force) return 0;

    if (force) {
      this.database.prepare('DELETE FROM transport_segments').run();
      this.database.prepare('DELETE FROM transport_connections').run();
    }

    const now = Date.now();

    // Ensure base services exist
    transportRepository.seedInitialTransportData();

    // Ensure BEST Feeder Bus 201 is seeded
    const existingBus = transportRepository.getServiceById('srv-best-201');
    if (!existingBus) {
      const { TransportService } = require('../models/TransportService');
      const { TransportStop } = require('../models/TransportStop');
      const busService = new TransportService({
        id: 'srv-best-201',
        mode: 'bus',
        lineIdentifier: 'BEST-201',
        name: 'BEST Feeder Bus 201',
        agency: 'Brihanmumbai Electric Supply and Transport (BEST)',
        status: 'OPERATIONAL',
        originArea: 'Andheri Station West',
        destinationArea: 'Vile Parle West',
        headsign: 'Vile Parle West via Juhu',
        fareType: 'FLAT',
        baseFare: 6,
        provenance: DataProvenance.verified('BEST Undertaking Public Route Guide', 'Official feeder bus timetable').toJSON(),
        createdAt: now,
        updatedAt: now
      });
      transportRepository.saveService(busService);
      transportRepository.saveStops([
        new TransportStop({ id: 'stop-b201-andheri', serviceId: 'srv-best-201', stopId: 'BUS_ANDHERI_W', stopName: 'Andheri Station West Bus Stand', area: 'Andheri Station West', stopSequence: 1, lat: 19.1199, lon: 72.8460, isTransitHub: true, createdAt: now }),
        new TransportStop({ id: 'stop-b201-gulmohar', serviceId: 'srv-best-201', stopId: 'BUS_GULMOHAR', stopName: 'Gulmohar Road Cross', area: 'Gulmohar Road', stopSequence: 2, lat: 19.1130, lon: 72.8350, isTransitHub: false, createdAt: now }),
        new TransportStop({ id: 'stop-b201-juhu', serviceId: 'srv-best-201', stopId: 'BUS_JUHU_CIRCLE', stopName: 'Juhu Circle Bus Stop', area: 'Juhu Circle', stopSequence: 3, lat: 19.1080, lon: 72.8300, isTransitHub: false, createdAt: now }),
        new TransportStop({ id: 'stop-b201-irla', serviceId: 'srv-best-201', stopId: 'BUS_IRLA_DJS', stopName: 'Irla / D.J. Sanghvi College Bus Stop', area: 'D.J. Sanghvi College', stopSequence: 4, lat: 19.1070, lon: 72.8365, isTransitHub: false, createdAt: now })
      ]);
    }

    // 1. Realistic Route Segments:
    // A) Western Railway Slow Line (WR-SLOW)
    const wrSegments = [
      new TransportSegment({
        id: 'seg-wr-borivali-kandivali',
        serviceId: 'srv-wr-slow',
        mode: TRANSPORT_MODES.TRAIN,
        lineIdentifier: 'WR-SLOW',
        fromStopId: 'STN_BORIVALI',
        toStopId: 'STN_KANDIVALI',
        fromArea: 'Borivali West',
        toArea: 'Kandivali West',
        distanceKm: 3.5,
        durationMinutes: 5,
        fareRupees: 5,
        stopSequence: 1,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-wr-kandivali-malad',
        serviceId: 'srv-wr-slow',
        mode: TRANSPORT_MODES.TRAIN,
        lineIdentifier: 'WR-SLOW',
        fromStopId: 'STN_KANDIVALI',
        toStopId: 'STN_MALAD',
        fromArea: 'Kandivali West',
        toArea: 'Malad West',
        distanceKm: 2.8,
        durationMinutes: 4,
        fareRupees: 5,
        stopSequence: 2,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-wr-malad-goregaon',
        serviceId: 'srv-wr-slow',
        mode: TRANSPORT_MODES.TRAIN,
        lineIdentifier: 'WR-SLOW',
        fromStopId: 'STN_MALAD',
        toStopId: 'STN_GOREGAON',
        fromArea: 'Malad West',
        toArea: 'Goregaon West',
        distanceKm: 3.1,
        durationMinutes: 5,
        fareRupees: 5,
        stopSequence: 3,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-wr-goregaon-andheri',
        serviceId: 'srv-wr-slow',
        mode: TRANSPORT_MODES.TRAIN,
        lineIdentifier: 'WR-SLOW',
        fromStopId: 'STN_GOREGAON',
        toStopId: 'STN_ANDHERI',
        fromArea: 'Goregaon West',
        toArea: 'Andheri West',
        distanceKm: 5.2,
        durationMinutes: 8,
        fareRupees: 5,
        stopSequence: 4,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-wr-andheri-vileparle',
        serviceId: 'srv-wr-slow',
        mode: TRANSPORT_MODES.TRAIN,
        lineIdentifier: 'WR-SLOW',
        fromStopId: 'STN_ANDHERI',
        toStopId: 'STN_VILEPARLE',
        fromArea: 'Andheri West',
        toArea: 'Vile Parle West',
        distanceKm: 2.1,
        durationMinutes: 4,
        fareRupees: 5,
        stopSequence: 5,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      })
    ];

    // B) Metro Line 1 Segments (Line-1: Ghatkopar ↔ Andheri ↔ Versova)
    const metroSegments = [
      new TransportSegment({
        id: 'seg-metro-versova-dnnagar',
        serviceId: 'srv-metro-1',
        mode: TRANSPORT_MODES.METRO,
        lineIdentifier: 'Line-1',
        fromStopId: 'METRO_VERSOVA',
        toStopId: 'METRO_DNNAGAR',
        fromArea: 'Versova',
        toArea: 'DN Nagar',
        distanceKm: 1.8,
        durationMinutes: 4,
        fareRupees: 10,
        stopSequence: 1,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-metro-dnnagar-andheri',
        serviceId: 'srv-metro-1',
        mode: TRANSPORT_MODES.METRO,
        lineIdentifier: 'Line-1',
        fromStopId: 'METRO_DNNAGAR',
        toStopId: 'METRO_ANDHERI',
        fromArea: 'DN Nagar',
        toArea: 'Andheri West',
        distanceKm: 2.2,
        durationMinutes: 5,
        fareRupees: 10,
        stopSequence: 2,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-metro-andheri-weh',
        serviceId: 'srv-metro-1',
        mode: TRANSPORT_MODES.METRO,
        lineIdentifier: 'Line-1',
        fromStopId: 'METRO_ANDHERI',
        toStopId: 'METRO_WEH',
        fromArea: 'Andheri West',
        toArea: 'Western Express Highway',
        distanceKm: 1.6,
        durationMinutes: 3,
        fareRupees: 10,
        stopSequence: 3,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      })
    ];

    // C) BEST Feeder Bus 201 Segments (Andheri Station West ↔ Juhu ↔ Vile Parle West)
    const busSegments = [
      new TransportSegment({
        id: 'seg-bus-andheri-gulmohar',
        serviceId: 'srv-best-201',
        mode: TRANSPORT_MODES.BUS,
        lineIdentifier: 'BEST-201',
        fromStopId: 'BUS_ANDHERI_W',
        toStopId: 'BUS_GULMOHAR',
        fromArea: 'Andheri Station West',
        toArea: 'Gulmohar Road',
        distanceKm: 1.5,
        durationMinutes: 7,
        fareRupees: 6,
        stopSequence: 1,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-bus-gulmohar-juhucircle',
        serviceId: 'srv-best-201',
        mode: TRANSPORT_MODES.BUS,
        lineIdentifier: 'BEST-201',
        fromStopId: 'BUS_GULMOHAR',
        toStopId: 'BUS_JUHU_CIRCLE',
        fromArea: 'Gulmohar Road',
        toArea: 'Juhu Circle',
        distanceKm: 1.2,
        durationMinutes: 6,
        fareRupees: 6,
        stopSequence: 2,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),
      new TransportSegment({
        id: 'seg-bus-juhu-djsanghvi',
        serviceId: 'srv-best-201',
        mode: TRANSPORT_MODES.BUS,
        lineIdentifier: 'BEST-201',
        fromStopId: 'BUS_JUHU_CIRCLE',
        toStopId: 'BUS_IRLA_DJS',
        fromArea: 'Juhu Circle',
        toArea: 'D.J. Sanghvi College',
        distanceKm: 0.9,
        durationMinutes: 5,
        fareRupees: 6,
        stopSequence: 3,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      })
    ];

    // 2. Realistic Connections & Transfers:
    const connections = [
      // Walk: Area A (Lokhandwala / Versova) → Metro Station
      new TransportConnection({
        id: 'conn-walk-area-a-to-metro',
        fromStopId: 'AREA_LOKHANDWALA',
        toStopId: 'METRO_VERSOVA',
        fromArea: 'Lokhandwala Complex',
        toArea: 'Versova',
        connectionType: 'WALKING_ACCESS',
        mode: 'walk',
        durationMinutes: 6,
        distanceKm: 0.45,
        fareRupees: 0,
        isAccessible: true,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),

      // Walk: Metro DN Nagar → Bus Stop DN Nagar
      new TransportConnection({
        id: 'conn-walk-metro-to-bus-stop',
        fromStopId: 'METRO_DNNAGAR',
        toStopId: 'BUS_ANDHERI_W',
        fromArea: 'DN Nagar',
        toArea: 'Andheri Station West',
        connectionType: 'TRANSFER',
        mode: 'walk',
        durationMinutes: 4,
        distanceKm: 0.3,
        fareRupees: 0,
        isAccessible: true,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),

      // Interchange: Andheri Western Railway Station ↔ Andheri Metro Station
      new TransportConnection({
        id: 'conn-interchange-wr-to-metro',
        fromStopId: 'STN_ANDHERI',
        toStopId: 'METRO_ANDHERI',
        fromArea: 'Andheri West',
        toArea: 'Andheri West',
        connectionType: 'INTERCHANGE',
        mode: 'walk',
        durationMinutes: 3,
        distanceKm: 0.2,
        fareRupees: 0,
        isAccessible: true,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),

      // Walk: Bus Stop (Irla / Juhu Circle) → D.J. Sanghvi College Campus
      new TransportConnection({
        id: 'conn-walk-bus-to-college',
        fromStopId: 'BUS_IRLA_DJS',
        toStopId: 'COLLEGE_DJS',
        fromArea: 'D.J. Sanghvi College',
        toArea: 'D.J. Sanghvi College of Engineering',
        connectionType: 'WALKING_ACCESS',
        mode: 'walk',
        durationMinutes: 3,
        distanceKm: 0.25,
        fareRupees: 0,
        isAccessible: true,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),

      // Walk: Vile Parle Railway Station → D.J. Sanghvi College
      new TransportConnection({
        id: 'conn-walk-vileparle-to-djs',
        fromStopId: 'STN_VILEPARLE',
        toStopId: 'COLLEGE_DJS',
        fromArea: 'Vile Parle West',
        toArea: 'D.J. Sanghvi College of Engineering',
        connectionType: 'WALKING_ACCESS',
        mode: 'walk',
        durationMinutes: 10,
        distanceKm: 0.85,
        fareRupees: 0,
        isAccessible: true,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      }),

      // Feeder: Shared Auto Shuttle from Andheri West Station to DJS
      new TransportConnection({
        id: 'conn-shuttle-andheri-to-djs',
        fromStopId: 'STN_ANDHERI',
        toStopId: 'COLLEGE_DJS',
        fromArea: 'Andheri West',
        toArea: 'D.J. Sanghvi College of Engineering',
        connectionType: 'FEEDER_SHUTTLE',
        mode: 'shared_auto',
        durationMinutes: 8,
        distanceKm: 2.4,
        fareRupees: 20,
        isAccessible: false,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      })
    ];

    const allSegments = [...wrSegments, ...metroSegments, ...busSegments];
    this.batchSaveSegments(allSegments);
    this.batchSaveConnections(connections);

    return allSegments.length + connections.length;
  }
}

const transportNetworkRepository = new TransportNetworkRepository();

module.exports = {
  TransportNetworkRepository,
  transportNetworkRepository
};
