import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import InstallPromoDialog from './ui/InstallPromoDialog';

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
 * - Dismissible from this session (persistence/snooze arrives in C4).
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
 */
export default function InstallPromoBanner({
  canInstall = false,
  isInstalled = false,
  onInstallApp,
  onDismiss,
  onOpenHub,
}) {
  const [dismissed, setDismissed] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Honest visibility: only promote when promotion can actually succeed.
  if (isInstalled || !canInstall || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

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
          onClick={onInstallApp}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Install app
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
        onInstall={onInstallApp}
        onOpenHub={() => {
          setIsDialogOpen(false);
          onOpenHub?.();
        }}
        canInstall={canInstall}
      />
    </div>
  );
}
