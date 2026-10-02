import React, { useState } from 'react';
import {
  BellRing,
  ChevronDown,
  ClipboardList,
  Compass,
  Download,
  Info,
  Share2,
  Smartphone,
} from 'lucide-react';
import { Badge, Card, StatTile } from '../components/ui';
import InstallStatusCard from '../components/ui/InstallStatusCard';
import ShareableCard from '../components/ui/ShareableCard';

const INSTALL_STATUS_META = {
  installed: { label: 'Installed', variant: 'emerald' },
  available: { label: 'Ready to install', variant: 'amber' },
  manual: { label: 'Manual install', variant: 'slate' },
};

/** Quick deep-link cards (subset most useful for sharing). */
const QUICK_SHARE_SCREENS = [
  { id: 'planner', label: 'Route Planner' },
  { id: 'feed', label: 'Live Alerts' },
];

/**
 * Install & Share Hub (Day 8 feature screen)
 *
 * Presentation-only page that gathers the PWA "advanced features" from the
 * roadmap in one place: install status and manual-install guidance, sharing
 * the app, and handling content shared INTO the app (Share Target). Install
 * state arrives from the app layer; browser capabilities are feature-detected
 * locally so unsupported browsers get honest guidance instead of broken
 * buttons. Native share and clipboard actions run inside this page's
 * ShareableCard components.
 *
 * @param {Object} props
 * @param {'installed'|'available'|'manual'} [props.installStatus='manual']
 * @param {Function} [props.onInstallApp] - Trigger the deferred browser install prompt
 * @param {Function} [props.onNotify] - Surface user feedback via the app toast system
 * @param {{title?: string, text?: string, url?: string}|null} [props.sharedReport=null]
 *   Content shared into the app via the OS share sheet, when present
 * @param {Function} [props.onUseSharedInReport] - Open the report composer with the shared content
 * @param {Function} [props.onDismissShared] - Discard the shared content
 */
export default function InstallShareHubPage({
  installStatus = 'manual',
  onInstallApp,
  onNotify,
  sharedReport = null,
  onUseSharedInReport,
  onDismissShared,
}) {
  const [isManualGuideOpen, setIsManualGuideOpen] = useState(false);
  const isWebShareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const installMeta = INSTALL_STATUS_META[installStatus] || INSTALL_STATUS_META.manual;
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const isAppleMobile =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') &&
    typeof window !== 'undefined' &&
    !window.MSStream;

  const shareApp = async () => {
    if (typeof navigator.share !== 'function' || !appUrl) return false;
    try {
      await navigator.share({
        title: 'Smart Student Commute Companion',
        text: 'Plan your college commute with me:',
        url: appUrl,
      });
      return true;
    } catch {
      // User cancelled the share sheet (AbortError) or the share failed —
      // both are silent no-ops for the caller.
      return false;
    }
  };

  const shareScreenLink = async (screen) => {
    if (typeof navigator.share !== 'function' || !appUrl) return false;
    try {
      await navigator.share({
        title: `Smart Student Commute Companion — ${screen.label}`,
        text: `Open the ${screen.label} screen:`,
        url: `${appUrl}/?tab=${screen.id}`,
      });
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-white">Install &amp; Share</h1>
        <p className="text-sm text-slate-400">
          Put the companion on your home screen, share it with classmates, and send links or text
          straight into a live report
        </p>
      </header>

      <section aria-label="PWA capability status" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Status</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile
            icon={<Smartphone className="h-4 w-4" />}
            variant={installStatus === 'installed' ? 'emerald' : installStatus === 'available' ? 'amber' : 'slate'}
            value={installMeta.label}
            label="App install"
            hint={installStatus === 'installed' ? 'Running as a standalone app' : 'Home screen ready'}
          />
          <StatTile
            icon={<Share2 className="h-4 w-4" />}
            variant={isWebShareSupported ? 'emerald' : 'slate'}
            value={isWebShareSupported ? 'Available' : 'Not available'}
            label="Web Share"
            hint={isWebShareSupported ? 'Native share sheet on this device' : 'Use copy-link sharing instead'}
          />
        </div>
      </section>

      <section aria-label="Install the app" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Install the app</h2>
        <InstallStatusCard
          status={installStatus}
          action={
            installStatus === 'available' && onInstallApp ? (
              <button
                type="button"
                onClick={onInstallApp}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:bg-emerald-400 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install app
              </button>
            ) : null
          }
        />
        {installStatus !== 'installed' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={() => setIsManualGuideOpen((open) => !open)}
              aria-expanded={isManualGuideOpen}
              aria-controls="manual-install-guide"
              className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              <span>
                {isAppleMobile
                  ? 'On iPhone or iPad? Add the app from the Safari share menu.'
                  : 'Browser not offering the one-tap install? Show manual steps.'}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isManualGuideOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {/* Rendered even when collapsed so aria-controls always resolves;
                hidden (not unmounted) keeps the association intact for AT. */}
            <ol
              id="manual-install-guide"
              hidden={!isManualGuideOpen}
              className="list-inside list-decimal space-y-1.5 px-6 pb-4 pt-1 text-xs leading-relaxed text-slate-400"
            >
              {isAppleMobile ? (
                <>
                  <li>Open this site in <strong className="text-slate-200">Safari</strong>.</li>
                  <li>Tap the <strong className="text-slate-200">Share</strong> button (square with an arrow).</li>
                  <li>Scroll and tap <strong className="text-slate-200">Add to Home Screen</strong>.</li>
                  <li>Tap <strong className="text-slate-200">Add</strong> — the icon appears on your home screen.</li>
                </>
              ) : (
                <>
                  <li>Open the <strong className="text-slate-200">browser menu</strong> (⋮ or ⋯).</li>
                  <li>Look for <strong className="text-slate-200">Install app</strong> / <strong className="text-slate-200">Add to Home screen</strong>.</li>
                  <li>Confirm — the icon appears on your home screen or desktop.</li>
                </>
              )}
            </ol>
          </div>
        )}
      </section>

      <section aria-label="Share the app" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Share the app</h2>
        <ShareableCard
          label="App link"
          value={appUrl || 'App link unavailable'}
          description="Send classmates the address of this app so they can plan the same commute."
          shareTitle="Smart Student Commute Companion"
          onShare={isWebShareSupported && appUrl ? shareApp : undefined}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_SHARE_SCREENS.map((screen) => (
            <ShareableCard
              key={screen.id}
              label={`${screen.label} link`}
              value={appUrl ? `${appUrl}/?tab=${screen.id}` : 'App link unavailable'}
              description={`Open straight to the ${screen.label} screen.`}
              onShare={isWebShareSupported && appUrl ? () => shareScreenLink(screen) : undefined}
            />
          ))}
        </div>
        {!isWebShareSupported && (
          <p className="text-xs text-slate-500">
            Native sharing is not available in this browser — every card still offers one-tap copy.
          </p>
        )}
      </section>

      <section aria-label="Shared content" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Shared into the app</h2>
        {sharedReport ? (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="sky">Shared content received</Badge>
              <p role="status" className="text-xs text-sky-300">
                Choose how to use it below — nothing is stored on any server.
              </p>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              {sharedReport.title && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-slate-400">Title</dt>
                  <dd className="min-w-0 break-words text-slate-200">{sharedReport.title}</dd>
                </div>
              )}
              {sharedReport.text && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-slate-400">Text</dt>
                  <dd className="min-w-0 break-words text-slate-200">{sharedReport.text}</dd>
                </div>
              )}
              {sharedReport.url && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-slate-400">Link</dt>
                  <dd className="min-w-0 break-all text-slate-200">{sharedReport.url}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onUseSharedInReport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-emerald-400 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Use in a live report
              </button>
              <button
                type="button"
                onClick={onDismissShared}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center">
            <Share2 className="mx-auto h-6 w-6 text-slate-600" aria-hidden="true" />
            <p className="pt-2 text-sm font-semibold text-slate-300">Nothing shared here yet</p>
            <p className="mx-auto max-w-md pt-1 text-xs leading-relaxed text-slate-500">
              When your device&rsquo;s share sheet targets this app, shared links or text land here and can be
              turned into a live disruption report in one tap.
            </p>
          </div>
        )}
      </section>

      <section aria-label="How install and share work" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">How it works</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-emerald-400" aria-hidden="true" />Standalone app</span>}>
            <p className="text-sm text-slate-400">
              Installed, the companion opens in its own window without browser bars — just like a native app.
            </p>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Compass className="h-4 w-4 text-sky-400" aria-hidden="true" />Shortcuts built in</span>}>
            <p className="text-sm text-slate-400">
              Long-press the app icon for quick shortcuts straight to route planning and the live feed.
            </p>
          </Card>
          <Card title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-amber-400" aria-hidden="true" />Pairs with alerts</span>}>
            <p className="text-sm text-slate-400">
              Installed apps can raise device alerts in the background — set those up on the Device Alerts screen.
            </p>
          </Card>
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span>
          Installation and sharing are handled entirely by your browser and device — no account, download
          server, or personal data is involved.
        </span>
      </p>
    </div>
  );
}
