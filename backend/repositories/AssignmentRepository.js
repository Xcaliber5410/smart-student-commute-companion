/**
 * AssignmentRepository
 *
 * Data-access operations for student academic tasks, deliverables, and assignments.
 */

const { getConnection } = require('../db/connection');
const { Assignment } = require('../models/Assignment');

class AssignmentRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM assignments WHERE id = ?');
    const row = stmt.get(id);
    return row ? Assignment.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM assignments WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.course_id) {
      query += ' AND course_id = ?';
      params.push(options.course_id);
    }

    query += ' ORDER BY due_date ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => Assignment.fromRow(r));
  }

  findByCourseId(courseId) {
    if (!courseId) return [];
    const stmt = this.database.prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC');
    const rows = stmt.all(courseId);
    return rows.map(r => Assignment.fromRow(r));
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

    if (options.course_id) {
      conditions.push('course_id = ?');
      params.push(options.course_id);
    }

    if (options.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    if (options.due_date_from !== undefined) {
      conditions.push('due_date >= ?');
      params.push(Number(options.due_date_from));
    }

    if (options.due_date_to !== undefined) {
      conditions.push('due_date <= ?');
      params.push(Number(options.due_date_to));
    }

    if (options.overdue === true) {
      const now = Date.now();
      conditions.push("status NOT IN ('completed', 'cancelled') AND due_date < ?");
      params.push(now);
    }

    if (options.upcoming === true) {
      const now = Date.now();
      const sevenDaysLater = now + (7 * 24 * 60 * 60 * 1000);
      conditions.push("status NOT IN ('completed', 'cancelled') AND due_date >= ? AND due_date <= ?");
      params.push(now, sevenDaysLater);
    }

    if (options.search && typeof options.search === 'string') {
      conditions.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      const searchParam = `%${options.search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    const whereClause = conditions.join(' AND ');

    // Order By resolution
    let orderBy = 'due_date ASC';
    if (options.sort_by === 'due_date_desc') {
      orderBy = 'due_date DESC';
    } else if (options.sort_by === 'created_at') {
      orderBy = 'created_at DESC';
    } else if (options.sort_by === 'priority') {
      orderBy = `
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END ASC, due_date ASC
      `;
    }

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM assignments WHERE ${whereClause}`);
    const total = countStmt.get(...params).count;

    const dataStmt = this.database.prepare(`
      SELECT * FROM assignments
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: rows.map(r => Assignment.fromRow(r)),
      total,
      page,
      limit,
      totalPages
    };
  }

  create(assignmentInstance) {
    const row = assignmentInstance.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO assignments (
        id, user_id, course_id, title, description, due_date, priority, status,
        reminder_enabled, reminder_lead_time_minutes, completed_at, created_at, updated_at
      ) VALUES (
        @id, @user_id, @course_id, @title, @description, @due_date, @priority, @status,
        @reminder_enabled, @reminder_lead_time_minutes, @completed_at, @created_at, @updated_at
      )
    `);
    stmt.run(row);
    return this.findById(row.id);
  }

  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const allowed = [
      'course_id',
      'title',
      'description',
      'due_date',
      'priority',
      'status',
      'reminder_enabled',
      'reminder_lead_time_minutes',
      'completed_at'
    ];
    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(updates[key]);
      }
    }

    if (setClauses.length === 0) return existing;

    setClauses.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    const stmt = this.database.prepare(`
      UPDATE assignments
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...params);

    return this.findById(id);
  }

  updateStatus(id, newStatus, completedAt = null) {
    const now = Date.now();
    const stmt = this.database.prepare(`
      UPDATE assignments
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(newStatus, completedAt, now, id);
    return this.findById(id);
  }

  delete(id) {
    const stmt = this.database.prepare('DELETE FROM assignments WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  countByUserId(userId, options = {}) {
    if (!userId) return 0;
    let query = 'SELECT COUNT(*) as cnt FROM assignments WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    const stmt = this.database.prepare(query);
    return stmt.get(...params).cnt;
  }
}

module.exports = {
  AssignmentRepository,
  assignmentRepository: new AssignmentRepository()
};
