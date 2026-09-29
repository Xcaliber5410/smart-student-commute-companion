import React from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import NotificationItem from '../components/NotificationItem';

export default function NotificationsPage({
  reports = [],
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
  onRefresh,
}) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">Notifications</h1>
          <p className="text-sm text-slate-400">
            Recent commute updates from the student community
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || isRefreshing}
            aria-busy={isRefreshing}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        )}
      </header>

      <section aria-label="Commute notifications" aria-busy={isLoading || isRefreshing}>
        {isLoading ? (
          <LoadingState
            headingLevel={2}
            title="Loading notifications..."
            description="Checking for the latest commute updates."
          />
        ) : loadError ? (
          <ErrorState
            headingLevel={2}
            title="Notifications unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload notifications"
          />
        ) : reports.length === 0 ? (
          <EmptyState
            headingLevel={2}
            icon={<Bell />}
            title="No new notifications"
            description="New student commute updates will appear here when they are reported."
          />
        ) : (
          <div className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            {reports.map((report) => (
              <NotificationItem key={report.id} report={report} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}