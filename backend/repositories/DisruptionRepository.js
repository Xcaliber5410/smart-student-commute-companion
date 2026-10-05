/**
 * DisruptionRepository
 *
 * Data-access operations for multimodal commute disruptions, alerts, and decay mechanics.
 * Guarantees explicit 4-tier data provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 */

const { getConnection } = require('../db/connection');
const { CommuteDisruption } = require('../models/CommuteDisruption');
const { DataProvenance } = require('../models/CommuteContracts');

class DisruptionRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Persists or updates a commute disruption record.
   * @param {CommuteDisruption} disruption
   * @returns {CommuteDisruption}
   */
  save(disruption) {
    const row = disruption instanceof CommuteDisruption ? disruption.toRow() : disruption;
    const stmt = this.database.prepare(`
      INSERT INTO commute_disruptions (
        id, type, affected_mode, affected_route_id, affected_area, severity, description,
        start_time, end_time, status, estimated_delay_minutes, provenance_tier, provider, confidence, created_at, updated_at
      ) VALUES (
        @id, @type, @affected_mode, @affected_route_id, @affected_area, @severity, @description,
        @start_time, @end_time, @status, @estimated_delay_minutes, @provenance_tier, @provider, @confidence, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        affected_mode = excluded.affected_mode,
        affected_route_id = excluded.affected_route_id,
        affected_area = excluded.affected_area,
        severity = excluded.severity,
        description = excluded.description,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        status = excluded.status,
        estimated_delay_minutes = excluded.estimated_delay_minutes,
        provenance_tier = excluded.provenance_tier,
        provider = excluded.provider,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `);
    stmt.run(row);
    return this.findById(row.id);
  }

  /**
   * Retrieves a disruption by ID.
   * @param {string} id
   * @returns {CommuteDisruption|null}
   */
  findById(id) {
    const row = this.database.prepare('SELECT * FROM commute_disruptions WHERE id = ?').get(id);
    return CommuteDisruption.fromRow(row);
  }

  /**
   * Retrieves active disruptions filtered by mode, area, type, or provenance.
   * Also integrates active user-reported live commute reports.
   *
   * @param {object} [options={}]
   * @param {number} [options.currentTime=Date.now()]
   * @param {string} [options.mode]
   * @param {string} [options.area]
   * @param {string} [options.type]
   * @param {string} [options.severity]
   * @param {string} [options.provenanceTier]
   * @returns {CommuteDisruption[]}
   */
  findActive(options = {}) {
    const now = options.currentTime || Date.now();
    const conditions = ['status = ?', 'start_time <= ?', 'end_time > ?'];
    const params = ['active', now, now];

    if (options.mode) {
      conditions.push('LOWER(affected_mode) = LOWER(?)');
      params.push(options.mode);
    }
    if (options.area) {
      conditions.push('LOWER(affected_area) LIKE LOWER(?)');
      params.push(`%${options.area}%`);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }
    if (options.provenanceTier) {
      conditions.push('provenance_tier = ?');
      params.push(options.provenanceTier);
    }

    const query = `
      SELECT * FROM commute_disruptions 
      WHERE ${conditions.join(' AND ')}
      ORDER BY severity DESC, start_time DESC
    `;
    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => CommuteDisruption.fromRow(r));
  }

  /**
   * Paginated listing of disruptions with multi-criteria filtering.
   * @param {object} [options={}]
   * @returns {{ data: CommuteDisruption[], total: number, page: number, limit: number, totalPages: number }}
   */
  findWithPagination(options = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    const status = options.status || 'active';
    if (status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (options.mode) {
      conditions.push('LOWER(affected_mode) = LOWER(?)');
      params.push(options.mode);
    }
    if (options.area) {
      conditions.push('LOWER(affected_area) LIKE LOWER(?)');
      params.push(`%${options.area}%`);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }
    if (options.provenanceTier) {
      conditions.push('provenance_tier = ?');
      params.push(options.provenanceTier);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.database.prepare(`SELECT COUNT(*) as total FROM commute_disruptions ${whereClause}`).get(...params);
    const total = countRow ? countRow.total : 0;

    const query = `
      SELECT * FROM commute_disruptions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = this.database.prepare(query).all(...params, limit, offset);

    return {
      data: rows.map(r => CommuteDisruption.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  /**
   * Updates disruption status (e.g. 'resolved', 'expired').
   * @param {string} id
   * @param {'active'|'expired'|'resolved'} status
   * @returns {boolean}
   */
  updateStatus(id, status) {
    const result = this.database.prepare('UPDATE commute_disruptions SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Synchronizes legacy live_commute_reports into commute_disruptions table.
   * @returns {number} Count of synchronized reports
   */
  syncFromLiveReports() {
    const now = Date.now();
    const liveReports = this.database.prepare("SELECT * FROM live_commute_reports WHERE status = 'active' AND expires_at > ?").all(now);
    let count = 0;
    for (const report of liveReports) {
      const disruption = CommuteDisruption.fromLiveReport(report);
      this.save(disruption);
      count++;
    }
    return count;
  }

  /**
   * Seeds realistic prototype disruptions illustrating all 4 provenance tiers.
   */
  seedInitialDisruptions() {
    const count = this.database.prepare('SELECT COUNT(*) as cnt FROM commute_disruptions').get().cnt;
    if (count > 0) return 0;

    const now = Date.now();
    const duration3h = 3 * 60 * 60 * 1000;
    const duration6h = 6 * 60 * 60 * 1000;

    const seedItems = [
      // 1. VERIFIED: Official Western Railway Maintenance Announcement
      new CommuteDisruption({
        id: 'disr-seed-wr-maint',
        type: 'maintenance',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Dadar - Andheri',
        severity: 'severe',
        description: 'Scheduled Mega Block on Western Railway Slow lines between Dadar and Andheri. Slow locals diverted to fast tracks.',
        startTime: now - 30 * 60 * 1000,
        endTime: now + duration6h,
        status: 'active',
        estimatedDelayMinutes: 20,
        provenance: DataProvenance.verified('Western Railway Public Bulletin', 'Official maintenance advisory', 'HIGH').toJSON(),
        createdAt: now,
        updatedAt: now
      }),

      // 2. USER_REPORTED: Community crowdsourced auto refusal
      new CommuteDisruption({
        id: 'disr-seed-auto-refusal',
        type: 'auto_refusal',
        affectedMode: 'auto',
        affectedRouteId: 'AUTO-SHUTTLE-DJS',
        affectedArea: 'Andheri Station West',
        severity: 'moderate',
        description: 'Severe auto-rickshaw queue and refusals outside Andheri Station West toward SV Road / Juhu.',
        startTime: now - 15 * 60 * 1000,
        endTime: now + duration3h,
        status: 'active',
        estimatedDelayMinutes: 15,
        provenance: DataProvenance.userReported('Community Commuter Feed', 'Multiple student confirmations outside station', 'MEDIUM').toJSON(),
        createdAt: now,
        updatedAt: now
      }),

      // 3. ESTIMATED: Environmental waterlogging risk heuristic
      new CommuteDisruption({
        id: 'disr-seed-milan-waterlog',
        type: 'waterlogging',
        affectedMode: 'auto',
        affectedRouteId: null,
        affectedArea: 'Milan Subway',
        severity: 'severe',
        description: 'High waterlogging risk at Milan Subway underpass due to heavy local rain. Auto and bus traffic diverted to flyover.',
        startTime: now - 45 * 60 * 1000,
        endTime: now + duration3h,
        status: 'active',
        estimatedDelayMinutes: 25,
        provenance: DataProvenance.estimated('Monsoon Flood Hotspot Heuristic', 'Calculated from active rainfall intensity and historical drainage capacity', 'HIGH').toJSON(),
        createdAt: now,
        updatedAt: now
      }),

      // 4. SYNTHETIC: Algorithmic rush-hour crowd simulation
      new CommuteDisruption({
        id: 'disr-seed-metro-crowd',
        type: 'crowding',
        affectedMode: 'metro',
        affectedRouteId: 'Line-1',
        affectedArea: 'Ghatkopar - Andheri',
        severity: 'minor',
        description: 'Peak morning college rush-hour density simulated on Metro Line 1. Expect 1-train boarding wait at Ghatkopar interchange.',
        startTime: now - 10 * 60 * 1000,
        endTime: now + duration3h,
        status: 'active',
        estimatedDelayMinutes: 6,
        provenance: DataProvenance.synthetic('Rush-Hour Crowd Simulation Model', 'Generated by prototype student traffic model for 08:30-09:30 AM', 'MEDIUM').toJSON(),
        createdAt: now,
        updatedAt: now
      })
    ];

    for (const item of seedItems) {
      this.save(item);
    }

    return seedItems.length;
  }
}

const disruptionRepository = new DisruptionRepository();

module.exports = {
  DisruptionRepository,
  disruptionRepository
};
