import React from 'react';
import Spinner from './Spinner';

/**
 * LoadingState - Reusable loading indicator for sections and pages
 * 
 * @param {Object} props
 * @param {string} [props.title='Loading...'] - Primary loading heading
 * @param {string} [props.description] - Optional secondary guidance text
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Spinner size
 * @param {string} [props.className=''] - Additional container classes
 */
export default function LoadingState({
  title = 'Loading...',
  description,
  size = 'lg',
  className = ''
}) {
  return (
    <div 
      className={`text-center py-12 px-4 bg-slate-950/40 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center gap-4 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} variant="primary" label={title} center />
      <div className="space-y-1 max-w-sm mx-auto">
        <h3 className="text-sm sm:text-base font-semibold text-slate-200">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-slate-400 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
