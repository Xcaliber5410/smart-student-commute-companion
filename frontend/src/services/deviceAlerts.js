/**
 * Device Alerts Feature Service (Day 7)
 *
 * Thin wrapper around the browser Notification API for OS-level delivery of
 * live disruption reports. Purely client-side: no backend endpoint is called
 * and no data leaves the device — the service only raises notifications from
 * live reports the app already receives over its existing socket stream.
 *
 * Browser notes:
 * - `new Notification(...)` throws on Android Chrome (and some iOS builds);
 *   those browsers only allow notifications through a service worker
 *   registration, so `showNotification` falls back to
 *   `navigator.serviceWorker.ready → reg.showNotification`.
 * - Every helper feature-detects, so unsupported browsers get safe answers
 *   (`'unsupported'` / `false`) instead of exceptions.
 */

/** @returns {boolean} Whether the Notification API exists in this browser. */
export function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * @returns {'granted'|'denied'|'default'|'unsupported'} Current permission
 * (never throws — reads the browser's live permission state).
 */
export function getPermission() {
  if (!isSupported()) return 'unsupported';
  return window.Notification.permission;
}

/**
 * Ask the user for notification permission.
 * MUST be called from a user gesture (e.g. button click) or browsers ignore it.
 *
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>} The resolved permission
 */
export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  try {
    const result = await Promise.resolve(window.Notification.requestPermission());
    return result === 'granted' || result === 'denied' || result === 'default'
      ? result
      : window.Notification.permission;
  } catch {
    return window.Notification.permission;
  }
}

/**
 * Watch for permission changes made outside the app (browser site settings).
 *
 * @param {Function} onChange - Called with the new permission state
 * @returns {Function} Cleanup that stops the watcher (safe to call always)
 */
export function watchPermission(onChange) {
  if (
    !isSupported() ||
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return () => {};
  }

  let status = null;
  let cancelled = false;

  navigator.permissions
    .query({ name: 'notifications' })
    .then((result) => {
      if (cancelled) return;
      status = result;
      status.onchange = () => onChange(status.state);
    })
    .catch(() => {
      // Permission Query API unavailable for notifications — status stays manual.
    });

  return () => {
    cancelled = true;
    if (status) status.onchange = null;
  };
}

/**
 * Raise a local OS-level notification.
 *
 * @param {Object} notification
 * @param {string} notification.title - Notification headline
 * @param {string} [notification.body] - Supporting text
 * @param {string} [notification.tag] - Dedupe tag (replaces an existing alert with the same tag)
 * @returns {Promise<boolean>} Whether a notification was actually shown
 */
export async function showNotification({ title, body, tag }) {
  if (!title || getPermission() !== 'granted') return false;

  try {
    new window.Notification(title, { body, tag });
    return true;
  } catch {
    // Constructor blocked (e.g. Android Chrome) — try the service worker path.
    try {
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
      const registration = await navigator.serviceWorker.ready;
      if (!registration || typeof registration.showNotification !== 'function') return false;
      await registration.showNotification(title, { body, tag });
      return true;
    } catch {
      return false;
    }
  }
}
