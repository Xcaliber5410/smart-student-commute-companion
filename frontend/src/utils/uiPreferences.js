/**
 * UI Preferences & Recent Searches
 *
 * Small, failure-safe localStorage helpers for client-side view state:
 * - Recent transit searches (reusable query chips)
 * - Local UI preferences such as result sorting
 * - Saved commutes ("My Commutes" — on-device planner shortcuts)
 * - Notification read state (Day 12 — which notifications were read)
 *
 * View/preference accessors are wrapped in try/catch so private browsing
 * modes, disabled storage, or quota errors never break the UI. Saved-commute
 * helpers surface storage failures as errors instead, because silently
 * pretending the list is empty would mislead the user.
 *
 * These helpers are UX-only — they never store personal data, tokens, or
 * credentials. Saved commutes keep only the same area-level planner fields
 * the user already types into the commute form.
 */

const RECENT_SEARCHES_KEY = 'smart_commute_recent_transit_searches';
const TRANSIT_SORT_KEY = 'smart_commute_transit_sort';
const APP_PREFERENCES_KEY = 'smart_commute_app_preferences';
const MAX_RECENT_SEARCHES = 5;

function safeRead(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode / quota) — preferences are optional.
  }
}

/** @returns {string[]} Previously searched queries (newest first, capped). */
export function readRecentSearches() {
  const value = safeRead(RECENT_SEARCHES_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter((q) => typeof q === 'string' && q.trim().length > 0).slice(0, MAX_RECENT_SEARCHES);
}

/**
 * Persist a query as the most recent search.
 * @param {string} query - Raw query (trimmed, deduped case-insensitively)
 * @returns {string[]} The updated recent-search list
 */
export function rememberSearch(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return readRecentSearches();

  const existing = readRecentSearches().filter(
    (q) => q.toLowerCase() !== trimmed.toLowerCase()
  );
  const next = [trimmed, ...existing].slice(0, MAX_RECENT_SEARCHES);
  safeWrite(RECENT_SEARCHES_KEY, next);
  return next;
}

/** Clear all remembered searches. @returns {string[]} Always empty list. */
export function clearRecentSearches() {
  safeWrite(RECENT_SEARCHES_KEY, []);
  return [];
}

export const TRANSIT_SORT_FALLBACK = { stops: 'name', routes: 'type' };

/** @returns {{stops: string, routes: string}} Stored sort preference (validated). */
export function readTransitSortPreference() {
  const stored = safeRead(TRANSIT_SORT_KEY, null);
  const allowed = {
    stops: ['name', 'distance'],
    routes: ['name', 'type'],
  };
  const result = { ...TRANSIT_SORT_FALLBACK };
  if (stored && typeof stored === 'object') {
    if (allowed.stops.includes(stored.stops)) result.stops = stored.stops;
    if (allowed.routes.includes(stored.routes)) result.routes = stored.routes;
  }
  return result;
}

/** Persist the transit result sort preference. */
export function writeTransitSortPreference(value) {
  const current = readTransitSortPreference();
  safeWrite(TRANSIT_SORT_KEY, {
    stops: value?.stops ?? current.stops,
    routes: value?.routes ?? current.routes,
  });
}

// ─── App Preferences (Day 5 — personalization controls) ───────────────────────

/**
 * Client-side interface preferences. These are display choices stored on
 * this device only — NOT server-side user settings (no backend endpoint
 * exists for persisting them, and none is implied).
 */
export const DEFAULT_APP_PREFERENCES = Object.freeze({
  /** Show the "at a glance" dashboard overview on the planner screen. */
  showDashboardOverview: true,
  /** Show a toast when another student posts a live disruption report. */
  liveReportToasts: true,
  /** Raise OS-level device alerts for live reports while the app is backgrounded. */
  deviceAlerts: true,
  /** Suppress live toasts & device alerts during a daily quiet window (Day 13). */
  quietHoursEnabled: false,
  /** Quiet window start, 24h `HH:MM` (local device time). */
  quietHoursStart: '22:00',
  /** Quiet window end, 24h `HH:MM`; may wrap past midnight. */
  quietHoursEnd: '07:00',
});

// 24-hour HH:MM — the shape an <input type="time"> produces.
const QUIET_HOURS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Whether a value is a usable quiet-hours time (`HH:MM`, 24h).
 * @param {string} value
 * @returns {boolean}
 */
export function isValidQuietHoursTime(value) {
  return typeof value === 'string' && QUIET_HOURS_TIME_PATTERN.test(value);
}

/**
 * Whether quiet hours are suppressing notifications right now.
 *
 * Handles a window that wraps past midnight (start > end) and treats an
 * empty window (start === end) as inactive so a malformed pair can never
 * suppress alerts for a full 24 hours. Reports still reach the feed either
 * way — quiet hours only mute pop-ups (toasts + OS-level alerts).
 *
 * @param {Object} [prefs] - Preference set (defaults applied per-key)
 * @param {Date} [now] - Current time (injectable for tests)
 * @returns {boolean}
 */
export function isQuietHoursActive(prefs, now = new Date()) {
  const merged = { ...DEFAULT_APP_PREFERENCES, ...(prefs || {}) };
  if (!merged.quietHoursEnabled) return false;
  if (
    !isValidQuietHoursTime(merged.quietHoursStart) ||
    !isValidQuietHoursTime(merged.quietHoursEnd)
  ) {
    return false;
  }
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(merged.quietHoursStart);
  const end = toMinutes(merged.quietHoursEnd);
  if (start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

/** @returns {Object} Stored app preferences merged over defaults (validated). */
export function readAppPreferences() {
  const stored = safeRead(APP_PREFERENCES_KEY, null);
  const result = { ...DEFAULT_APP_PREFERENCES };
  if (stored && typeof stored === 'object') {
    if (typeof stored.showDashboardOverview === 'boolean') {
      result.showDashboardOverview = stored.showDashboardOverview;
    }
    if (typeof stored.liveReportToasts === 'boolean') {
      result.liveReportToasts = stored.liveReportToasts;
    }
    if (typeof stored.deviceAlerts === 'boolean') {
      result.deviceAlerts = stored.deviceAlerts;
    }
    if (typeof stored.quietHoursEnabled === 'boolean') {
      result.quietHoursEnabled = stored.quietHoursEnabled;
    }
    if (isValidQuietHoursTime(stored.quietHoursStart)) {
      result.quietHoursStart = stored.quietHoursStart;
    }
    if (isValidQuietHoursTime(stored.quietHoursEnd)) {
      result.quietHoursEnd = stored.quietHoursEnd;
    }
  }
  return result;
}

/**
 * Merge preference overrides into the stored app preferences.
 * @param {Object} overrides - Partial preference object
 * @returns {Object} The full updated preference set
 */
export function writeAppPreferences(overrides) {
  const next = { ...readAppPreferences() };
  if (overrides && typeof overrides === 'object') {
    if (typeof overrides.showDashboardOverview === 'boolean') {
      next.showDashboardOverview = overrides.showDashboardOverview;
    }
    if (typeof overrides.liveReportToasts === 'boolean') {
      next.liveReportToasts = overrides.liveReportToasts;
    }
    if (typeof overrides.deviceAlerts === 'boolean') {
      next.deviceAlerts = overrides.deviceAlerts;
    }
    if (typeof overrides.quietHoursEnabled === 'boolean') {
      next.quietHoursEnabled = overrides.quietHoursEnabled;
    }
    if (isValidQuietHoursTime(overrides.quietHoursStart)) {
      next.quietHoursStart = overrides.quietHoursStart;
    }
    if (isValidQuietHoursTime(overrides.quietHoursEnd)) {
      next.quietHoursEnd = overrides.quietHoursEnd;
    }
  }
  safeWrite(APP_PREFERENCES_KEY, next);
  return next;
}

/** Restore defaults. @returns {Object} The default preference set. */
export function resetAppPreferences() {
  const defaults = { ...DEFAULT_APP_PREFERENCES };
  safeWrite(APP_PREFERENCES_KEY, defaults);
  return defaults;
}

// ─── Saved Commutes ("My Commutes", Day 5) ───────────────────────────────────

const SAVED_COMMUTES_KEY = 'smart_commute_saved_commutes';
const MAX_SAVED_COMMUTES = 8;

/** Preference profiles accepted by the commute planner form. */
const ALLOWED_PREFERENCES = ['balanced', 'fastest', 'cheapest', 'rain-safe'];
/** Transport modes accepted by the commute planner form. */
const ALLOWED_MODES = ['train', 'metro', 'bus', 'auto', 'walk'];
const DEFAULT_ARRIVAL_TIME = '09:00';

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function cleanText(value, maxLength = 100) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Normalize a raw saved-commute entry into the exact shape the planner form
 * consumes. Returns null when the entry is unusable (missing endpoints).
 */
function sanitizeSavedCommute(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const origin = cleanText(entry.origin);
  const destination = cleanText(entry.destination);
  if (!origin || !destination) return null;

  const modes = Array.isArray(entry.preferredModes)
    ? entry.preferredModes.filter((mode) => ALLOWED_MODES.includes(mode))
    : [];

  return {
    id: cleanText(entry.id, 60) || `sc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    origin,
    destination,
    desiredArrivalTime:
      typeof entry.desiredArrivalTime === 'string' && /^\d{2}:\d{2}$/.test(entry.desiredArrivalTime)
        ? entry.desiredArrivalTime
        : DEFAULT_ARRIVAL_TIME,
    preferredModes: modes.length > 0 ? modes : [...ALLOWED_MODES],
    preference: ALLOWED_PREFERENCES.includes(entry.preference) ? entry.preference : 'balanced',
    walkingToleranceMinutes: clampNumber(entry.walkingToleranceMinutes, 5, 30, 20),
    maxBudgetRupees: clampNumber(entry.maxBudgetRupees, 5, 1500, 100),
    savedAt: cleanText(entry.savedAt, 40) || null,
  };
}

/**
 * Stable comparison key for a commute setup (ignores id/savedAt). Used for
 * duplicate detection and for highlighting the setup loaded in the planner.
 *
 * @param {Object} setup - Planner-form-shaped commute setup
 * @returns {string} Normalized signature (empty for unusable input)
 */
export function commuteSignature(setup) {
  if (!setup || typeof setup !== 'object') return '';
  const origin = cleanText(setup.origin);
  const destination = cleanText(setup.destination);
  if (!origin || !destination) return '';
  const modes = Array.isArray(setup.preferredModes)
    ? setup.preferredModes.filter((mode) => ALLOWED_MODES.includes(mode)).sort()
    : [];
  return [
    origin.toLowerCase(),
    destination.toLowerCase(),
    typeof setup.desiredArrivalTime === 'string' ? setup.desiredArrivalTime : DEFAULT_ARRIVAL_TIME,
    ALLOWED_PREFERENCES.includes(setup.preference) ? setup.preference : 'balanced',
    modes.join('+'),
  ].join('|');
}

function writeSavedCommutes(list) {
  try {
    window.localStorage.setItem(SAVED_COMMUTES_KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      'This browser blocked local storage, so the commute could not be saved. Allow site storage for this app and try again.'
    );
  }
}

/**
 * Read all saved commutes (newest first).
 *
 * Unlike the optional view-preference helpers, storage failures surface as
 * errors so the screen can offer a real retry instead of silently showing an
 * empty list. A corrupt payload resets to an empty list rather than failing
 * forever.
 *
 * @returns {Array<Object>} Validated saved commutes
 * @throws {Error} When local storage itself is unavailable
 */
export function readSavedCommutes() {
  let raw;
  try {
    raw = window.localStorage.getItem(SAVED_COMMUTES_KEY);
  } catch {
    throw new Error(
      'Saved commutes could not be read because local storage is unavailable in this browser.'
    );
  }
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    writeSavedCommutes([]);
    return [];
  }
  if (!Array.isArray(parsed)) {
    writeSavedCommutes([]);
    return [];
  }
  return parsed.map(sanitizeSavedCommute).filter(Boolean).slice(0, MAX_SAVED_COMMUTES);
}

/**
 * Save a commute setup (deduplicated by signature, newest first, capped).
 *
 * @param {Object} setup - Current planner form values
 * @returns {Array<Object>} The updated saved-commute list
 * @throws {Error} On unusable input or unavailable local storage
 */
export function saveCommute(setup) {
  const candidate = sanitizeSavedCommute({ ...setup, savedAt: new Date().toISOString() });
  if (!candidate) {
    throw new Error('Add a starting point and a destination before saving this commute.');
  }
  const signature = commuteSignature(candidate);
  const kept = readSavedCommutes().filter((saved) => commuteSignature(saved) !== signature);
  const next = [
    { ...candidate, id: `sc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}` },
    ...kept,
  ].slice(0, MAX_SAVED_COMMUTES);
  writeSavedCommutes(next);
  return next;
}

/**
 * Remove one saved commute by id.
 * @returns {Array<Object>} The updated saved-commute list
 */
export function removeSavedCommute(id) {
  const next = readSavedCommutes().filter((saved) => saved.id !== id);
  writeSavedCommutes(next);
  return next;
}

/** Remove every saved commute. @returns {Array} Always an empty list. */
export function clearSavedCommutes() {
  writeSavedCommutes([]);
  return [];
}

/**
 * Whether a planner setup already exists in a saved-commute list.
 *
 * @param {Array<Object>} list - Saved commutes
 * @param {Object} setup - Planner-form-shaped setup to look for
 * @returns {boolean}
 */
export function isCommuteSaved(list, setup) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const signature = commuteSignature(setup);
  return Boolean(signature) && list.some((saved) => commuteSignature(saved) === signature);
}

// ─── Notification read state (Day 12) ────────────────────────────────────────

const NOTIFICATION_READ_KEY = 'smart_commute_notification_read_state';
// Bounded so the store cannot grow forever; the oldest read-marks expire first
// (those reports have typically aged out of the feed anyway).
const MAX_READ_NOTIFICATION_IDS = 300;

/**
 * Ids of notifications the student has marked as read on this device.
 * Failure-safe: missing/corrupt storage degrades to an empty set (everything
 * simply looks unread again — nothing breaks and no data is fabricated).
 *
 * @returns {Set<string>} Read notification ids
 */
export function readNotificationReadIds() {
  const value = safeRead(NOTIFICATION_READ_KEY, []);
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((id) => typeof id === 'string' && id.length > 0)
      .slice(-MAX_READ_NOTIFICATION_IDS)
  );
}

/**
 * Persist the full read-id set (bounded, oldest expire first; failure-safe like the
 * other preferences — a rejected write is silently ignored because losing
 * read-state is only a cosmetic regression).
 *
 * @param {Iterable<string>} ids - Current read notification ids
 * @returns {Set<string>} The set that was stored
 */
export function writeNotificationReadIds(ids) {
  // Insertion order is chronological (toggles append; a hydrated Set keeps the
  // stored order), so slicing the tail keeps the NEWEST read-marks and lets
  // the oldest expire — a stable policy that survives load/save cycles.
  const unique = Array.from(
    new Set(Array.from(ids || []).filter((id) => typeof id === 'string' && id.length > 0))
  );
  const kept = unique.slice(-MAX_READ_NOTIFICATION_IDS);
  safeWrite(NOTIFICATION_READ_KEY, kept);
  return new Set(kept);
}
