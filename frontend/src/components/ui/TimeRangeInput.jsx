import React from 'react';
import Input from './Input';

/**
 * TimeRangeInput - labelled start/end time pair (Day 13)
 *
 * A small composite control for a daily time window (quiet hours). Wraps two
 * `Input type="time"` controls in a labelled `fieldset` so screen readers
 * announce the group before each time, keeps both fields disabled together,
 * and exposes a hint slot for window behaviour / live status text.
 *
 * Values are 24-hour `HH:MM` strings — the format `<input type="time">`
 * produces and the format `utils/uiPreferences.js` validates.
 *
 * @param {Object} props
 * @param {string} props.id - Base id; fieldset label and inputs derive from it
 * @param {string} props.legend - Visible group label (e.g. "Quiet window")
 * @param {string} [props.startLabel='Start'] - Label for the start input
 * @param {string} [props.endLabel='End'] - Label for the end input
 * @param {string} props.startValue - Current start value (HH:MM)
 * @param {string} props.endValue - Current end value (HH:MM)
 * @param {Function} props.onChangeStart - (value) when the start changes
 * @param {Function} props.onChangeEnd - (value) when the end changes
 * @param {boolean} [props.disabled=false] - Disable both inputs together
 * @param {string} [props.startError] - Validation error for the start input
 * @param {string} [props.endError] - Validation error for the end input
 * @param {Function} [props.onBlurStart] - Blur handler for the start input
 * @param {Function} [props.onBlurEnd] - Blur handler for the end input
 * @param {React.ReactNode} [props.hint] - Hint/status rendered under the pair
 * @param {string} [props.className=''] - Extra classes for the wrapper
 *
 * @example
 * <TimeRangeInput
 *   id="quiet-hours"
 *   legend="Quiet window"
 *   startValue="22:00"
 *   endValue="07:00"
 *   disabled={!enabled}
 *   onChangeStart={v => onChange({ quietHoursStart: v })}
 *   onChangeEnd={v => onChange({ quietHoursEnd: v })}
 *   hint="Overnight windows wrap past midnight."
 * />
 */
export default function TimeRangeInput({
  id,
  legend,
  startLabel = 'Start',
  endLabel = 'End',
  startValue,
  endValue,
  onChangeStart,
  onChangeEnd,
  disabled = false,
  startError,
  endError,
  onBlurStart,
  onBlurEnd,
  hint,
  className = '',
}) {
  const hintId = `${id}-hint`;
  return (
    <fieldset
      className={`min-w-0 border-0 p-0 m-0 ${className}`}
      disabled={disabled}
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="block p-0 text-xs font-semibold text-slate-300 mb-1.5">
        {legend}
      </legend>
      {/* Stacked on narrow screens; two columns only once a pair of time
          inputs comfortably fits (640px+, still inside a max-w-lg modal). */}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <Input
          id={`${id}-start`}
          label={startLabel}
          type="time"
          value={startValue}
          error={startError}
          onChange={(event) => onChangeStart(event.target.value)}
          onBlur={onBlurStart}
        />
        <Input
          id={`${id}-end`}
          label={endLabel}
          type="time"
          value={endValue}
          error={endError}
          onChange={(event) => onChangeEnd(event.target.value)}
          onBlur={onBlurEnd}
        />
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-500 leading-relaxed break-words">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
