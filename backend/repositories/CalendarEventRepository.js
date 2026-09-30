/**
 * CalendarEventRepository
 *
 * Data-access operations for student calendar events, lectures, labs, and exams.
 */

const { getConnection } = require('../db/connection');
const { CalendarEvent } = require('../models/CalendarEvent');

class CalendarEventRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM calendar_events WHERE id = ?');
    const row = stmt.get(id);
    return row ? CalendarEvent.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM calendar_events WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.course_id) {
      query += ' AND course_id = ?';
      params.push(options.course_id);
    }
    if (options.event_type) {
      query += ' AND event_type = ?';
      params.push(options.event_type);
    }

    query += ' ORDER BY start_time ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => CalendarEvent.fromRow(r));
  }

  /**
   * Finds all events for a student that overlap with or fall inside the given time window.
   * Two intervals [A.start, A.end] and [rangeStart, rangeEnd] overlap if:
   * A.start < rangeEnd AND A.end > rangeStart
   */
  findInRange(userId, rangeStart, rangeEnd, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = `
      SELECT * FROM calendar_events 
      WHERE user_id = ? 
        AND start_time < ? 
        AND end_time > ?
    `;
    const params = [userId, rangeEnd, rangeStart];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    } else {
      // Default to scheduled only unless explicitly specified
      query += " AND status != 'cancelled'";
    }

    if (options.course_id) {
      query += ' AND course_id = ?';
      params.push(options.course_id);
    }

    query += ' ORDER BY start_time ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => CalendarEvent.fromRow(r));
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

    if (options.event_type) {
      whereClause += ' AND event_type = ?';
      params.push(options.event_type);
    }

    if (options.status) {
      whereClause += ' AND status = ?';
      params.push(options.status);
    }

    if (options.start_after) {
      whereClause += ' AND start_time >= ?';
      params.push(Number(options.start_after));
    }

    if (options.end_before) {
      whereClause += ' AND end_time <= ?';
      params.push(Number(options.end_before));
    }

    if (options.search && typeof options.search === 'string' && options.search.trim()) {
      whereClause += ' AND (title LIKE ? OR description LIKE ? OR location LIKE ?)';
      const term = `%${options.search.trim()}%`;
      params.push(term, term, term);
    }

    // Determine ordering
    let orderClause = 'ORDER BY start_time ASC';
    if (options.sort_by === 'start_time_desc') {
      orderClause = 'ORDER BY start_time DESC';
    } else if (options.sort_by === 'created_at') {
      orderClause = 'ORDER BY created_at DESC';
    }

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM calendar_events ${whereClause}`);
    const total = countStmt.get(...params).count;

    const dataStmt = this.database.prepare(`
      SELECT * FROM calendar_events 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(...params, limit, offset);

    return {
      data: rows.map(r => CalendarEvent.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  create(event) {
    if (!(event instanceof CalendarEvent)) {
      throw new TypeError('event must be an instance of CalendarEvent');
    }

    const row = event.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO calendar_events (
        id, user_id, course_id, title, description, location,
        event_type, start_time, end_time, status,
        reminder_enabled, reminder_lead_time_minutes, created_at, updated_at
      ) VALUES (
        @id, @user_id, @course_id, @title, @description, @location,
        @event_type, @start_time, @end_time, @status,
        @reminder_enabled, @reminder_lead_time_minutes, @created_at, @updated_at
      )
    `);

    stmt.run(row);
    return event;
  }

  update(id, updates) {
    if (!id || typeof id !== 'string') return null;
    const existing = this.findById(id);
    if (!existing) return null;

    const allowedFields = [
      'course_id', 'title', 'description', 'location',
      'event_type', 'start_time', 'end_time', 'status',
      'reminder_enabled', 'reminder_lead_time_minutes'
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

    const query = `UPDATE calendar_events SET ${fieldsToSet.join(', ')} WHERE id = @id`;
    this.database.prepare(query).run(values);

    return this.findById(id);
  }

  delete(id) {
    if (!id || typeof id !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM calendar_events WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

module.exports = {
  CalendarEventRepository,
  calendarEventRepository: new CalendarEventRepository()
};
