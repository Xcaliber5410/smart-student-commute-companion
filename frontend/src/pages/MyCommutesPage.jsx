import React from 'react';
import { Bookmark, Compass, RefreshCw } from 'lucide-react';
import SavedCommutes from '../components/SavedCommutes';
import { ErrorState, EmptyState, ListSkeleton, Button } from '../components/ui';

/**
 * MyCommutesPage - Core "My Commutes" feature page structure
 *
 * Semantic page for saved commute setups:
 * - Page heading (h1) for document outline
 * - On-device storage note (area-level planner data only)
 * - Saved list following the loading → error → empty → content order
 *
 * All data and callbacks arrive via props (no storage/API calls in pages).
 *
 * @param {Object} props
 * @param {Array<Object>} props.commutes - Saved commute setups (newest first)
 * @param {boolean} props.isLoading - Whether the saved list is first loading
 * @param {string|null} props.loadError - Friendly storage read error
 * @param {Function} props.onRetryLoad - Retry a failed saved-list load
 * @param {boolean} props.isRefreshing - Whether the list is re-reading storage
 * @param {Function} props.onRefresh - Re-read saved commutes from storage
 * @param {Function} props.onPlanCommute - Plan a saved commute
 * @param {Function} props.onRemoveCommute - Remove a saved commute
 * @param {boolean} props.isPlanning - Whether a plan request is in flight
 * @param {string|null} props.activeSignature - Setup loaded in the planner
 * @param {Function} props.onNavigateToPlanner - Navigate back to the planner
 */
export default function MyCommutesPage({
  commutes = [],
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
  onRefresh,
  onPlanCommute,
  onRemoveCommute,
  isPlanning = false,
  activeSignature = null,
  onNavigateToPlanner,
}) {
  const isBusy = isLoading || isRefreshing;

  return (
    <div className="space-y-5">
      {/* Page heading — establishes the h1 for this view */}
      <header className="pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            My Commutes
          </h1>
          <p className="text-sm text-slate-400">
            Saved commute setups for one-tap planning across your week
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isBusy}
            aria-busy={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRefreshing ? 'Reloading...' : 'Reload'}</span>
          </button>
        )}
      </header>

      {/* On-device storage note */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 flex items-center gap-2">
        <Bookmark className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
        <span>
          <strong className="text-emerald-400">Stored on this device only:</strong> saved commutes keep
          area-level planner settings (start, destination, modes, budget) — never accounts, tokens, or exact locations.
        </span>
      </div>

      {/* Saved list: loading → error → empty → content */}
      <section aria-label="Saved commutes" aria-busy={isBusy}>
        {isLoading ? (
          <ListSkeleton rows={3} label="Loading your saved commutes" />
        ) : loadError ? (
          <ErrorState
            headingLevel={2}
            title="Saved commutes unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Try Again"
            suggestions={[
              'Local storage may be blocked — allow site storage for this app and retry.',
              'Private browsing windows can disable storage for saved items.',
            ]}
          />
        ) : commutes.length === 0 ? (
          <EmptyState
            headingLevel={2}
            icon={<Bookmark className="w-6 h-6 text-emerald-400" aria-hidden="true" />}
            title="No saved commutes yet"
            description="Configure your route in the planner, then press “Save this commute” to keep it here for one-tap planning."
            action={
              <Button type="button" variant="primary" size="sm" icon={<Compass />} onClick={onNavigateToPlanner}>
                Plan a commute
              </Button>
            }
          />
        ) : (
          <>
            <p role="status" className="text-xs text-slate-400 pb-3">
              {commutes.length} saved {commutes.length === 1 ? 'commute' : 'commutes'} on this device
              {isRefreshing && ' — reloading…'}
            </p>
            <SavedCommutes
              commutes={commutes}
              onPlanCommute={onPlanCommute}
              onRemoveCommute={onRemoveCommute}
              isPlanning={isPlanning}
              activeSignature={activeSignature}
            />
          </>
        )}
      </section>
    </div>
  );
}
