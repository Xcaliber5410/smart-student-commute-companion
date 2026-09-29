/**
 * CourseRepository
 *
 * Data-access operations for student academic courses and subjects.
 */

const { getConnection } = require('../db/connection');
const { Course } = require('../models/Course');

class CourseRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM courses WHERE id = ?');
    const row = stmt.get(id);
    return row ? Course.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM courses WHERE user_id = ?';
    const params = [userId];

    if (options.archived !== undefined) {
      query += ' AND archived = ?';
      params.push(options.archived ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => Course.fromRow(r));
  }

  findByNameAndUser(name, userId) {
    if (!name || !userId) return null;
    const stmt = this.database.prepare(
      'SELECT * FROM courses WHERE user_id = ? AND LOWER(name) = LOWER(?)'
    );
    const row = stmt.get(userId, name.trim());
    return row ? Course.fromRow(row) : null;
  }

  findByCodeAndUser(code, userId) {
    if (!code || !userId) return null;
    const stmt = this.database.prepare(
      'SELECT * FROM courses WHERE user_id = ? AND LOWER(code) = LOWER(?)'
    );
    const row = stmt.get(userId, code.trim());
    return row ? Course.fromRow(row) : null;
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

    if (options.archived !== undefined) {
      conditions.push('archived = ?');
      params.push(options.archived ? 1 : 0);
    }

    if (options.search && typeof options.search === 'string') {
      conditions.push('(LOWER(name) LIKE LOWER(?) OR LOWER(code) LIKE LOWER(?) OR LOWER(instructor) LIKE LOWER(?))');
      const searchParam = `%${options.search.trim()}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM courses WHERE ${whereClause}`);
    const total = countStmt.get(...params).count;

    const dataStmt = this.database.prepare(`
      SELECT * FROM courses
      WHERE ${whereClause}
      ORDER BY archived ASC, created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: rows.map(r => Course.fromRow(r)),
      total,
      page,
      limit,
      totalPages
    };
  }

  create(courseInstance) {
    const row = courseInstance.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO courses (
        id, user_id, name, code, instructor, color, credits, archived, created_at, updated_at
      ) VALUES (
        @id, @user_id, @name, @code, @instructor, @color, @credits, @archived, @created_at, @updated_at
      )
    `);
    stmt.run(row);
    return this.findById(row.id);
  }

  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const allowed = ['name', 'code', 'instructor', 'color', 'credits', 'archived'];
    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(key === 'archived' ? (updates[key] ? 1 : 0) : updates[key]);
      }
    }

    if (setClauses.length === 0) return existing;

    setClauses.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    const stmt = this.database.prepare(`
      UPDATE courses
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...params);

    return this.findById(id);
  }

  archive(id, archived = true) {
    return this.update(id, { archived: archived ? 1 : 0 });
  }

  delete(id) {
    const stmt = this.database.prepare('DELETE FROM courses WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  countByUserId(userId, options = {}) {
    if (!userId) return 0;
    let query = 'SELECT COUNT(*) as cnt FROM courses WHERE user_id = ?';
    const params = [userId];

    if (options.archived !== undefined) {
      query += ' AND archived = ?';
      params.push(options.archived ? 1 : 0);
    }

    const stmt = this.database.prepare(query);
    return stmt.get(...params).cnt;
  }
}

module.exports = {
  CourseRepository,
  courseRepository: new CourseRepository()
};
