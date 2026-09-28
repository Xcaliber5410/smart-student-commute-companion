import React from 'react';
import { Search, TrainFront } from 'lucide-react';
import { Button, Input } from './ui';

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
}) {
  const canSubmit = query.trim().length > 0 && !isSearching;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
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
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="e.g. Dadar, Andheri, Western Line, Metro 1..."
            hint="Searches official Mumbai GTFS data — suburban rail, metro, and BEST routes."
            icon={<Search className="w-4 h-4" aria-hidden="true" />}
            containerClassName="flex-1 min-w-0"
            autoComplete="off"
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
      </form>
    </div>
  );
}
