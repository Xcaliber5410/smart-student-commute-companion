import React from 'react';
import Badge from './Badge';

/**
 * EventLogList - Reusable chronological event log
 *
 * Renders timestamped, device-local events (install outcomes, connectivity
 * transitions, cache activity, service-worker errors) as a real ordered
 * list so assistive tech announces item order and count.
 *
 * Each row pairs a decorative severity dot with a visible text kind badge,
 * so severity is never conveyed by color alone. Messages wrap instead of
 * truncating — log text is meant to be read in full. The caller owns
 * slicing (recent rows, filters, "show more"), keeping this component
 * purely presentational.
 *
 * @param {Object} props
 * @param {Array<{id?: string|number, kind?: string, level?: string, message: string, at?: string}>} [props.items]
 *   Events, newest first. `kind` maps to a badge label, `level` to the dot
 *   color ('info' | 'success' | 'warning' | 'error'), `at` to an ISO time.
 * @param {string} [props.label='Recorded events'] - Accessible name for the list
 * @param {string} [props.emptyMessage='No events recorded yet.'] - Shown when there are no rows
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <EventLogList
 *   label="Service worker error log"
 *   items={errors}
 *   emptyMessage="No worker errors recorded."
 * />
 */
const KIND_STYLES = {
  install: { label: 'Install', variant: 'sky' },
  offline: { label: 'Offline', variant: 'amber' },
  online: { label: 'Online', variant: 'emerald' },
  cache: { label: 'Cache', variant: 'indigo' },
  'sw-error': { label: 'Worker error', variant: 'rose' },
  'sw-update': { label: 'Worker update', variant: 'teal' },
};

const LEVEL_DOTS = {
  info: 'bg-sky-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-rose-400',
};

export default function EventLogList({
  items = [],
  label = 'Recorded events',
  emptyMessage = 'No events recorded yet.',
  className = '',
}) {
  if (!items.length) {
    return (
      <p className={`px-1 text-xs text-slate-500 ${className}`} role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol
      aria-label={label}
      className={`rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/80 ${className}`}
    >
      {items.map((item, index) => {
        const kind = KIND_STYLES[item.kind] || { label: item.kind || 'Event', variant: 'slate' };
        const dot = LEVEL_DOTS[item.level] || 'bg-slate-500';
        return (
          <li
            key={item.id ?? `${item.at ?? 'event'}-${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dot}`}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant={kind.variant} size="xs">
                  {kind.label}
                </Badge>
                <span className="min-w-0 text-xs leading-relaxed text-slate-300 break-words">
                  {item.message}
                </span>
              </div>
            </div>
            {item.at && (
              <time
                dateTime={item.at}
                className="whitespace-nowrap text-[10px] text-slate-500"
              >
                {formatRelativeTime(item.at)}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function formatRelativeTime(iso) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
