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
}

module.exports = {
  RideGroupRepository,
  rideGroupRepository: new RideGroupRepository()
};
