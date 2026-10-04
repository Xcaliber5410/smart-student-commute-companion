import React from 'react';

/**
 * UnreadCountBadge - numeric unread/new count indicator (Day 12)
 *
 * Compact count pill used by the Notifications screen header and by the
 * navigation badges. The displayed number is clamped (`9+` by default) so the
 * badge never overflows tight layouts such as the ten-item mobile bottom nav,
 * and an optional `srLabel` gives screen readers the full meaning of the
 * number without relying on color or position.
 *
 * @param {Object} props
 * @param {number} [props.count=0] - Whole number to display; renders nothing
 *   when count <= 0 (nothing to announce).
 * @param {number} [props.max=9] - Clamp threshold; counts above render `${max}+`.
 * @param {string|null} [props.srLabel='unread notifications'] - Suffix for a
 *   visually hidden description of the count. Pass `null` when adjacent visible
 *   text already carries the meaning (avoids duplicate announcements).
 * @param {'emerald'|'amber'} [props.variant='emerald'] - Color variant.
 * @param {'sm'|'md'} [props.size='sm'] - Pill size.
 * @param {string} [props.className=''] - Extra classes for positioning.
 */
export default function UnreadCountBadge({
  count = 0,
  max = 9,
  srLabel = 'unread notifications',
  variant = 'emerald',
  size = 'sm',
  className = '',
}) {
  if (!Number.isFinite(count) || count <= 0) return null;

  const display = count > max ? `${max}+` : String(count);
  const sizeClasses =
    size === 'md'
      ? 'min-w-6 px-1.5 py-0.5 text-xs'
      : 'min-w-4 px-1 py-0.5 text-[10px]';
  const variantClasses =
    variant === 'amber'
      ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
      : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-bold tabular-nums ${sizeClasses} ${variantClasses} ${className}`}
    >
      <span aria-hidden="true">{display}</span>
      {srLabel ? <span className="sr-only">{`${count} ${srLabel}`}</span> : null}
    </span>
  );
}
