import React from 'react';
import { BellRing, Info, Moon, ShieldAlert, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { Alert, Badge, Card, StatTile } from '../components/ui';

const PERMISSION_META = {
  loading: {
    label: 'Checking...',
    variant: 'slate',
    description: 'Reading the browser notification permission.',
  },
  granted: {
    label: 'Allowed',
    variant: 'emerald',
    description: 'This browser may show system-level notifications for live disruptions.',
  },
  denied: {
    label: 'Blocked',
    variant: 'rose',
    description: 'Notifications are blocked for this site. Allow them in your browser site settings to receive device alerts.',
  },
  default: {
    label: 'Not asked yet',
    variant: 'amber',
    description: 'Permission has not been requested. Enable device alerts below to be prompted.',
  },
  unsupported: {
    label: 'Unsupported',
    variant: 'rose',
    description: 'This browser does not support the Notification API, so device alerts are unavailable.',
  },
};

/**
 * Device Alerts (Day 7 feature screen)
 *
 * Presentation-only page: permission/live-sync status and an explanation of
 * when OS-level alerts fire. Interactive controls (enable, toggles, test alert)
 * arrive via props in later commits.
 */
export default function DeviceAlertsPage({
  permission = 'default',
  isLiveSyncConnected = false,
  isEnabled = true,
  controls = null,
}) {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const effectivePermission = !isSupported ? 'unsupported' : permission;
  const meta = PERMISSION_META[effectivePermission] || PERMISSION_META.default;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-white">Device Alerts</h1>
        <p className="text-sm text-slate-400">
          OS-level notifications for live disruption reports, delivered even when the app is in the background
        </p>
      </header>

      {effectivePermission === 'unsupported' && (
        <Alert variant="warning" title="Device alerts unavailable">
          <span>
            This browser does not support the Notification API. You can still follow live disruptions on the
            Notifications screen while the app is open.
          </span>
        </Alert>
      )}

      {effectivePermission === 'denied' && (
        <Alert variant="error" title="Notifications are blocked">
          <span>
            Your browser is blocking notifications for this site. Open the site settings for this page and allow
            notifications, then reload to enable device alerts.
          </span>
        </Alert>
      )}

      <section aria-label="Device alert status" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Status</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            icon={<BellRing className="h-4 w-4" />}
            variant={meta.variant}
            value={meta.label}
            label="Notification permission"
            hint={isSupported ? 'Browser permission' : 'Not supported here'}
          />
          <StatTile
            icon={isLiveSyncConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            variant={isLiveSyncConnected ? 'emerald' : 'amber'}
            value={isLiveSyncConnected ? 'Connected' : 'Disconnected'}
            label="Live sync"
            hint={isLiveSyncConnected ? 'Receiving live reports' : 'Waiting for live reports'}
          />
          <StatTile
            icon={<Moon className="h-4 w-4" />}
            variant={isEnabled ? 'sky' : 'slate'}
            value={isEnabled ? 'On' : 'Off'}
            label="Device alerts"
            hint="Your saved preference"
          />
        </div>
        <p role="status" aria-live="polite" className="text-xs text-slate-500">
          {meta.description}
        </p>
      </section>

      <section aria-label="How device alerts work" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">How it works</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-emerald-400" aria-hidden="true" />Background delivery</span>}>
            <p className="text-sm text-slate-400">
              Alerts are shown by your operating system only while the app is not focused, so you hear about
              disruptions without keeping the tab open.
            </p>
          </Card>
          <Card title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-sky-400" aria-hidden="true" />Live reports only</span>}>
            <p className="text-sm text-slate-400">
              Each alert mirrors a live disruption reported by the student community — the same updates you see
              on the Notifications screen.
            </p>
          </Card>
          <Card title={<span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />You stay in control</span>}>
            <p className="text-sm text-slate-400">
              Device alerts respect your saved preference and the browser permission. Turn them off or block
              them at any time.
            </p>
          </Card>
        </div>
      </section>

      {controls && (
        <section aria-label="Device alert settings" className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Settings</h2>
          {controls}
        </section>
      )}

      <p className="flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span>
          {effectivePermission === 'granted'
            ? 'Device alerts are ready. New live reports will appear as system notifications when the app is in the background.'
            : 'Nothing is sent to any server — alerts are raised locally by your browser from live reports the app already receives.'}
        </span>
      </p>
    </div>
  );
}
