import React, { useState } from 'react';
import { Search, TrainFront } from 'lucide-react';
import { Button, Input } from './ui';
import { validateText } from '../utils/validation';

/**
 * TransitSearchForm - Search controls for the Transit Search feature
 *
 * Controlled search form (query state and request state are owned by the
 * application layer — this component is presentation only):
 * - Accessible labeled search field with a visible h2 heading
 * - Submit button reflects the in-flight request state
 * - Enter submits; empty queries cannot be submitted
 * - Responsive: field and button stack on mobile, sit inline on sm+
 */
export default function TransitSearchForm({
  query,
  onQueryChange,
  onSubmit,
  isSearching = false,
  recentSearches = [],
  onSelectRecent,
  onClearRecent,
}) {
  const [queryError, setQueryError] = useState(null);

  const canSubmit = query.trim().length > 0 && !isSearching;

  const handleChange = (value) => {
    onQueryChange(value);
    if (queryError) setQueryError(null); // clear as the user types
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSearching) return;

    // Client-side validation — mirrors the backend contract (1–100 chars)
    const trimmed = query.trim();
    const error =
      trimmed.length === 0
        ? 'Enter a station, stop, or line name to search.'
        : validateText(trimmed, { minLength: 2, maxLength: 100, label: 'Search query' });
    if (error) {
      setQueryError(error);
      document.getElementById('transit-search-query')?.focus();
      return;
    }

    setQueryError(null);
    onSubmit(query);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <span>Search the Transit Network</span>
        </h2>
        <span className="text-[11px] font-medium text-emerald-400/90 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
          <TrainFront className="w-3 h-3" aria-hidden="true" />
          Mumbai GTFS Verified
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
          <Input
            id="transit-search-query"
            label="Station, stop, or line"
            type="search"
            required
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="e.g. Dadar, Andheri, Western Line, Metro 1..."
            hint="Searches official Mumbai GTFS data — suburban rail, metro, and BEST routes."
            error={queryError || undefined}
            icon={<Search className="w-4 h-4" aria-hidden="true" />}
            containerClassName="flex-1 min-w-0"
            autoComplete="off"
            maxLength={100}
          />
          <Button
            type="submit"
            variant="primary"
            loading={isSearching}
            disabled={!canSubmit}
            icon={<Search className="w-4 h-4" aria-hidden="true" />}
            className="sm:shrink-0 w-full sm:w-auto"
          >
            {isSearching ? 'Searching...' : 'Search Network'}
          </Button>
        </div>

        {/* Recent searches — one click re-runs a previous query */}
        {recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-[11px] font-semibold text-slate-400">
              Recent:
            </span>
            {recentSearches.map((recent) => (
              <button
                key={recent}
                type="button"
                onClick={() => onSelectRecent?.(recent)}
                className="text-[11px] px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                aria-label={`Search again for ${recent}`}
              >
                {recent}
              </button>
            ))}
            <button
              type="button"
              onClick={onClearRecent}
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2 px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              Clear
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
