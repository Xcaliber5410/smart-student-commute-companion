import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import Button from './Button';

/**
 * ErrorState - Reusable error display component with retry action
 * 
 * Safely presents readable errors to users without exposing technical stack traces.
 * 
 * @param {Object} props
 * @param {string} [props.title='Unable to load information'] - Error title
 * @param {string} [props.message='An unexpected error occurred while fetching commute data. Please try again.'] - User-friendly message
 * @param {Function} [props.onRetry] - Callback to retry the operation
 * @param {string} [props.retryLabel='Try Again'] - Label for the retry button
 * @param {boolean} [props.isRetrying=false] - Whether retry is in progress
 * @param {string[]} [props.suggestions] - Optional helpful troubleshooting suggestions
 * @param {React.ReactNode} [props.customAction] - Custom action button or component
 * @param {string} [props.className=''] - Additional container classes
 */
export default function ErrorState({
  title = 'Unable to load information',
  message = 'An unexpected error occurred while fetching commute data. Please try again.',
  onRetry,
  retryLabel = 'Try Again',
  isRetrying = false,
  suggestions,
  customAction,
  className = ''
}) {
  return (
    <div 
      className={`text-center py-10 px-4 bg-rose-950/20 rounded-2xl border border-rose-900/50 shadow-xl ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-3.5 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/10">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-100">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            {message}
          </p>
        </div>

        {Array.isArray(suggestions) && suggestions.length > 0 && (
          <div className="w-full text-left bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 space-y-1.5 my-1">
            <span className="font-semibold text-slate-300">Suggestions:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-400">
              {suggestions.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 mt-1">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:border-rose-500"
            >
              <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isRetrying ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{isRetrying ? 'Retrying...' : retryLabel}</span>
            </Button>
          )}

          {customAction}
        </div>
      </div>
    </div>
  );
}
