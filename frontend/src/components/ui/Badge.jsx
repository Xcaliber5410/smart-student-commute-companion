import React from 'react';

/**
 * Badge - Reusable status/label indicator
 *
 * Displays short contextual labels (mode, impact, connection status, etc.).
 * Always renders a visible text label alongside any icon so status is never
 * communicated by color alone.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Badge text (required for accessibility)
 * @param {React.ReactNode} [props.icon] - Optional leading icon (decorative)
 * @param {'slate'|'emerald'|'amber'|'rose'|'indigo'|'sky'|'teal'} [props.variant='slate'] - Color variant
 * @param {'xs'|'sm'} [props.size='sm'] - Badge size
 * @param {string} [props.className=''] - Additional classes
 *
 * @example
 * <Badge variant="amber" icon={<AlertTriangle />}>Community reported</Badge>
 */
const VARIANT_CLASSES = {
  slate: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  teal: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
};

export default function Badge({
  children,
  icon,
  variant = 'slate',
  size = 'sm',
  className = '',
}) {
  const sizeClasses = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-semibold whitespace-nowrap ${sizeClasses} ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.slate} ${className}`}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
