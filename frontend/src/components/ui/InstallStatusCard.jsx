import React from 'react';
import { CheckCircle2, Download, HelpCircle, Smartphone, SquarePlus } from 'lucide-react';
import { Badge } from './ui';

const STATUS_META = {
  loading: {
    label: 'Checking...',
    variant: 'slate',
    icon: <HelpCircle className="h-4 w-4" />,
    description: 'Reading the browser install state.',
  },
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
 * InstallStatusCard - Install capability panel for the Install & Share hub
 *
 * Shows the current PWA install state as an icon, status badge, and
 * plain-language description, with an optional action slot (the
 * "Install app" button when the deferred browser prompt is available).
 *
 * @param {Object} props
 * @param {'loading'|'installed'|'available'|'manual'} [props.status='manual']
 * @param {React.ReactNode} [props.action] - Action button slot
 */
export default function InstallStatusCard({ status = 'manual', action = null }) {
  const meta = STATUS_META[status] || STATUS_META.manual;

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
            <h3 className="text-sm font-bold text-white">Home screen install</h3>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          <p className="pt-0.5 text-xs leading-relaxed text-slate-400">{meta.description}</p>
        </div>
      </div>
      {action && (
        <div className="shrink-0 sm:self-center">{action}</div>
      )}
    </div>
  );
}
