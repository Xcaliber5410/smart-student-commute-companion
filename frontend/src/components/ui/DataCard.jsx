import React from 'react';

/**
 * DataCard - Reusable data display card
 *
 * Consistent card shell for list/detail data items with:
 * - Optional left accent strip (e.g., impact level)
 * - Header slot (badges, timestamps, trailing actions)
 * - Title with optional trailing content
 * - Optional subtitle/meta line
 * - Body content
 * - Footer slot (actions, counts)
 *
 * Long text in the title/subtitle is truncated with ellipsis so cards never
 * break list layouts on mobile.
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.header] - Top slot (badges, freshness, etc.)
 * @param {React.ReactNode} props.title - Primary row content
 * @param {React.ReactNode} [props.subtitle] - Secondary line (route, area, etc.)
 * @param {React.ReactNode} props.children - Card body content
 * @param {React.ReactNode} [props.footer] - Bottom slot (actions, metadata)
 * @param {string} [props.accent] - Tailwind classes for the left accent strip
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <DataCard
 *   accent="bg-emerald-500"
 *   header={<Badge variant="amber">Community reported</Badge>}
 *   title={<span className="font-bold text-white">Andheri East</span>}
 *   subtitle="Western Line"
 *   footer={<span>12 confirmed</span>}
 * >
 *   Report message...
 * </DataCard>
 */
export default function DataCard({
  header,
  title,
  subtitle,
  children,
  footer,
  accent,
  className = '',
}) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 transition-all hover:border-slate-700 ${className}`}
    >
      {accent && (
        <div className={`absolute top-0 left-0 bottom-0 w-1 ${accent}`} aria-hidden="true" />
      )}

      <div className="space-y-2.5">
        {header && (
          <div className="flex flex-wrap items-center justify-between gap-2 pl-2">
            {header}
          </div>
        )}

        <div className="pl-2 min-w-0">
          <div className="text-sm font-bold text-white flex items-center justify-between gap-2 min-w-0">
            <span className="truncate min-w-0">{title}</span>
            {subtitle && <span className="shrink-0">{subtitle}</span>}
          </div>
        </div>

        {children && <div className="pl-2 min-w-0">{children}</div>}

        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pl-2 border-t border-slate-850 text-xs">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
