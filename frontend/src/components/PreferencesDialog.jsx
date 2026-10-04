import React, { useEffect, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Modal, Button, Toggle, TimeRangeInput } from './ui';
import {
  DEFAULT_APP_PREFERENCES,
  isQuietHoursActive,
  isValidQuietHoursTime,
} from '../utils/uiPreferences';

/**
 * PreferencesDialog - Student personalization controls (client-side only)
 *
 * A settings dialog for display and notification preferences stored on this
 * device via the existing uiPreferences store. Every control:
 * - has a visible label + description (never placeholder-only),
 * - updates immediately (parent applies it on change) and shows a toast,
 * - is keyboard operable through the shared Modal focus management.
 *
 * Day 13 added the Notifications section: the live-report toast toggle plus
 * quiet hours — a device-local window (default 22:00–07:00) during which
 * pop-ups (toasts and OS-level alerts) are muted. Reports still arrive in the
 * feed either way; quiet hours never hide data.
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

  // Local drafts so half-typed times don't snap back on every keystroke.
  // Valid HH:MM values persist immediately through onChange (optimistic —
  // the store validates them again); invalid text only lives in the draft,
  // flagged with an inline error until fixed or blurred away.
  const [startDraft, setStartDraft] = useState(prefs.quietHoursStart);
  const [endDraft, setEndDraft] = useState(prefs.quietHoursEnd);
  const [timeErrors, setTimeErrors] = useState({ start: null, end: null });

  // External changes (e.g. "Restore defaults") re-sync the drafts. When the
  // value is unchanged this is a no-op, so typing is never clobbered.
  useEffect(() => {
    setStartDraft(prefs.quietHoursStart);
  }, [prefs.quietHoursStart]);
  useEffect(() => {
    setEndDraft(prefs.quietHoursEnd);
  }, [prefs.quietHoursEnd]);

  // Recompute the "active now" status once a minute while the dialog is
  // open so it never goes stale when the clock crosses the window boundary.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setInterval(() => setClockTick((tick) => tick + 1), 60000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const handleTimeChange = (field, value) => {
    if (field === 'start') setStartDraft(value);
    else setEndDraft(value);
    if (isValidQuietHoursTime(value)) {
      setTimeErrors((current) => ({ ...current, [field]: null }));
      onChange(
        field === 'start' ? { quietHoursStart: value } : { quietHoursEnd: value }
      );
    } else {
      setTimeErrors((current) => ({
        ...current,
        [field]: 'Use HH:MM format, for example 22:00.',
      }));
    }
  };

  // Leaving an unparsable draft reverts to the stored value instead of
  // trapping the student on an empty field.
  const handleTimeBlur = (field) => {
    const draft = field === 'start' ? startDraft : endDraft;
    if (isValidQuietHoursTime(draft)) return;
    if (field === 'start') setStartDraft(prefs.quietHoursStart);
    else setEndDraft(prefs.quietHoursEnd);
    setTimeErrors((current) => ({ ...current, [field]: null }));
  };

  const quietActive = isQuietHoursActive(prefs);
  const quietStatus = !prefs.quietHoursEnabled
    ? 'Quiet hours are off — live pop-ups follow your toggles above.'
    : quietActive
      ? `Quiet hours are active now (${prefs.quietHoursStart}–${prefs.quietHoursEnd}) — toasts and device alerts are paused. Reports still appear in Live Alerts.`
      : `Quiet hours run daily from ${prefs.quietHoursStart} to ${prefs.quietHoursEnd}.`;

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
          <p className="pt-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
            Display
          </p>
          <Toggle
            id="pref-dashboard-overview"
            className="py-3 border-b border-slate-800"
            checked={prefs.showDashboardOverview}
            onChange={(value) => onChange({ showDashboardOverview: value })}
            label="Show dashboard overview"
            description="Display the “at a glance” summary, quick actions, and recent searches at the top of the planner."
          />
          <p className="pt-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
            Notifications
          </p>
          <Toggle
            id="pref-live-report-toasts"
            className="py-3 border-b border-slate-800"
            checked={prefs.liveReportToasts}
            onChange={(value) => onChange({ liveReportToasts: value })}
            label="Live report notifications"
            description="Show a toast when another student posts a new disruption report while you browse."
          />
          <Toggle
            id="pref-quiet-hours"
            className="py-3 border-b border-slate-800"
            checked={prefs.quietHoursEnabled}
            onChange={(value) => onChange({ quietHoursEnabled: value })}
            label="Quiet hours"
            description="Pause live toasts and device alerts during a daily window (for example overnight). Reports still reach Live Alerts — nothing is hidden."
          />
          <TimeRangeInput
            id="pref-quiet-hours-window"
            legend="Quiet window"
            startLabel="Start"
            endLabel="End"
            startValue={startDraft}
            endValue={endDraft}
            startError={timeErrors.start}
            endError={timeErrors.end}
            disabled={!prefs.quietHoursEnabled}
            onChangeStart={(value) => handleTimeChange('start', value)}
            onChangeEnd={(value) => handleTimeChange('end', value)}
            onBlurStart={() => handleTimeBlur('start')}
            onBlurEnd={() => handleTimeBlur('end')}
            className="py-3"
          />
          <p className="pb-3 text-xs text-slate-500 leading-relaxed">{quietStatus}</p>
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
