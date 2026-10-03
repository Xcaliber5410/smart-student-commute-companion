import React from 'react';
import { Clock } from 'lucide-react';

/**
 * QueueReportItem - Reusable queued-submission row
 *
 * One pending unit of work waiting to reach the server (a Day-11 offline
 * report is the first consumer). Renders as an `<li>` so it must live inside
 * a list (`<ul>`/`<ol>`) — the caller owns the list, ordering, filtering and
 * action wiring, keeping this component purely presentational.
 *
 * Status is always carried by a visible text badge (never color alone),
 * long messages wrap instead of truncating, and the optional `children` slot
 * lets the caller append row actions (discard, retry) as real buttons.
 *
 * @param {Object} props
 * @param {'pending'|'sending'|'failed'} [props.status='pending'] - Delivery state
 * @param {string} [props.title] - Primary line (usually the report description)
 * @param {string} [props.queuedAt] - ISO time the item was queued
 * @param {string} [props.area] - Optional secondary context (e.g. area)
 * @param {number} [props.attempts=0] - How many delivery attempts have run
 * @param {string} [props.error] - Friendly rejection/last-failure message
 * @param {React.ReactNode} [props.children] - Row actions (buttons)
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <ul>
 *   <QueueReportItem
 *     status="pending"
 *     title="Road closed near campus gate"
 *     queuedAt={item.queuedAt}
 *     area="Andheri"
 *   >
 *     <button type="button">Discard</button>
 *   </QueueReportItem>
 * </ul>
 */
const STATUS_STYLES = {
  pending: {
    label: 'Waiting',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  sending: {
    label: 'Sending',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  failed: {
    label: 'Rejected',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

export default function QueueReportItem({
  status = 'pending',
  title = 'Report',
  queuedAt,
  area,
  attempts = 0,
  error,
  children,
  className = '',
}) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;

  return (
    <li
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${style.className}`}
        >
          {style.label}
        </span>
        <span className="min-w-0 text-sm text-slate-200 break-words">{title}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {queuedAt && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Queued {formatRelativeTime(queuedAt)}
          </span>
        )}
        {area && <span>{area}</span>}
        {attempts > 0 && <span>{attempts} send attempt(s)</span>}
      </div>
      {error && <p className="mt-1 text-xs text-rose-300/90 break-words">{error}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );
}

function formatRelativeTime(iso) {
  if (typeof iso !== 'string') return 'just now';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'just now';
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
