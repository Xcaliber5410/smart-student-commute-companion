import React, { useState, useMemo } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import TravelTogether from '../components/TravelTogether';
import { LoadingState, ErrorState, EmptyState, SearchInput, FilterBar, Select } from '../components/ui';
import { applyListControls, buildActiveFilters } from '../utils/listControls';

/**
 * TravelTogetherPage - Core "Travel Together" feature page structure
 *
 * Composes the commute-coordination feature into a single semantic page:
 * - Page heading (h1) for document outline
 * - Reusable search / filter / sort controls (client-side over the loaded list)
 * - Ride group list with loading/error placeholders
 *
 * Filter and sort state is kept here (view state), separate from the
 * presentational group list component.
 */
export default function TravelTogetherPage({
  groups = [],
  onJoinGroup,
  onOpenCreateGroup,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
}) {
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState('all');
  const [sortBy, setSortBy] = useState('departure');

  const visibleGroups = useMemo(
    () =>
      applyListControls(groups, {
        query,
        queryFields: ['origin_area', 'destination_college', 'notes', 'creator_pseudonym'],
        filters: {},
        sortKey:
          sortBy === 'departure'
            ? (g) => g.departure_time || ''
            : sortBy === 'spots'
            ? (g) => (g.max_members ?? 0) - (g.current_members ?? 0)
            : (g) => g.origin_area || '',
        sortDir: 'asc',
      }).filter((g) => {
        const isFull = (g.current_members ?? 0) >= (g.max_members ?? 0);
        if (availability === 'open') return !isFull;
        if (availability === 'full') return isFull;
        return true;
      }),
    [groups, query, availability, sortBy]
  );

  const activeFilters = buildActiveFilters(
    { availability },
    { availability: 'Availability' },
    { availability: { open: 'Open spots', full: 'Full groups' } },
    (field) => (field === 'availability' ? setAvailability('all') : undefined)
  );

  const handleClearAll = () => {
    setQuery('');
    setAvailability('all');
  };

  const showNoMatches = !isLoading && !loadError && groups.length > 0 && visibleGroups.length === 0;

  return (
    <div className="space-y-5">
      <header className="pb-1">
        <h1 className="text-xl font-extrabold text-white tracking-tight">
          Travel Together
        </h1>
        <p className="text-sm text-slate-400">
          Safe student grouping for auto-pooling and local train buddies
        </p>
      </header>

      {/* Search / filter / sort controls */}
      <FilterBar
        activeFilters={activeFilters}
        onClearAll={handleClearAll}
        resultCount={visibleGroups.length}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Search commute groups"
          placeholder="Search origin, college, or notes..."
          className="flex-1 min-w-[180px]"
        />

        <div className="flex flex-wrap gap-2.5">
          <Select
            label="Availability"
            id="group-availability-filter"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            options={[
              { value: 'all', label: 'All groups' },
              { value: 'open', label: 'Open spots' },
              { value: 'full', label: 'Full groups' },
            ]}
          />
          <Select
            label="Sort by"
            id="group-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'departure', label: 'Departure time' },
              { value: 'spots', label: 'Most open spots' },
              { value: 'area', label: 'Origin area (A-Z)' },
            ]}
          />
        </div>
      </FilterBar>

      <section aria-label="Commute groups" aria-busy={isLoading || isRefreshing}>
        {isLoading ? (
          <LoadingState
            title="Loading commute groups..."
            description="Fetching open student ride pools for your college routes."
          />
        ) : loadError ? (
          <ErrorState
            title="Commute groups unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload Groups"
          />
        ) : showNoMatches ? (
          <EmptyState
            icon={<SearchIcon />}
            title="No groups match your filters"
            description="Try a different search term, or clear the active filters to see all commute groups."
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
          <TravelTogether
            groups={visibleGroups}
            onJoinGroup={onJoinGroup}
            onOpenCreateGroup={onOpenCreateGroup}
          />
        )}
      </section>
    </div>
  );
}
