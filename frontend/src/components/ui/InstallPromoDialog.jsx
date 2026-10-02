import React from 'react';
import { BellRing, Download, Smartphone, WifiOff } from 'lucide-react';
import Modal from './Modal';
import FeatureHighlight from './FeatureHighlight';

/**
 * InstallPromoDialog - "Why install?" benefits dialog (Day 9)
 *
 * Deepens the install promotion started by InstallPromoBanner: explains the
 * three concrete benefits of installing (offline shell, device alerts,
 * home-screen shortcuts) and offers the install action plus a route to the
 * Day 8 Install & Share hub for manual guidance.
 *
 * Built on the shared Modal, so focus trapping, Escape close, scroll lock,
 * and the semantic dialog role come for free — no dialog behavior is
 * reimplemented here. When the browser holds no deferred prompt, the primary
 * action is honestly omitted and the manual path (Day 8 hub) is highlighted
 * instead.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Function} props.onClose - Close handler
 * @param {Function} [props.onInstall] - Trigger the existing install flow (omitted when unavailable)
 * @param {Function} [props.onOpenHub] - Navigate to the Install & Share screen
 * @param {boolean} [props.canInstall=false] - A deferred install prompt exists
 */
export default function InstallPromoDialog({
  isOpen,
  onClose,
  onInstall,
  onOpenHub,
  canInstall = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Why install?"
      icon={<Download className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
      size="md"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onOpenHub}
            className="min-h-9 px-3.5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            Open Install &amp; Share
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-slate-400">
          Installing takes one tap and adds the companion to your home screen —
          no app store, no account, and nothing stored on a server.
        </p>
        <div className="space-y-3.5">
          <FeatureHighlight
            icon={<WifiOff className="w-4 h-4" />}
            title="Works offline"
            description="The installed shell opens without a connection, so saved commutes and the interface stay reachable on patchy network."
          />
          <FeatureHighlight
            icon={<BellRing className="w-4 h-4" />}
            title="Device alerts"
            description="Installed apps can raise OS-level alerts for live disruptions even while the tab is backgrounded."
          />
          <FeatureHighlight
            icon={<Smartphone className="w-4 h-4" />}
            title="Home-screen shortcuts"
            description="Long-press the app icon to jump straight into route planning or the live feed."
          />
        </div>
        {canInstall && onInstall && (
          <button
            type="button"
            onClick={onInstall}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:bg-emerald-400 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Install app
          </button>
        )}
        {!canInstall && (
          <p className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs text-slate-400">
            This browser doesn&rsquo;t offer one-tap install right now — the
            Install &amp; Share screen has manual steps for every device.
          </p>
        )}
      </div>
    </Modal>
  );
}
