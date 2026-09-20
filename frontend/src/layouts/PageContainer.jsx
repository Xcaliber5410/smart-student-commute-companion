import React from 'react';

/**
 * PageContainer - Reusable content container component
 * 
 * Provides consistent styling for page content sections with:
 * - Dark themed card styling
 * - Responsive padding and spacing
 * - Optional title and description
 * - Flexible content area
 * 
 * @param {Object} props
 * @param {string} props.title - Optional title for the section
 * @param {string} props.description - Optional description text
 * @param {React.ReactNode} props.children - Content to render
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.as - HTML element to render as (default: 'div')
 */
export default function PageContainer({ 
  title, 
  description, 
  children, 
  className = '',
  as: Component = 'div'
}) {
  return (
    <Component className={`bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm ${className}`}>
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h2 className="text-lg font-extrabold text-white tracking-tight mb-1">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-slate-400">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </Component>
  );
}
