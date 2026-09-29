import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Modal, Button } from './ui';
import { DEFAULT_APP_PREFERENCES } from '../utils/uiPreferences';

/**
 * Switch - Accessible labeled toggle built on a native checkbox.
 *
 * The native input keeps keyboard operation, form semantics, and screen
 * reader support for free; the track visuals sit next to it and the label
 * text is always visible (never color-only).
 *
 * @param {Object} props
 * @param {string} props.id - Unique id (associates label with input)
 * @param {boolean} props.checked - Current state
 * @param {Function} props.onChange - Change handler: onChange(boolean)
 * @param {string} props.label - Visible label text
 * @param {string} props.description - Secondary explanation
 */
function Switch({ id, checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-800 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-slate-200 cursor-pointer">
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
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
          aria-describedby={description ? `${id}-desc` : undefined}
        />
        <span
          aria-hidden="true"
          className={`block w-11 h-6 rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950 ${
            checked ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-800 border-slate-700'
          }`}
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

/**
 * PreferencesDialog - Student personalization controls (client-side only)
 *
 * A settings dialog for display preferences stored on this device via the
 * existing uiPreferences store. Every control:
 * - has a visible label + description (never placeholder-only),
 * - updates immediately (parent applies it on change) and shows a toast,
 * - is keyboard operable through the shared Modal focus management.
 *
 * NOTE: these are local interface preferences. There is no backend endpoint
 * for syncing them, and the dialog says so plainly.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Function} props.onClose - Close handler
 * @param {Object} props.preferences - Current preference values
 * @param {Function} props.onChange - Apply a preference: onChange(partial)
 * @param {Function} props.onReset - Restore default preferences
 */
export default function PreferencesDialog({
  isOpen,
  onClose,
  preferences,
  onChange,
  onReset,
}) {
  const prefs = { ...DEFAULT_APP_PREFERENCES, ...(preferences || {}) };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preferences"
      icon={<SlidersHorizontal className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          These settings personalize how this app looks and behaves on{' '}
          <strong className="text-slate-300">this device only</strong>. They are
          stored in your browser and never leave it — no account sync.
        </p>

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4">
          <Switch
            id="pref-dashboard-overview"
            checked={prefs.showDashboardOverview}
            onChange={(value) => onChange({ showDashboardOverview: value })}
            label="Show dashboard overview"
            description="Display the “at a glance” summary, quick actions, and recent searches at the top of the planner."
          />
          <Switch
            id="pref-live-report-toasts"
            checked={prefs.liveReportToasts}
            onChange={(value) => onChange({ liveReportToasts: value })}
            label="Live report notifications"
            description="Show a toast when another student posts a new disruption report while you browse."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
            onClick={onReset}
          >
            Restore defaults
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
