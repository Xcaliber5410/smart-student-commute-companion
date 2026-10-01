/**
 * GoalRepository
 *
 * Data-access operations for student academic, personal, and skill goals.
 */

const { getConnection } = require('../db/connection');
const { Goal } = require('../models/Goal');

class GoalRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM goals WHERE id = ?');
    const row = stmt.get(id);
    return row ? Goal.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM goals WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    if (options.course_id !== undefined) {
      if (options.course_id === null) {
        query += ' AND course_id IS NULL';
      } else {
        query += ' AND course_id = ?';
        params.push(options.course_id);
      }
    }

    query += ' ORDER BY created_at DESC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => Goal.fromRow(r));
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

    if (options.course_id !== undefined && options.course_id !== null && options.course_id !== '') {
      conditions.push('course_id = ?');
      params.push(options.course_id);
    }

    if (options.search && typeof options.search === 'string') {
      conditions.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      const searchParam = `%${options.search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM goals WHERE ${whereClause}`);
    const total = countStmt.get(...params).count;

    const dataStmt = this.database.prepare(`
      SELECT * FROM goals
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN status = 'in_progress' THEN 1
          WHEN status = 'on_hold' THEN 2
          WHEN status = 'completed' THEN 3
          ELSE 4
        END,
        target_date ASC,
        created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: rows.map(r => Goal.fromRow(r)),
      total,
      page,
      limit,
      totalPages
    };
  }

  create(goalInstance) {
    const row = goalInstance.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO goals (
        id, user_id, course_id, title, description, target_date,
        status, progress, target_value, current_value, unit,
        completed_at, created_at, updated_at
      ) VALUES (
        @id, @user_id, @course_id, @title, @description, @target_date,
        @status, @progress, @target_value, @current_value, @unit,
        @completed_at, @created_at, @updated_at
      )
    `);
    stmt.run(row);
    return this.findById(row.id);
  }

  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const allowed = [
      'course_id', 'title', 'description', 'target_date',
      'status', 'progress', 'target_value', 'current_value', 'unit',
      'completed_at', 'updated_at'
    ];

    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(updates[key]);
      }
    }

    if (sets.length === 0) return existing;

    if (!updates.updated_at) {
      sets.push('updated_at = ?');
      params.push(Date.now());
    }

    params.push(id);
    const query = `UPDATE goals SET ${sets.join(', ')} WHERE id = ?`;
    this.database.prepare(query).run(...params);

    return this.findById(id);
  }

  delete(id) {
    if (!id || typeof id !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM goals WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

const goalRepository = new GoalRepository();

module.exports = {
  GoalRepository,
  goalRepository
};
