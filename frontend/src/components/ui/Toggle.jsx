import React from 'react';

/**
 * Toggle - Reusable accessible on/off switch
 *
 * Built on a native checkbox with role="switch" so keyboard operation,
 * form semantics, and screen reader support come for free. The visible
 * track sits next to the input with a peer focus ring, and the ON/OFF
 * text state means status is never conveyed by color alone.
 *
 * @param {Object} props
 * @param {string} props.id - Unique id (associates label with input)
 * @param {boolean} props.checked - Current state
 * @param {Function} props.onChange - Change handler: onChange(boolean)
 * @param {string} props.label - Visible label text
 * @param {string} [props.description] - Secondary explanation
 * @param {boolean} [props.disabled] - Disable during pending work (e.g. permission request)
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <Toggle id="device-alerts" checked={enabled} onChange={setEnabled} label="Device alerts" />
 */
export default function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={`block text-sm font-semibold cursor-pointer ${
            disabled ? 'text-slate-500' : 'text-slate-200'
          }`}
        >
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-xs text-slate-500 leading-relaxed pt-0.5">
            {description}
          </p>
        )}
      </div>
      <div className="relative shrink-0 pt-0.5">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
          aria-describedby={description ? `${id}-desc` : undefined}
        />
        <span
          aria-hidden="true"
          className={`block w-11 h-6 rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950 ${
            checked ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-800 border-slate-700'
          } ${disabled ? 'opacity-60' : ''}`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-white shadow mt-1 ml-1 transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
        {/* Text state so status is never conveyed by color alone */}
        <span className="absolute -top-0.5 right-0 translate-y-full text-[10px] font-bold text-slate-500">
          {checked ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  );
}
