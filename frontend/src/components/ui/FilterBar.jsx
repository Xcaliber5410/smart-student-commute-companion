import React from 'react';
import { X, SlidersHorizontal } from 'lucide-react';

/**
 * FilterChip - Visible indicator for a single active filter
 *
 * @param {Object} props
 * @param {string} props.label - Human-readable filter description
 * @param {Function} [props.onRemove] - Removes this filter when provided
 */
export function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold px-2 py-1 whitespace-nowrap">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove filter: ${label}`}
          className="p-1.5 -my-1 -mr-1 rounded hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/**
 * FilterBar - Reusable search/filter/sort toolbar
 *
 * Consistent responsive container for list controls:
 * - Wraps search, filter selects, and sort controls
 * - Renders active-filter chips so current narrowing is understandable
 * - Provides a "Clear all" reset action when filters are active
 *
 * Presentation only — filter values, filtering, and sorting logic are owned
 * by the feature page via props.
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.children] - Control inputs (search, selects)
 * @param {Array<{label: string, onRemove?: Function}>} [props.activeFilters=[]] - Active filter chips
 * @param {Function} [props.onClearAll] - Clears every filter; shows reset button when provided and filters active
 * @param {number} [props.resultCount] - Optional count of matching items
 * @param {string} [props.className=''] - Additional classes
 *
 * @example
 * <FilterBar activeFilters={chips} onClearAll={reset} resultCount={n}>
 *   <SearchInput ... />
 *   <Select ... />
 * </FilterBar>
 */
export default function FilterBar({
  children,
  activeFilters = [],
  onClearAll,
  resultCount,
  className = '',
}) {
  const hasActive = activeFilters.length > 0;

  return (
    <div
      className={`bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5 ${className}`}
      role="search"
    >
      <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
        <div className="flex-1 flex flex-wrap items-center gap-2">
          {hasActive && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              Active:
            </span>
          )}
          {activeFilters.map((f, i) => (
            <FilterChip key={`${f.label}-${i}`} label={f.label} onRemove={f.onRemove} />
          ))}
          {hasActive && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-semibold text-slate-400 hover:text-white underline underline-offset-2 px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              Clear all
            </button>
          )}
        </div>

        {typeof resultCount === 'number' && (
          <span
            className="text-[11px] text-slate-400 font-mono shrink-0"
            aria-live="polite"
          >
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
        {children}
      </div>
    </div>
  );
}
