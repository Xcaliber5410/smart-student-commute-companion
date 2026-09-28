import React, { useState } from 'react';
import { 
  Navigation, 
  GraduationCap, 
  Clock, 
  Sliders, 
  IndianRupee, 
  Footprints, 
  Sparkles, 
  Train, 
  Bus, 
  Car, 
  Umbrella, 
  Zap, 
  Scale, 
  Coins 
} from 'lucide-react';
import {
  validateForm,
  validateRequired,
  validateText,
  validateNumber,
  focusFirstInvalid,
} from '../utils/validation';

/** Field → DOM id map so the first invalid control receives focus. */
const FIELD_IDS = {
  origin: 'planner-origin',
  destination: 'planner-destination',
  maxBudgetRupees: 'planner-budget',
};

const COLLEGE_PRESETS = [
  { label: 'IIT Bombay (Powai)', value: 'IIT Bombay Powai' },
  { label: 'VJTI (Matunga)', value: 'VJTI Matunga' },
  { label: 'NMIMS / Mithibai (Vile Parle)', value: 'NMIMS Vile Parle' },
  { label: 'HR / KC (Churchgate)', value: 'HR College Churchgate' },
  { label: 'SPIT / Bhavan (Andheri W)', value: 'SPIT Bhavans Andheri' },
  { label: 'Ruia / Podar (Matunga)', value: 'Ruia College Matunga' },
  { label: "St. Xavier's (Fort)", value: "St. Xavier's College Fort" }
];

const ORIGIN_PRESETS = [
  'Andheri East', 'Borivali West', 'Dadar', 'Bandra', 'Ghatkopar', 'Thane West', 'Vile Parle East', 'Kandivali East'
];

export default function PlannerForm({ formData, setFormData, onPlan, isLoading }) {
  const [errors, setErrors] = useState({});

  const clearError = (field) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev));
  };

  const toggleMode = (mode) => {
    const current = [...formData.preferredModes];
    if (current.includes(mode)) {
      if (current.length > 1) {
        setFormData({ ...formData, preferredModes: current.filter(m => m !== mode) });
      }
    } else {
      setFormData({ ...formData, preferredModes: [...current, mode] });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Client-side validation before dispatching a plan request
    const { isValid, errors: validationErrors } = validateForm(formData, {
      origin: [
        (v) => validateRequired(v, 'Starting area'),
        (v) => validateText(v, { minLength: 2, maxLength: 100, label: 'Starting area' }),
      ],
      destination: [
        (v) => validateRequired(v, 'College destination'),
        (v) => validateText(v, { minLength: 2, maxLength: 100, label: 'College destination' }),
      ],
      maxBudgetRupees: [
        (v) => validateNumber(v, { min: 5, max: 1500, label: 'Max budget' }),
      ],
    });

    if (!isValid) {
      setErrors(validationErrors);
      focusFirstInvalid(validationErrors, FIELD_IDS);
      return;
    }

    setErrors({});
    onPlan();
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Navigation className="w-4 h-4 text-emerald-400" />
          <span>Student Commute Planner</span>
        </h2>
        <span className="text-[11px] font-medium text-emerald-400/90 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
          GTFS + Gemini Grounded
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Origin */}
        <div>
          <label htmlFor="planner-origin" className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
              Starting Area (Neighborhood / Station)
            </span>
          </label>
          <input
            id="planner-origin"
            type="text"
            required
            aria-required="true"
            aria-invalid={errors.origin ? 'true' : 'false'}
            aria-describedby={errors.origin ? 'planner-origin-error' : undefined}
            value={formData.origin}
            onChange={(e) => {
              setFormData({ ...formData, origin: e.target.value });
              clearError('origin');
            }}
            placeholder="e.g. Andheri East, Borivali, Dadar..."
            className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
              errors.origin
                ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-slate-700/80 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500'
            }`}
          />
          {errors.origin && (
            <p id="planner-origin-error" className="mt-1.5 text-xs text-rose-400" role="alert">
              {errors.origin}
            </p>
          )}
          {/* Quick origin suggestions */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {ORIGIN_PRESETS.slice(0, 5).map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, origin: area });
                  clearError('origin');
                }}
                className={`text-[11px] px-2 py-0.5 rounded-md transition-all ${
                  formData.origin === area
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Destination */}
        <div>
          <label htmlFor="planner-destination" className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              College Destination
            </span>
          </label>
          <input
            id="planner-destination"
            type="text"
            required
            aria-required="true"
            aria-invalid={errors.destination ? 'true' : 'false'}
            aria-describedby={errors.destination ? 'planner-destination-error' : undefined}
            value={formData.destination}
            onChange={(e) => {
              setFormData({ ...formData, destination: e.target.value });
              clearError('destination');
            }}
            placeholder="e.g. IIT Bombay, VJTI, NMIMS..."
            className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
              errors.destination
                ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                : 'border-slate-700/80 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500'
            }`}
          />
          {errors.destination && (
            <p id="planner-destination-error" className="mt-1.5 text-xs text-rose-400" role="alert">
              {errors.destination}
            </p>
          )}
          {/* Quick College presets */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COLLEGE_PRESETS.map((col) => (
              <button
                key={col.value}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, destination: col.value });
                  clearError('destination');
                }}
                className={`text-[11px] px-2 py-0.5 rounded-md transition-all ${
                  formData.destination === col.value
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Arrival Time and Preference Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Desired Arrival Time
            </label>
            <input
              type="time"
              value={formData.desiredArrivalTime}
              onChange={(e) => setFormData({ ...formData, desiredArrivalTime: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              Route Priority
            </label>
            <select
              value={formData.preference}
              onChange={(e) => setFormData({ ...formData, preference: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="balanced">Balanced (Optimal Tradeoff)</option>
              <option value="fastest">Fastest (Earliest Arrival)</option>
              <option value="cheapest">Cheapest (Lowest Fare)</option>
              <option value="rain-safe">Rain-Safe (Sheltered / Low Walk)</option>
            </select>
          </div>
        </div>

        {/* Transportation Mode Toggles */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Allowed Modes
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { id: 'train', label: 'Local Train', icon: Train },
              { id: 'metro', label: 'Metro', icon: Zap },
              { id: 'bus', label: 'BEST Bus', icon: Bus },
              { id: 'auto', label: 'Auto / Cab', icon: Car },
              { id: 'walk', label: 'Walk', icon: Footprints }
            ].map(({ id, label, icon: Icon }) => {
              const active = formData.preferredModes.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleMode(id)}
                  aria-pressed={active}
                  aria-label={`${label} — ${active ? 'enabled' : 'disabled'}`}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:ring-offset-slate-950 ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-semibold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1 ${active ? 'text-emerald-400' : 'text-slate-400'}`} aria-hidden="true" />
                  <span className="text-[10px] leading-tight" aria-hidden="true">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Walking Tolerance & Budget */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
              <span className="flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-teal-400" />
                Max Walking
              </span>
              <span className="text-emerald-400 font-bold">{formData.walkingToleranceMinutes} mins</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              step="5"
              value={formData.walkingToleranceMinutes}
              onChange={(e) => setFormData({ ...formData, walkingToleranceMinutes: parseInt(e.target.value) })}
              aria-label={`Maximum walking tolerance: ${formData.walkingToleranceMinutes} minutes`}
              aria-valuemin={5}
              aria-valuemax={30}
              aria-valuenow={formData.walkingToleranceMinutes}
              className="w-full accent-emerald-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
              <span className="flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                Max Budget
              </span>
              <div className="flex items-center gap-1">
                <span className="text-amber-400 text-xs font-mono">₹</span>
                <input
                  id="planner-budget"
                  type="number"
                  min="5"
                  max="1500"
                  step="5"
                  aria-invalid={errors.maxBudgetRupees ? 'true' : 'false'}
                  aria-describedby={errors.maxBudgetRupees ? 'planner-budget-error' : undefined}
                  value={formData.maxBudgetRupees}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setFormData({ ...formData, maxBudgetRupees: isNaN(val) ? 0 : val });
                    clearError('maxBudgetRupees');
                  }}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-bold text-amber-400 text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="600"
              step="10"
              value={Math.min(600, formData.maxBudgetRupees || 10)}
              onChange={(e) => setFormData({ ...formData, maxBudgetRupees: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
            />
            {errors.maxBudgetRupees && (
              <p id="planner-budget-error" className="mt-1 text-xs text-rose-400" role="alert">
                {errors.maxBudgetRupees}
              </p>
            )}
            {/* Quick Budget Chips */}
            <div className="flex items-center gap-1 mt-1.5 overflow-x-auto pb-0.5">
              {[25, 50, 100, 200, 350, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFormData({ ...formData, maxBudgetRupees: preset })}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    formData.maxBudgetRupees === preset
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  ₹{preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-slate-950 shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 mt-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
              <span>Calculating Multi-Modal Commute...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
              <span>Plan My Commute</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
