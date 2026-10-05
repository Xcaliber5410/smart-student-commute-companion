import { request, FrontendApiError } from './api.js';
import {
  readAuthSession,
  writeAuthSession,
  clearAuthSession,
  AUTH_SESSION_EXPIRED_EVENT,
} from '../utils/authSession.js';

/**
 * Authentication Service (Day 14 — Student Account)
 *
 * Talks to the REAL backend auth contract — nothing here is simulated:
 *
 * - `POST /api/auth/register` — public; creates the account (201)
 * - `POST /api/auth/login`    — public; returns `{ token, user }`
 * - `GET  /api/auth/me`       — Bearer-authenticated profile verification
 *
 * Successful sign-in persists the session through `utils/authSession.js`
 * (device-local, password never stored). The `Authorization: Bearer` header
 * for authenticated calls is attached centrally by `services/api.js`.
 */

/**
 * Sign in with email + password.
 *
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<{token: string, user: Object, savedAt: string}>} stored session
 * @throws {FrontendApiError} 401 for bad credentials, network errors, malformed responses
 */
export async function signIn({ email, password }) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!data?.token || !data?.user) {
    throw new FrontendApiError(
      'The server returned an unexpected sign-in response. Please try again.',
      null,
      false
    );
  }

  writeAuthSession({ token: data.token, user: data.user });
  return readAuthSession();
}

/**
 * Create an account, then sign in with the same credentials so the student
 * lands in a verified session without typing the password twice.
 *
 * The backend's register response carries no token (verified against
 * `backend/controllers/authController.js`), so the follow-up login is a real
 * second request — not a fabricated session.
 *
 * @param {{email: string, password: string, full_name: string, college_name: string}} payload
 * @returns {Promise<{token: string, user: Object, savedAt: string}>} stored session
 * @throws {FrontendApiError} 409 for a duplicate email; login failures after
 *   registration are re-thrown with the account-created context
 */
export async function registerAccount(payload) {
  await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  try {
    return await signIn({ email: payload.email, password: payload.password });
  } catch (err) {
    if (err instanceof FrontendApiError) {
      throw new FrontendApiError(
        `Your account was created, but automatic sign-in failed: ${err.message}`,
        err.status,
        err.isNetwork
      );
    }
    throw err;
  }
}

/**
 * Verify the stored session against `GET /api/auth/me` and refresh the
 * cached profile.
 *
 * An invalid token (401) or a deleted account (404) clears the stored
 * session and returns null — the app simply continues as a guest. Network
 * failures reject so the UI can offer a retry instead of pretending the
 * session is gone.
 *
 * @returns {Promise<{token: string, user: Object, savedAt: string}|null>}
 * @throws {FrontendApiError} when verification could not run (offline etc.)
 */
export async function fetchCurrentUser() {
  const stored = readAuthSession();
  if (!stored?.token) return null;

  try {
    const data = await request('/auth/me');
    if (!data?.user) {
      throw new FrontendApiError(
        'The server returned an unexpected profile response.',
        null,
        false
      );
    }

    // Refresh the cached profile with the server's authoritative copy.
    writeAuthSession({ token: stored.token, user: data.user });
    return readAuthSession();
  } catch (err) {
    if (err instanceof FrontendApiError && (err.status === 401 || err.status === 404)) {
      clearAuthSession();
      // 401 is broadcast by the API layer; a 404 means the account itself
      // is gone, so broadcast the same "session no longer valid" signal.
      if (err.status === 404 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
      }
      return null;
    }
    throw err;
  }
}

/**
 * Sign out: drop the session from this device.
 * The token cannot be revoked server-side (the backend contract has no
 * logout endpoint), which is documented as a known limitation.
 *
 * @returns {null}
 */
export function signOut() {
  clearAuthSession();
  return null;
}
