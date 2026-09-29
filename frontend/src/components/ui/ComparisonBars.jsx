import React from 'react';

const BAR_VARIANTS = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-500',
};

/**
 * ComparisonBars - Lightweight horizontal bar chart for small data sets
 *
 * Compares a handful of real numeric values (e.g. travel time or fare across
 * route options) as labeled horizontal bars. Deliberately dependency-free —
 * no charting library — and readable on small screens because every bar is
 * paired with its label and exact value as text.
 *
 * Rendering rules:
 * - Non-numeric / missing entries are skipped rather than drawn as zero.
 * - The longest value sets the scale (never an invented axis maximum).
 * - An empty list renders an explicit empty state, not a blank box.
 * - Bars are aria-hidden; each row's text is the accessible representation.
 *
 * @param {Object} props
 * @param {Array<{label: string, value: number, displayValue?: string, variant?: string, emphasis?: boolean}>} props.items - Data points
 * @param {string} props.title - Chart heading (visible, forms the group name)
 * @param {string} [props.valueUnit] - Unit suffix used when computing display text
 * @param {string} [props.emptyMessage='No data to compare yet'] - Empty-state copy
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <ComparisonBars
 *   title="Travel time across options"
 *   items={[{ label: 'Recommended', value: 42, emphasis: true }, { label: 'Alternative', value: 55 }]}
 *   valueUnit="min"
 * />
 */
export default function ComparisonBars({
  items = [],
  title,
  valueUnit = '',
  emptyMessage = 'No data to compare yet',
  className = '',
}) {
  const valid = (Array.isArray(items) ? items : []).filter(
    (item) => item && typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0
  );

  if (valid.length === 0) {
    return (
      <div className={`min-w-0 ${className}`}>
        {title && (
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2">
            {title}
          </h4>
        )}
        <p role="status" className="text-xs text-slate-500 bg-slate-950/60 border border-dashed border-slate-800 rounded-xl px-3 py-3">
          {emptyMessage}
        </p>
      </div>
    );
  }

  const scaleMax = Math.max(...valid.map((item) => item.value), 1);

  return (
    <div className={`min-w-0 ${className}`}>
      {title && (
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2">
          {title}
        </h4>
      )}
      <ul className="space-y-2 list-none">
        {valid.map((item, index) => {
          const width = Math.max(4, Math.round((item.value / scaleMax) * 100));
          const fillClass =
            BAR_VARIANTS[item.variant] ||
            (item.emphasis ? BAR_VARIANTS.emerald : BAR_VARIANTS.slate);
          const display =
            item.displayValue ??
            `${Math.round(item.value)}${valueUnit ? ` ${valueUnit}` : ''}`;
          return (
            <li
              key={`${item.label}-${index}`}
              className={`text-xs ${item.emphasis ? 'text-slate-100' : 'text-slate-400'}`}
            >
              <div className="flex items-baseline justify-between gap-2 pb-0.5">
                <span className={`truncate ${item.emphasis ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
                <span className={`shrink-0 font-mono ${item.emphasis ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>
                  {display}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-2 w-full rounded-full bg-slate-800/80 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
