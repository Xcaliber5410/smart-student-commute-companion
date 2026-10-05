/**
 * Auth Session Store (device-local)
 *
 * Failure-safe localStorage envelope for the Student Account session
 * (Day 14). Same conventions as the other `smart_commute_*` stores in
 * `utils/uiPreferences.js`: reads never throw, malformed payloads are
 * treated as "no session", and writes report success/failure instead of
 * crashing the UI.
 *
 * The session holds the JWT returned by `POST /api/auth/login` plus the
 * profile the server confirmed. It never holds a password.
 *
 * This module is deliberately tiny and dependency-free so both
 * `services/api.js` (Authorization header) and `services/auth.js`
 * (sign-in/sign-out) can import it without a circular import.
 *
 * Privacy: the token stays on this device — it is never sent anywhere
 * except this app's own backend, and no secrets are shipped in the bundle.
 */

/** localStorage key for the session envelope */
export const AUTH_SESSION_KEY = 'smart_commute_auth_session';

/**
 * Window event dispatched when the backend rejects the stored token
 * (401 on an authenticated request). The App layer listens to drop the
 * session from state and tell the student why.
 */
export const AUTH_SESSION_EXPIRED_EVENT = 'auth-session-expired';

/** Minimal envelope validation — anything else is treated as no session */
function isValidSession(session) {
  return Boolean(
    session &&
      typeof session === 'object' &&
      typeof session.token === 'string' &&
      session.token.length > 0 &&
      session.user &&
      typeof session.user === 'object' &&
      typeof session.user.email === 'string'
  );
}

/**
 * Read the stored session.
 * @returns {{token: string, user: Object, savedAt: string}|null}
 */
export function readAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    // Storage blocked or corrupted payload — behave as signed out.
    return null;
  }
}

/**
 * Read only the stored JWT (used by the API layer for the Bearer header).
 * @returns {string|null}
 */
export function readAuthToken() {
  return readAuthSession()?.token || null;
}

/**
 * Persist a session after a successful login.
 * @param {{token: string, user: Object}} session
 * @returns {boolean} whether the session could be stored
 */
export function writeAuthSession({ token, user }) {
  const envelope = {
    token,
    user,
    savedAt: new Date().toISOString(),
  };
  if (!isValidSession(envelope)) return false;
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false; // private mode / quota — caller decides how to surface it
  }
}

/**
 * Remove the stored session (sign-out or server-rejected token).
 * Idempotent; never throws.
 */
export function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
