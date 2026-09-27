import React, { useState } from 'react';
import { Users, Plus, Clock, MapPin, GraduationCap, Check, ShieldCheck } from 'lucide-react';
import { EmptyState, Badge, DataCard, MetaRow, MetaList } from './ui';

export default function TravelTogether({ groups = [], onJoinGroup, onOpenCreateGroup }) {
  const [joiningId, setJoiningId] = useState(null);

  const handleJoin = async (groupId) => {
    setJoiningId(groupId);
    try {
      await onJoinGroup(groupId);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight">
              TRAVEL TOGETHER (COMMUTE GROUPS)
            </h2>
            <p className="text-[11px] text-slate-400">
              Safe student grouping for auto-pooling and local train buddies
            </p>
          </div>
        </div>

        <button
          onClick={onOpenCreateGroup}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white shadow-md shadow-indigo-500/20 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>New Group</span>
        </button>
      </div>

      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>
          <strong>Privacy Preserving:</strong> Only area-level landmarks and departure times are shared. No home addresses.
        </span>
      </div>

      {/* Groups List */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6 text-indigo-400" aria-hidden="true" />}
          title="No commute groups currently active"
          description="Be the first to create a safe student auto-pool or transit travel buddy group for your college route!"
          action={
            <button
              onClick={onOpenCreateGroup}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Start a Commute Group
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {groups.map((grp) => {
            const isFull = grp.current_members >= grp.max_members;
            const isJoining = joiningId === grp.id;

            return (
              <DataCard
                key={grp.id}
                header={
                  <>
                    <Badge variant="indigo" size="xs">
                      {grp.mode}
                    </Badge>
                    <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {grp.departure_time}
                    </span>
                  </>
                }
                title={
                  <span className="font-semibold text-white">{grp.origin_area}</span>
                }
                footer={
                  <>
                    <div className="text-slate-400 text-[11px]">
                      Host: <strong className="text-slate-200">{grp.creator_pseudonym}</strong>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold ${isFull ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {grp.current_members} / {grp.max_members} joined
                      </span>

                      <button
                        onClick={() => handleJoin(grp.id)}
                        disabled={isFull || isJoining}
                        aria-label={isFull ? 'Group is full' : `Join group from ${grp.origin_area}`}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          isFull
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95 shadow-sm'
                        }`}
                      >
                        {isFull ? (
                          <span>Full</span>
                        ) : (
                          <>
                            <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />
                            <span>{isJoining ? 'Joining...' : 'Join'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                }
              >
                <MetaList>
                  <MetaRow
                    icon={<MapPin className="w-3.5 h-3.5 text-emerald-400" />}
                    label="Origin"
                    valueClassName="text-white font-semibold"
                  >
                    {grp.origin_area}
                  </MetaRow>
                  <MetaRow
                    icon={<GraduationCap className="w-3.5 h-3.5 text-indigo-400" />}
                    label="Destination"
                    valueClassName="text-indigo-300 font-semibold"
                  >
                    {grp.destination_college}
                  </MetaRow>
                </MetaList>

                {grp.notes && (
                  <p className="text-[11px] text-slate-400 italic bg-slate-900/50 p-2 rounded-lg border border-slate-850 mt-2.5">
                    "{grp.notes}"
                  </p>
                )}
              </DataCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
