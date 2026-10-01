/**
 * Share Target (Day 8)
 *
 * Client-side plumbing for the PWA Share Target: content shared from the
 * OS share sheet arrives as a POST to /share-target, is intercepted by the
 * service worker, forwarded to the app via postMessage + sessionStorage,
 * and consumed here. Everything is feature-detected and failure-safe so
 * unsupported browsers simply report `isSupported() === false`.
 *
 * No backend involvement: shared content is handed to the app's existing
 * report composer entirely on-device.
 */

const SHARE_TARGET_PATH = '/share-target';
const STORAGE_KEY = 'smart_commute_share_target_payload';
const SW_MESSAGE_TYPE = 'SHARE_TARGET_PAYLOAD';

/**
 * Whether the PWA Share Target flow is available in this browser.
 * Requires: service worker (interception point) + a declared share_target
 * in the manifest (checked at launch time by the OS).
 * @returns {boolean}
 */
export function isSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** @returns {boolean} Whether the current launch looks like a share-target launch. */
export function isShareTargetLaunch() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('share-target');
  } catch {
    return false;
  }
}

/**
 * Persist shared content so it survives the SW redirect to '/'.
 * @param {{title?: string, text?: string, url?: string}} payload
 */
export function setShareTargetData(payload) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      title: typeof payload?.title === 'string' ? payload.title : '',
      text: typeof payload?.text === 'string' ? payload.text : '',
      url: typeof payload?.url === 'string' ? payload.url : '',
      receivedAt: Date.now(),
    }));
  } catch {
    // sessionStorage unavailable (private mode) — the SW postMessage path
    // below is the primary delivery channel; storage is a redundancy.
  }
}

/**
 * @returns {{title: string, text: string, url: string, receivedAt: number}|null}
 */
export function getShareTargetData() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      text: typeof parsed.text === 'string' ? parsed.text : '',
      url: typeof parsed.url === 'string' ? parsed.url : '',
      receivedAt: typeof parsed.receivedAt === 'number' ? parsed.receivedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Clear stored shared content (used once consumed or dismissed). */
export function clearShareTargetData() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}

/**
 * Listen for shared content delivered by the service worker via postMessage
 * (the primary channel; sessionStorage is the fallback redundancy).
 *
 * @param {Function} callback - Called with {title, text, url}
 * @returns {Function} Cleanup function removing the listener
 */
export function registerShareTargetListener(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }

  const handleMessage = (event) => {
    if (event.data?.type === SW_MESSAGE_TYPE && event.data.payload) {
      setShareTargetData(event.data.payload);
      callback(event.data.payload);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}

/**
 * Wait for the service worker to control this page, then subscribe to
 * share-target deliveries. Shared launches land on '/?share-target' before
 * the SW may control the page, so we wait for readiness first.
 *
 * @param {Function} callback - Called with the payload when delivered
 * @returns {Function} Cleanup function
 */
export function watchShareTargetDeliveries(callback) {
  if (!isSupported() || typeof callback !== 'function') return () => {};

  let cancelled = false;
  let cleanupMessage = () => {};

  navigator.serviceWorker.ready
    .then((registration) => {
      if (cancelled) return;
      cleanupMessage = registerShareTargetListener(callback);
      // Ask any existing window client that already holds shared content
      // (e.g. the SW redirected us) whether it has a payload stashed —
      // covers the case where postMessage raced the page load.
      registration.active?.postMessage({ type: 'SHARE_TARGET_PING' });
    })
    .catch(() => {
      // SW unavailable — silent; sessionStorage fallback is read by the app
      // on mount instead.
    });

  return () => {
    cancelled = true;
    cleanupMessage();
  };
}
