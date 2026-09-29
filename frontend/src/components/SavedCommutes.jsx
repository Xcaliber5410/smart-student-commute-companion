import React, { useState } from 'react';
import {
  Clock,
  Sparkles,
  Trash2,
  IndianRupee,
  Footprints,
  Sliders,
  MapPin,
} from 'lucide-react';
import { Badge, DataCard, MetaList, MetaRow, ConfirmDialog, Button } from './ui';
import { commuteSignature } from '../utils/uiPreferences';

/**
 * Human labels for planner values (kept in sync with PlannerForm).
 */
const MODE_LABELS = {
  train: 'Local Train',
  metro: 'Metro',
  bus: 'BEST Bus',
  auto: 'Auto / Cab',
  walk: 'Walk',
};

const PREFERENCE_LABELS = {
  balanced: 'Balanced',
  fastest: 'Fastest',
  cheapest: 'Cheapest',
  'rain-safe': 'Rain-Safe',
};

function formatSavedDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * SavedCommutes - Card list for the "My Commutes" feature
 *
 * Renders each saved commute setup as a DataCard with its planner metadata
 * and contextual actions:
 * - "Plan this commute" hands the setup to the planner (cross-screen hand-off)
 * - "Remove" is gated behind a confirmation dialog so nothing is lost by a tap
 *
 * Presentation only — persistence and planning logic arrive via props.
 *
 * @param {Object} props
 * @param {Array<Object>} props.commutes - Saved commute setups (newest first)
 * @param {Function} props.onPlanCommute - Plan a saved commute
 * @param {Function} props.onRemoveCommute - Remove a saved commute by id
 * @param {boolean} [props.isPlanning] - Whether a plan request is in flight
 * @param {string|null} [props.activeSignature] - Signature loaded in the planner
 */
export default function SavedCommutes({
  commutes = [],
  onPlanCommute,
  onRemoveCommute,
  isPlanning = false,
  activeSignature = null,
}) {
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const handleConfirmRemoval = async () => {
    const target = pendingRemoval;
    setPendingRemoval(null);
    if (target) await onRemoveCommute(target.id);
  };

  return (
    <>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3.5 list-none">
        {commutes.map((commute) => {
          const isActive = Boolean(activeSignature) && activeSignature === commuteSignature(commute);
          const savedLabel = formatSavedDate(commute.savedAt);
          const removalLabel = `Remove saved commute from ${commute.origin} to ${commute.destination}`;

          return (
            <li key={commute.id}>
              <DataCard
                accent={isActive ? 'bg-emerald-500' : 'bg-slate-700'}
                header={
                  <>
                    <Badge variant={isActive ? 'emerald' : 'slate'} size="xs" icon={<MapPin />}>
                      {isActive ? 'Loaded in planner' : 'Saved commute'}
                    </Badge>
                    {savedLabel && (
                      <span className="text-[11px] text-slate-500">Saved {savedLabel}</span>
                    )}
                  </>
                }
                title={
                  <span>
                    {commute.origin}
                    <span aria-hidden="true"> → </span>
                    <span className="sr-only">to </span>
                    {commute.destination}
                  </span>
                }
              >
                <MetaList>
                  <MetaRow icon={<Clock />} label="Desired arrival">
                    Arrive by {commute.desiredArrivalTime}
                  </MetaRow>
                  <MetaRow icon={<IndianRupee />} label="Maximum budget">
                    Max ₹{commute.maxBudgetRupees}
                  </MetaRow>
                  <MetaRow icon={<Footprints />} label="Walking tolerance">
                    Up to {commute.walkingToleranceMinutes} min walk
                  </MetaRow>
                </MetaList>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge variant="indigo" size="xs" icon={<Sliders />}>
                    {PREFERENCE_LABELS[commute.preference] || commute.preference}
                  </Badge>
                  {commute.preferredModes.map((mode) => (
                    <Badge key={mode} variant="teal" size="xs">
                      {MODE_LABELS[mode] || mode}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2.5 mt-2.5 border-t border-slate-800">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    icon={<Sparkles />}
                    disabled={isPlanning}
                    onClick={() => onPlanCommute(commute)}
                    aria-label={`Plan commute from ${commute.origin} to ${commute.destination}`}
                  >
                    Plan this commute
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    disabled={isPlanning}
                    onClick={() => setPendingRemoval(commute)}
                    aria-label={removalLabel}
                  >
                    Remove
                  </Button>
                </div>
              </DataCard>
            </li>
          );
        })}
      </ul>

      {/* Destructive-action confirmation (UI only; removal fires on confirm) */}
      <ConfirmDialog
        isOpen={Boolean(pendingRemoval)}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={handleConfirmRemoval}
        title="Remove saved commute?"
        message={
          pendingRemoval
            ? `"${pendingRemoval.origin} → ${pendingRemoval.destination}" will be removed from this device. You can save it again at any time from the planner.`
            : ''
        }
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}
