import React, { useState } from 'react';
import {
  CloudOff,
  UploadCloud,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  QueueReportItem,
  StatTile,
} from '../components/ui';

// Queue filters: the list below shows a subset; counts in the Status section
// always reflect the full queue.
const QUEUE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'failed', label: 'Rejected' },
];

/**
 * Offline Queue (Day 11 feature screen)
 *
 * Shows community disruption reports the student filed while offline, so a
 * dropped connection never silently loses a report. Queued reports are
 * submitted through the existing `POST /api/live-reports` contract as soon as
 * connectivity returns (automatic on `online`, or manually with Sync now).
 *
 * Two kinds of information render here:
 *  - Live facts (connection status, whether a sync is running) read from
 *    browser APIs / App state — always shown.
 *  - The queue itself (items, sync outcome) which arrives via props with
 *    explicit loading, empty and error states; nothing is fabricated when
 *    data is absent.
 *
 * Everything here is device-local state about *pending* submissions — no new
 * backend surface is involved.
 *
 * @param {Object} props
 * @param {Array} [props.items] - Queued reports (see services/offlineQueue.js)
 * @param {boolean} [props.isLoading] - Initial queue hydration in progress
 * @param {string|null} [props.loadError] - Friendly queue read error message
 * @param {Function} [props.onRetry] - Retry the failed queue read
 * @param {boolean} [props.isOffline] - Browser reports no connectivity
 * @param {boolean} [props.isSyncing] - A queue flush is in progress
 * @param {Function} [props.onSync] - Manually flush the queue now
 * @param {Function} [props.onDiscard] - Discard one queued report (id)
 * @param {Function} [props.onRetryItem] - Re-queue one rejected report (id)
 * @param {string|null} [props.lastSyncedAt] - ISO time of the last successful flush
 */
export default function OfflineQueuePage({
  items = [],
  isLoading = false,
  loadError = null,
  onRetry,
  isOffline = false,
  isSyncing = false,
  onSync,
  onDiscard,
  onRetryItem,
  lastSyncedAt = null,
}) {
  // Local interaction state: list filter + the report pending confirmation
  // (the discard action itself lives in the caller).
  const [filter, setFilter] = useState('all');
  const [discardTarget, setDiscardTarget] = useState(null);

  const pending = items.filter((item) => item.status !== 'failed');
  const failed = items.filter((item) => item.status === 'failed');
  const visibleItems = items.filter((item) =>
    filter === 'failed'
      ? item.status === 'failed'
      : filter === 'waiting'
        ? item.status !== 'failed'
        : true
  );

  const connection = isOffline
    ? {
        value: 'Offline',
        hint: 'Reports will wait in this queue',
        variant: 'amber',
        icon: <WifiOff className="h-4 w-4" aria-hidden="true" />,
      }
    : {
        value: 'Online',
        hint: 'Queued reports send automatically',
        variant: 'emerald',
        icon: <Wifi className="h-4 w-4" aria-hidden="true" />,
      };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
            Offline Queue
          </h1>
          <p className="text-sm text-slate-400">
            Reports you file while offline wait here and are broadcast to the feed as soon
            as your connection returns — a flaky signal never loses a report.
          </p>
        </div>
        {onSync && items.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<UploadCloud className="h-4 w-4" aria-hidden="true" />}
            loading={isSyncing}
            disabled={isSyncing || isOffline}
            onClick={onSync}
            className="min-h-9"
          >
            Sync now
          </Button>
        )}
      </header>

      {/* Live queue status — always rendered */}
      <section aria-label="Queue status" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Status
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <StatTile
            icon={connection.icon}
            variant={connection.variant}
            value={connection.value}
            label="Connection"
            hint={connection.hint}
          />
          <StatTile
            variant={pending.length > 0 ? 'sky' : 'slate'}
            value={pending.length}
            label="Waiting to send"
            hint={
              failed.length > 0
                ? `${failed.length} rejected — review below`
                : pending.length > 0
                  ? 'Broadcasts on reconnect'
                  : 'Nothing pending'
            }
          />
          <StatTile
            variant={lastSyncedAt ? 'emerald' : 'slate'}
            value={formatRelativeTime(lastSyncedAt)}
            label="Last synced"
            hint={lastSyncedAt ? 'Queue flushed successfully' : 'Nothing sent yet'}
          />
        </div>
      </section>

      {/* Queue read/sync request states — honest about absent data */}
      {loadError && (
        <ErrorState
          title="Could not read the queue"
          message={loadError}
          onRetry={onRetry}
          retryLabel="Try again"
          headingLevel={2}
        />
      )}
      {isLoading && !items.length && (
        <LoadingState
          title="Loading your queue…"
          description="Reading reports saved on this device."
          headingLevel={2}
        />
      )}
      {!isLoading && !loadError && !items.length && (
        <EmptyState
          icon={<UploadCloud className="w-6 h-6" aria-hidden="true" />}
          title="Nothing waiting to send"
          description="If you file a report without a connection, it is saved on this device and delivered here automatically once you are back online."
          headingLevel={2}
        />
      )}

      {/* Queued reports */}
      {items.length > 0 && (
        <section aria-label="Queued reports" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              {filter === 'failed'
                ? 'Rejected reports'
                : pending.length > 0
                  ? 'Waiting to send'
                  : 'Previously queued'}
            </h2>
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Filter queued reports"
            >
              {QUEUE_FILTERS.map((option) => {
                const isActive = filter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setFilter(option.id)}
                    className={`min-h-9 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                      isActive
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {visibleItems.length > 0 ? (
            <ul className="space-y-2">
              {visibleItems.map((item) => (
                <QueueReportItem
                  key={item.id}
                  status={
                    item.status === 'failed' ? 'failed' : isSyncing ? 'sending' : 'pending'
                  }
                  title={
                  item.report?.message ||
                  item.report?.description ||
                  item.report?.type ||
                  'Report'
                }
                  queuedAt={item.queuedAt}
                  area={item.report?.area}
                  attempts={item.attempts}
                  error={item.lastError}
                >
                  {onRetryItem && item.status === 'failed' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onRetryItem(item.id)}
                      className="min-h-9"
                    >
                      Try again
                    </Button>
                  )}
                  {onDiscard && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDiscardTarget(item)}
                      className="min-h-9"
                    >
                      Discard
                    </Button>
                  )}
                </QueueReportItem>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-1 text-xs text-slate-500">
              {filter === 'failed'
                ? 'No rejected reports — everything either went out or is still waiting.'
                : 'No reports waiting to send.'}
            </p>
          )}
        </section>
      )}

      {/* How it works / privacy note */}
      <p className="flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-400">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span>
          Queued reports stay in this browser until they are delivered — they are only
          submitted through the normal live-alerts endpoint, and nothing else is sent in
          the background. Discard a report here at any time before it goes out.
        </span>
      </p>

      {/* Discard confirmation (UI only; the caller performs the removal) */}
      {onDiscard && (
        <ConfirmDialog
          isOpen={Boolean(discardTarget)}
          onCancel={() => setDiscardTarget(null)}
          onConfirm={() => {
            if (discardTarget) onDiscard(discardTarget.id);
            setDiscardTarget(null);
          }}
          title="Discard this report?"
          message={`“${
            discardTarget?.report?.message ||
            discardTarget?.report?.description ||
            discardTarget?.report?.type ||
            'This report'
          }” will be removed from this device without being broadcast. This cannot be undone.`}
          confirmLabel="Discard report"
          destructive
        />
      )}
    </div>
  );
}

// ─── Device-local formatting helpers (presentation only) ───────────────────

function formatRelativeTime(iso) {
  if (typeof iso !== 'string') return 'Never';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Never';
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
