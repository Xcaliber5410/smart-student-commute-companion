import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * PasswordField - Reusable labelled password input with reveal toggle
 *
 * Same labelling, error and hint contract as `Input`, plus a built-in
 * show/hide control so every password form in the app gets the same
 * accessible reveal behaviour instead of re-implementing it (Day 14).
 *
 * Accessibility:
 * - The label is a real `<label htmlFor>`; errors use `role="alert"` and
 *   `aria-invalid`, hints/errors are wired via `aria-describedby` (Input parity).
 * - The reveal control is a real `<button type="button">` with
 *   `aria-pressed` state and an accessible name that always says what it does.
 * - Visibility is component-local: switching it never disturbs the value,
 *   focus, or the surrounding form draft.
 *
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {string} [props.id] - Input id (auto-generated when omitted)
 * @param {string} props.value - Current password value
 * @param {Function} props.onChange - (event) => void
 * @param {boolean} [props.required] - Mark as required
 * @param {boolean} [props.disabled] - Disable the field
 * @param {string} [props.error] - Error message (renders role="alert")
 * @param {string} [props.hint] - Help text (hidden while an error shows)
 * @param {string} [props.autoComplete] - autocomplete hint (browser password managers)
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.name] - Form field name
 * @param {string} [props.className] - Extra classes for the input
 * @param {string} [props.containerClassName] - Extra classes for the wrapper
 * @param {Object} [props.rest] - Any other native input props
 *
 * @example
 * <PasswordField
 *   id="account-password"
 *   label="Password"
 *   value={password}
 *   onChange={(e) => setPassword(e.target.value)}
 *   autoComplete="current-password"
 *   required
 * />
 */
export default function PasswordField({
  label,
  id,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  hint,
  autoComplete,
  placeholder,
  name,
  className = '',
  containerClassName = '',
  ...rest
}) {
  const [visible, setVisible] = useState(false);
  const fieldId = id || `password-${Math.random().toString(36).substr(2, 9)}`;

  const baseStyles =
    'w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 pr-11 text-sm text-white placeholder-slate-500 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  const borderStyles = error
    ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500'
    : 'border-slate-700/80 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500';

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-300 mb-1.5">
          {label}
          {required && <span className="text-rose-400 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={`${baseStyles} ${borderStyles} ${className}`}
          {...rest}
        />

        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={fieldId}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {visible ? (
            <EyeOff className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Eye className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {error && (
        <p id={`${fieldId}-error`} className="mt-1.5 text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}

      {hint && !error && (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}
