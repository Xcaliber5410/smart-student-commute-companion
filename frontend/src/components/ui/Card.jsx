import React from 'react';

/**
 * Card - Reusable card container component
 * 
 * A flexible card component for grouping related content with consistent styling.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.title - Optional card title
 * @param {React.ReactNode} props.headerAction - Optional action in header
 * @param {string} props.footer - Optional card footer content
 * @param {boolean} props.noPadding - Remove default padding
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.as - HTML element to render as (default: 'div')
 * 
 * @example
 * <Card title="Route Results">
 *   <p>Card content here</p>
 * </Card>
 * 
 * <Card 
 *   title="Settings"
 *   headerAction={<Button size="sm">Edit</Button>}
 * >
 *   Content
 * </Card>
 */
export default function Card({
  children,
  title,
  headerAction,
  footer,
  noPadding = false,
  className = '',
  as: Component = 'div',
}) {
  const hasHeader = title || headerAction;
  
  return (
    <Component className={`bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl backdrop-blur-sm ${className}`}>
      {hasHeader && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          {title && (
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {title}
            </h3>
          )}
          {headerAction && (
            <div className="flex items-center gap-2">
              {headerAction}
            </div>
          )}
        </div>
      )}
      
      <div className={noPadding ? '' : 'p-5'}>
        {children}
      </div>
      
      {footer && (
        <div className="px-5 py-4 border-t border-slate-800/80 bg-slate-950/40">
          {footer}
        </div>
      )}
    </Component>
  );
}
