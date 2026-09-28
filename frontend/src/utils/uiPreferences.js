/**
 * UI Preferences & Recent Searches
 *
 * Small, failure-safe localStorage helpers for client-side view state:
 * - Recent transit searches (reusable query chips)
 * - Local UI preferences such as result sorting
 *
 * Every accessor is wrapped in try/catch so private browsing modes,
 * disabled storage, or quota errors never break the UI. These helpers are
 * UX-only — they never store personal data, tokens, or credentials.
 */

const RECENT_SEARCHES_KEY = 'smart_commute_recent_transit_searches';
const TRANSIT_SORT_KEY = 'smart_commute_transit_sort';
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
