/**
 * SavedRouteRepository
 *
 * Data-access operations for student saved/bookmarked commute routes.
 */

const { getConnection } = require('../db/connection');
const { SavedRoute } = require('../models/SavedRoute');

class SavedRouteRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM saved_routes WHERE id = ?');
    const row = stmt.get(id);
    return row ? SavedRoute.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM saved_routes WHERE user_id = ?';
    const params = [userId];

    if (options.preferred_mode) {
      query += ' AND LOWER(preferred_mode) = LOWER(?)';
      params.push(options.preferred_mode);
    }

    query += ' ORDER BY created_at DESC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => SavedRoute.fromRow(r));
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

    if (options.preferred_mode) {
      conditions.push('LOWER(preferred_mode) = LOWER(?)');
      params.push(options.preferred_mode);
    }
    if (options.max_budget) {
      conditions.push('max_budget <= ?');
      params.push(Number(options.max_budget));
    }
    if (options.search) {
      conditions.push('(LOWER(name) LIKE LOWER(?) OR LOWER(origin) LIKE LOWER(?) OR LOWER(destination) LIKE LOWER(?))');
      const term = `%${options.search}%`;
      params.push(term, term, term);
    }
    if (options.tag) {
      conditions.push('LOWER(tags) LIKE LOWER(?)');
      params.push(`%${options.tag}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM saved_routes ${whereClause}`);
    const { count: total } = countStmt.get(...params);

    const queryStmt = this.database.prepare(`
      SELECT * FROM saved_routes
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = queryStmt.all(...params, limit, offset);

    return {
      data: rows.map(r => SavedRoute.fromRow(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  create(data) {
    const route = data instanceof SavedRoute ? data : SavedRoute.create(data);
    const row = route.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO saved_routes (
        id, user_id, name, origin, destination,
        preferred_mode, max_budget, summary, tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.user_id,
      row.name,
      row.origin,
      row.destination,
      row.preferred_mode,
      row.max_budget,
      row.summary,
      row.tags,
      row.created_at
    );

    return this.findById(row.id);
  }

  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const name = updates.name !== undefined ? updates.name : existing.name;
    const origin = updates.origin !== undefined ? updates.origin : existing.origin;
    const destination = updates.destination !== undefined ? updates.destination : existing.destination;
    const preferredMode = updates.preferred_mode !== undefined ? updates.preferred_mode : existing.preferred_mode;
    const maxBudget = updates.max_budget !== undefined ? Number(updates.max_budget) : existing.max_budget;
    const summary = updates.summary !== undefined ? updates.summary : existing.summary;
    const tags = updates.tags !== undefined
      ? (Array.isArray(updates.tags) ? JSON.stringify(updates.tags) : updates.tags)
      : JSON.stringify(existing.tags);

    const stmt = this.database.prepare(`
      UPDATE saved_routes
      SET name = ?,
          origin = ?,
          destination = ?,
          preferred_mode = ?,
          max_budget = ?,
          summary = ?,
          tags = ?
      WHERE id = ?
    `);

    stmt.run(
      name,
      origin,
      destination,
      preferredMode,
      maxBudget,
      summary,
      tags,
      id
    );

    return this.findById(id);
  }

  delete(id) {
    const stmt = this.database.prepare('DELETE FROM saved_routes WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  }
}

const savedRouteRepository = new SavedRouteRepository();

module.exports = {
  SavedRouteRepository,
  savedRouteRepository
};
