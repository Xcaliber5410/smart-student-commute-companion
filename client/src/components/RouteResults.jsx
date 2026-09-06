import React from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  IndianRupee, 
  Footprints, 
  ArrowRight, 
  ShieldAlert, 
  ThumbsUp, 
  Zap, 
  Train, 
  Bus, 
  Car, 
  Umbrella,
  CloudRain
} from 'lucide-react';

export default function RouteResults({ 
  planResult, 
  selectedRouteId, 
  setSelectedRouteId, 
  onOpenFeedback 
}) {
  if (!planResult) return null;

  const { recommendation, alternatives, weather } = planResult;
  const recRoute = recommendation.route;
  const aiReasoning = recommendation.aiReasoning;

  const getModeIcon = (mode) => {
    switch (mode) {
      case 'metro': return <Zap className="w-4 h-4 text-amber-400" />;
      case 'train': return <Train className="w-4 h-4 text-rose-400" />;
      case 'bus': return <Bus className="w-4 h-4 text-emerald-400" />;
      case 'auto': return <Car className="w-4 h-4 text-sky-400" />;
      default: return <Footprints className="w-4 h-4 text-teal-400" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Weather Snapshot Widget */}
      {weather && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <CloudRain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Mumbai Weather: {weather.condition}</span>
                <span className="text-[10px] text-slate-400 font-mono">({weather.temperatureC}°C)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Rain Probability: <strong className={weather.rainProbability > 50 ? 'text-amber-400' : 'text-slate-300'}>{weather.rainProbability}%</strong>
                {weather.rainRisk === 'high' ? ' • Rain penalties applied to outdoor walking legs' : ' • Normal commuting conditions'}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 hidden sm:inline">
            Open-Meteo API
          </span>
        </div>
      )}

      {/* RECOMMENDED ROUTE CARD */}
      <div 
        onClick={() => setSelectedRouteId(recRoute.id)}
        className={`bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 rounded-2xl p-5 shadow-2xl transition-all cursor-pointer relative overflow-hidden ${
          selectedRouteId === recRoute.id 
            ? 'border-emerald-500 shadow-emerald-500/10' 
            : 'border-emerald-500/50 hover:border-emerald-400/80'
        }`}
      >
        {/* Glow Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
              RECOMMENDED COMMUTE
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              {recRoute.sourceLabel === 'Verified GTFS Schedule' ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> ✓ Verified GTFS
                </span>
              ) : (
                <span className="text-sky-400">≈ Estimated Route</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Depart by</span>
            <span className="text-sm font-extrabold text-emerald-300 font-mono bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
              {recRoute.estimatedDeparture}
            </span>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="mb-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            {getModeIcon(recRoute.primaryMode)}
            <span>{recRoute.title}</span>
          </h3>
          <p className="text-xs text-slate-400">{recRoute.subtitle}</p>
        </div>

        {/* AI Explanation Box */}
        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
              {aiReasoning.aiProvider || 'Gemini 3.8 Flash Rationale'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ml-auto font-medium">
              Confidence: {aiReasoning.confidence?.toUpperCase() || 'HIGH'}
            </span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            {aiReasoning.reason || aiReasoning.summary}
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" />
              Duration
            </div>
            <div className="text-base font-extrabold text-white mt-0.5">
              {recRoute.durationMinutes} <span className="text-xs font-normal text-slate-400">mins</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Arr: {recRoute.estimatedArrival}</div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <IndianRupee className="w-3 h-3 text-amber-400" />
              Est. Fare
            </div>
            <div className="text-base font-extrabold text-amber-300 mt-0.5">
              ₹{recRoute.fareRupees}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {recRoute.fareRupees <= 15 ? 'Student Saver' : 'Standard'}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <Footprints className="w-3 h-3 text-teal-400" />
              Walking
            </div>
            <div className="text-base font-extrabold text-teal-300 mt-0.5">
              {recRoute.walkingDurationMinutes} <span className="text-xs font-normal text-slate-400">mins</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {recRoute.totalWalkingDistanceKm} km
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <Zap className="w-3 h-3 text-indigo-400" />
              Reliability
            </div>
            <div className="text-base font-extrabold text-indigo-300 mt-0.5">
              {recRoute.scores?.reliability || 85}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {recRoute.transfers === 0 ? 'Direct Route' : `${recRoute.transfers} Transfer`}
            </div>
          </div>
        </div>

        {/* Warnings / Disruption Alerts */}
        {((aiReasoning.warnings && aiReasoning.warnings.length > 0) || (recRoute.disruptionAlerts && recRoute.disruptionAlerts.length > 0)) && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 mb-4 space-y-1.5">
            <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Route Advisory & Warnings</span>
            </div>
            {aiReasoning.warnings?.map((w, idx) => (
              <div key={idx} className="text-xs text-amber-200/90 pl-5">
                • {w}
              </div>
            ))}
          </div>
        )}

        {/* Step-by-Step Leg Breakdown */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-xs font-bold text-slate-300 mb-1">Route Stages:</div>
          {recRoute.legs?.map((leg, idx) => (
            <div key={idx} className="flex items-start gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
              <div className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{leg.description}</span>
                  <span className="text-slate-400 font-mono text-[11px]">{leg.durationMinutes} mins</span>
                </div>
                {leg.agency && (
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                      {leg.agency}
                    </span>
                    {leg.fareRupees !== undefined && (
                      <span className="text-emerald-400 font-medium">₹{leg.fareRupees}</span>
                    )}
                    {leg.departureTime && (
                      <span className="font-mono">Dep: {leg.departureTime}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Active Route Selection Indicator */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${selectedRouteId === recRoute.id ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
            {selectedRouteId === recRoute.id ? 'Viewing this route on map' : 'Click to inspect on map'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFeedback(recRoute.id);
            }}
            className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>Rate Recommendation</span>
          </button>
        </div>
      </div>

      {/* PRACTICAL ALTERNATIVES LIST */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>Practical Alternatives ({alternatives.length})</span>
          <span className="text-[11px] normal-case text-slate-400">Click any card to render on map</span>
        </h4>

        <div className="space-y-3">
          {alternatives.map((alt) => {
            const isSelected = selectedRouteId === alt.id;
            return (
              <div
                key={alt.id}
                onClick={() => setSelectedRouteId(alt.id)}
                className={`bg-slate-900/90 border rounded-xl p-4 transition-all cursor-pointer hover:border-slate-600 ${
                  isSelected 
                    ? 'border-indigo-500 bg-slate-900/95 ring-1 ring-indigo-500/50 shadow-lg' 
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {getModeIcon(alt.primaryMode)}
                    <span className="text-sm font-bold text-white">{alt.title}</span>
                  </div>
                  {alt.badgeLabel && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {alt.badgeLabel}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mb-3">{alt.subtitle}</p>

                {/* Quick stats row */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  <span className="flex items-center gap-1 font-semibold text-white">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    {alt.durationMinutes} mins
                  </span>
                  <span className="flex items-center gap-1 text-amber-300 font-semibold">
                    <IndianRupee className="w-3.5 h-3.5" />
                    ₹{alt.fareRupees}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Footprints className="w-3.5 h-3.5 text-teal-400" />
                    {alt.walkingDurationMinutes}m walk
                  </span>
                  <span className="font-mono text-slate-400 ml-auto text-[11px]">
                    Dep: {alt.estimatedDeparture} → Arr: {alt.estimatedArrival}
                  </span>
                </div>

                {/* Disruption indicator on alternative */}
                {alt.disruptionAlerts && alt.disruptionAlerts.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">⚠ Community report: {alt.disruptionAlerts[0].message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
