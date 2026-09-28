/**
 * NotificationRepository
 *
 * Data-access operations for student notifications with filtering,
 * read-state tracking, and pagination.
 */

const { getConnection } = require('../db/connection');
const { Notification } = require('../models/Notification');

class NotificationRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM notifications WHERE id = ?');
    const row = stmt.get(id);
    return row ? Notification.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (options.read !== undefined && options.read !== null) {
      const readVal = options.read === true || options.read === 1 || options.read === '1' || options.read === 'true' ? 1 : 0;
      query += ' AND read = ?';
      params.push(readVal);
    }
    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }
    if (options.priority) {
      query += ' AND priority = ?';
      params.push(options.priority);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(Number(options.limit));
    }

    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => Notification.fromRow(r));
  }

  findWithPaginationAndFilters(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      return { data: [], total: 0, page: 1, limit: 20, totalPages: 0, unreadCount: 0 };
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.read !== undefined && options.read !== null && options.read !== '') {
      const readVal = options.read === true || options.read === 1 || options.read === '1' || options.read === 'true' ? 1 : 0;
      conditions.push('read = ?');
      params.push(readVal);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    const whereClause = conditions.join(' AND ');

    // Count matching
    const countStmt = this.database.prepare(`SELECT COUNT(*) AS total FROM notifications WHERE ${whereClause}`);
    const countResult = countStmt.get(...params);
    const total = countResult ? countResult.total : 0;

    // Unread count specifically for this user
    const unreadStmt = this.database.prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0');
    const unreadResult = unreadStmt.get(userId);
    const unreadCount = unreadResult ? unreadResult.unread : 0;

    // Fetch page data
    const query = `
      SELECT * FROM notifications 
      WHERE ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const rows = this.database.prepare(query).all(...params, limit, offset);

    return {
      data: rows.map(r => Notification.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
      unreadCount
    };
  }

  getUnreadCount(userId) {
    if (!userId || typeof userId !== 'string') return 0;
    const stmt = this.database.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0');
    const res = stmt.get(userId);
    return res ? res.count : 0;
  }

  create(data) {
    const notification = data instanceof Notification ? data : Notification.create(data);
    const row = notification.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO notifications (
        id, user_id, type, title, message, priority, read, read_at,
        related_resource_type, related_resource_id, payload, created_at, expires_at
      ) VALUES (
        @id, @user_id, @type, @title, @message, @priority, @read, @read_at,
        @related_resource_type, @related_resource_id, @payload, @created_at, @expires_at
      )
    `);

    stmt.run(row);
    return this.findById(notification.id);
  }

  markAsRead(id, timestamp = Date.now()) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare(`
      UPDATE notifications 
      SET read = 1, read_at = ? 
      WHERE id = ?
    `);
    stmt.run(timestamp, id);
    return this.findById(id);
  }

  markAllAsRead(userId, timestamp = Date.now()) {
    if (!userId || typeof userId !== 'string') return 0;
    const stmt = this.database.prepare(`
      UPDATE notifications 
      SET read = 1, read_at = ? 
      WHERE user_id = ? AND read = 0
    `);
    const result = stmt.run(timestamp, userId);
    return result.changes;
  }

  markMultipleAsRead(userId, ids = [], timestamp = Date.now()) {
    if (!userId || !Array.isArray(ids) || ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.database.prepare(`
      UPDATE notifications 
      SET read = 1, read_at = ? 
      WHERE user_id = ? AND id IN (${placeholders}) AND read = 0
    `);

    const result = stmt.run(timestamp, userId, ...ids);
    return result.changes;
  }

  delete(id) {
    if (!id || typeof id !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM notifications WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteExpired(now = Date.now()) {
    const stmt = this.database.prepare('DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at <= ?');
    const result = stmt.run(now);
    return result.changes;
  }
}

const notificationRepository = new NotificationRepository();

module.exports = {
  NotificationRepository,
  notificationRepository
};
