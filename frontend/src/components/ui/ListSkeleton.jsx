import React from 'react';
import Skeleton from './Skeleton';

/**
 * ListSkeleton - Reusable loading placeholder for card lists
 *
 * Renders stable-size shimmering rows that mirror the DataCard list layout
 * so content does not jump when real data arrives. The skeleton itself is
 * hidden from assistive technology; an optional visible-to-screen-readers
 * status message announces the loading state.
 *
 * @param {Object} props
 * @param {number} [props.rows=3] - Number of placeholder rows
 * @param {string} [props.label='Loading results'] - Accessible status message
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <ListSkeleton rows={4} label="Searching the transit network" />
 */
export default function ListSkeleton({ rows = 3, label = 'Loading results', className = '' }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-3.5">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5 animate-pulse"
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton variant="rounded" className="w-24 h-5" />
              <Skeleton variant="rounded" className="w-16 h-5" />
            </div>
            <Skeleton variant="text" className="w-2/3 h-4" />
            <Skeleton variant="text" className="w-1/2 h-3" />
            <div className="pt-2 border-t border-slate-800/60">
              <Skeleton variant="text" className="w-28 h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
