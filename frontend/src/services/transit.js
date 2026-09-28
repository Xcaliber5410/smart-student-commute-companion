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
import { searchTransitNetwork, FrontendApiError } from './api';

/**
 * Search GTFS stops and routes by free text (or nearby by coordinates).
 *
 * Request-state contract:
 * - Network/HTTP failures reject with FrontendApiError (from api.js).
 * - A 2xx response that explicitly reports `success: false` is treated as a
 *   FAILED request (rejected), never as an empty result — so the UI can show
 *   an error state with retry instead of a misleading "no matches" state.
 *
 * @param {Object} [params] - { q } or { lat, lon }
 * @returns {Promise<{stops: Array, routes: Array}>} Normalized result lists
 * @throws {FrontendApiError} When the request or the reported result failed
 */
export async function searchTransit(params = {}) {
  const res = await searchTransitNetwork(params);

  if (res?.success === false) {
    throw new FrontendApiError(
      res.message ||
        'The transit search could not be completed right now. Please try again.',
      null
    );
  }

  return {
    stops: Array.isArray(res?.stops) ? res.stops : [],
    routes: Array.isArray(res?.routes) ? res.routes : [],
  };
}
