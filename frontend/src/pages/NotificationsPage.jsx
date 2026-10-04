import React, { useMemo, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { Alert, EmptyState, ErrorState, LoadingState, SearchInput, Select } from '../components/ui';
import NotificationItem from '../components/NotificationItem';

export default function NotificationsPage({
  reports = [],
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
  onRefresh,
  isConnectionLost = false,
  onReconnect,
  readIds = new Set(),
  onToggleRead,
  onMarkAllRead,
  unreadCount,
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all');

  // Read state is owned by App (shared with navigation badges); derive counts
  // here so the header summary always matches the visible data.
  const readTotal = reports.filter((report) => readIds.has(report.id)).length;
  const unread =
    typeof unreadCount === 'number' ? unreadCount : reports.length - readTotal;
  const hasUnread = unread > 0;

  const visibleReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesQuery = !normalizedQuery || [report.area, report.message, report.mode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      const isRead = readIds.has(report.id);
      return matchesQuery && (view === 'all' || (view === 'unread' ? !isRead : isRead));
    });
  }, [query, readIds, reports, view]);

  const handleToggleRead = (id) => {
    if (onToggleRead) onToggleRead(id);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">Notifications</h1>
          <p className="text-sm text-slate-400">
            Recent commute updates from the student community
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {unread} unread · {readTotal} read
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onMarkAllRead && reports.length > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={!hasUnread}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              Mark all as read
            </button>
          )}
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
        </div>
      </header>

      {isConnectionLost && !isLoading && !loadError && (
        <Alert variant="warning" title="Live notifications paused">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>You are seeing the last loaded updates. New reports may be delayed.</span>
            {onReconnect && (
              <button
                type="button"
                onClick={onReconnect}
                className="min-h-10 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              >
                Reconnect
              </button>
            )}
          </div>
        </Alert>
      )}

      <section aria-label="Commute notifications" aria-busy={isLoading || isRefreshing}>
        {isRefreshing && !isLoading && !loadError && (
          <p role="status" className="mb-3 flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" aria-hidden="true" />
            Checking for new notifications...
          </p>
        )}
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
          <>
            <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-end">
              <SearchInput
                value={query}
                onChange={setQuery}
                label="Search notifications"
                placeholder="Search area or message..."
                className="w-full min-w-0 flex-1 sm:min-w-[200px]"
              />
              <Select
                label="Show"
                id="notification-view"
                className="w-full sm:w-auto"
                value={view}
                onChange={(event) => setView(event.target.value)}
                options={[
                  { value: 'all', label: 'All notifications' },
                  { value: 'unread', label: 'Unread only' },
                  { value: 'read', label: 'Read only' },
                ]}
              />
            </div>
            <p role="status" aria-live="polite" className="mt-3 text-xs text-slate-500">
              Showing {visibleReports.length} of {reports.length} notifications
            </p>
            {visibleReports.length === 0 ? (
              <EmptyState
                headingLevel={2}
                icon={<Bell />}
                title="No notifications match"
                description="Try a different search or change the notification filter."
                action={(
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setView('all'); }}
                    className="min-h-10 rounded-xl bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  >
                    Clear filters
                  </button>
                )}
              />
            ) : (
              <div className="mt-3 divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                {visibleReports.map((report) => (
                  <NotificationItem
                    key={report.id}
                    report={report}
                    isRead={readIds.has(report.id)}
                    onToggleRead={handleToggleRead}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}