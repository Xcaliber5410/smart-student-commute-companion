/**
 * Offline Report Queue Service (Day 11)
 *
 * Keeps community disruption reports that were filed while the device had no
 * connection, and delivers them once connectivity returns — so a flaky signal
 * never silently loses a report.
 *
 * DESIGN RULES
 * - Device-local only: everything lives in localStorage under a failure-safe
 *   `smart_commute_offline_queue` envelope (validated reads, boolean writes).
 * - Submissions go ONLY through the existing frontend contract
 *   `liveReports.createReport()` → `POST /api/live-reports`. No endpoint,
 *   payload shape or backend behavior is invented here.
 * - Error classification follows `FrontendApiError` from `api.js`:
 *     · `isNetwork === true` (offline / DNS / 15s timeout) → retryable:
 *       the item stays `pending` and the flush stops (the connection died).
 *     · any HTTP status → not auto-retryable: the item becomes `failed` with
 *       the friendly server message so the student can review it in the UI
 *       (Try again / Discard). This never fabricates a success.
 * - Queue size is bounded (MAX_QUEUE_ITEMS) and the limit is surfaced to the
 *   caller instead of silently dropping reports.
 *
 * All functions are synchronous except `syncQueue()`, which performs the real
 * network submissions.
 */
import { createReport } from './liveReports';

export const QUEUE_STORAGE_KEY = 'smart_commute_offline_queue';
export const MAX_QUEUE_ITEMS = 50;

/**
 * @typedef {Object} QueuedReport
 * @property {string} id - Stable local id
 * @property {Object} report - Exact payload for `createReport`
 * @property {string} queuedAt - ISO timestamp
 * @property {'pending'|'failed'} status - `pending` retries, `failed` needs a decision
 * @property {number} attempts - Delivery attempts made so far
 * @property {string|null} lastError - Friendly message from the last failed attempt
 */

// ─── Failure-safe storage primitives ───────────────────────────────────────

function emptyState() {
  return { items: [], lastSyncedAt: null };
}

function isValidItem(item) {
  return Boolean(
    item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      item.report &&
      typeof item.report === 'object' &&
      (item.status === 'pending' || item.status === 'failed')
  );
}

/**
 * Read the full queue state (items + last successful sync time).
 * Never throws; corrupt/absent storage degrades to an empty queue.
 * @returns {{items: QueuedReport[], lastSyncedAt: string|null}}
 */
export function readQueueState() {
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items.filter(isValidItem) : [];
    const lastSyncedAt =
      typeof parsed?.lastSyncedAt === 'string' &&
      Number.isFinite(Date.parse(parsed?.lastSyncedAt))
        ? parsed.lastSyncedAt
        : null;
    return { items, lastSyncedAt };
  } catch {
    return emptyState();
  }
}

/**
 * Persist the queue state.
 * @returns {boolean} true when storage accepted the write
 */
export function writeQueueState(state) {
  try {
    window.localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify({
        items: Array.isArray(state?.items) ? state.items.filter(isValidItem) : [],
        lastSyncedAt: state?.lastSyncedAt ?? null,
      })
    );
    return true;
  } catch {
    return false; // storage unavailable / quota exceeded — caller surfaces it
  }
}

/** Convenience: just the queued items. */
export function readQueue() {
  return readQueueState().items;
}

// ─── Queue mutations (each persists, then returns the new state) ───────────

/**
 * Add a report to the queue.
 * @param {Object} report - Payload for `createReport`
 * @returns {{items, lastSyncedAt}|null} new state, or null when the queue is
 *   full or storage rejected the write (nothing is silently dropped)
 */
export function enqueueReport(report) {
  const state = readQueueState();
  if (!report || typeof report !== 'object') return null;
  if (state.items.length >= MAX_QUEUE_ITEMS) return null;

  const item = {
    id:
      (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
      `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    report,
    queuedAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
  const next = { ...state, items: [...state.items, item] };
  return writeQueueState(next) ? next : null;
}

/**
 * Discard one queued report (user decision — never retried).
 * @returns {Object|null} new state, or null on storage failure
 */
export function removeQueuedReport(id) {
  const state = readQueueState();
  const next = { ...state, items: state.items.filter((item) => item.id !== id) };
  if (next.items.length === state.items.length) return state; // nothing matched
  return writeQueueState(next) ? next : null;
}

/**
 * Re-queue a rejected report (clears its failure state for a fresh attempt).
 * @returns {Object|null} new state, or null on storage failure
 */
export function retryQueuedReport(id) {
  const state = readQueueState();
  const next = {
    ...state,
    items: state.items.map((item) =>
      item.id === id && item.status === 'failed'
        ? { ...item, status: 'pending', lastError: null }
        : item
    ),
  };
  return writeQueueState(next) ? next : null;
}

// ─── Delivery ──────────────────────────────────────────────────────────────

/**
 * Flush all pending items through the existing `createReport` contract.
 *
 * Stops at the first network-level failure (the connection died again) and
 * converts HTTP rejections into visible `failed` items — never fabricates
 * success, never loops forever.
 *
 * @returns {Promise<{sent: number, failed: number, pending: number,
 *   stoppedOffline: boolean, state: {items, lastSyncedAt}}>} 
 */
export async function syncQueue() {
  const state = readQueueState();
  const summary = (stoppedOffline = false) => ({
    sent: 0,
    failed: 0,
    pending: state.items.filter((item) => item.status === 'pending').length,
    stoppedOffline,
    state,
  });

  // Nothing to do — or no connection at all (don't burn attempts on a
  // request that cannot leave the device).
  if (!state.items.some((item) => item.status === 'pending')) {
    return summary(false);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return summary(true);
  }

  const updatedById = new Map(); // id → new item, or null when delivered
  let sent = 0;
  let failed = 0;
  let stop = false;

  for (const item of state.items) {
    if (stop || item.status !== 'pending') continue;
    try {
      await createReport(item.report);
      sent += 1;
      updatedById.set(item.id, null); // delivered — remove from the queue
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      if (err?.isNetwork) {
        // Connection died mid-flush: keep this item and everything after it
        // pending for the next online event; stop trying.
        stop = true;
        updatedById.set(item.id, { ...item, attempts });
        continue;
      }
      // Reachable server rejected it (4xx/5xx): surface it for a decision
      // instead of silently retrying forever.
      failed += 1;
      updatedById.set(item.id, {
        ...item,
        attempts,
        status: 'failed',
        lastError: err?.message || 'Delivery failed. Please try again.',
      });
    }
  }

  const items = state.items
    .map((item) => (updatedById.has(item.id) ? updatedById.get(item.id) : item))
    .filter(Boolean);
  const next = {
    items,
    lastSyncedAt: sent > 0 ? new Date().toISOString() : state.lastSyncedAt,
  };
  const stored = writeQueueState(next);

  return {
    sent,
    failed,
    pending: items.filter((item) => item.status === 'pending').length,
    stoppedOffline: stop,
    // Storage rejected the update — report the persisted state honestly so
    // the UI does not pretend items were removed.
    state: stored ? next : state,
  };
}
