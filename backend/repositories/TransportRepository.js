/**
 * TransportRepository
 *
 * Provides data-access operations for transport services, lines, stops, and schedules.
 * Supports public/synthetic prototype data with explicit 4-tier provenance.
 */

const { getConnection } = require('../db/connection');
const { TransportService } = require('../models/TransportService');
const { TransportStop } = require('../models/TransportStop');
const { TransportSchedule } = require('../models/TransportSchedule');
const { DataProvenance } = require('../models/CommuteContracts');

class TransportRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Persists or updates a transport service line.
   * @param {TransportService} service
   * @returns {TransportService}
   */
  saveService(service) {
    const row = service instanceof TransportService ? service.toRow() : service;
    const stmt = this.database.prepare(`
      INSERT INTO transport_services (
        id, mode, line_identifier, name, agency, status, origin_area, destination_area,
        headsign, fare_type, base_fare, provenance_tier, provider, confidence, created_at, updated_at
      ) VALUES (
        @id, @mode, @line_identifier, @name, @agency, @status, @origin_area, @destination_area,
        @headsign, @fare_type, @base_fare, @provenance_tier, @provider, @confidence, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        mode = excluded.mode,
        line_identifier = excluded.line_identifier,
        name = excluded.name,
        agency = excluded.agency,
        status = excluded.status,
        origin_area = excluded.origin_area,
        destination_area = excluded.destination_area,
        headsign = excluded.headsign,
        fare_type = excluded.fare_type,
        base_fare = excluded.base_fare,
        provenance_tier = excluded.provenance_tier,
        provider = excluded.provider,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `);
    stmt.run(row);
    return this.getServiceById(row.id);
  }

  /**
   * Retrieves a transport service by its unique ID, populated with its stops.
   * @param {string} id
   * @returns {TransportService|null}
   */
  getServiceById(id) {
    const row = this.database.prepare('SELECT * FROM transport_services WHERE id = ?').get(id);
    if (!row) return null;
    const stopRows = this.database.prepare('SELECT * FROM transport_stops WHERE service_id = ? ORDER BY stop_sequence ASC').all(id);
    return TransportService.fromRow(row, stopRows);
  }

  /**
   * Finds services matching a specific mode (train, metro, bus, auto, shared_auto).
   * @param {string} mode
   * @returns {TransportService[]}
   */
  findServicesByMode(mode) {
    const rows = this.database.prepare('SELECT * FROM transport_services WHERE mode = ? ORDER BY name ASC').all(mode);
    return rows.map(r => {
      const stopRows = this.database.prepare('SELECT * FROM transport_stops WHERE service_id = ? ORDER BY stop_sequence ASC').all(r.id);
      return TransportService.fromRow(r, stopRows);
    });
  }

  /**
   * Finds a service by its route/line identifier (e.g. "WR-SLOW", "Line-1", "BEST-201").
   * @param {string} lineIdentifier
   * @returns {TransportService|null}
   */
  findServicesByLine(lineIdentifier) {
    const row = this.database.prepare('SELECT * FROM transport_services WHERE LOWER(line_identifier) = LOWER(?)').get(lineIdentifier);
    if (!row) return null;
    const stopRows = this.database.prepare('SELECT * FROM transport_stops WHERE service_id = ? ORDER BY stop_sequence ASC').all(row.id);
    return TransportService.fromRow(row, stopRows);
  }

  /**
   * Finds services that connect two landmark areas directly.
   * @param {string} originArea
   * @param {string} destArea
   * @returns {TransportService[]}
   */
  findServicesConnectingAreas(originArea, destArea) {
    const query = `
      SELECT DISTINCT s.* FROM transport_services s
      JOIN transport_stops st1 ON s.id = st1.service_id
      JOIN transport_stops st2 ON s.id = st2.service_id
      WHERE LOWER(st1.area) LIKE LOWER(?)
        AND LOWER(st2.area) LIKE LOWER(?)
        AND st1.stop_sequence < st2.stop_sequence
    `;
    const rows = this.database.prepare(query).all(`%${originArea}%`, `%${destArea}%`);
    return rows.map(r => {
      const stopRows = this.database.prepare('SELECT * FROM transport_stops WHERE service_id = ? ORDER BY stop_sequence ASC').all(r.id);
      return TransportService.fromRow(r, stopRows);
    });
  }

  /**
   * Batch saves transport stops for a service.
   * @param {TransportStop[]} stops
   * @returns {number} Count of stops inserted/updated
   */
  saveStops(stops) {
    if (!stops || stops.length === 0) return 0;
    const insertStmt = this.database.prepare(`
      INSERT INTO transport_stops (
        id, service_id, stop_id, stop_name, area, stop_sequence, lat, lon, is_transit_hub, provenance_tier, created_at
      ) VALUES (
        @id, @service_id, @stop_id, @stop_name, @area, @stop_sequence, @lat, @lon, @is_transit_hub, @provenance_tier, @created_at
      )
      ON CONFLICT(id) DO UPDATE SET
        stop_name = excluded.stop_name,
        area = excluded.area,
        stop_sequence = excluded.stop_sequence,
        lat = excluded.lat,
        lon = excluded.lon,
        is_transit_hub = excluded.is_transit_hub,
        provenance_tier = excluded.provenance_tier
    `);

    const tx = this.database.transaction(stopList => {
      for (const stop of stopList) {
        const row = stop instanceof TransportStop ? stop.toRow() : stop;
        insertStmt.run(row);
      }
    });

    tx(stops);
    return stops.length;
  }

  /**
   * Finds stops matching an area name or landmark.
   * @param {string} areaName
   * @returns {TransportStop[]}
   */
  findStopsByArea(areaName) {
    const rows = this.database.prepare('SELECT * FROM transport_stops WHERE LOWER(area) LIKE LOWER(?) OR LOWER(stop_name) LIKE LOWER(?)').all(`%${areaName}%`, `%${areaName}%`);
    return rows.map(r => TransportStop.fromRow(r));
  }

  /**
   * Batch saves timetable schedule segments.
   * @param {TransportSchedule[]} schedules
   * @returns {number}
   */
  saveSchedules(schedules) {
    if (!schedules || schedules.length === 0) return 0;
    const insertStmt = this.database.prepare(`
      INSERT INTO transport_schedules (
        id, service_id, trip_identifier, from_stop_id, to_stop_id, departure_time, arrival_time,
        duration_minutes, operating_days, status, provenance_tier, created_at
      ) VALUES (
        @id, @service_id, @trip_identifier, @from_stop_id, @to_stop_id, @departure_time, @arrival_time,
        @duration_minutes, @operating_days, @status, @provenance_tier, @created_at
      )
      ON CONFLICT(id) DO UPDATE SET
        departure_time = excluded.departure_time,
        arrival_time = excluded.arrival_time,
        duration_minutes = excluded.duration_minutes,
        operating_days = excluded.operating_days,
        status = excluded.status,
        provenance_tier = excluded.provenance_tier
    `);

    const tx = this.database.transaction(scheduleList => {
      for (const sched of scheduleList) {
        const row = sched instanceof TransportSchedule ? sched.toRow() : sched;
        insertStmt.run(row);
      }
    });

    tx(schedules);
    return schedules.length;
  }

  /**
   * Finds scheduled timetable trips between two stops after a specified time.
   * @param {string} fromStopId
   * @param {string} toStopId
   * @param {object} [options={}]
   * @returns {TransportSchedule[]}
   */
  findSchedules(fromStopId, toStopId, options = {}) {
    let query = 'SELECT * FROM transport_schedules WHERE from_stop_id = ? AND to_stop_id = ?';
    const params = [fromStopId, toStopId];

    if (options.afterTime) {
      query += ' AND departure_time >= ?';
      params.push(options.afterTime);
    }
    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY departure_time ASC';
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(Number(options.limit));
    }

    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => TransportSchedule.fromRow(r));
  }

  /**
   * Updates availability status of a transport service line.
   * @param {string} id
   * @param {'OPERATIONAL'|'DELAYED'|'SUSPENDED'|'LIMITED_SERVICE'} status
   * @returns {boolean}
   */
  updateServiceStatus(id, status) {
    const result = this.database.prepare('UPDATE transport_services SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Seeds foundational Mumbai multimodal transport data for prototype use.
   */
  seedInitialTransportData() {
    const count = this.database.prepare('SELECT COUNT(*) as cnt FROM transport_services').get().cnt;
    if (count > 0) return 0;

    const now = Date.now();

    // 1. Western Railway Slow Local Line (VERIFIED)
    const wrSlow = new TransportService({
      id: 'srv-wr-slow',
      mode: 'train',
      lineIdentifier: 'WR-SLOW',
      name: 'Western Railway Slow Local',
      agency: 'Western Railway',
      status: 'OPERATIONAL',
      originArea: 'Churchgate',
      destinationArea: 'Borivali',
      headsign: 'Borivali Slow',
      fareType: 'DISTANCE_TIERED',
      baseFare: 10,
      provenance: DataProvenance.verified('Western Railway Official GTFS Timetable', 'Static Mumbai suburban timetable').toJSON(),
      createdAt: now,
      updatedAt: now
    });
    this.saveService(wrSlow);

    const wrStops = [
      new TransportStop({ id: 'stop-wr-churchgate', serviceId: 'srv-wr-slow', stopId: 'STN_CHURCHGATE', stopName: 'Churchgate Terminus', area: 'Churchgate', stopSequence: 1, lat: 18.9322, lon: 72.8264, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-wr-dadar', serviceId: 'srv-wr-slow', stopId: 'STN_DADAR', stopName: 'Dadar Western Station', area: 'Dadar West', stopSequence: 2, lat: 19.0178, lon: 72.8432, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-wr-bandra', serviceId: 'srv-wr-slow', stopId: 'STN_BANDRA', stopName: 'Bandra Western Station', area: 'Bandra West', stopSequence: 3, lat: 19.0544, lon: 72.8406, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-wr-vileparle', serviceId: 'srv-wr-slow', stopId: 'STN_VILEPARLE', stopName: 'Vile Parle Station', area: 'Vile Parle West', stopSequence: 4, lat: 19.0999, lon: 72.8439, isTransitHub: false, createdAt: now }),
      new TransportStop({ id: 'stop-wr-andheri', serviceId: 'srv-wr-slow', stopId: 'STN_ANDHERI', stopName: 'Andheri Western Station', area: 'Andheri West', stopSequence: 5, lat: 19.1197, lon: 72.8464, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-wr-borivali', serviceId: 'srv-wr-slow', stopId: 'STN_BORIVALI', stopName: 'Borivali Station', area: 'Borivali West', stopSequence: 6, lat: 19.2294, lon: 72.8467, isTransitHub: true, createdAt: now })
    ];
    this.saveStops(wrStops);

    const wrSchedules = [
      new TransportSchedule({ id: 'sched-wr-0800', serviceId: 'srv-wr-slow', tripIdentifier: 'TRIP_WR_901', fromStopId: 'STN_BORIVALI', toStopId: 'STN_VILEPARLE', departureTime: '08:00', arrivalTime: '08:28', durationMinutes: 28, operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], createdAt: now }),
      new TransportSchedule({ id: 'sched-wr-0815', serviceId: 'srv-wr-slow', tripIdentifier: 'TRIP_WR_903', fromStopId: 'STN_BORIVALI', toStopId: 'STN_VILEPARLE', departureTime: '08:15', arrivalTime: '08:43', durationMinutes: 28, operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], createdAt: now }),
      new TransportSchedule({ id: 'sched-wr-0830', serviceId: 'srv-wr-slow', tripIdentifier: 'TRIP_WR_905', fromStopId: 'STN_BORIVALI', toStopId: 'STN_VILEPARLE', departureTime: '08:30', arrivalTime: '08:58', durationMinutes: 28, operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], createdAt: now })
    ];
    this.saveSchedules(wrSchedules);

    // 2. Mumbai Metro Line 1 (VERIFIED)
    const metro1 = new TransportService({
      id: 'srv-metro-1',
      mode: 'metro',
      lineIdentifier: 'Line-1',
      name: 'Mumbai Metro Line 1 (Blue Line)',
      agency: 'Mumbai Metro One (MMOPL)',
      status: 'OPERATIONAL',
      originArea: 'Versova',
      destinationArea: 'Ghatkopar',
      headsign: 'Ghatkopar',
      fareType: 'DISTANCE_TIERED',
      baseFare: 20,
      provenance: DataProvenance.verified('Mumbai Metro One Timetable Feed', 'Published 4-minute headway metro service').toJSON(),
      createdAt: now,
      updatedAt: now
    });
    this.saveService(metro1);

    const metroStops = [
      new TransportStop({ id: 'stop-m1-versova', serviceId: 'srv-metro-1', stopId: 'METRO_VERSOVA', stopName: 'Versova Metro Station', area: 'Andheri West', stopSequence: 1, lat: 19.1317, lon: 72.8183, isTransitHub: false, createdAt: now }),
      new TransportStop({ id: 'stop-m1-dn-nagar', serviceId: 'srv-metro-1', stopId: 'METRO_DNNAGAR', stopName: 'D.N. Nagar Metro Station', area: 'Andheri West', stopSequence: 2, lat: 19.1245, lon: 72.8315, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-m1-andheri', serviceId: 'srv-metro-1', stopId: 'METRO_ANDHERI', stopName: 'Andheri Metro Station', area: 'Andheri East', stopSequence: 3, lat: 19.1205, lon: 72.8480, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-m1-ghatkopar', serviceId: 'srv-metro-1', stopId: 'METRO_GHATKOPAR', stopName: 'Ghatkopar Metro Station', area: 'Ghatkopar West', stopSequence: 4, lat: 19.0864, lon: 72.9081, isTransitHub: true, createdAt: now })
    ];
    this.saveStops(metroStops);

    // 3. Station-to-College Auto Shuttle (ESTIMATED)
    const autoShuttle = new TransportService({
      id: 'srv-auto-djs',
      mode: 'auto',
      lineIdentifier: 'AUTO-SHUTTLE-DJS',
      name: 'Vile Parle Station to D.J. Sanghvi Auto Shuttle',
      agency: 'Mumbai Auto-Rickshaw Operators',
      status: 'OPERATIONAL',
      originArea: 'Vile Parle Station West',
      destinationArea: 'D.J. Sanghvi College',
      headsign: 'DJ Sanghvi Gate',
      fareType: 'METERED',
      baseFare: 28,
      provenance: DataProvenance.estimated('Mumbai Regional Transport Authority Tariff', 'Calculated 1.5km road distance with standard minimum fare').toJSON(),
      createdAt: now,
      updatedAt: now
    });
    this.saveService(autoShuttle);

    const autoStops = [
      new TransportStop({ id: 'stop-auto-vp-stn', serviceId: 'srv-auto-djs', stopId: 'AUTO_VP_WEST', stopName: 'Vile Parle Station West Auto Stand', area: 'Vile Parle West', stopSequence: 1, lat: 19.1005, lon: 72.8425, isTransitHub: true, createdAt: now }),
      new TransportStop({ id: 'stop-auto-djs-gate', serviceId: 'srv-auto-djs', stopId: 'COLLEGE_DJS', stopName: 'D.J. Sanghvi College Main Gate', area: 'Vile Parle West', stopSequence: 2, lat: 19.1075, lon: 72.8372, isTransitHub: false, createdAt: now })
    ];
    this.saveStops(autoStops);

    return 3;
  }
}

const transportRepository = new TransportRepository();

module.exports = {
  TransportRepository,
  transportRepository
};
