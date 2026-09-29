/**
 * ReminderRepository
 *
 * Data-access operations for student commute reminders, status filtering,
 * due reminder querying, and lifecycle updates.
 */

const { getConnection } = require('../db/connection');
const { Reminder } = require('../models/Reminder');

class ReminderRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM reminders WHERE id = ?');
    const row = stmt.get(id);
    return row ? Reminder.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM reminders WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.reminder_type) {
      query += ' AND reminder_type = ?';
      params.push(options.reminder_type);
    }

    query += ' ORDER BY scheduled_time ASC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(Number(options.limit));
    }

    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => Reminder.fromRow(r));
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

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.reminder_type) {
      conditions.push('reminder_type = ?');
      params.push(options.reminder_type);
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countStmt = this.database.prepare(`SELECT COUNT(*) AS total FROM reminders WHERE ${whereClause}`);
    const countResult = countStmt.get(...params);
    const total = countResult ? countResult.total : 0;

    // Page data
    const query = `
      SELECT * FROM reminders 
      WHERE ${whereClause} 
      ORDER BY scheduled_time ASC 
      LIMIT ? OFFSET ?
    `;
    const rows = this.database.prepare(query).all(...params, limit, offset);

    return {
      data: rows.map(r => Reminder.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0
    };
  }

  findDueReminders(asOfTime = Date.now(), limit = 50) {
    const stmt = this.database.prepare(`
      SELECT * FROM reminders 
      WHERE status = 'scheduled' AND scheduled_time <= ? 
      ORDER BY scheduled_time ASC 
      LIMIT ?
    `);
    const rows = stmt.all(asOfTime, limit);
    return rows.map(r => Reminder.fromRow(r));
  }

  create(data) {
    const reminder = data instanceof Reminder ? data : Reminder.create(data);
    const row = reminder.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO reminders (
        id, user_id, title, message, scheduled_time, reminder_type,
        status, related_resource_type, related_resource_id, triggered_at,
        created_at, updated_at
      ) VALUES (
        @id, @user_id, @title, @message, @scheduled_time, @reminder_type,
        @status, @related_resource_type, @related_resource_id, @triggered_at,
        @created_at, @updated_at
      )
    `);

    stmt.run(row);
    return this.findById(reminder.id);
  }

  update(id, updates = {}) {
    const current = this.findById(id);
    if (!current) return null;

    const updatedTitle = updates.title !== undefined ? updates.title : current.title;
    const updatedMessage = updates.message !== undefined ? updates.message : current.message;
    const updatedScheduledTime = updates.scheduled_time !== undefined ? updates.scheduled_time : current.scheduled_time;
    const updatedType = updates.reminder_type !== undefined ? updates.reminder_type : current.reminder_type;
    const now = Date.now();

    const stmt = this.database.prepare(`
      UPDATE reminders 
      SET title = ?, message = ?, scheduled_time = ?, reminder_type = ?, updated_at = ? 
      WHERE id = ?
    `);

    stmt.run(updatedTitle, updatedMessage, updatedScheduledTime, updatedType, now, id);
    return this.findById(id);
  }

  updateStatus(id, newStatus, timestamp = Date.now()) {
    const current = this.findById(id);
    if (!current) return null;

    let triggeredAt = current.triggered_at;
    if (newStatus === 'triggered' && !triggeredAt) {
      triggeredAt = timestamp;
    }

    const stmt = this.database.prepare(`
      UPDATE reminders 
      SET status = ?, triggered_at = ?, updated_at = ? 
      WHERE id = ?
    `);

    stmt.run(newStatus, triggeredAt, timestamp, id);
    return this.findById(id);
  }

  delete(id) {
    if (!id || typeof id !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM reminders WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  findByResource(resourceType, resourceId) {
    if (!resourceType || !resourceId) return [];
    const stmt = this.database.prepare(
      'SELECT * FROM reminders WHERE related_resource_type = ? AND related_resource_id = ?'
    );
    const rows = stmt.all(resourceType, resourceId);
    return rows.map(r => Reminder.fromRow(r));
  }

  deleteByResource(resourceType, resourceId) {
    if (!resourceType || !resourceId) return 0;
    const stmt = this.database.prepare(
      'DELETE FROM reminders WHERE related_resource_type = ? AND related_resource_id = ?'
    );
    const result = stmt.run(resourceType, resourceId);
    return result.changes;
  }
}

const reminderRepository = new ReminderRepository();

module.exports = {
  ReminderRepository,
  reminderRepository
};
