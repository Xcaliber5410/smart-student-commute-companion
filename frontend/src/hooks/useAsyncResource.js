import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAsyncResource - Local async data state machine
 *
 * Manages the lifecycle of a client-side data fetch without pulling in a
 * state-management library. Establishes consistent states for:
 *
 * - idle        → no request issued yet
 * - loading     → first load (no data to show)
 * - refreshing  → background reload while previous data stays visible
 * - success     → data available
 * - error       → first load failed (no data to show)
 *
 * Guarantees:
 * - Stale responses are ignored: each request gets a sequence number and
 *   only the latest response may update state (no out-of-order overwrites).
 * - Refresh failures never discard already-loaded data; the caller receives
 *   { ok: false } and can surface a toast instead of blanking the page.
 * - `loadFn` is read through a ref, so the callback identity is stable and
 *   socket effects can safely capture it once.
 * - Updates are suppressed after unmount.
 *
 * @param {Function} loadFn - async () => data (may throw / reject)
 * @param {Object} [options]
 * @param {string} [options.errorMessage] - Fallback user-friendly error message
 * @returns {Object} Resource controls and state
 *
 * @example
 * const {
 *   data, setData, status, error,
 *   isLoading, isRefreshing, loadError,
 *   load,
 * } = useAsyncResource(async () => (await fetchLiveReports()).reports, {
 *   errorMessage: 'Unable to load live updates. Please try again.',
 * });
 */
export default function useAsyncResource(loadFn, { errorMessage } = {}) {
  const [data, setDataState] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | refreshing | success | error
  const [error, setError] = useState(null);

  const loadFnRef = useRef(loadFn);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const statusRef = useRef(status);
  const hasLoadedRef = useRef(false);

  // Keep refs current
  useEffect(() => {
    loadFnRef.current = loadFn;
  });
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Issue a load. Foreground if there is no data yet, background refresh
   * otherwise. Never rejects — result is { ok, data?, error? }.
   */
  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setStatus(hasLoadedRef.current ? 'refreshing' : 'loading');
    setError(null);

    try {
      const result = await loadFnRef.current();
      if (seq !== seqRef.current || !mountedRef.current) {
        return { ok: false, stale: true }; // obsolete response — ignore
      }
      setDataState(result);
      hasLoadedRef.current = true;
      setStatus('success');
      return { ok: true, data: result };
    } catch (err) {
      if (seq !== seqRef.current || !mountedRef.current) {
        return { ok: false, stale: true };
      }
      const message =
        (err && err.message) || errorMessage || 'Unable to load data. Please try again.';

      if (hasLoadedRef.current) {
        // Background refresh failed — keep existing data visible
        setStatus('success');
        setError(null);
        return { ok: false, error: message, keptData: true };
      }

      // First load failed — surface the error state (friendly message only)
      setStatus('error');
      setError(message);
      return { ok: false, error: message };
    }
  }, [errorMessage]);

  /**
   * Update data imperatively (e.g., from socket events).
   * Supports functional updates. If the resource previously errored but we
   * now have data, transition back to success.
   */
  const setData = useCallback((value) => {
    setDataState(value);
    if (statusRef.current === 'error') {
      hasLoadedRef.current = true;
      setError(null);
      setStatus('success');
    }
  }, []);

  return {
    data,
    setData,
    status,
    error,
    isLoading: status === 'idle' || status === 'loading',
    isRefreshing: status === 'refreshing',
    loadError: status === 'error' ? error : null,
    load,
  };
}
