import React from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * SuccessState - Reusable confirmation and success state component
 * 
 * @param {Object} props
 * @param {string} [props.title='Success!'] - Success heading
 * @param {string} [props.description] - Detailed confirmation message
 * @param {React.ReactNode} [props.action] - Optional action button (e.g., Continue, Close)
 * @param {string} [props.className=''] - Additional CSS classes
 */
export default function SuccessState({
  title = 'Success!',
  description,
  action,
  className = ''
}) {
  return (
    <div 
      className={`text-center py-10 px-4 bg-emerald-950/20 rounded-2xl border border-emerald-900/50 shadow-xl ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3.5 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">
            {title}
          </h3>
          {description && (
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {action && (
          <div className="mt-2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
