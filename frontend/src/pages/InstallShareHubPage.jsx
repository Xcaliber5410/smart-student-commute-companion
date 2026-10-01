import React from 'react';
import {
  BellRing,
  CheckCircle2,
  Compass,
  Download,
  Info,
  Link2,
  Share2,
  Smartphone,
  SquarePlus,
} from 'lucide-react';
import { Card, StatTile } from '../components/ui';
import InstallStatusCard from '../components/ui/InstallStatusCard';
import ShareableCard from '../components/ui/ShareableCard';

const INSTALL_STATUS_META = {
  installed: {
    label: 'Installed',
    variant: 'emerald',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'The app is installed on this device and runs in its own window.',
  },
  available: {
    label: 'Ready to install',
    variant: 'amber',
    icon: <Download className="h-4 w-4" />,
    description: 'Your browser can install the app right now — one tap and it lives on your home screen.',
  },
  manual: {
    label: 'Manual install',
    variant: 'slate',
    icon: <SquarePlus className="h-4 w-4" />,
    description: 'Install from your browser menu: look for “Install app” or “Add to Home Screen”.',
  },
};

/**
 * Install & Share Hub (Day 8 feature screen)
 *
 * Presentation-only page that gathers the PWA "advanced features" from the
 * roadmap in one place: install status, app sharing, and handling of content
 * shared INTO the app (Share Target). Install state arrives from the app
 * layer; browser capabilities are feature-detected locally so unsupported
 * browsers get honest guidance instead of broken buttons.
 *
 * @param {Object} props
 * @param {'installed'|'available'|'manual'} [props.installStatus='manual']
 * @param {Function} [props.onInstallApp] - Trigger the deferred browser install prompt
 */
export default function InstallShareHubPage({
  installStatus = 'manual',
  onInstallApp,
}) {
  const isWebShareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const installMeta = INSTALL_STATUS_META[installStatus] || INSTALL_STATUS_META.manual;
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

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
      </section>

      <section aria-label="Share the app" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Share the app</h2>
        <ShareableCard
          label="App link"
          value={appUrl || 'App link unavailable'}
          description="Send classmates the address of this app so they can plan the same commute."
          shareTitle="Smart Student Commute Companion"
          onShare={isWebShareSupported && appUrl ? () => navigator.share({ title: 'Smart Student Commute Companion', text: 'Plan your college commute with me:', url: appUrl }) : undefined}
        />
      </section>

      <section aria-label="Shared content" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Shared into the app</h2>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center">
          <Share2 className="mx-auto h-6 w-6 text-slate-600" aria-hidden="true" />
          <p className="pt-2 text-sm font-semibold text-slate-300">Nothing shared here yet</p>
          <p className="mx-auto max-w-md pt-1 text-xs text-slate-500 leading-relaxed">
            When your device&rsquo;s share sheet targets this app, shared links or text land here and can be
            turned into a live disruption report in one tap.
          </p>
        </div>
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
