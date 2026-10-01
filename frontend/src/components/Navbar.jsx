import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  RotateCcw, 
  ShieldCheck, 
  Wifi, 
  WifiOff,  Users,
  AlertTriangle,
  TrainFront,
  Bookmark,
  Bell,
  BellRing,
  SlidersHorizontal,
  Download,
  Menu,
  X
} from 'lucide-react';
import { ENABLE_DEMO_RESET } from '../config/index.js';
import { ConfirmDialog } from './ui';

/**
 * Valid application routes
 */
const NAV_ITEMS = [
  {
    id: 'planner',
    label: 'Plan Route',
    shortLabel: 'Planner',
    icon: Compass,
    description: 'Multimodal AI transit recommendations'
  },
  {
    id: 'mycommutes',
    label: 'My Commutes',
    shortLabel: 'Commutes',
    icon: Bookmark,
    description: 'Saved commute setups for one-tap planning'
  },
  {
    id: 'transit',
    label: 'Transit Search',
    shortLabel: 'Search',
    icon: TrainFront,
    description: 'Official Mumbai GTFS stations & lines lookup'
  },
  {
    id: 'together',
    label: 'Travel Together',
    shortLabel: 'Together',
    icon: Users,
    description: 'Student safety ride pools & auto groups'
  },
  {
    id: 'feed',
    label: 'Live Alerts',
    shortLabel: 'Alerts',
    icon: AlertTriangle,
    description: 'Real-time crowd-sourced transit disruptions',
    hasBadge: true
  },
  {
    id: 'notifications',
    label: 'Notifications',
    shortLabel: 'Notices',
    icon: Bell,
    description: 'Recent student commute updates'
  },
  {
    id: 'devicealerts',
    label: 'Device Alerts',
    shortLabel: 'Device',
    icon: BellRing,
    description: 'OS-level alerts for live disruptions'
  }
];

export default function Navbar({ 
  isConnected, 
  onResetDemo, 
  isResetting, 
  activeTab, 
  setActiveTab, 
  reportsCount = 0,
  onOpenPreferences,
  canInstall = false,
  onInstallApp
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);

  const handleRequestReset = () => {
    setIsConfirmingReset(true);
  };

  const handleConfirmReset = () => {
    setIsConfirmingReset(false);
    setMobileMenuOpen(false);
    onResetDemo?.();
  };

  // Close mobile menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    if (mobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Navigate and close mobile menu
  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
        {/* Top Privacy & Security Notice Banner */}
        <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border-b border-slate-800/80 px-4 py-1.5 text-xs text-slate-300 flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="truncate min-w-0">
              <strong className="text-emerald-400 font-semibold">Privacy Protected:</strong> Area-level commute routing without continuous GPS tracking.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-slate-400 shrink-0 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
              Mumbai GTFS Verified
            </span>
            <span>OSRM Multimodal</span>
          </div>
        </div>

        {/* Main Navbar Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 p-0.5 shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Compass className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-sm sm:text-base tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent truncate">
                  Smart Student Commute
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  MUMBAI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden lg:block truncate">
                Multimodal Transit • Community Disruptions • Weather Intelligence
              </p>
            </div>
          </div>

          {/* Desktop/Tablet Primary Navigation */}
          <nav 
            className="hidden md:flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-1 text-xs font-medium shrink-0" 
            role="navigation" 
            aria-label="Main application navigation"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={`px-2 xl:px-2.5 2xl:px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-semibold shadow-md shadow-emerald-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${item.id === 'feed' && !isActive ? 'text-amber-400' : ''}`} aria-hidden="true" />
                  {/*
                    Labels scale with available width so seven tabs never
                    overflow the header: icon-only below xl (tablets and
                    small laptops), short labels at xl, full labels only when
                    there is room (2xl). aria-label/title keep the target
                    named when only the icon shows.
                  */}
                  <span className="hidden 2xl:inline">{item.label}</span>
                  <span className="hidden xl:inline 2xl:hidden">{item.shortLabel}</span>
                  {item.hasBadge && reportsCount > 0 && (
                    <span 
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-0.5 ${
                        isActive 
                          ? 'bg-slate-950 text-emerald-400' 
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                      aria-label={`${reportsCount} active alerts`}
                    >
                      {reportsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Connectivity, Demo Reset & Mobile Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Socket Status Badge */}
            <div
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
              role="status"
              aria-live="polite"
              title={isConnected ? 'Live sync connected via Socket.IO' : 'Live sync disconnected, reconnecting...'}
            >
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
                  <span className="font-medium text-[11px] hidden sm:inline">Live Sync</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-400" aria-hidden="true" />
                  <span className="font-medium text-[11px] hidden sm:inline">Offline</span>
                </>
              )}
            </div>

            {/* PWA Install action (only when the browser offers it) */}
            {canInstall && onInstallApp && (
              <button
                type="button"
                onClick={onInstallApp}
                title="Install this app on your device"
                aria-label="Install app"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 border border-emerald-400 text-slate-950 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Install App</span>
              </button>
            )}

            {/* Preferences (client-side personalization controls) */}
            {onOpenPreferences && (
              <button
                type="button"
                onClick={onOpenPreferences}
                title="Personalize your interface"
                aria-label="Open preferences"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all hover:border-slate-500 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span className="hidden lg:inline">Preferences</span>
              </button>
            )}

            {/* Reset Demo State Button */}
            {ENABLE_DEMO_RESET && (
              <button
                onClick={handleRequestReset}
                disabled={isResetting}
                title="Reset demo data to baseline state"
                aria-label="Reset demo environment"
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all hover:border-slate-500 active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <RotateCcw className={`w-3.5 h-3.5 text-indigo-400 ${isResetting ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden lg:inline">Reset Demo</span>
              </button>
            )}

            {/* Mobile Hamburger Toggle Button */}
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5 text-slate-300" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Drawer / Menu */}
        {mobileMenuOpen && (
          <div 
            id="mobile-navigation"
            ref={mobileNavRef}
            className="md:hidden border-t border-slate-800/80 bg-slate-950/98 px-4 pt-3 pb-5 space-y-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
            role="region"
            aria-label="Mobile navigation menu"
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              Navigation
            </div>
            
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} aria-hidden="true" />
                      <div>
                        <div className="leading-tight">{item.label}</div>
                        <div className={`text-[11px] ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                          {item.description}
                        </div>
                      </div>
                    </div>
                    {item.hasBadge && reportsCount > 0 && (
                      <span 
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          isActive 
                            ? 'bg-slate-950 text-emerald-400' 
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {reportsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile Preferences Control */}
            {onOpenPreferences && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                {canInstall && onInstallApp && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onInstallApp();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-500 border border-emerald-400 text-slate-950 text-xs font-bold hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Install App</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPreferences();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Preferences</span>
                </button>
              </div>
            )}

            {/* Mobile Reset Demo Control */}
            {ENABLE_DEMO_RESET && (
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  onClick={handleRequestReset}
                  disabled={isResetting}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-indigo-400 ${isResetting ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{isResetting ? 'Resetting Demo...' : 'Reset Demo Environment'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Mobile Bottom Fixed Navigation Bar (Sticky Thumb Navigation) */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/90 px-2 py-2 flex items-center justify-around shadow-2xl"
        role="navigation"
        aria-label="Mobile quick navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400 scale-110' : 'text-slate-400'} transition-transform`} aria-hidden="true" />
                {item.hasBadge && reportsCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-amber-500 text-slate-950 text-[10px] font-extrabold rounded-full flex items-center justify-center border border-slate-950">
                    {reportsCount > 9 ? '9+' : reportsCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight max-w-full truncate">
                {item.shortLabel}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-0.5" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Destructive-action confirmation (UI only; action fires on confirm) */}
      <ConfirmDialog
        isOpen={isConfirmingReset}
        onCancel={() => setIsConfirmingReset(false)}
        onConfirm={handleConfirmReset}
        title="Reset demo environment?"
        message="This will restore all live reports, commute groups, and demo data to the baseline state. This action cannot be undone."
        confirmLabel="Reset Demo"
        destructive
        isPending={isResetting}
      />
    </>
  );
}
