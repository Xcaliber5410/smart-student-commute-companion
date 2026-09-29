import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

/**
 * Toast - Floating notification region
 *
 * Renders the application's feedback queue as a non-blocking, dismissible
 * live region:
 *
 * - Success / info / warning toasts announce via role="status" (polite).
 * - Error toasts announce via role="alert" (assertive) so failures are not
 *   missed while the user keeps working.
 * - Every toast has a keyboard-focusable dismiss button; auto-dismiss
 *   timers live in the owner (App), which gives errors a longer window.
 * - The region floats above the mobile bottom nav and never reflows the
 *   page layout (fixed positioning + pointer-events isolation).
 *
 * @param {Object} props
 * @param {Array<{id: number, message: string, type?: string}>} props.toasts - Active toasts (oldest first)
 * @param {Function} props.onDismiss - Dismiss handler: onDismiss(id)
 */
const STYLES = {
  success: 'bg-emerald-950/90 border-emerald-500 text-emerald-200',
  error: 'bg-rose-950/90 border-rose-500 text-rose-200',
  warning: 'bg-amber-950/90 border-amber-500 text-amber-200',
  info: 'bg-sky-950/90 border-sky-500 text-sky-200',
};

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function Toast({ toasts = [], onDismiss }) {
  const list = Array.isArray(toasts) ? toasts : [];
  if (list.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-[3000] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none max-w-sm sm:max-w-sm w-auto"
      aria-label="Notifications"
    >
      {list.map((toast) => {
        const type = toast.type || 'success';
        const Icon = ICONS[type] || ICONS.success;
        const isError = type === 'error';

        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex items-start gap-2 px-3.5 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-semibold animate-fade-in ${STYLES[type] || STYLES.success}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="flex-1 min-w-0 break-words">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss?.(toast.id)}
              aria-label={`Dismiss notification: ${toast.message.slice(0, 60)}`}
              className="shrink-0 -mr-1 -mt-0.5 p-1 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-current"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
