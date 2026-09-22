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
}

module.exports = {
  FeedbackRepository,
  feedbackRepository: new FeedbackRepository()
};
