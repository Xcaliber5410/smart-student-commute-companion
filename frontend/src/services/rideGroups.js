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
import { fetchRideGroups, postRideGroup, joinRideGroup } from './api';

/**
 * List active commute groups.
 * @param {Object} [filters] - { page, limit, mode, origin, destination, status }
 * @returns {Promise<Array>} Normalized group list
 */
export async function listGroups(filters = {}) {
  const res = await fetchRideGroups(filters);
  if (!res?.success) return [];
  return res.groups || [];
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
