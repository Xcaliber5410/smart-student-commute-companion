/**
 * RideGroup Repository
 *
 * Data-access operations for "Travel Together" student carpool groups.
 */

const { getConnection } = require('../db/connection');
const { RideGroup } = require('../models/RideGroup');

class RideGroupRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Retrieves the most recently created ride groups.
   *
   * @param {number} [limit=20]
   * @returns {RideGroup[]}
   */
  findRecent(limit = 20) {
    const stmt = this.database.prepare(
      'SELECT * FROM ride_groups ORDER BY created_at DESC LIMIT ?'
    );
    const rows = stmt.all(limit);
    return rows.map(r => RideGroup.fromRow(r));
  }

  /**
   * Retrieves ride groups with database-level pagination and filtering.
   *
   * @param {object} [options={}]
   * @returns {{ data: RideGroup[], total: number, page: number, limit: number, totalPages: number }}
   */
  findWithPagination(options = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (options.mode) {
      conditions.push('LOWER(mode) = LOWER(?)');
      params.push(options.mode);
    }
    if (options.origin) {
      conditions.push('LOWER(origin_area) LIKE LOWER(?)');
      params.push(`%${options.origin}%`);
    }
    if (options.destination) {
      conditions.push('LOWER(destination_college) LIKE LOWER(?)');
      params.push(`%${options.destination}%`);
    }
    if (options.status) {
      if (options.status === 'open') {
        conditions.push('current_members < max_members');
      } else if (options.status === 'full') {
        conditions.push('current_members >= max_members');
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM ride_groups ${whereClause}`);
    const { count: total } = countStmt.get(...params);

    const queryStmt = this.database.prepare(`
      SELECT * FROM ride_groups
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = queryStmt.all(...params, limit, offset);

    return {
      data: rows.map(r => RideGroup.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  /**
   * Finds a ride group by its unique ID.
   *
   * @param {string} id
   * @returns {RideGroup|null}
   */
  findById(id) {
    const stmt = this.database.prepare('SELECT * FROM ride_groups WHERE id = ?');
    const row = stmt.get(id);
    return row ? RideGroup.fromRow(row) : null;
  }

  /**
   * Creates a new ride group.
   *
   * @param {object|RideGroup} data
   * @returns {RideGroup}
   */
  create(data) {
    const group = data instanceof RideGroup ? data : RideGroup.create(data);
    const row = group.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO ride_groups 
      (id, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, current_members, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.creator_pseudonym,
      row.origin_area,
      row.destination_college,
      row.departure_time,
      row.mode,
      row.max_members,
      row.current_members,
      row.notes,
      row.created_at
    );

    return this.findById(row.id);
  }

  /**
   * Increments current member count for a ride group.
   *
   * @param {string} id
   * @returns {RideGroup|null}
   */
  incrementMembers(id) {
    const stmt = this.database.prepare(
      'UPDATE ride_groups SET current_members = current_members + 1 WHERE id = ?'
    );
    stmt.run(id);
    return this.findById(id);
  }

  /**
   * Decrements current member count for a ride group (cannot drop below 1).
   *
   * @param {string} id
   * @returns {RideGroup|null}
   */
  decrementMembers(id) {
    const stmt = this.database.prepare(
      'UPDATE ride_groups SET current_members = MAX(1, current_members - 1) WHERE id = ?'
    );
    stmt.run(id);
    return this.findById(id);
  }

  /**
   * Atomically joins a ride group inside a transaction, verifying capacity before incrementing.
   *
   * @param {string} id
   * @returns {RideGroup}
   */
  atomicJoin(id) {
    let updated = null;
    const runTx = this.database.transaction(() => {
      const group = this.findById(id);
      if (!group) {
        const err = new Error('NOT_FOUND');
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (group.current_members >= group.max_members) {
        const err = new Error('GROUP_FULL');
        err.code = 'GROUP_FULL';
        throw err;
      }
      this.database.prepare(
        'UPDATE ride_groups SET current_members = current_members + 1 WHERE id = ?'
      ).run(id);
      updated = this.findById(id);
    });
    runTx();
    return updated;
  }

  /**
   * Atomically leaves a ride group inside a transaction, verifying minimum membership.
   *
   * @param {string} id
   * @returns {RideGroup}
   */
  atomicLeave(id) {
    let updated = null;
    const runTx = this.database.transaction(() => {
      const group = this.findById(id);
      if (!group) {
        const err = new Error('NOT_FOUND');
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (group.current_members <= 1) {
        const err = new Error('MINIMUM_MEMBERSHIP_REACHED');
        err.code = 'MINIMUM_MEMBERSHIP_REACHED';
        throw err;
      }
      this.database.prepare(
        'UPDATE ride_groups SET current_members = current_members - 1 WHERE id = ?'
      ).run(id);
      updated = this.findById(id);
    });
    runTx();
    return updated;
  }

  /**
   * Updates an existing ride group.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {RideGroup|null}
   */
  update(id, updates) {
    const existing = this.findById(id);
    if (!existing) return null;

    const departure = updates.departure_time !== undefined ? updates.departure_time : existing.departure_time;
    const maxMembers = updates.max_members !== undefined ? Number(updates.max_members) : existing.max_members;
    const notes = updates.notes !== undefined ? updates.notes : existing.notes;

    const stmt = this.database.prepare(`
      UPDATE ride_groups
      SET departure_time = ?, max_members = ?, notes = ?
      WHERE id = ?
    `);
    stmt.run(departure, maxMembers, notes, id);
    return this.findById(id);
  }

  /**
   * Deletes a ride group.
   *
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const stmt = this.database.prepare('DELETE FROM ride_groups WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  }
}

module.exports = {
  RideGroupRepository,
  rideGroupRepository: new RideGroupRepository()
};
