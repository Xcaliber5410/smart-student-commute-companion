/**
 * StudentSearchRepository
 *
 * Data-access operations for cross-entity unified student search.
 * Safely queries SQLite tables with parameterization, indexing, and strict student isolation.
 */

const { getConnection } = require('../db/connection');

class StudentSearchRepository {
  constructor(dbInstance = null) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Searches academic courses belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchCourses(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM courses
      WHERE user_id = ?
        AND (LOWER(name) LIKE ? OR LOWER(COALESCE(code, '')) LIKE ? OR LOWER(COALESCE(instructor, '')) LIKE ?)
    `;
    const params = [userId, term, term, term];

    if (options.status === 'active' || options.archived === false || options.archived === 0) {
      query += ' AND archived = 0';
    } else if (options.status === 'archived' || options.archived === true || options.archived === 1) {
      query += ' AND archived = 1';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }

  /**
   * Searches assignments and tasks belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchAssignments(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM assignments
      WHERE user_id = ?
        AND (LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)
    `;
    const params = [userId, term, term];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      params.push(options.courseId);
    }
    if (options.goalId) {
      query += ' AND goal_id = ?';
      params.push(options.goalId);
    }

    query += ' ORDER BY due_date ASC, created_at DESC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }

  /**
   * Searches scheduled calendar events belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchCalendarEvents(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM calendar_events
      WHERE user_id = ?
        AND (LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ? OR LOWER(COALESCE(location, '')) LIKE ?)
    `;
    const params = [userId, term, term, term];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      params.push(options.courseId);
    }

    query += ' ORDER BY start_time ASC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }

  /**
   * Searches study sessions belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchStudySessions(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM study_sessions
      WHERE user_id = ?
        AND (LOWER(title) LIKE ? OR LOWER(COALESCE(notes, '')) LIKE ?)
    `;
    const params = [userId, term, term];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      params.push(options.courseId);
    }
    if (options.goalId) {
      query += ' AND goal_id = ?';
      params.push(options.goalId);
    }

    query += ' ORDER BY planned_start_time DESC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }

  /**
   * Searches academic and personal goals belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchGoals(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM goals
      WHERE user_id = ?
        AND (LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)
    `;
    const params = [userId, term, term];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      params.push(options.courseId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }

  /**
   * Searches saved transit routes belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchSavedRoutes(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    const query = `
      SELECT * FROM saved_routes
      WHERE user_id = ?
        AND (LOWER(name) LIKE ? OR LOWER(origin) LIKE ? OR LOWER(destination) LIKE ? OR LOWER(COALESCE(tags, '')) LIKE ?)
      ORDER BY created_at DESC
      LIMIT ?
    `;
    return this.database.prepare(query).all(userId, term, term, term, term, limit);
  }

  /**
   * Searches student in-app notifications.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchNotifications(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM notifications
      WHERE user_id = ?
        AND (LOWER(title) LIKE ? OR LOWER(message) LIKE ?)
    `;
    const params = [userId, term, term];

    if (options.read !== undefined && options.read !== null && options.read !== '') {
      query += ' AND read = ?';
      params.push(options.read ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }

  /**
   * Searches scheduled student reminders.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchReminders(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const term = `%${searchTerm.toLowerCase()}%`;
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    let query = `
      SELECT * FROM reminders
      WHERE user_id = ?
        AND (LOWER(title) LIKE ? OR LOWER(COALESCE(message, '')) LIKE ?)
    `;
    const params = [userId, term, term];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY scheduled_time DESC LIMIT ?';
    params.push(limit);

    return this.database.prepare(query).all(...params);
  }
}

const studentSearchRepository = new StudentSearchRepository();

module.exports = {
  StudentSearchRepository,
  studentSearchRepository
};
