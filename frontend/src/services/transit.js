/**
 * Transit Search Feature Service
 *
 * Feature-specific frontend functions for the Transit Search feature
 * (station / stop and line lookup across official Mumbai GTFS data).
 * Wraps the centralized API client (api.js) so presentation components
 * never call raw endpoints directly.
 *
 * BACKEND DEPENDENCIES (real, existing endpoint):
 * - GET /api/transit/search   (query: q | lat, lon)
 *
 * All functions resolve with normalized data and reject with FrontendApiError
 * carrying user-friendly messages (never stack traces).
 */
import { searchTransitNetwork } from './api';

/**
 * Search GTFS stops and routes by free text (or nearby by coordinates).
 *
 * @param {Object} [params] - { q } or { lat, lon }
 * @returns {Promise<{stops: Array, routes: Array}>} Normalized result lists
 */
export async function searchTransit(params = {}) {
  const res = await searchTransitNetwork(params);
  if (!res?.success) return { stops: [], routes: [] };
  return {
    stops: Array.isArray(res.stops) ? res.stops : [],
    routes: Array.isArray(res.routes) ? res.routes : [],
  };
}
