import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Plus, 
  Check, 
  X, 
  Clock, 
  Users, 
  Radio, 
  ThumbsUp, 
  ThumbsDown,
  Sparkles,
  Train,
  Bus,
  Car,
  Zap,
  Footprints
} from 'lucide-react';
import { EmptyState, Badge, DataCard } from './ui';

export default function LiveStudentFeed({ 
  reports = [], 
  onConfirm, 
  onContradict, 
  onOpenCreateReport, 
  isConnected 
}) {
  const [votingId, setVotingId] = useState(null);

  const handleVote = async (reportId, action) => {
    setVotingId(`${reportId}-${action}`);
    try {
      if (action === 'confirm') {
        await onConfirm(reportId);
      } else {
        await onContradict(reportId);
      }
    } finally {
      setVotingId(null);
    }
  };

  const getModeBadge = (mode) => {
    switch (mode) {
      case 'train': return <Badge variant="rose" size="xs" icon={<Train className="w-3 h-3" />}>Train</Badge>;
      case 'metro': return <Badge variant="amber" size="xs" icon={<Zap className="w-3 h-3" />}>Metro</Badge>;
      case 'bus': return <Badge variant="emerald" size="xs" icon={<Bus className="w-3 h-3" />}>BEST Bus</Badge>;
      case 'auto': return <Badge variant="sky" size="xs" icon={<Car className="w-3 h-3" />}>Auto / Taxi</Badge>;
      default: return <Badge variant="teal" size="xs" icon={<Footprints className="w-3 h-3" />}>Walk</Badge>;
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400"></span>
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight">
              LIVE FROM STUDENTS
            </h2>
            <p className="text-[11px] text-slate-400">
              Crowdsourced ground realities across Mumbai campuses
            </p>
          </div>
        </div>

        <button
          onClick={onOpenCreateReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>Post Report</span>
        </button>
      </div>

      {/* Connection Indicator Bar */}
      <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
        <span className="text-slate-400">
          Sync Status: <strong className={isConnected ? 'text-emerald-400' : 'text-rose-400'}>{isConnected ? 'Live Socket Stream Active' : 'Connecting to Stream...'}</strong>
        </span>
        <span className="text-slate-400">
          Decay window: <strong>120 min max</strong>
        </span>
      </div>

      {/* Reports Feed */}
      {reports.length === 0 ? (
        <EmptyState
          icon={<Radio className="w-6 h-6 text-slate-400" aria-hidden="true" />}
          title="All corridors operating smoothly"
          description="No active student disruption reports right now. When students post real-time updates, they will appear here automatically."
          action={
            <button
              onClick={onOpenCreateReport}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Post a Report
            </button>
          }
        />
      ) : (
        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {reports.map((rep) => {
            const isConfirming = votingId === `${rep.id}-confirm`;
            const isContradicting = votingId === `${rep.id}-contradict`;

            return (
              <DataCard
                key={rep.id}
                accent={
                  rep.impact === 'high' ? 'bg-rose-500' : (rep.impact === 'medium' ? 'bg-amber-500' : 'bg-emerald-500')
                }
                header={
                  <>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="amber" size="xs" icon={<AlertTriangle className="w-2.5 h-2.5" />}>
                        Community reported
                      </Badge>
                      {getModeBadge(rep.mode)}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                        {rep.ageFormatted}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        (w: {rep.freshnessWeight?.toFixed(2) || '1.0'})
                      </span>
                    </div>
                  </>
                }
                title={rep.area}
                subtitle={
                  <span className="text-[11px] font-normal text-slate-400">
                    by <span className="text-indigo-300">{rep.pseudonym}</span>
                  </span>
                }
                footer={
                  <>
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span className="font-semibold text-emerald-400">
                        {rep.confirmation_count} confirmed
                      </span>
                      {rep.contradiction_count > 0 && (
                        <span className="text-slate-400">
                          • {rep.contradiction_count} resolved
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                    {/* Still happening */}
                    <button
                      onClick={() => handleVote(rep.id, 'confirm')}
                      disabled={isConfirming}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 hover:bg-emerald-950/40 border border-slate-750 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                      title="Vote: Disruption is still active"
                    >
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Still happening</span>
                    </button>

                    {/* No longer happening */}
                    <button
                      onClick={() => handleVote(rep.id, 'contradict')}
                      disabled={isContradicting}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 hover:bg-rose-950/40 border border-slate-750 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                      title="Vote: Cleared up / No longer happening"
                    >
                      <X className="w-3 h-3 text-rose-400" />
                      <span>No longer happening</span>
                    </button>
                    </div>
                  </>
                }
              >
                {rep.route_name && (
                  <div className="text-[11px] text-slate-400 font-medium mb-1.5">{rep.route_name}</div>
                )}
                <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/40 p-2 rounded-lg border border-slate-850">
                  "{rep.message}"
                </p>
              </DataCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
