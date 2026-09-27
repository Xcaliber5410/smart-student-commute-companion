import React from 'react';
import LiveStudentFeed from '../components/LiveStudentFeed';
import { LoadingState, ErrorState } from '../components/ui';

/**
 * LiveAlertsPage - Core "Live Alerts" feature page structure
 *
 * Composes the crowd-sourced disruption feed into a single semantic page:
 * - Page heading (h1) for document outline
 * - Live report feed with loading/error placeholders
 *
 * Presentation container only: reports and vote actions arrive via props.
 *
 * @param {Object} props
 * @param {Array} props.reports - Active live disruption reports
 * @param {Function} props.onConfirm - Confirm a report ("still happening")
 * @param {Function} props.onContradict - Contradict a report ("no longer happening")
 * @param {Function} props.onOpenCreateReport - Open the report dialog
 * @param {boolean} props.isConnected - Live socket connection status
 * @param {boolean} props.isLoading - Whether reports are loading
 * @param {string|null} props.loadError - User-friendly load error message
 * @param {Function} props.onRetryLoad - Retry loading reports
 * @param {boolean} props.isRefreshing - Whether a background refresh is running
 */
export default function LiveAlertsPage({
  reports = [],
  onConfirm,
  onContradict,
  onOpenCreateReport,
  isConnected,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
}) {
  return (
    <div className="space-y-5">
      <header className="pb-1">
        <h1 className="text-xl font-extrabold text-white tracking-tight">
          Live Alerts
        </h1>
        <p className="text-sm text-slate-400">
          Real-time crowd-sourced transit disruptions reported by students
        </p>
      </header>

      <section aria-label="Live disruption reports" aria-busy={isLoading || isRefreshing}>
        {isLoading ? (
          <LoadingState
            title="Loading live alerts..."
            description="Fetching the latest student disruption reports across Mumbai."
          />
        ) : loadError ? (
          <ErrorState
            title="Live alerts unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload Alerts"
          />
        ) : (
          <LiveStudentFeed
            reports={reports}
            onConfirm={onConfirm}
            onContradict={onContradict}
            onOpenCreateReport={onOpenCreateReport}
            isConnected={isConnected}
          />
        )}
      </section>
    </div>
  );
}
