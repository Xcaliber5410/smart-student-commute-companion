import React, { useState, useMemo } from 'react';
import { Search as SearchIcon, RefreshCw } from 'lucide-react';
import LiveStudentFeed from '../components/LiveStudentFeed';
import { LoadingState, ErrorState, EmptyState, SearchInput, FilterBar, Select } from '../components/ui';
import { applyListControls, buildActiveFilters } from '../utils/listControls';

const IMPACT_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };
const MODE_LABELS = {
  train: 'Train',
  metro: 'Metro',
  bus: 'BEST Bus',
  auto: 'Auto / Taxi',
  walk: 'Walk',
};

/**
 * LiveAlertsPage - Core "Live Alerts" feature page structure
 *
 * Composes the crowd-sourced disruption feed into a single semantic page:
 * - Page heading (h1) for document outline
 * - Reusable search / filter / sort controls (client-side over the active list)
 * - Live report feed with loading/error placeholders
 *
 * Filter and sort state is kept here (view state), separate from the
 * presentational feed component.
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
  onRefresh,
}) {
  const [query, setQuery] = useState('');
  const [impact, setImpact] = useState('all');
  const [mode, setMode] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const visibleReports = useMemo(
    () =>
      applyListControls(reports, {
        query,
        queryFields: ['area', 'message', 'route_name', 'pseudonym'],
        filters: { impact, mode },
        sortKey:
          sortBy === 'newest'
            ? (r) => -(r.ageMinutes ?? 0)
            : sortBy === 'oldest'
            ? (r) => r.ageMinutes ?? 0
            : sortBy === 'impact'
            ? (r) => ({ high: 3, medium: 2, low: 1 }[r.impact] ?? 0)
            : (r) => r.freshnessWeight ?? 1,
        sortDir: sortBy === 'oldest' ? 'asc' : 'desc',
      }),
    [reports, query, impact, mode, sortBy]
  );

  const activeFilters = buildActiveFilters(
    { impact, mode },
    { impact: 'Impact', mode: 'Mode' },
    { impact: IMPACT_LABELS, mode: MODE_LABELS },
    (field) => (field === 'impact' ? setImpact('all') : setMode('all'))
  );

  const handleClearAll = () => {
    setQuery('');
    setImpact('all');
    setMode('all');
  };

  const showNoMatches = !isLoading && !loadError && reports.length > 0 && visibleReports.length === 0;

  return (
    <div className="space-y-5">
      <header className="pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Live Alerts
          </h1>
          <p className="text-sm text-slate-400">
            Real-time crowd-sourced transit disruptions reported by students
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || isRefreshing}
            aria-busy={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        )}
      </header>

      {/* Search / filter / sort controls */}
      <FilterBar
        activeFilters={activeFilters}
        onClearAll={handleClearAll}
        resultCount={visibleReports.length}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Search live alerts"
          placeholder="Search area, route, or message..."
          className="flex-1 min-w-[180px]"
        />

        <div className="flex flex-wrap gap-2.5">
          <Select
            label="Impact"
            id="alert-impact-filter"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            options={[
              { value: 'all', label: 'All impacts' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <Select
            label="Mode"
            id="alert-mode-filter"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            options={[
              { value: 'all', label: 'All modes' },
              ...Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            label="Sort by"
            id="alert-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'impact', label: 'Highest impact' },
              { value: 'freshness', label: 'Freshest' },
            ]}
          />
        </div>
      </FilterBar>

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
        ) : showNoMatches ? (
          <EmptyState
            icon={<SearchIcon />}
            title="No alerts match your filters"
            description="Try a different search term, or clear the active filters to see all live reports."
            action={
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              >
                Clear Filters
              </button>
            }
          />
        ) : (
          <LiveStudentFeed
            reports={visibleReports}
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
