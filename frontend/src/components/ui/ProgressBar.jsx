import React from 'react';

const TRACK_VARIANTS = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-400',
};

const TRACK_SIZES = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

/**
 * ProgressBar - Reusable percentage/progress indicator
 *
 * Accessible horizontal progress meter (role="progressbar") for showing a
 * real value against a maximum: budget usage, rain probability, reliability
 * scores, completion, etc.
 *
 * Behaviour notes:
 * - `value` is validated and clamped to [0, max]; a null/undefined value
 *   renders an honest "no data" state instead of a misleading 0% bar.
 * - The numeric value renders as real text next to the track, so the number
 *   is never conveyed by color or bar length alone.
 * - Bars are decorative for assistive tech — the text label carries the data.
 *
 * @param {Object} props
 * @param {number|null} [props.value=null] - Current value (clamped to max)
 * @param {number} [props.max=100] - Maximum value (> 0)
 * @param {string} props.label - Visible label (also the accessible name)
 * @param {string} [props.displayValue] - Override the rendered value text
 * @param {'emerald'|'sky'|'amber'|'rose'|'indigo'|'teal'|'slate'} [props.variant='emerald'] - Fill color
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Track height
 * @param {boolean} [props.showValue=true] - Render the value text
 * @param {string} [props.hint] - Optional secondary line
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <ProgressBar label="Rain probability" value={weather.rainProbability} displayValue={`${weather.rainProbability}%`} variant="sky" />
 */
export default function ProgressBar({
  value = null,
  max = 100,
  label,
  displayValue,
  variant = 'emerald',
  size = 'md',
  showValue = true,
  hint,
  className = '',
}) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const hasValue = Number.isFinite(Number(value));
  const clamped = hasValue
    ? Math.min(safeMax, Math.max(0, Number(value)))
    : null;
  const percent = clamped === null ? 0 : Math.round((clamped / safeMax) * 100);
  const fillClass = TRACK_VARIANTS[variant] || TRACK_VARIANTS.emerald;
  const trackClass = TRACK_SIZES[size] || TRACK_SIZES.md;

  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <div className="flex items-baseline justify-between gap-2 pb-1">
          <span className="text-[11px] font-semibold text-slate-400 truncate">
            {label}
          </span>
          {showValue && (
            <span className="text-[11px] font-bold text-slate-200 shrink-0">
              {displayValue ??
                (hasValue ? `${Math.round(clamped)} / ${Math.round(safeMax)}` : '—')}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped === null ? undefined : Math.round(clamped)}
        aria-valuetext={
          displayValue ?? (hasValue ? `${percent}%` : 'No data available')
        }
        aria-busy={!hasValue || undefined}
        className={`w-full rounded-full bg-slate-800 overflow-hidden ${trackClass}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
          style={{ width: hasValue ? `${percent}%` : '0%' }}
        />
      </div>
      {!hasValue && (
        <p className="text-[10px] text-slate-500 pt-0.5">No data yet</p>
      )}
      {hint && hasValue && (
        <p className="text-[10px] text-slate-500 pt-0.5 truncate">{hint}</p>
      )}
    </div>
  );
}
