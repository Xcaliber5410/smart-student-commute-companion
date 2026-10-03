/**
 * PWA Analytics Service (Day 10)
 *
 * Device-local metrics behind the Analytics screen — the Day-10 roadmap
 * items: install tracking, offline usage, cache hit/miss rates and
 * service-worker error monitoring. Purely client-side: counters live in
 * localStorage and the service worker posts its observations to open
 * windows. No network calls, no backend, no personal data — matching the
 * project's documented privacy stance (nothing leaves the device).
 *
 * Follows the failure-safe pattern of `utils/uiPreferences.js` and
 * `services/installPromotion.js`:
 * - Reads never return garbage: absent/corrupt payloads read as "no metrics
 *   yet"; blocked storage raises a friendly error the caller can surface.
 * - Writes report success honestly and degrade (metrics simply stop
 *   accumulating) when storage is unavailable.
 *
 * Event log shape (newest first, capped):
 *   { id, kind, level, at, message }
 */

const ANALYTICS_KEY = 'smart_commute_pwa_analytics';
const MAX_EVENTS = 50;
const MAX_MESSAGE_LENGTH = 200;

/** Fresh zeroed snapshot — the persisted shape minus `events`. */
function defaultState() {
  return {
    version: 1,
    updatedAt: null,
    install: { accepted: 0, dismissed: 0, unavailable: 0, installedAt: null },
    offline: { sessions: 0, totalMs: 0, lastOfflineAt: null, openSince: null },
    cache: { hits: 0, misses: 0 },
    sw: { errorCount: 0, lastErrorAt: null },
    events: [],
  };
}

function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function toIsoOrNull(value) {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Coerce a parsed payload into the documented shape; drop what's malformed. */
function normalize(raw) {
  const state = defaultState();
  if (!raw || typeof raw !== 'object') return state;

  const install = raw.install || {};
  const offline = raw.offline || {};
  const cache = raw.cache || {};
  const sw = raw.sw || {};

  state.updatedAt = toIsoOrNull(raw.updatedAt);
  state.install = {
    accepted: toCount(install.accepted),
    dismissed: toCount(install.dismissed),
    unavailable: toCount(install.unavailable),
    installedAt: toIsoOrNull(install.installedAt),
  };
  state.offline = {
    sessions: toCount(offline.sessions),
    totalMs: toCount(offline.totalMs),
    lastOfflineAt: toIsoOrNull(offline.lastOfflineAt),
    openSince: toIsoOrNull(offline.openSince),
  };
  state.cache = { hits: toCount(cache.hits), misses: toCount(cache.misses) };
  state.sw = {
    errorCount: toCount(sw.errorCount),
    lastErrorAt: toIsoOrNull(sw.lastErrorAt),
  };
  state.events = Array.isArray(raw.events)
    ? raw.events
        .filter(
          (event) =>
            event &&
            typeof event === 'object' &&
            typeof event.kind === 'string' &&
            typeof event.message === 'string' &&
            toIsoOrNull(event.at)
        )
        .slice(0, MAX_EVENTS)
        .map((event) => ({
          id: event.id,
          kind: event.kind,
          level: ['info', 'success', 'warning', 'error'].includes(event.level)
            ? event.level
            : 'info',
          at: toIsoOrNull(event.at),
          message: event.message.slice(0, MAX_MESSAGE_LENGTH),
        }))
    : [];
  return state;
}

/**
 * Read persisted metrics.
 *
 * @returns {Object|null} normalized snapshot, or null when nothing has been
 *   recorded yet (or the payload was corrupt — "no metrics" beats fake data)
 * @throws {Error} friendly message when site storage is blocked entirely
 */
function readAnalytics() {
  let raw;
  try {
    raw = window.localStorage.getItem(ANALYTICS_KEY);
  } catch {
    throw new Error(
      'Site storage is unavailable, so metrics cannot be read from this device.'
    );
  }
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null; // corrupt payload — honest "nothing recorded"
  }
}

/** State for mutation; falls back to a fresh zeroed snapshot. */
function loadMutable() {
  try {
    return readAnalytics() || defaultState();
  } catch {
    return null; // storage blocked — nothing can be recorded either
  }
}

/** @returns {boolean} whether the write persisted */
function persist(state) {
  if (!state) return false;
  state.updatedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // quota/private mode — caller shows honest feedback
  }
}

function pushEvent(state, { kind, level, message, now }) {
  state.events.unshift({
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    level,
    at: new Date(now).toISOString(),
    message: String(message).slice(0, MAX_MESSAGE_LENGTH),
  });
  if (state.events.length > MAX_EVENTS) {
    state.events.length = MAX_EVENTS;
  }
}

/**
 * Pull the service worker's own counters (cache hit/miss, worker errors)
 * from its persistent store and merge them into the local snapshot. The
 * worker records lookups that happen before this page's JS mounts, so a
 * pull is the only way to see every observation.
 *
 * Resolves with whether a merge was persisted. Never rejects: no controller
 * (fresh visit), an older worker that doesn't answer, or blocked storage all
 * degrade to "keep what we already have".
 *
 * @returns {Promise<boolean>}
 */
async function syncSwAnalytics() {
  try {
    const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
    const controller = container?.controller;
    if (!controller) return false;

    const store = await new Promise((resolve) => {
      // Worker → page messages surface on the ServiceWorkerContainer, not
      // on window (verified in Chrome; matches the spec).
      const onMessage = (event) => {
        if (event.data?.type !== 'pwa-analytics-store') return;
        cleanup();
        resolve(event.data.store || null);
      };
      let timer = setTimeout(() => {
        cleanup();
        resolve(null); // worker didn't answer (older version) — skip
      }, 1000);
      const cleanup = () => {
        container.removeEventListener('message', onMessage);
        clearTimeout(timer);
      };
      container.addEventListener('message', onMessage);
      try {
        controller.postMessage({ type: 'pwa-analytics-sync' });
      } catch {
        cleanup();
        resolve(null);
      }
    });

    if (!store || typeof store !== 'object') return false;
    return mergeSwStore(store);
  } catch {
    return false;
  }
}

/** Replace the worker-owned fields of the local snapshot with the store. */
function mergeSwStore(store) {
  const state = loadMutable();
  if (!state) return false;

  const swEvents = (Array.isArray(store.errors) ? store.errors : [])
    .filter((error) => error && typeof error.message === 'string' && toIsoOrNull(error.at))
    .map((error) => ({
      id: typeof error.id === 'string' ? error.id : undefined,
      kind: 'sw-error',
      level: 'error',
      at: toIsoOrNull(error.at),
      message: error.message.slice(0, MAX_MESSAGE_LENGTH),
    }));

  state.cache = { hits: toCount(store.hits), misses: toCount(store.misses) };
  state.sw = {
    errorCount: toCount(store.errorCount),
    lastErrorAt: swEvents.length ? swEvents[0].at : null,
  };
  // The worker owns worker-error entries; keep local (install) events and
  // re-merge newest-first.
  state.events = [...state.events.filter((event) => event.kind !== 'sw-error'), ...swEvents]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_EVENTS);
  return persist(state);
}

/**
 * Snapshot for the Analytics screen: worker counters merged in (see
 * syncSwAnalytics), persisted metrics, plus a best-effort storage estimate
 * (never persisted, never rejects where the Storage API is absent).
 *
 * @returns {Promise<Object|null>} snapshot (null when nothing recorded yet)
 */
export async function readAnalyticsSnapshot() {
  await syncSwAnalytics();
  const snapshot = readAnalytics();
  if (!snapshot) return null;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return {
        ...snapshot,
        storage: {
          usage: Number.isFinite(usage) ? usage : null,
          quota: Number.isFinite(quota) ? quota : null,
        },
      };
    }
  } catch {
    // Estimate unavailable — the rest of the snapshot is still valid.
  }
  return snapshot;
}

/**
 * Record an install-prompt outcome from the existing `promptInstall()` flow.
 *
 * @param {'accepted'|'dismissed'|'unavailable'} outcome
 * @param {number} [now=Date.now()]
 * @returns {boolean} whether it persisted
 */
export function recordInstallOutcome(outcome = 'unavailable', now = Date.now()) {
  const state = loadMutable();
  if (!state) return false;
  if (outcome === 'accepted') {
    state.install.accepted += 1;
    pushEvent(state, {
      kind: 'install',
      level: 'success',
      message: 'Install prompt accepted',
      now,
    });
  } else if (outcome === 'dismissed') {
    state.install.dismissed += 1;
    pushEvent(state, {
      kind: 'install',
      level: 'info',
      message: 'Install prompt dismissed',
      now,
    });
  } else {
    state.install.unavailable += 1;
    pushEvent(state, {
      kind: 'install',
      level: 'warning',
      message: 'Install prompt unavailable',
      now,
    });
  }
  return persist(state);
}

/**
 * Record the real `appinstalled` browser event (the truthful install moment).
 *
 * @param {number} [now=Date.now()]
 * @returns {boolean} whether it persisted (false when already recorded)
 */
export function markInstalled(now = Date.now()) {
  const state = loadMutable();
  if (!state) return false;
  if (state.install.installedAt) return false;
  state.install.installedAt = new Date(now).toISOString();
  pushEvent(state, {
    kind: 'install',
    level: 'success',
    message: 'App installed to the home screen',
    now,
  });
  return persist(state);
}

/**
 * Session start bookkeeping: drop an offline period left open by a previous
 * session (its true duration is unknowable — counting it would fabricate
 * offline time) and begin a fresh one when launching offline.
 *
 * @param {{isOffline?: boolean, now?: number}} [options]
 * @returns {boolean} whether anything changed
 */
export function beginAnalyticsSession({ isOffline = false, now = Date.now() } = {}) {
  const state = loadMutable();
  if (!state) return false;
  let changed = false;
  if (state.offline.openSince) {
    state.offline.openSince = null; // interrupted session — not counted
    changed = true;
  }
  if (isOffline) {
    state.offline.openSince = new Date(now).toISOString();
    state.offline.sessions += 1;
    state.offline.lastOfflineAt = new Date(now).toISOString();
    changed = true;
  }
  return changed ? persist(state) : true;
}

/**
 * Start counting an offline period (browser `offline` event).
 * @returns {boolean} whether it persisted
 */
export function beginOfflinePeriod(now = Date.now()) {
  const state = loadMutable();
  if (!state) return false;
  if (state.offline.openSince) return false; // already counting
  state.offline.openSince = new Date(now).toISOString();
  state.offline.sessions += 1;
  state.offline.lastOfflineAt = new Date(now).toISOString();
  return persist(state);
}

/**
 * Close the open offline period and add its duration (browser `online` event).
 * @returns {boolean} whether it persisted
 */
export function endOfflinePeriod(now = Date.now()) {
  const state = loadMutable();
  if (!state) return false;
  const since = Date.parse(state.offline.openSince || '');
  if (!Number.isFinite(since)) return false; // not offline (or already closed)
  state.offline.totalMs += Math.max(0, now - since);
  state.offline.openSince = null;
  return persist(state);
}

/**
 * Clear every recorded metric (Analytics screen reset action).
 *
 * @returns {boolean} false only when storage blocks the removal — the caller
 *   surfaces that honestly instead of pretending the data is gone
 */
export function resetAnalytics() {
  let removed = false;
  try {
    window.localStorage.removeItem(ANALYTICS_KEY);
    removed = true;
  } catch {
    return false; // storage blocked — metrics cannot be cleared
  }
  try {
    // Best-effort: clear the service worker's counters too so the next sync
    // doesn't resurrect them. A missing/older controller is not an error.
    navigator.serviceWorker?.controller?.postMessage({ type: 'pwa-analytics-reset' });
  } catch {
    // No controller — worker counters (if any) stay until it answers again.
  }
  return removed;
}

/**
 * Subscribe to "worker metrics changed" broadcasts from the service worker.
 * Notifications are coalesced, and the caller re-reads the snapshot (which
 * syncs the worker store) — one refresh path for every change.
 *
 * @param {Function} onChange - called (coalesced) when metrics may have changed
 * @returns {Function} unsubscribe
 */
export function watchAnalytics(onChange) {
  const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
  if (!container?.addEventListener) return () => {};

  let notifyTimer = null;
  const scheduleNotify = () => {
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      onChange?.();
    }, 400);
  };

  const handleMessage = (event) => {
    if (event?.data?.type === 'pwa-analytics-updated') scheduleNotify();
  };

  container.addEventListener('message', handleMessage);
  return () => {
    container.removeEventListener('message', handleMessage);
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
  };
}
