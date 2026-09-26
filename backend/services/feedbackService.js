/**
 * Feedback Service
 *
 * Encapsulates business logic for student route feedback and recommendation ratings.
 */

const { feedbackRepository } = require('../repositories/FeedbackRepository');
const { NotFoundError } = require('../errors');

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

    return created.toJSON ? created.toJSON() : (created.toRow ? created.toRow() : created);
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
   * Lists feedback entries with pagination and filtering.
   *
   * @param {object|string} [options={}]
   * @returns {{ summary?: object, feedback: object[], pagination: object }}
   */
  listFeedback(options = {}) {
    const opts = typeof options === 'string' ? { recommendation_id: options } : (options || {});
    const result = this.repo.findWithPagination(opts);
    const feedback = result.data.map(f => (f.toJSON ? f.toJSON() : f));
    const summary = opts.recommendation_id ? this.getFeedbackSummary(opts.recommendation_id) : undefined;

    return {
      summary,
      feedback,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1
      }
    };
  }

  /**
   * Updates an existing feedback entry.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {object}
   */
  updateFeedback(id, updates) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Feedback with id '${id}' not found`);
    }

    const updated = this.repo.update(id, updates);
    return updated.toJSON ? updated.toJSON() : (updated.toRow ? updated.toRow() : updated);
  }

  /**
   * Deletes a feedback entry by ID.
   *
   * @param {string} id
   * @returns {boolean}
   */
  deleteFeedback(id) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Feedback with id '${id}' not found`);
    }

    return this.repo.delete(id);
  }

  /**
   * Atomically submits a batch of feedback entries inside a transaction.
   *
   * @param {object[]} items
   * @returns {object[]}
   */
  submitFeedbackBatch(items) {
    const created = this.repo.createBatch(items);
    return created.map(f => (f.toJSON ? f.toJSON() : (f.toRow ? f.toRow() : f)));
  }

  /**
   * Atomically cleans up all feedback associated with a recommendation.
   *
   * @param {string} recommendationId
   * @returns {number}
   */
  deleteFeedbackByRecommendation(recommendationId) {
    return this.repo.deleteByRecommendationId(recommendationId);
  }
}

module.exports = {
  FeedbackService,
  feedbackService: new FeedbackService()
};
