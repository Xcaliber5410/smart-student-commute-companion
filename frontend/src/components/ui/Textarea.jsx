import React from 'react';

/**
 * Textarea - Reusable textarea component
 * 
 * A styled textarea component with character count, validation states,
 * and full accessibility support.
 * 
 * @param {Object} props
 * @param {string} props.label - Textarea label
 * @param {string} props.id - Textarea ID (auto-generated if not provided)
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.value - Textarea value
 * @param {Function} props.onChange - Change handler
 * @param {number} props.rows - Number of rows (default: 4)
 * @param {number} props.maxLength - Maximum character length
 * @param {boolean} props.required - Mark as required
 * @param {boolean} props.disabled - Disable textarea
 * @param {string} props.error - Error message
 * @param {string} props.hint - Helper text
 * @param {boolean} props.showCount - Show character count
 * @param {string} props.className - Additional CSS classes for textarea
 * @param {string} props.containerClassName - Additional CSS classes for container
 * @param {Object} props.rest - Other textarea props
 * 
 * @example
 * <Textarea 
 *   label="Description"
 *   value={description}
 *   onChange={(e) => setDescription(e.target.value)}
 *   maxLength={500}
 *   showCount
 * />
 */
export default function Textarea({
  label,
  id,
  placeholder,
  value,
  onChange,
  rows = 4,
  maxLength,
  required = false,
  disabled = false,
  error,
  hint,
  showCount = false,
  className = '',
  containerClassName = '',
  ...rest
}) {
  // Generate unique ID if not provided
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  
  // Base textarea styles
  const baseStyles = 'w-full bg-slate-950 border rounded-xl p-3 text-sm text-white placeholder-slate-500 resize-vertical transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  
  // Border styles based on state
  const borderStyles = error 
    ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500' 
    : 'border-slate-700/80 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500';
  
  // Combine styles
  const textareaStyles = `${baseStyles} ${borderStyles} ${className}`;
  
  // Character count
  const currentLength = value ? value.length : 0;
  const showCharCount = showCount && maxLength;
  
  return (
    <div className={`${containerClassName}`}>
      <div className="flex items-center justify-between mb-1.5">
        {label && (
          <label 
            htmlFor={textareaId} 
            className="block text-xs font-semibold text-slate-300"
          >
            {label}
            {required && <span className="text-rose-400 ml-1">*</span>}
          </label>
        )}
        
        {showCharCount && (
          <span className={`text-xs ${currentLength > maxLength ? 'text-rose-400' : 'text-slate-500'}`}>
            {currentLength}/{maxLength}
          </span>
        )}
      </div>
      
      <textarea
        id={textareaId}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={rows}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        className={textareaStyles}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...rest}
      />
      
      {error && (
        <p 
          id={`${textareaId}-error`} 
          className="mt-1.5 text-xs text-rose-400"
          role="alert"
        >
          {error}
        </p>
      )}
      
      {hint && !error && (
        <p 
          id={`${textareaId}-hint`} 
          className="mt-1.5 text-xs text-slate-400"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
