/**
 * Install Promotion Service (Day 9)
 *
 * Eligibility and cross-session snooze persistence for the install promo
 * banner. Purely client-side (localStorage + browser install state) — no
 * network calls, no backend, no personal data. Follows the same
 * failure-safe pattern as `utils/uiPreferences.js`:
 *
 * - Reads never throw; corrupt payloads degrade to "not snoozed".
 * - Writes report success honestly; when storage is unavailable (private
 *   mode, quota) the caller keeps its session-only dismissal, so the UI
 *   degrades instead of breaking.
 *
 * The snooze is a deliberate user action ("Maybe later"), stored with a
 * 7-day cooldown so promotion returns later instead of forever-or-never.
 */

const PROMO_SNOOZE_KEY = 'smart_commute_install_promo_snooze';
const SNOOZE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Whether promoting install can honestly succeed right now.
 * The banner must never appear when there is no deferred prompt (the click
 * would do nothing) or when the app is already installed (nagging).
 *
 * @param {{canInstall?: boolean, isInstalled?: boolean}} state
 * @returns {boolean}
 */
export function isPromoEligible({ canInstall = false, isInstalled = false } = {}) {
  return Boolean(canInstall) && !Boolean(isInstalled);
}

/**
 * @returns {string|null} ISO timestamp of the last snooze, or null when
 *   absent/corrupt (never throws).
 */
export function readPromoSnooze() {
  try {
    const raw = window.localStorage.getItem(PROMO_SNOOZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const snoozedAt = parsed && typeof parsed === 'object' ? parsed.snoozedAt : null;
    if (typeof snoozedAt !== 'string') return null;
    const ts = Date.parse(snoozedAt);
    return Number.isFinite(ts) ? snoozedAt : null;
  } catch {
    return null;
  }
}

/**
 * Whether the promo is currently inside its snooze cooldown.
 * A timestamp in the future (clock warp) counts as expired rather than
 * silently suppressing promotion forever.
 *
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isPromoSnoozed(now = Date.now()) {
  const snoozedAt = readPromoSnooze();
  if (!snoozedAt) return false;
  const age = now - Date.parse(snoozedAt);
  return age >= 0 && age < SNOOZE_COOLDOWN_MS;
}

/**
 * Persist a snooze for the cooldown window.
 *
 * @param {number} [now=Date.now()]
 * @returns {boolean} true when persisted; false when storage is unavailable
 *   (caller falls back to session-only dismissal — honest degradation).
 */
export function writePromoSnooze(now = Date.now()) {
  try {
    window.localStorage.setItem(
      PROMO_SNOOZE_KEY,
      JSON.stringify({ snoozedAt: new Date(now).toISOString() })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear any snooze (e.g., re-offer immediately). Safe no-op when storage
 * is unavailable.
 */
export function clearPromoSnooze() {
  try {
    window.localStorage.removeItem(PROMO_SNOOZE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
