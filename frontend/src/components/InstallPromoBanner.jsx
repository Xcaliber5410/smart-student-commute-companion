import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import InstallPromoDialog from './ui/InstallPromoDialog';
import { isPromoEligible, isPromoSnoozed, writePromoSnooze } from '../services/installPromotion';

/**
 * InstallPromoBanner - Smart install promotion (Day 9 roadmap: "Install
 * promotion banner")
 *
 * A non-blocking, in-flow promotional strip rendered directly above the page
 * content (same placement pattern as PwaStatusBanner, so it never covers the
 * toast region or the fixed mobile bottom navigation). It proactively offers
 * the install flow that the Day 8 Install & Share hub documents, but only in
 * the states where promotion is honest:
 *
 * - Hidden entirely when the app is already installed (no nagging).
 * - Hidden when the browser never offered a deferred install prompt.
 * - Dismissing snoozes promotion for 7 days via the installPromotion
 *   service (session-only fallback when storage is unavailable).
 *
 * The Install action is the existing app-layer handler (deferred
 * `beforeinstallprompt` prompt + toast feedback), so this component never
 * touches browser install APIs directly.
 *
 * @param {Object} props
 * @param {boolean} props.canInstall - Browser currently holds a deferred install prompt
 * @param {boolean} props.isInstalled - App is running installed (standalone)
 * @param {Function} props.onInstallApp - Trigger the existing install flow
 * @param {Function} [props.onDismiss] - Optional notified when the user dismisses
 * @param {Function} [props.onOpenHub] - Navigate to the Day 8 Install & Share screen
 * @param {string} [props.activeTab] - Current tab id; a change reveals the banner
 *   (promotion waits for engagement instead of competing with first paint)
 */
export default function InstallPromoBanner({
  canInstall = false,
  isInstalled = false,
  onInstallApp,
  onDismiss,
  onOpenHub,
  activeTab,
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  // Cross-session snooze read up front (sync localStorage, failure-safe).
  const [dismissed, setDismissed] = useState(() => isPromoSnoozed());
  const initialTabRef = useRef(activeTab);

  // Smart trigger: reveal after the first navigation OR a short idle delay —
  // never on first paint, so the promo never competes with initial content.
  useEffect(() => {
    const timer = setTimeout(() => setIsRevealed(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab && activeTab !== initialTabRef.current) setIsRevealed(true);
  }, [activeTab]);

  const handleInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    setIsDialogOpen(false);
    try {
      await onInstallApp?.();
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Persist the 7-day snooze; when storage is unavailable the session-only
    // dismissal above still holds (honest degradation, never a throw).
    writePromoSnooze();
    onDismiss?.();
  };

  // Honest visibility: only promote when promotion can actually succeed.
  if (!isPromoEligible({ canInstall, isInstalled }) || dismissed || !isRevealed) return null;

  return (
    <div
      role="region"
      aria-label="Install the app"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-100"
    >
      <Download className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
      <span className="flex-1 min-w-[180px]">
        <strong className="font-bold text-emerald-300">Take it with you.</strong>{' '}
        Install the companion for home-screen launch, offline access, and device
        alerts — one tap, no app store.
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleInstall}
          disabled={isInstalling}
          aria-busy={isInstalling || undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          {isInstalling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {isInstalling ? 'Installing…' : 'Install app'}
        </button>
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Learn more
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install promotion"
          title="Dismiss install promotion"
          className="p-1.5 rounded-lg text-emerald-300/70 hover:text-emerald-200 hover:bg-emerald-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <InstallPromoDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onInstall={handleInstall}
        onOpenHub={() => {
          setIsDialogOpen(false);
          onOpenHub?.();
        }}
        canInstall={canInstall}
      />
    </div>
  );
}
