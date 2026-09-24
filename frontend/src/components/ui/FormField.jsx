import React from 'react';

/**
 * FormField - Reusable form field wrapper
 * 
 * Provides consistent layout and accessibility wiring for form inputs:
 * - Associates <label> with control via htmlFor/id
 * - Renders accessible required indicator
 * - Connects error and hint messages with role="alert" and unique IDs
 * 
 * @param {Object} props
 * @param {string} props.label - Field label text
 * @param {string} [props.id] - Control ID
 * @param {boolean} [props.required=false] - Whether field is required
 * @param {string} [props.error] - Validation error message
 * @param {string} [props.hint] - Informational helper text
 * @param {React.ReactNode} props.children - Form control element
 * @param {string} [props.className=''] - Additional container classes
 */
export default function FormField({
  label,
  id,
  required = false,
  error,
  hint,
  children,
  className = ''
}) {
  const fieldId = id || (children && children.props && children.props.id);
  const errorId = fieldId ? `${fieldId}-error` : undefined;
  const hintId = fieldId ? `${fieldId}-hint` : undefined;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label 
          htmlFor={fieldId} 
          className="block text-xs font-semibold text-slate-300"
        >
          {label}
          {required && (
            <span className="text-rose-400 ml-1" aria-hidden="true">*</span>
          )}
        </label>
      )}

      <div className="relative">
        {React.isValidElement(children) && fieldId
          ? React.cloneElement(children, {
              id: fieldId,
              'aria-invalid': error ? 'true' : 'false',
              'aria-describedby': error ? errorId : hint ? hintId : undefined,
              ...(error ? { className: `${children.props.className || ''} border-rose-500 focus:ring-rose-500/50` } : {})
            })
          : children}
      </div>

      {error && (
        <p 
          id={errorId}
          className="text-xs text-rose-400 flex items-center gap-1 animate-in fade-in duration-150"
          role="alert"
        >
          <span>{error}</span>
        </p>
      )}

      {hint && !error && (
        <p 
          id={hintId}
          className="text-xs text-slate-400"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
