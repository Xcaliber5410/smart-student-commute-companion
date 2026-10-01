/**
 * StudySessionRepository
 *
 * Data-access operations for student study sessions and productivity blocks.
 */

const { getConnection } = require('../db/connection');
const { StudySession } = require('../models/StudySession');

class StudySessionRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM study_sessions WHERE id = ?');
    const row = stmt.get(id);
    return row ? StudySession.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM study_sessions WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.course_id) {
      query += ' AND course_id = ?';
      params.push(options.course_id);
    }
    if (options.assignment_id) {
      query += ' AND assignment_id = ?';
      params.push(options.assignment_id);
    }
    if (options.goal_id) {
      query += ' AND goal_id = ?';
      params.push(options.goal_id);
    }

    query += ' ORDER BY planned_start_time ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => StudySession.fromRow(r));
  }

  findByGoalId(goalId) {
    if (!goalId || typeof goalId !== 'string') return [];
    const stmt = this.database.prepare('SELECT * FROM study_sessions WHERE goal_id = ? ORDER BY planned_start_time ASC');
    const rows = stmt.all(goalId);
    return rows.map(r => StudySession.fromRow(r));
  }

  /**
   * Finds all study sessions for a student that overlap with or fall inside the given time window.
   * A study session interval [start, start + duration * 60000] overlaps with [rangeStart, rangeEnd] if:
   * start < rangeEnd AND (start + duration * 60000) > rangeStart
   */
  findInRange(userId, rangeStart, rangeEnd, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = `
      SELECT * FROM study_sessions 
      WHERE user_id = ? 
        AND planned_start_time < ? 
        AND (planned_start_time + (planned_duration_minutes * 60000)) > ?
    `;
    const params = [userId, rangeEnd, rangeStart];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    } else {
      query += " AND status != 'cancelled'";
    }

    if (options.course_id) {
      query += ' AND course_id = ?';
      params.push(options.course_id);
    }

    query += ' ORDER BY planned_start_time ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => StudySession.fromRow(r));
  }

  findWithPaginationAndFilters(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params = [userId];

    if (options.course_id) {
      whereClause += ' AND course_id = ?';
      params.push(options.course_id);
    }

    if (options.assignment_id) {
      whereClause += ' AND assignment_id = ?';
      params.push(options.assignment_id);
    }

    if (options.goal_id) {
      whereClause += ' AND goal_id = ?';
      params.push(options.goal_id);
    }

    if (options.status) {
      whereClause += ' AND status = ?';
      params.push(options.status);
    }

    if (options.start_after) {
      whereClause += ' AND planned_start_time >= ?';
      params.push(Number(options.start_after));
    }

    if (options.end_before) {
      whereClause += ' AND planned_start_time <= ?';
      params.push(Number(options.end_before));
    }

    if (options.search && typeof options.search === 'string' && options.search.trim()) {
      whereClause += ' AND (title LIKE ? OR notes LIKE ?)';
      const term = `%${options.search.trim()}%`;
      params.push(term, term);
    }

    // Determine ordering
    let orderClause = 'ORDER BY planned_start_time ASC';
    if (options.sort_by === 'time_desc') {
      orderClause = 'ORDER BY planned_start_time DESC';
    } else if (options.sort_by === 'created_at') {
      orderClause = 'ORDER BY created_at DESC';
    }

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM study_sessions ${whereClause}`);
    const total = countStmt.get(...params).count;

    const dataStmt = this.database.prepare(`
      SELECT * FROM study_sessions 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(...params, limit, offset);

    return {
      data: rows.map(r => StudySession.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  create(session) {
    if (!(session instanceof StudySession)) {
      throw new TypeError('session must be an instance of StudySession');
    }

    const row = session.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO study_sessions (
        id, user_id, course_id, assignment_id, goal_id, title, notes,
        planned_start_time, planned_duration_minutes, actual_duration_minutes,
        status, reminder_enabled, reminder_lead_time_minutes,
        completed_at, created_at, updated_at
      ) VALUES (
        @id, @user_id, @course_id, @assignment_id, @goal_id, @title, @notes,
        @planned_start_time, @planned_duration_minutes, @actual_duration_minutes,
        @status, @reminder_enabled, @reminder_lead_time_minutes,
        @completed_at, @created_at, @updated_at
      )
    `);

    stmt.run(row);
    return session;
  }

  getGoalStudySessionSummary(goalId) {
    if (!goalId || typeof goalId !== 'string') {
      return { total_sessions: 0, completed_sessions: 0, completed_minutes: 0, total_planned_minutes: 0, completed_hours: 0 };
    }
    const stmt = this.database.prepare(`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(CASE WHEN status = 'completed' THEN COALESCE(actual_duration_minutes, planned_duration_minutes, 0) ELSE 0 END) as completed_minutes,
        SUM(COALESCE(planned_duration_minutes, 0)) as total_planned_minutes
      FROM study_sessions
      WHERE goal_id = ? AND status != 'cancelled'
    `);
    const row = stmt.get(goalId);
    const totalSessions = Number(row?.total_sessions || 0);
    const completedSessions = Number(row?.completed_sessions || 0);
    const completedMinutes = Number(row?.completed_minutes || 0);
    const totalPlannedMinutes = Number(row?.total_planned_minutes || 0);
    const completedHours = Math.round((completedMinutes / 60) * 10) / 10;

    return {
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      completed_minutes: completedMinutes,
      completed_hours: completedHours,
      total_planned_minutes: totalPlannedMinutes
    };
  }

  update(id, updates) {
    if (!id || typeof id !== 'string') return null;
    const existing = this.findById(id);
    if (!existing) return null;

    const allowedFields = [
      'course_id', 'assignment_id', 'goal_id', 'title', 'notes',
      'planned_start_time', 'planned_duration_minutes', 'actual_duration_minutes',
      'status', 'reminder_enabled', 'reminder_lead_time_minutes', 'completed_at'
    ];

    const fieldsToSet = [];
    const values = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        fieldsToSet.push(`${key} = @${key}`);
        if (key === 'reminder_enabled') {
          values[key] = updates[key] ? 1 : 0;
        } else {
          values[key] = updates[key];
        }
      }
    }

    if (fieldsToSet.length === 0) return existing;

    const now = Date.now();
    fieldsToSet.push('updated_at = @updated_at');
    values.updated_at = now;
    values.id = id;

    const query = `UPDATE study_sessions SET ${fieldsToSet.join(', ')} WHERE id = @id`;
    this.database.prepare(query).run(values);

    return this.findById(id);
  }

  delete(id) {
    if (!id || typeof id !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM study_sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

module.exports = {
  StudySessionRepository,
  studySessionRepository: new StudySessionRepository()
};
