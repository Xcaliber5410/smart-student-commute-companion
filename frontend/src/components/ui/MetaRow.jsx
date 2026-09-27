import React from 'react';

/**
 * MetaRow - Reusable metadata row (icon + label/value)
 *
 * Displays a single labeled piece of detail information such as an origin
 * area, destination, departure time, or host. Used inside DataCards and
 * detail sections to avoid duplicating row markup across feature pages.
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.icon] - Optional leading icon (decorative)
 * @param {React.ReactNode} props.children - Row content (value)
 * @param {string} [props.label] - Optional accessible label for the value
 * @param {string} [props.className=''] - Additional classes
 * @param {string} [props.valueClassName=''] - Classes for the value text
 *
 * @example
 * <MetaRow icon={<MapPin />} label="Origin" valueClassName="text-white font-semibold">
 *   Andheri East
 * </MetaRow>
 */
export default function MetaRow({
  icon,
  children,
  label,
  className = '',
  valueClassName = 'text-slate-300',
}) {
  return (
    <div
      className={`flex items-center gap-1.5 text-xs min-w-0 ${className}`}
      {...(label ? { role: 'group', 'aria-label': label } : {})}
    >
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={`truncate min-w-0 ${valueClassName}`}>{children}</span>
    </div>
  );
}

/**
 * MetaList - Container for a stack of MetaRow items
 */
export function MetaList({ children, className = '' }) {
  return <div className={`space-y-1 ${className}`}>{children}</div>;
}
