import React, { useState, useEffect } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';

/**
 * PwaStatusBanner - Offline status & app-update feedback
 *
 * A non-blocking, full-width status strip rendered above page content that
 * communicates two PWA states honestly:
 *
 * - **Offline**: browser connectivity is gone; the cached app shell is still
 *   usable, but live data (plans, reports, groups) will fail until the
 *   connection returns. Announced politely via role="status".
 * - **Update available**: the service worker installed a newer version and
 *   a refresh is offered with an explicit action button. Dismissible so it
 *   never traps the user.
 *
 * The banner participates in normal document flow (no fixed overlay), so it
 * can never cover the toast region or the mobile bottom navigation.
 *
 * @param {Object} props
 * @param {boolean} props.isOffline - navigator.onLine === false
 * @param {boolean} props.updateAvailable - A new service-worker version is waiting
 * @param {Function} props.onRefresh - Apply the pending update (reload)
 */
export default function PwaStatusBanner({ isOffline = false, updateAvailable = false, onRefresh }) {
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // A genuinely new update supersedes a previous dismissal
  useEffect(() => {
    if (updateAvailable) setUpdateDismissed(false);
  }, [updateAvailable]);

  if (!isOffline && (!updateAvailable || updateDismissed)) return null;

  return (
    <div className="space-y-2 pb-1" role="status" aria-live="polite">
      {isOffline && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-950/40 text-amber-200 text-xs font-medium">
          <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
          <span>
            <strong className="font-bold text-amber-300">You&rsquo;re offline.</strong>{' '}
            The app shell is cached, so you can keep browsing — but planning,
            live alerts, and search need a connection and will show retry
            options until you&rsquo;re back online.
          </span>
        </div>
      )}

      {updateAvailable && !updateDismissed && (
        <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs font-medium">
          <RefreshCw className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span className="flex-1 min-w-[180px]">
            <strong className="font-bold text-emerald-300">Update ready.</strong>{' '}
            A newer version of the app has been downloaded.
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setUpdateDismissed(true)}
            aria-label="Dismiss update notification"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
