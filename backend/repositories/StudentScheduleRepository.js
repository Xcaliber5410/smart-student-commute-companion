/**
 * StudentScheduleRepository
 *
 * Data-access operations for student recurring commute schedules.
 */

const { getConnection } = require('../db/connection');
const { StudentSchedule } = require('../models/StudentSchedule');

class StudentScheduleRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM student_schedules WHERE id = ?');
    const row = stmt.get(id);
    return row ? StudentSchedule.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM student_schedules WHERE user_id = ?';
    const params = [userId];

    if (options.active !== undefined) {
      query += ' AND active = ?';
      params.push(options.active ? 1 : 0);
    }

    query += ' ORDER BY target_arrival_time ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => StudentSchedule.fromRow(r));
  }

  findActiveSchedulesForDay(day) {
    if (!day || typeof day !== 'string') return [];
    const stmt = this.database.prepare(`
      SELECT * FROM student_schedules 
      WHERE active = 1 AND LOWER(days_of_week) LIKE LOWER(?)
      ORDER BY target_arrival_time ASC
    `);
    const rows = stmt.all(`%${day}%`);
    return rows.map(r => StudentSchedule.fromRow(r));
  }

  findWithPaginationAndFilters(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.active !== undefined && options.active !== '') {
      conditions.push('active = ?');
      params.push(options.active === true || options.active === 'true' || options.active === 1 || options.active === '1' ? 1 : 0);
    }
    const dayFilter = options.day || options.day_of_week;
    if (dayFilter) {
      conditions.push('LOWER(days_of_week) LIKE LOWER(?)');
      params.push(`%${dayFilter}%`);
    }
    if (options.search) {
      conditions.push('(LOWER(title) LIKE LOWER(?) OR LOWER(origin) LIKE LOWER(?) OR LOWER(destination) LIKE LOWER(?))');
      const term = `%${options.search}%`;
      params.push(term, term, term);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM student_schedules ${whereClause}`);
    const { count: total } = countStmt.get(...params);

    const queryStmt = this.database.prepare(`
      SELECT * FROM student_schedules
      ${whereClause}
      ORDER BY target_arrival_time ASC
      LIMIT ? OFFSET ?
    `);
    const rows = queryStmt.all(...params, limit, offset);

    return {
      data: rows.map(r => StudentSchedule.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  create(data) {
    const schedule = data instanceof StudentSchedule ? data : StudentSchedule.create(data);
    const row = schedule.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO student_schedules (
        id, user_id, title, origin, destination,
        target_arrival_time, days_of_week, reminder_enabled, active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.user_id,
      row.title,
      row.origin,
      row.destination,
      row.target_arrival_time,
      row.days_of_week,
      row.reminder_enabled,
      row.active,
      row.created_at,
      row.updated_at
    );

    return this.findById(row.id);
  }

  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const title = updates.title !== undefined ? updates.title : existing.title;
    const origin = updates.origin !== undefined ? updates.origin : existing.origin;
    const destination = updates.destination !== undefined ? updates.destination : existing.destination;
    const arrivalTime = updates.target_arrival_time !== undefined ? updates.target_arrival_time : existing.target_arrival_time;
    const daysOfWeek = updates.days_of_week !== undefined
      ? (Array.isArray(updates.days_of_week) ? JSON.stringify(updates.days_of_week) : updates.days_of_week)
      : JSON.stringify(existing.days_of_week);
    const reminderEnabled = updates.reminder_enabled !== undefined ? (updates.reminder_enabled ? 1 : 0) : (existing.reminder_enabled ? 1 : 0);
    const active = updates.active !== undefined ? (updates.active ? 1 : 0) : (existing.active ? 1 : 0);
    const now = Date.now();

    const stmt = this.database.prepare(`
      UPDATE student_schedules
      SET title = ?,
          origin = ?,
          destination = ?,
          target_arrival_time = ?,
          days_of_week = ?,
          reminder_enabled = ?,
          active = ?,
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      title,
      origin,
      destination,
      arrivalTime,
      daysOfWeek,
      reminderEnabled,
      active,
      now,
      id
    );

    return this.findById(id);
  }

  delete(id) {
    const stmt = this.database.prepare('DELETE FROM student_schedules WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  }
}

const studentScheduleRepository = new StudentScheduleRepository();

module.exports = {
  StudentScheduleRepository,
  studentScheduleRepository
};
