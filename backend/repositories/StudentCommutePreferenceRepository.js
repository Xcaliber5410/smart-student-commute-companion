/**
 * StudentCommutePreferenceRepository
 *
 * Data-access operations for student commute preferences and constraints in SQLite.
 * Ensures strict user ownership and atomic upsert semantics.
 */

const { getConnection } = require('../db/connection');
const { StudentCommutePreference } = require('../models/StudentCommutePreference');

class StudentCommutePreferenceRepository {
  /**
   * @param {object} [dbInstance] - Optional SQLite connection for testing
   */
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Finds commute preferences for a specific user.
   *
   * @param {string} userId
   * @returns {StudentCommutePreference|null}
   */
  findByUserId(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM student_commute_preferences WHERE user_id = ?');
    const row = stmt.get(userId);
    return row ? StudentCommutePreference.fromRow(row) : null;
  }

  /**
   * Upserts commute preferences for a student.
   * If existing, merges updates; if new, provisions with defaults.
   *
   * @param {string} userId
   * @param {object} [data={}]
   * @returns {StudentCommutePreference}
   */
  upsert(userId, data = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required to upsert commute preferences');
    }

    const existing = this.findByUserId(userId);
    const now = Date.now();

    if (!existing) {
      const entity = StudentCommutePreference.createDefault(userId, {
        ...data,
        user_id: userId,
        created_at: now,
        updated_at: now
      });

      const row = entity.toRow();
      const stmt = this.database.prepare(`
        INSERT INTO student_commute_preferences (
          user_id, preferred_modes, walking_tolerance_minutes, max_transfers,
          max_budget_rupees, route_preference, default_arrival_time,
          allow_shared_rides, require_wheelchair_access,
          default_origin_area, default_destination_college,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        row.user_id,
        row.preferred_modes,
        row.walking_tolerance_minutes,
        row.max_transfers,
        row.max_budget_rupees,
        row.route_preference,
        row.default_arrival_time,
        row.allow_shared_rides,
        row.require_wheelchair_access,
        row.default_origin_area,
        row.default_destination_college,
        row.created_at,
        row.updated_at
      );

      return this.findByUserId(userId);
    }

    // Merge updates with existing
    const merged = {
      user_id: userId,
      preferred_modes: data.preferred_modes !== undefined ? data.preferred_modes : existing.preferred_modes,
      walking_tolerance_minutes: data.walking_tolerance_minutes !== undefined ? Number(data.walking_tolerance_minutes) : existing.walking_tolerance_minutes,
      max_transfers: data.max_transfers !== undefined ? Number(data.max_transfers) : existing.max_transfers,
      max_budget_rupees: data.max_budget_rupees !== undefined ? Number(data.max_budget_rupees) : existing.max_budget_rupees,
      route_preference: data.route_preference !== undefined ? data.route_preference : existing.route_preference,
      default_arrival_time: data.default_arrival_time !== undefined ? data.default_arrival_time : existing.default_arrival_time,
      allow_shared_rides: data.allow_shared_rides !== undefined ? Boolean(data.allow_shared_rides) : existing.allow_shared_rides,
      require_wheelchair_access: data.require_wheelchair_access !== undefined ? Boolean(data.require_wheelchair_access) : existing.require_wheelchair_access,
      default_origin_area: data.default_origin_area !== undefined ? data.default_origin_area : existing.default_origin_area,
      default_destination_college: data.default_destination_college !== undefined ? data.default_destination_college : existing.default_destination_college,
      created_at: existing.created_at,
      updated_at: now
    };

    const entity = new StudentCommutePreference(merged);
    const row = entity.toRow();

    const stmt = this.database.prepare(`
      UPDATE student_commute_preferences
      SET preferred_modes = ?,
          walking_tolerance_minutes = ?,
          max_transfers = ?,
          max_budget_rupees = ?,
          route_preference = ?,
          default_arrival_time = ?,
          allow_shared_rides = ?,
          require_wheelchair_access = ?,
          default_origin_area = ?,
          default_destination_college = ?,
          updated_at = ?
      WHERE user_id = ?
    `);

    stmt.run(
      row.preferred_modes,
      row.walking_tolerance_minutes,
      row.max_transfers,
      row.max_budget_rupees,
      row.route_preference,
      row.default_arrival_time,
      row.allow_shared_rides,
      row.require_wheelchair_access,
      row.default_origin_area,
      row.default_destination_college,
      row.updated_at,
      userId
    );

    return this.findByUserId(userId);
  }

  /**
   * Deletes preferences for a specific user.
   *
   * @param {string} userId
   * @returns {boolean} True if a record was deleted
   */
  deleteByUserId(userId) {
    if (!userId || typeof userId !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM student_commute_preferences WHERE user_id = ?');
    const info = stmt.run(userId);
    return info.changes > 0;
  }

  /**
   * Resets student preferences to system defaults.
   *
   * @param {string} userId
   * @returns {StudentCommutePreference}
   */
  resetToDefaults(userId) {
    this.deleteByUserId(userId);
    return this.upsert(userId, {});
  }
}

const studentCommutePreferenceRepository = new StudentCommutePreferenceRepository();

module.exports = {
  StudentCommutePreferenceRepository,
  studentCommutePreferenceRepository
};
