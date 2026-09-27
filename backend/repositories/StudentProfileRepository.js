/**
 * StudentProfileRepository
 *
 * Data-access operations for student commute preferences and default routes.
 */

const { getConnection } = require('../db/connection');
const { StudentProfile } = require('../models/StudentProfile');

class StudentProfileRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Finds a student profile by user ID.
   *
   * @param {string} userId
   * @returns {StudentProfile|null}
   */
  findByUserId(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM student_profiles WHERE user_id = ?');
    const row = stmt.get(userId);
    return row ? StudentProfile.fromRow(row) : null;
  }

  /**
   * Upserts a student profile for a given user.
   *
   * @param {string} userId
   * @param {object} data
   * @returns {StudentProfile}
   */
  upsert(userId, data = {}) {
    const existing = this.findByUserId(userId);
    const now = Date.now();

    if (!existing) {
      const preferredModes = Array.isArray(data.preferred_modes)
        ? JSON.stringify(data.preferred_modes)
        : (typeof data.preferred_modes === 'string' ? data.preferred_modes : '["train","metro","bus","auto","walk"]');

      const stmt = this.database.prepare(`
        INSERT INTO student_profiles (
          user_id, home_area, default_college, preferred_modes,
          walking_tolerance_minutes, max_budget_rupees, default_arrival_time,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        userId,
        data.home_area || '',
        data.default_college || '',
        preferredModes,
        Number(data.walking_tolerance_minutes || 20),
        Number(data.max_budget_rupees || 100),
        data.default_arrival_time || '09:00',
        now,
        now
      );
    } else {
      const homeArea = data.home_area !== undefined ? data.home_area : existing.home_area;
      const defaultCollege = data.default_college !== undefined ? data.default_college : existing.default_college;
      const preferredModes = data.preferred_modes !== undefined
        ? (Array.isArray(data.preferred_modes) ? JSON.stringify(data.preferred_modes) : data.preferred_modes)
        : JSON.stringify(existing.preferred_modes);
      const walkingTol = data.walking_tolerance_minutes !== undefined ? Number(data.walking_tolerance_minutes) : existing.walking_tolerance_minutes;
      const maxBudget = data.max_budget_rupees !== undefined ? Number(data.max_budget_rupees) : existing.max_budget_rupees;
      const arrivalTime = data.default_arrival_time !== undefined ? data.default_arrival_time : existing.default_arrival_time;

      const stmt = this.database.prepare(`
        UPDATE student_profiles
        SET home_area = ?,
            default_college = ?,
            preferred_modes = ?,
            walking_tolerance_minutes = ?,
            max_budget_rupees = ?,
            default_arrival_time = ?,
            updated_at = ?
        WHERE user_id = ?
      `);

      stmt.run(
        homeArea,
        defaultCollege,
        preferredModes,
        walkingTol,
        maxBudget,
        arrivalTime,
        now,
        userId
      );
    }

    return this.findByUserId(userId);
  }

  /**
   * Deletes a student profile.
   *
   * @param {string} userId
   * @returns {boolean}
   */
  delete(userId) {
    const stmt = this.database.prepare('DELETE FROM student_profiles WHERE user_id = ?');
    const res = stmt.run(userId);
    return res.changes > 0;
  }
}

const studentProfileRepository = new StudentProfileRepository();

module.exports = {
  StudentProfileRepository,
  studentProfileRepository
};
