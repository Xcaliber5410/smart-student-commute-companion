import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Gauge,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  StatTile,
} from '../components/ui';

/**
 * PWA Analytics (Day 10 feature screen)
 *
 * Client-side monitoring dashboard for the installed app — the four roadmap
 * items from PWA_SETUP.md: install tracking, offline usage, cache hit/miss
 * rates, and service-worker error monitoring.
 *
 * Two kinds of information render here:
 *  - Live status (install offer, display mode, connection, SW control) read
 *    directly from browser APIs and existing application state — always shown.
 *  - Recorded metrics (counters, timestamps, cache rates) that the app has
 *    observed over time. They arrive via props with explicit loading, empty
 *    and error states; nothing is fabricated when data is absent.
 *
 * Everything shown is device-local — no analytics leave this browser, which
 * matches the project's documented privacy stance.
 *
 * @param {Object} props
 * @param {Object|null} [props.snapshot] - Recorded metrics (null until loaded)
 * @param {boolean} [props.isLoading] - First load in progress
 * @param {string|null} [props.loadError] - Friendly first-load error message
 * @param {Function} [props.onRetry] - Retry the failed load
 * @param {boolean} [props.isRefreshing] - Background refresh in progress
 * @param {Function} [props.onRefresh] - Re-read recorded metrics
 * @param {boolean} [props.canInstall] - Browser currently offers one-tap install
 * @param {boolean} [props.isInstalled] - App is installed / running standalone
 * @param {boolean} [props.isOffline] - Browser reports no connectivity
 */
export default function AnalyticsPage({
  snapshot = null,
  isLoading = false,
  loadError = null,
  onRetry,
  isRefreshing = false,
  onRefresh,
  canInstall = false,
  isInstalled = false,
  isOffline = false,
}) {
  // Display mode can change without a reload (Chrome opens installed PWAs
  // in standalone), so both live facts subscribe to their change events.
  const [isStandalone, setIsStandalone] = useState(() => {
    try {
      return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
    } catch {
      return false;
    }
  });
  const [swControlled, setSwControlled] = useState(() =>
    Boolean(navigator.serviceWorker?.controller)
  );

  useEffect(() => {
    let media;
    try {
      media = window.matchMedia?.('(display-mode: standalone)');
      media?.addEventListener?.('change', handleDisplayModeChange);
    } catch {
      // matchMedia display-mode queries unsupported — initial value stands.
    }
    // The service worker claims open clients on activation; the controller
    // state flips without a page reload.
    navigator.serviceWorker?.addEventListener?.('controllerchange', handleControllerChange);
    return () => {
      media?.removeEventListener?.('change', handleDisplayModeChange);
      navigator.serviceWorker?.removeEventListener?.('controllerchange', handleControllerChange);
    };
  }, []);

  function handleDisplayModeChange(event) {
    setIsStandalone(Boolean(event.matches));
  }

  function handleControllerChange() {
    setSwControlled(Boolean(navigator.serviceWorker?.controller));
  }

  const installStatus = isInstalled
    ? {
        value: 'Installed',
        hint: 'Running as an installed app',
        variant: 'emerald',
      }
    : canInstall
      ? {
          value: 'Available',
          hint: 'Browser offers one-tap install',
          variant: 'sky',
        }
      : {
          value: 'Not offered',
          hint: 'Manual steps live in Install & Share',
          variant: 'slate',
        };

  const displayMode = isStandalone
    ? { value: 'Standalone', hint: 'Opened from your home screen', variant: 'emerald' }
    : { value: 'Browser tab', hint: 'Running inside the browser', variant: 'slate' };

  const connection = isOffline
    ? {
        value: 'Offline',
        hint: 'Live updates pause until you reconnect',
        variant: 'amber',
        icon: <WifiOff className="h-4 w-4" aria-hidden="true" />,
      }
    : {
        value: 'Online',
        hint: 'Live updates are streaming',
        variant: 'emerald',
        icon: <Wifi className="h-4 w-4" aria-hidden="true" />,
      };

  const swStatus = swControlled
    ? {
        value: 'Active',
        hint: 'Service worker serves the cached shell',
        variant: 'emerald',
      }
    : {
        value: 'Not active',
        hint: 'Claims the page on its first activation',
        variant: 'amber',
      };

  // Recorded metrics (present only after the app has loaded them)
  const installData = {
    accepted: snapshot?.install?.accepted ?? 0,
    dismissed: snapshot?.install?.dismissed ?? 0,
    unavailable: snapshot?.install?.unavailable ?? 0,
    installedAt: snapshot?.install?.installedAt ?? null,
  };
  const offlineData = {
    sessions: snapshot?.offline?.sessions ?? 0,
    totalMs: snapshot?.offline?.totalMs ?? 0,
    lastOfflineAt: snapshot?.offline?.lastOfflineAt ?? null,
  };
  const cacheData = {
    hits: snapshot?.cache?.hits ?? 0,
    misses: snapshot?.cache?.misses ?? 0,
  };
  const swData = {
    errorCount: snapshot?.sw?.errorCount ?? 0,
    lastErrorAt: snapshot?.sw?.lastErrorAt ?? null,
  };
  const storageData = snapshot?.storage ?? null;

  const cacheLookups = cacheData.hits + cacheData.misses;
  const hitRate =
    snapshot && cacheLookups > 0
      ? Math.round((cacheData.hits / cacheLookups) * 100)
      : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
            PWA Analytics
          </h1>
          <p className="text-sm text-slate-400">
            How this app is installed, how often it runs offline, how well the service-worker
            cache performs, and whether the worker hits any errors.
          </p>
        </div>
        {onRefresh && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            loading={isRefreshing}
            disabled={isRefreshing}
            onClick={onRefresh}
            className="shrink-0 self-start"
          >
            Refresh
          </Button>
        )}
      </header>

      {/* Recorded-metrics request states — honest about absent data */}
      {isLoading && !snapshot && (
        <LoadingState
          title="Loading analytics…"
          description="Reading the metrics recorded on this device."
          headingLevel={2}
        />
      )}
      {loadError && (
        <ErrorState
          title="Unable to load analytics"
          message={loadError}
          onRetry={onRetry}
          retryLabel="Try again"
          headingLevel={2}
        />
      )}
      {!snapshot && !isLoading && !loadError && (
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" aria-hidden="true" />}
          title="No metrics recorded yet"
          description="Metrics are recorded on this device as you install the app, lose connectivity, and let the service worker serve cached files. They will appear here."
          headingLevel={2}
        />
      )}

      <section aria-label="Installation tracking" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Installation tracking
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={<MonitorSmartphone className="h-4 w-4" aria-hidden="true" />}
            variant={installStatus.variant}
            value={installStatus.value}
            label="Install status"
            hint={installStatus.hint}
          />
          <StatTile
            icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
            variant={displayMode.variant}
            value={displayMode.value}
            label="Display mode"
            hint={displayMode.hint}
          />
          {snapshot && (
            <>
              <StatTile
                variant="emerald"
                value={installData.accepted}
                label="Install accepted"
                hint="One-tap prompts accepted"
              />
              <StatTile
                variant="sky"
                value={installData.dismissed}
                label="Install dismissed"
                hint={`${installData.unavailable} prompts unavailable`}
              />
            </>
          )}
        </div>
        {snapshot && installData.installedAt && (
          <p className="text-xs text-slate-500">
            Installed on {formatDate(installData.installedAt)}.
          </p>
        )}
      </section>

      <section aria-label="Offline usage analytics" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Offline usage
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={connection.icon}
            variant={connection.variant}
            value={connection.value}
            label="Connection"
            hint={connection.hint}
          />
          {snapshot && (
            <>
              <StatTile
                variant="sky"
                value={offlineData.sessions}
                label="Offline periods"
                hint="Times connectivity dropped"
              />
              <StatTile
                variant="indigo"
                value={formatDuration(offlineData.totalMs)}
                label="Time offline"
                hint="Cumulative on this device"
              />
              <StatTile
                variant="slate"
                value={formatRelativeTime(offlineData.lastOfflineAt)}
                label="Last offline"
                hint="Most recent disconnection"
              />
            </>
          )}
        </div>
      </section>

      <section aria-label="Cache hit and miss rates" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Cache performance
        </h2>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3.5">
          <ProgressBar
            label="Static asset cache hit rate"
            value={hitRate}
            displayValue={hitRate === null ? undefined : `${hitRate}%`}
            variant="emerald"
            hint={
              hitRate === null
                ? undefined
                : `${cacheData.hits} served from cache · ${cacheData.misses} from network`
            }
          />
        </div>
        {snapshot && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile
              variant="emerald"
              value={cacheData.hits}
              label="Cache hits"
              hint="Served without network"
            />
            <StatTile
              variant="amber"
              value={cacheData.misses}
              label="Cache misses"
              hint="Fetched from the network"
            />
            <StatTile
              variant="slate"
              value={storageData ? formatBytes(storageData.usage) : '—'}
              label="Storage used"
              hint={
                storageData && Number.isFinite(storageData.quota)
                  ? `of ${formatBytes(storageData.quota)} quota`
                  : 'Quota unavailable'
              }
            />
          </div>
        )}
      </section>

      <section aria-label="Service worker error monitoring" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Service worker monitoring
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
            variant={swStatus.variant}
            value={swStatus.value}
            label="Service worker"
            hint={swStatus.hint}
          />
          {snapshot && (
            <>
              <StatTile
                variant={swData.errorCount > 0 ? 'rose' : 'emerald'}
                value={swData.errorCount}
                label="Worker errors"
                hint="Recorded on this device"
              />
              <StatTile
                variant="slate"
                value={formatRelativeTime(swData.lastErrorAt)}
                label="Last error"
                hint="Most recent worker failure"
              />
            </>
          )}
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span>
          Every metric on this screen is counted and stored on this device only. Nothing is
          uploaded to a server, and no browsing history or location leaves your browser.
        </span>
      </p>
    </div>
  );
}

// ─── Device-local formatting helpers (presentation only) ───────────────────

function formatRelativeTime(iso) {
  if (typeof iso !== 'string') return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDate(iso) {
  if (typeof iso !== 'string') return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
