/**
 * Ride Groups Feature Service
 *
 * Feature-specific frontend functions for the Travel Together feature.
 * Wraps the centralized API client (api.js) so presentation components
 * never call raw endpoints directly.
 *
 * BACKEND DEPENDENCIES (real, existing endpoints — see README API table):
 * - GET  /api/ride-groups        (query: page, limit, mode, origin, destination, status)
 * - POST /api/ride-groups
 * - POST /api/ride-groups/:id/join
 *
 * All functions resolve with parsed JSON and reject with FrontendApiError
 * carrying user-friendly messages (never stack traces).
 */
import { fetchRideGroups, postRideGroup, joinRideGroup, FrontendApiError } from './api';

/**
 * List active commute groups.
 *
 * Request-state contract:
 * - A 2xx response reporting `success: false` rejects instead of resolving to
 *   an empty list, so screens render their error state rather than a false
 *   "no groups" empty state. A genuinely empty feed still resolves to [].
 *
 * @param {Object} [filters] - { page, limit, mode, origin, destination, status }
 * @returns {Promise<Array>} Normalized group list
 * @throws {FrontendApiError} When the request or the reported result failed
 */
export async function listGroups(filters = {}) {
  const res = await fetchRideGroups(filters);
  if (res?.success === false) {
    throw new FrontendApiError(
      res.message || 'Commute groups could not be loaded right now. Please try again.',
      null
    );
  }
  return Array.isArray(res?.groups) ? res.groups : [];
}

/**
 * Create a new commute coordination group.
 * @param {Object} group - Group payload
 */
export function createGroup(group) {
  return postRideGroup(group);
}

/**
 * Join an existing commute group.
 * @param {string} groupId
 */
export function joinGroup(groupId) {
  return joinRideGroup(groupId);
}
