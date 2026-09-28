import React from 'react';
import { Search as SearchIcon, RefreshCw } from 'lucide-react';
import TransitSearchForm from '../components/TransitSearchForm';
import TransitResults from '../components/TransitResults';
import { LoadingState, ErrorState, EmptyState } from '../components/ui';

/**
 * TransitSearchPage - Core "Transit Search" feature page structure
 *
 * Semantic page for the GTFS station / stop / line lookup feature:
 * - Page heading (h1) for document outline
 * - Search controls (always visible, request state passed via props)
 * - Results section following the loading → error → content order
 *
 * All data and callbacks arrive via props (no API calls in pages).
 */
export default function TransitSearchPage({
  query,
  onQueryChange,
  onSearch,
  status = 'idle',
  result = null,
  error = null,
  onRetry,
  onRefresh,
}) {
  const stops = result?.stops || [];
  const routes = result?.routes || [];
  const hasResults = stops.length > 0 || routes.length > 0;
  const trimmedQuery = query.trim();
  const isBusy = status === 'loading' || status === 'refreshing';

  return (
    <div className="space-y-5">
      <header className="pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Transit Search
          </h1>
          <p className="text-sm text-slate-400">
            Look up official Mumbai GTFS stations, stops, and transit lines
          </p>
        </div>
        {onRefresh && status === 'success' && hasResults && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isBusy}
            aria-busy={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isBusy ? 'Searching...' : 'Search again'}</span>
          </button>
        )}
      </header>

      {/* Search controls — always available so users can refine a query */}
      <section aria-label="Transit search controls">
        <TransitSearchForm
          query={query}
          onQueryChange={onQueryChange}
          onSubmit={onSearch}
          isSearching={status === 'loading'}
        />
      </section>

      {/* Results section: idle → loading → error → content */}
      <section aria-label="Transit search results" aria-busy={isBusy}>
        {status === 'idle' ? (
          <EmptyState
            icon={<SearchIcon />}
            title="Search the Mumbai transit network"
            description="Enter a station, stop, or line name above to explore official GTFS data — suburban rail, metro, and BEST bus routes."
          />
        ) : status === 'loading' ? (
          <LoadingState
            title="Searching the transit network..."
            description="Looking up matching stops and lines in the official Mumbai GTFS dataset."
          />
        ) : status === 'error' ? (
          <ErrorState
            title="Transit search unavailable"
            message={error}
            onRetry={onRetry}
            retryLabel="Try Again"
            suggestions={[
              'Check your internet connection and try again.',
              'Verify the backend service is running and try again.',
            ]}
          />
        ) : !hasResults ? (
          <EmptyState
            icon={<SearchIcon />}
            title={`No transit matches for "${trimmedQuery}"`}
            description="Try a shorter keyword — for example a station (Dadar), an area (Andheri), or a line (Western Line)."
          />
        ) : (
          <TransitResults stops={stops} routes={routes} />
        )}
      </section>
    </div>
  );
}
