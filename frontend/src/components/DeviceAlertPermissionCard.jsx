import React from 'react';
import { BellRing, BellOff, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';
import { Badge } from './ui';

const STATUS_META = {
  loading: {
    label: 'Checking...',
    variant: 'slate',
    icon: <HelpCircle className="h-4 w-4" />,
    description: 'Reading the browser notification permission.',
  },
  pending: {
    label: 'Requesting...',
    variant: 'sky',
    icon: <HelpCircle className="h-4 w-4" />,
    description: 'Waiting for your choice in the browser permission prompt.',
  },
  granted: {
    label: 'Allowed',
    variant: 'emerald',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'This browser may show system-level notifications for live disruptions.',
  },
  denied: {
    label: 'Blocked',
    variant: 'rose',
    icon: <BellOff className="h-4 w-4" />,
    description: 'Notifications are blocked for this site. Allow them in your browser site settings to receive device alerts.',
  },
  default: {
    label: 'Not asked yet',
    variant: 'amber',
    icon: <BellRing className="h-4 w-4" />,
    description: 'Permission has not been requested yet. Enable device alerts below to be prompted.',
  },
  unsupported: {
    label: 'Unsupported',
    variant: 'rose',
    icon: <ShieldAlert className="h-4 w-4" />,
    description: 'This browser does not support the Notification API, so device alerts are unavailable.',
  },
};

/**
 * DeviceAlertPermissionCard - Permission status panel for Device Alerts
 *
 * Shows the current browser notification permission as an icon, status
 * badge, and plain-language description, with an optional action slot
 * (e.g. the "Enable device alerts" button) rendered beside it.
 *
 * @param {Object} props
 * @param {'loading'|'granted'|'denied'|'default'|'unsupported'} [props.permission='default']
 * @param {React.ReactNode} [props.action] - Action button slot
 * @param {boolean} [props.isPending=false] - Whether a permission request is in flight
 */
export default function DeviceAlertPermissionCard({
  permission = 'default',
  action = null,
  isPending = false,
}) {
  const meta = STATUS_META[isPending ? 'pending' : permission] || STATUS_META.default;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-300"
        >
          {meta.icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">Browser permission</h3>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          {/* Permission changes are announced politely (e.g. when the user
              flips the setting in browser site settings) */}
          <p role="status" aria-live="polite" className="pt-0.5 text-xs text-slate-400 leading-relaxed">
            {meta.description}
          </p>
        </div>
      </div>
      {action && <div className="shrink-0 sm:pl-3">{action}</div>}
    </div>
  );
}
