import React from 'react';
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

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Origin */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Starting Area (Neighborhood / Station)
            </span>
          </label>
          <input
            type="text"
            required
            value={formData.origin}
            onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
            placeholder="e.g. Andheri East, Borivali, Dadar..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
          />
          {/* Quick origin suggestions */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {ORIGIN_PRESETS.slice(0, 5).map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setFormData({ ...formData, origin: area })}
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
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
              College Destination
            </span>
          </label>
          <input
            type="text"
            required
            value={formData.destination}
            onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
            placeholder="e.g. IIT Bombay, VJTI, NMIMS..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          {/* Quick College presets */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COLLEGE_PRESETS.map((col) => (
              <button
                key={col.value}
                type="button"
                onClick={() => setFormData({ ...formData, destination: col.value })}
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
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-semibold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="text-[10px] leading-tight">{label}</span>
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
              className="w-full accent-emerald-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
              <span className="flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                Max Budget
              </span>
              <span className="text-amber-400 font-bold">₹{formData.maxBudgetRupees}</span>
            </div>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={formData.maxBudgetRupees}
              onChange={(e) => setFormData({ ...formData, maxBudgetRupees: parseInt(e.target.value) })}
              className="w-full accent-amber-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
            />
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
