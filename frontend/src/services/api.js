import { API_BASE_URL, logger } from '../config/index.js';
import {
  readAuthToken,
  clearAuthSession,
  AUTH_SESSION_EXPIRED_EVENT,
} from '../utils/authSession.js';

/**
 * Frontend API Service Layer
 *
 * Centralizes all backend communication with:
 * - Configurable request timeouts with AbortController
 * - Consistent HTTP error handling
 * - Network failure detection
 * - Frontend-friendly error conversion (no stack traces exposed)
 * - Anonymous user token management (UX, not security)
 * - Optional Bearer session header for signed-in students (Day 14)
 *
 * SECURITY NOTE:
 * - No secrets or credentials are stored here.
 * - The `smart_commute_user_token` is a privacy pseudonym for anonymous
 *   voting only.
 * - The Student Account JWT lives in `utils/authSession.js` (device-local)
 *   and is attached to requests here only while a session exists; requests
 *   made while signed out are byte-for-byte what they were before Day 14.
 * - All real authorization is enforced server-side.
 */

// Default request timeout in milliseconds
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * FrontendApiError — wraps API failures with a user-friendly message.
 * Never exposes raw stack traces or server internals to the UI.
 */
export class FrontendApiError extends Error {
  /**
   * @param {string} message - User-friendly error message
   * @param {number|null} [status=null] - HTTP status code if available
   * @param {boolean} [isNetwork=false] - Whether this is a network-level failure
   */
  constructor(message, status = null, isNetwork = false) {
    super(message);
    this.name = 'FrontendApiError';
    this.status = status;
    this.isNetwork = isNetwork;
  }
}

/**
 * Core fetch wrapper with timeout, error normalization, and safe logging.
 * Exported so feature services (e.g. services/auth.js) reuse one request
 * path — timeouts, error mapping, the Bearer header and session-expiry
 * handling — instead of re-implementing fetch themselves.
 *
 * @param {string} path - API path (appended to API_BASE_URL)
 * @param {RequestInit} [options={}] - Standard fetch options
 * @param {number} [timeoutMs=DEFAULT_TIMEOUT_MS] - Abort timeout in ms
 * @returns {Promise<any>} Parsed JSON response
 * @throws {FrontendApiError} On any network or HTTP error
 */
export async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Day 14 — attach the stored session token to authenticated calls.
  // Credential endpoints authenticate through their request body, so they
  // never carry a (possibly stale) Bearer header; while signed out this is
  // a no-op and no Authorization header is sent at all.
  const isCredentialEndpoint =
    path.startsWith('/auth/login') || path.startsWith('/auth/register');
  const authToken = isCredentialEndpoint ? null : readAuthToken();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401 && authToken) {
      // The backend rejected our stored session — it is no longer valid.
      // Drop it from the device and tell the app, so the UI never keeps
      // rendering a signed-in student that the server no longer accepts.
      // (Bad credentials on /auth/login never reach this branch: those
      // requests carry no Authorization header.)
      clearAuthSession();
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
      }
    }

    if (!response.ok) {
      // Try to extract a server-provided message — but never expose raw internals
      let serverMessage = null;
      try {
        const body = await response.json();
        serverMessage = body?.message || body?.error || null;
      } catch {
        // Ignore JSON parse errors on error bodies
      }

      const friendlyMessage = toFriendlyHttpError(response.status, serverMessage);
      logger.warn(`[API] ${options.method || 'GET'} ${path} → ${response.status}`, { serverMessage });
      throw new FrontendApiError(friendlyMessage, response.status, false);
    }

    return response.json();
  } catch (err) {
    if (err instanceof FrontendApiError) throw err;

    // AbortController timeout
    if (err.name === 'AbortError') {
      throw new FrontendApiError(
        'The request took too long. Please check your connection and try again.',
        null,
        true
      );
    }

    // Network failure (no internet, CORS, etc.)
    logger.warn('[API] Network error:', err.message);
    throw new FrontendApiError(
      'Unable to connect to the server. Please check your internet connection.',
      null,
      true
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convert HTTP status codes to human-readable, non-technical messages.
 *
 * @param {number} status - HTTP status code
 * @param {string|null} serverMessage - Optional server-provided message
 * @returns {string} User-friendly error message
 */
function toFriendlyHttpError(status, serverMessage) {
  if (serverMessage) return serverMessage;

  switch (true) {
    case status === 400: return 'The request was invalid. Please check your inputs and try again.';
    case status === 401: return 'You are not authorized to perform this action.';
    case status === 403: return 'Access denied. You do not have permission.';
    case status === 404: return 'The requested resource was not found.';
    case status === 409: return 'A conflict occurred. Please refresh and try again.';
    case status === 422: return 'The submitted data could not be processed. Please check your inputs.';
    case status === 429: return 'Too many requests. Please wait a moment before trying again.';
    case status >= 500:  return 'The server encountered an error. Please try again in a moment.';
    default:             return `Request failed (${status}). Please try again.`;
  }
}

/**
 * Retrieve or generate a persistent anonymous user token.
 * Used only for pseudonymous crowdsourced voting — NOT for authentication.
 */
function getOrGenerateUserToken() {
  let token = localStorage.getItem('smart_commute_user_token');
  if (!token) {
    token = 'student-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('smart_commute_user_token', token);
  }
  return token;
}

// ─── Public API Functions ────────────────────────────────────────────────────

/** Check backend health */
export async function checkHealth() {
  return request('/health');
}

/**
 * Plan a multi-modal commute route
 * @param {Object} planData - Commute planning parameters
 */
export async function planCommute(planData) {
  return request('/plan', {
    method: 'POST',
    body: JSON.stringify(planData)
  });
}

/**
 * Build a URL query string from defined params (skips empty/undefined/'all').
 * Only used against real backend query contracts — never fabricates keys.
 *
 * @param {Object} params - Key/value query parameters
 * @returns {string} '' or '?a=1&b=2'
 */
function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Fetch active live disruption reports
 *
 * Supports the real backend filter contract (reportFilterQuerySchema):
 * page, limit, mode, area, impact, status.
 *
 * @param {Object} [filters] - Optional server-side filters
 */
export async function fetchLiveReports(filters = {}) {
  return request(`/live-reports${buildQuery(filters)}`);
}

/**
 * Post a new live disruption report
 * @param {Object} reportData - Report content
 */
export async function postLiveReport(reportData) {
  return request('/live-reports', {
    method: 'POST',
    body: JSON.stringify(reportData)
  });
}

/**
 * Confirm a live report as still active (crowdsourced voting)
 * @param {string} reportId - Report ID to confirm
 */
export async function confirmReport(reportId) {
  return request(`/live-reports/${reportId}/confirm`, {
    method: 'POST',
    headers: { 'x-user-token': getOrGenerateUserToken() }
  });
}

/**
 * Mark a live report as resolved/contradicted (crowdsourced voting)
 * @param {string} reportId - Report ID to contradict
 */
export async function contradictReport(reportId) {
  return request(`/live-reports/${reportId}/contradict`, {
    method: 'POST',
    headers: { 'x-user-token': getOrGenerateUserToken() }
  });
}

/**
 * Fetch active ride coordination groups
 *
 * Supports the real backend filter contract (rideGroupFilterQuerySchema):
 * page, limit, mode, origin, destination, status.
 *
 * @param {Object} [filters] - Optional server-side filters
 */
export async function fetchRideGroups(filters = {}) {
  return request(`/ride-groups${buildQuery(filters)}`);
}

/**
 * Create a new ride coordination group
 * @param {Object} groupData - Group details
 */
export async function postRideGroup(groupData) {
  return request('/ride-groups', {
    method: 'POST',
    body: JSON.stringify(groupData)
  });
}

/**
 * Join an existing ride coordination group
 *
 * Sends the same anonymous `x-user-token` header the vote endpoints use: the
 * backend reads it (`req.user || req.headers['x-user-token']`) to enforce its
 * creator/already-member guards, so joining without it would silently skip
 * those checks.
 *
 * @param {string} groupId - Group ID to join
 */
export async function joinRideGroup(groupId) {
  return request(`/ride-groups/${groupId}/join`, {
    method: 'POST',
    headers: { 'x-user-token': getOrGenerateUserToken() }
  });
}

/**
 * Search the GTFS transit network (stops + routes)
 * Supports the real backend query contract (transitSearchQuerySchema):
 * q (free text) — or lat/lon for a nearby search.
 *
 * @param {Object} [params] - { q, lat, lon }
 */
export async function searchTransitNetwork(params = {}) {
  return request(`/transit/search${buildQuery(params)}`);
}

/**
 * Submit route quality feedback
 * @param {Object} feedbackData - Feedback payload
 */
export async function submitFeedback(feedbackData) {
  return request('/feedback', {
    method: 'POST',
    body: JSON.stringify(feedbackData)
  });
}

/** Reset the demo environment to baseline state */
export async function resetDemoState() {
  return request('/demo/reset', {
    method: 'POST'
  });
}
