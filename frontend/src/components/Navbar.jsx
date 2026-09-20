import React from 'react';
import { Compass, RotateCcw, ShieldCheck, Wifi, WifiOff, Users, AlertTriangle, MapPin } from 'lucide-react';
import { ENABLE_DEMO_RESET } from '../config/index.js';

export default function Navbar({ isConnected, onResetDemo, isResetting, activeTab, setActiveTab, reportsCount }) {
  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      {/* Top Privacy & Security Notice Banner */}
      <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border-b border-slate-800/80 px-4 py-1.5 text-xs text-slate-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-emerald-400 font-semibold">Privacy Protected:</strong> We use area-level commute information rather than continuous location tracking.
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Mumbai GTFS Verified
          </span>
          <span>OpenStreetMap + OSRM</span>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Compass className="w-5 h-5 text-emerald-400 animate-spin-slow" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Smart Student Commute
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                MUMBAI MVP
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Multimodal Transit • Community Disruptions • Weather Intelligence
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab('planner')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'planner'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Plan Route</span>
          </button>
          <button
            onClick={() => setActiveTab('together')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'together'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Travel Together</span>
          </button>
          <button
            onClick={() => setActiveTab('feed')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'feed'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Live Alerts</span>
            {reportsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 ml-0.5">
                {reportsCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Status & Demo Controls */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
            title={isConnected ? 'Socket.IO connected to live feed' : 'Socket.IO offline, reconnecting...'}
          >
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="font-medium text-[11px] hidden sm:inline">Live Sync</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-rose-400" />
                <span className="font-medium text-[11px] hidden sm:inline">Offline</span>
              </>
            )}
          </div>

          {ENABLE_DEMO_RESET && (
            <button
              onClick={onResetDemo}
              disabled={isResetting}
              title="Reset Hackathon demo reports & environment"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all hover:border-slate-500 active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-indigo-400 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Reset Demo</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
