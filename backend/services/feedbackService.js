/**
 * Feedback Service
 *
 * Encapsulates business logic for student route feedback and recommendation ratings.
 */

const { feedbackRepository } = require('../repositories/FeedbackRepository');

class FeedbackService {
  constructor(repo = feedbackRepository) {
    this.repo = repo;
  }

  /**
   * Persists student feedback for a recommended route.
   *
   * @param {object} input
   * @returns {object}
   */
  submitFeedback(input) {
    const id = input.id || `fb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const created = this.repo.create({
      id,
      recommendation_id: input.recommendation_id || '',
      is_useful: Boolean(input.is_useful),
      tags: input.tags || [],
      comment: input.comment || '',
      created_at: input.created_at || Date.now()
    });

    return created.toRow ? created.toRow() : created;
  }

  /**
   * Computes rating summary metrics (helpful percentage, counts) for a recommendation.
   *
   * @param {string} recommendationId
   * @returns {object}
   */
  getFeedbackSummary(recommendationId) {
    return this.repo.getRatingSummary(recommendationId);
  }

  /**
   * Retrieves all feedback entries for a specific route recommendation.
   *
   * @param {string} recommendationId
   * @returns {object[]}
   */
  getFeedbackForRecommendation(recommendationId) {
    const list = this.repo.findByRecommendationId(recommendationId);
    return list.map(f => (f.toRow ? f.toRow() : f));
  }

  /**
   * Lists feedback entries, optionally filtered by recommendation_id.
   *
   * @param {string} [recommendationId]
   * @returns {{ summary?: object, feedback: object[] }}
   */
  listFeedback(recommendationId) {
    if (recommendationId) {
      const feedback = this.getFeedbackForRecommendation(recommendationId);
      const summary = this.getFeedbackSummary(recommendationId);
      return { summary, feedback };
    }
    const stmt = this.repo.database.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50');
    const rows = stmt.all();
    const feedback = rows.map(r => {
      let tags = [];
      try { tags = JSON.parse(r.tags); } catch (e) { tags = []; }
      return {
        id: r.id,
        recommendation_id: r.recommendation_id,
        is_useful: Boolean(r.is_useful),
        tags,
        comment: r.comment,
        created_at: Number(r.created_at)
      };
    });
    return { feedback };
  }
}

module.exports = {
  FeedbackService,
  feedbackService: new FeedbackService()
};
