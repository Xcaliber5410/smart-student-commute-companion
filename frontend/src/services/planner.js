/**
 * Planner Feature Service
 *
 * Feature-specific frontend functions for the Plan Route feature.
 * Wraps the centralized API client (api.js) so presentation components
 * never call raw endpoints directly.
 *
 * BACKEND DEPENDENCIES (real, existing endpoints — see README API table):
 * - POST /api/plan        (geocode, transit candidates, scoring, AI reasoning)
 * - POST /api/feedback    (recommendation rating)
 *
 * All functions resolve with parsed JSON and reject with FrontendApiError
 * carrying user-friendly messages (never stack traces).
 */
import { planCommute, submitFeedback } from './api';

/**
 * Request a multi-modal commute plan.
 * @param {Object} planData - Planner form values
 * @returns {Promise<Object>} Plan result (success, recommendation, alternatives...)
 */
export function requestPlan(planData) {
  return planCommute(planData);
}

/**
 * Submit feedback for a route recommendation.
 * @param {Object} feedback - { recommendation_id, is_useful, tags, comment }
 */
export function sendFeedback(feedback) {
  return submitFeedback(feedback);
}
