import React from 'react';
import { BellRing, Info, Moon, Send, ShieldAlert, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { Alert, Button, Card, StatTile, Toggle } from '../components/ui';
import DeviceAlertPermissionCard from '../components/DeviceAlertPermissionCard';

/**
 * Device Alerts (Day 7 feature screen)
 *
 * Presentation-only page: permission/live-sync status, settings controls, and
 * an explanation of when OS-level alerts fire. All effects (permission
 * request, preference writes, test notification) run in the application
 * layer and arrive via callback props.
 */
export default function DeviceAlertsPage({
  permission = 'default',
  isPermissionPending = false,
  onRequestPermission,
  isLiveSyncConnected = false,
  isEnabled = true,
  onToggleEnabled,
  onSendTestAlert,
  isSendingTest = false,
}) {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const effectivePermission = !isSupported ? 'unsupported' : permission;
  const canSendTest = effectivePermission === 'granted' && isEnabled && !isSendingTest;

  // Permission action slot: the enable button appears only while the browser
  // has not been asked yet (denied/unsupported are guided by the alerts above).
  const permissionAction = effectivePermission === 'default' ? (
    <Button
      type="button"
      variant="primary"
      size="sm"
      icon={<BellRing className="h-3.5 w-3.5" aria-hidden="true" />}
      loading={isPermissionPending}
      disabled={isPermissionPending}
      onClick={onRequestPermission}
    >
      {isPermissionPending ? 'Requesting...' : 'Enable device alerts'}
    </Button>
  ) : null;

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
        <DeviceAlertPermissionCard
          permission={effectivePermission}
          action={permissionAction}
          isPending={isPermissionPending}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <section aria-label="Device alert settings" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Settings</h2>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
          <Toggle
            id="device-alerts-enabled"
            checked={isEnabled}
            onChange={onToggleEnabled}
            label="Device alerts"
            description="Show OS-level notifications for new live disruption reports while the app is in the background."
            className="border-b border-slate-800 pb-3"
          />
          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-200">Send test alert</p>
              <p className="text-xs text-slate-500 leading-relaxed pt-0.5">
                Raise a sample notification now to see how alerts appear on this device.
                {!canSendTest && effectivePermission === 'granted' && !isEnabled
                  ? ' Turn device alerts on first.'
                  : ''}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
              loading={isSendingTest}
              disabled={!canSendTest}
              onClick={onSendTestAlert}
            >
              Send test alert
            </Button>
          </div>
        </div>
      </section>

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
