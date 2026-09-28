import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

/**
 * Toast - Floating notification component
 * 
 * Displays temporary feedback messages to users for:
 * - Success confirmations
 * - Error messages
 * - Warning notifications
 * - Info messages
 * 
 * @param {Object} props
 * @param {string} props.message - Message to display
 * @param {string} props.type - Type: 'success', 'error', 'warning', 'info' (default: 'success')
 */
export default function Toast({ message, type = 'success' }) {
  if (!message) return null;

  const styles = {
    success: 'bg-emerald-950/90 border-emerald-500 text-emerald-200',
    error: 'bg-rose-950/90 border-rose-500 text-rose-200',
    warning: 'bg-amber-950/90 border-amber-500 text-amber-200',
    info: 'bg-sky-950/90 border-sky-500 text-sky-200'
  };

  const Icon = type === 'error' ? AlertCircle : type === 'info' ? Info : CheckCircle2;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-[3000] max-w-sm animate-fade-in"
    >
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-semibold ${styles[type] || styles.success}`}>
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  );
}
