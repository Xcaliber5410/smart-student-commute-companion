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
