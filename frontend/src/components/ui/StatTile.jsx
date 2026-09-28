import React from 'react';

const VARIANT_CLASSES = {
  slate: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
};

/**
 * StatTile - Reusable summary metric tile
 *
 * Compact, accessible stat display (icon + value + label + optional hint)
 * used for counts and status summaries at the top of feature screens.
 * Value and label render as real text, so the number is never conveyed by
 * color alone.
 *
 * @param {Object} props
 * @param {string|number} props.value - Primary metric value
 * @param {string} props.label - Short metric label
 * @param {React.ReactNode} [props.icon] - Optional decorative icon
 * @param {'slate'|'emerald'|'sky'|'amber'|'rose'|'indigo'} [props.variant='slate'] - Accent variant
 * @param {string} [props.hint] - Optional secondary line
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <StatTile value={12} label="Stops found" icon={<MapPin />} variant="emerald" />
 */
export default function StatTile({
  value,
  label,
  icon,
  variant = 'slate',
  hint,
  className = '',
}) {
  const variantClasses = VARIANT_CLASSES[variant] || VARIANT_CLASSES.slate;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 min-w-0 ${className}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${variantClasses}`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-lg font-extrabold text-white leading-tight truncate">
          {value}
        </div>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">
          {label}
        </div>
        {hint && (
          <div className="text-[10px] text-slate-500 truncate">{hint}</div>
        )}
      </div>
    </div>
  );
}
