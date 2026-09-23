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
}

module.exports = {
  FeedbackService,
  feedbackService: new FeedbackService()
};
