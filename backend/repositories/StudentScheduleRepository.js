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
