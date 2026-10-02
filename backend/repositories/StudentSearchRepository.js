/**
 * StudentSearchRepository
 *
 * Data-access operations for cross-entity unified student search.
 * Safely queries SQLite tables with parameterization, indexing, and strict student isolation.
 * Supports phrase and multi-word token matching across searchable columns.
 */

const { getConnection } = require('../db/connection');

function buildFieldClause(fields) {
  return fields.map(f => `LOWER(COALESCE(${f}, '')) LIKE ?`).join(' OR ');
}

/**
 * Builds safe parameterized SQL conditions supporting phrase matching and tokenized matching.
 *
 * @param {string[]} fields - Column names to search across
 * @param {string} searchTerm - Search text
 * @returns {{ clause: string, params: string[] }}
 */
function buildSearchCondition(fields, searchTerm) {
  const clean = searchTerm.trim().replace(/\s+/g, ' ');
  const term = `%${clean.toLowerCase()}%`;
  const tokens = clean.split(' ').map(t => t.toLowerCase()).filter(t => t.length > 0);

  if (tokens.length <= 1) {
    const clause = `(${buildFieldClause(fields)})`;
    const params = fields.map(() => term);
    return { clause, params };
  }

  // Full phrase match OR all tokens matched across the fields
  const fullClause = `(${buildFieldClause(fields)})`;
  const fullParams = fields.map(() => term);

  const tokenClauses = [];
  const tokenParams = [];
  for (const token of tokens) {
    tokenClauses.push(`(${buildFieldClause(fields)})`);
    for (let i = 0; i < fields.length; i++) {
      tokenParams.push(`%${token}%`);
    }
  }

  const clause = `(${fullClause} OR (${tokenClauses.join(' AND ')}))`;
  const params = [...fullParams, ...tokenParams];
  return { clause, params };
}

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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['name', 'code', 'instructor'], searchTerm);

    let query = `
      SELECT * FROM courses
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status === 'active' || options.archived === false || options.archived === 0) {
      query += ' AND archived = 0';
    } else if (options.status === 'archived' || options.archived === true || options.archived === 1) {
      query += ' AND archived = 1';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'description'], searchTerm);

    let query = `
      SELECT * FROM assignments
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status) {
      query += ' AND status = ?';
      queryParams.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      queryParams.push(options.courseId);
    }
    if (options.goalId) {
      query += ' AND goal_id = ?';
      queryParams.push(options.goalId);
    }

    query += ' ORDER BY due_date ASC, created_at DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'description', 'location', 'event_type'], searchTerm);

    let query = `
      SELECT * FROM calendar_events
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status) {
      query += ' AND status = ?';
      queryParams.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      queryParams.push(options.courseId);
    }

    query += ' ORDER BY start_time ASC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'notes'], searchTerm);

    let query = `
      SELECT * FROM study_sessions
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status) {
      query += ' AND status = ?';
      queryParams.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      queryParams.push(options.courseId);
    }
    if (options.goalId) {
      query += ' AND goal_id = ?';
      queryParams.push(options.goalId);
    }

    query += ' ORDER BY planned_start_time DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'description'], searchTerm);

    let query = `
      SELECT * FROM goals
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status) {
      query += ' AND status = ?';
      queryParams.push(options.status);
    }
    if (options.courseId) {
      query += ' AND course_id = ?';
      queryParams.push(options.courseId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['name', 'origin', 'destination', 'tags'], searchTerm);

    const query = `
      SELECT * FROM saved_routes
      WHERE user_id = ? AND ${clause}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    return this.database.prepare(query).all(userId, ...params, limit);
  }

  /**
   * Searches recurring commute schedules belonging to the student.
   *
   * @param {string} userId - Owning student ID
   * @param {string} searchTerm - Search query text
   * @param {object} [options={}] - Filter and limit options
   * @returns {Array<object>} Raw matching database rows
   */
  searchSchedules(userId, searchTerm, options = {}) {
    if (!userId) return [];
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'origin', 'destination'], searchTerm);

    let query = `
      SELECT * FROM student_schedules
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status === 'active' || options.active === true || options.active === 1) {
      query += ' AND active = 1';
    } else if (options.status === 'inactive' || options.active === false || options.active === 0) {
      query += ' AND active = 0';
    }

    query += ' ORDER BY target_arrival_time ASC, created_at DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'message'], searchTerm);

    let query = `
      SELECT * FROM notifications
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.read !== undefined && options.read !== null && options.read !== '') {
      query += ' AND read = ?';
      queryParams.push(options.read ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
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
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const { clause, params } = buildSearchCondition(['title', 'message'], searchTerm);

    let query = `
      SELECT * FROM reminders
      WHERE user_id = ? AND ${clause}
    `;
    const queryParams = [userId, ...params];

    if (options.status) {
      query += ' AND status = ?';
      queryParams.push(options.status);
    }

    query += ' ORDER BY scheduled_time DESC LIMIT ?';
    queryParams.push(limit);

    return this.database.prepare(query).all(...queryParams);
  }
}

const studentSearchRepository = new StudentSearchRepository();

module.exports = {
  StudentSearchRepository,
  studentSearchRepository
};
