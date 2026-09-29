import React from 'react';
import {
  AlertTriangle,
  Bookmark,
  Plus,
  Search,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Alert, Button, StatTile } from './ui';

/**
 * DashboardOverview - Student dashboard summary for the main screen
 *
 * A compact "at a glance" panel that sits at the top of the planner view and
 * gives students the information hierarchy they need before planning:
 *
 * - Summary tiles fed by real application state (saved commutes, live alerts,
 *   ride groups, sync status) — never fabricated statistics
 * - Quick-access actions to the most common student tasks
 * - Recent transit searches (client-side preference store) as jump-off chips
 * - Honest loading, error, and empty states for every section
 *
 * Presentation only: all data and callbacks arrive via props.
 *
 * @param {Object} props
 * @param {number} props.savedCommutesCount - Commutes saved on this device
 * @param {number} props.groupsCount - Active ride groups
 * @param {number} props.reportsCount - Live disruption reports
 * @param {boolean} props.isConnected - Live socket connection status
 * @param {boolean} props.isLoading - Whether initial counts are loading
 * @param {string|null} props.loadError - Initial load failure message
 * @param {Function} props.onRetryLoad - Retry the failed initial load
 * @param {string[]} props.recentSearches - Recent transit search queries
 * @param {Function} props.onSelectRecent - Run a recent search
 * @param {Function} props.onNavigate - Navigate to another screen (tab id)
 * @param {Function} props.onOpenCreateReport - Open the disruption report dialog
 */
export default function DashboardOverview({
  savedCommutesCount = 0,
  groupsCount = 0,
  reportsCount = 0,
  isConnected = false,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  recentSearches = [],
  onSelectRecent,
  onNavigate,
  onOpenCreateReport,
}) {
  // Counts render as "—" while the first load is in flight instead of a
  // misleading 0, and keep their last value during background refreshes.
  const count = (value) => (isLoading ? '—' : value);

  return (
    <section aria-label="Commute dashboard" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-200 tracking-tight">
          Your commute at a glance
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            isConnected
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          }`}
        >
          {isConnected ? (
            <Wifi className="w-3 h-3" aria-hidden="true" />
          ) : (
            <WifiOff className="w-3 h-3" aria-hidden="true" />
          )}
          {isLoading
            ? 'Connecting…'
            : isConnected
              ? 'Live updates on'
              : 'Live updates reconnecting'}
        </span>
      </div>

      {/* Summary tiles — real counts from application state */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatTile
          value={count(savedCommutesCount)}
          label="Saved commutes"
          icon={<Bookmark className="w-4 h-4" aria-hidden="true" />}
          variant="emerald"
          hint={
            !isLoading && savedCommutesCount === 0
              ? 'Save one from the planner'
              : 'Stored on this device'
          }
        />
        <StatTile
          value={count(reportsCount)}
          label="Active alerts"
          icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
          variant="amber"
          hint={isLoading ? 'Loading live reports' : 'Crowd-sourced updates'}
        />
        <StatTile
          value={count(groupsCount)}
          label="Ride groups"
          icon={<Users className="w-4 h-4" aria-hidden="true" />}
          variant="indigo"
          hint={isLoading ? 'Loading groups' : 'Student travel pools'}
        />
        <StatTile
          value={isLoading ? '—' : isConnected ? 'Live' : 'Reconnecting'}
          label="Sync status"
          icon={
            isConnected ? (
              <Wifi className="w-4 h-4" aria-hidden="true" />
            ) : (
              <WifiOff className="w-4 h-4" aria-hidden="true" />
            )
          }
          variant={isConnected ? 'sky' : 'rose'}
          hint="Real-time stream"
        />
      </div>

      {/* Initial load failure — keep counts visible but offer a real retry */}
      {loadError && (
        <Alert variant="warning" title="Live counts unavailable">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            {onRetryLoad && (
              <Button type="button" size="sm" variant="secondary" onClick={onRetryLoad}>
                Retry
              </Button>
            )}
          </div>
        </Alert>
      )}

      {/* Quick-access actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Bookmark className="w-3.5 h-3.5" aria-hidden="true" />}
          onClick={() => onNavigate?.('mycommutes')}
        >
          My Commutes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Search className="w-3.5 h-3.5" aria-hidden="true" />}
          onClick={() => onNavigate?.('transit')}
        >
          Search transit stops
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
          onClick={onOpenCreateReport}
        >
          Post a disruption
        </Button>
      </div>

      {/* Recent searches — jump back into a previous query */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide pb-1.5">
          Recent searches
        </h3>
        {recentSearches.length === 0 ? (
          <p className="text-xs text-slate-500">
            Search a station or line on Transit Search and it will appear here
            for one-tap reuse.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 list-none">
            {recentSearches.map((query) => (
              <li key={query}>
                <button
                  type="button"
                  onClick={() => onSelectRecent?.(query)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
                >
                  {query}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
