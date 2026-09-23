/**
 * Feedback Repository
 *
 * Data-access operations for Student Route Feedback.
 */

const { getConnection } = require('../db/connection');
const { Feedback } = require('../models/Feedback');

class FeedbackRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Persists new user feedback.
   *
   * @param {object|Feedback} data
   * @returns {Feedback}
   */
  create(data) {
    const fb = data instanceof Feedback ? data : Feedback.create(data);
    const row = fb.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO feedback (id, recommendation_id, is_useful, tags, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.recommendation_id,
      row.is_useful,
      row.tags,
      row.comment,
      row.created_at
    );

    return this.findById(row.id);
  }

  /**
   * Finds feedback by ID.
   *
   * @param {string} id
   * @returns {Feedback|null}
   */
  findById(id) {
    const stmt = this.database.prepare('SELECT * FROM feedback WHERE id = ?');
    const row = stmt.get(id);
    return row ? Feedback.fromRow(row) : null;
  }

  /**
   * Lists feedback entries for a specific route recommendation.
   *
   * @param {string} recommendationId
   * @returns {Feedback[]}
   */
  findByRecommendationId(recommendationId) {
    const stmt = this.database.prepare(
      'SELECT * FROM feedback WHERE recommendation_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(recommendationId);
    return rows.map(r => Feedback.fromRow(r));
  }

  /**
   * Computes helpful vs not helpful feedback summary for a recommendation.
   *
   * @param {string} recommendationId
   * @returns {{ total: number, helpful: number, notHelpful: number, helpfulPercentage: number }}
   */
  getRatingSummary(recommendationId) {
    const list = this.findByRecommendationId(recommendationId);
    const total = list.length;
    if (total === 0) {
      return { total: 0, helpful: 0, notHelpful: 0, helpfulPercentage: 0 };
    }
    const helpful = list.filter(f => f.is_useful).length;
    const notHelpful = total - helpful;
    const helpfulPercentage = Math.round((helpful / total) * 100);
    return { total, helpful, notHelpful, helpfulPercentage };
  }

  /**
   * Updates an existing feedback entry.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {Feedback|null}
   */
  update(id, updates) {
    const existing = this.findById(id);
    if (!existing) return null;

    const isUseful = updates.is_useful !== undefined ? (updates.is_useful ? 1 : 0) : (existing.is_useful ? 1 : 0);
    const tags = updates.tags !== undefined ? JSON.stringify(updates.tags) : JSON.stringify(existing.tags);
    const comment = updates.comment !== undefined ? updates.comment : existing.comment;

    const stmt = this.database.prepare(`
      UPDATE feedback
      SET is_useful = ?, tags = ?, comment = ?
      WHERE id = ?
    `);
    stmt.run(isUseful, tags, comment, id);
    return this.findById(id);
  }

  /**
   * Deletes a feedback entry by ID.
   *
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const stmt = this.database.prepare('DELETE FROM feedback WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  }
}

module.exports = {
  FeedbackRepository,
  feedbackRepository: new FeedbackRepository()
};
