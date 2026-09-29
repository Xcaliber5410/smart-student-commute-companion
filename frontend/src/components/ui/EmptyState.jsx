import React from 'react';

/**
 * EmptyState - Reusable empty state component
 * 
 * Displays a helpful message when there's no content to show.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Icon to display
 * @param {string} props.title - Empty state title
 * @param {string} props.description - Empty state description
 * @param {React.ReactNode} props.action - Optional call-to-action button
 * @param {2|3|4|5|6} [props.headingLevel=3] - Heading rank; pass 2 when this
 *   state renders as the first thing under the page h1 (keeps the document
 *   outline free of skipped levels)
 * @param {string} props.className - Additional CSS classes
 * 
 * @example
 * <EmptyState 
 *   icon={<InboxIcon />}
 *   title="No reports yet"
 *   description="When students post disruption reports, they'll appear here."
 *   action={<Button onClick={handleCreate}>Post Report</Button>}
 * />
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 3,
  className = '',
}) {
  const Heading = `h${Math.min(6, Math.max(2, Number(headingLevel) || 3))}`;

  return (
    <div 
      className={`text-center py-12 px-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
        {icon && (
          <div className="w-12 h-12 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-slate-400">
            {icon}
          </div>
        )}
        
        {title && (
          <Heading className="text-base font-semibold text-slate-200">
            {title}
          </Heading>
        )}
        
        {description && (
          <p className="text-sm text-slate-400 leading-relaxed">
            {description}
          </p>
        )}
        
        {action && (
          <div className="mt-2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
