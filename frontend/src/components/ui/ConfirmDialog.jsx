import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * ConfirmDialog - Reusable confirmation dialog
 *
 * Built on Modal for destructive or consequential actions (e.g., resetting
 * demo data). Provides clear confirm/cancel choices with an optional
 * pending/disabled state to prevent duplicate submissions.
 *
 * UI/event abstraction only — the caller performs the actual action.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Function} props.onCancel - Cancel/close handler
 * @param {Function} props.onConfirm - Confirm handler
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Explanation of what will happen
 * @param {string} [props.confirmLabel='Confirm'] - Confirm button text
 * @param {string} [props.cancelLabel='Cancel'] - Cancel button text
 * @param {boolean} [props.destructive=false] - Style confirm as danger
 * @param {boolean} [props.isPending=false] - Disable buttons while action runs
 *
 * @example
 * <ConfirmDialog
 *   isOpen={confirmOpen}
 *   title="Reset demo environment?"
 *   message="All reports and groups return to the baseline state."
 *   confirmLabel="Reset Demo"
 *   destructive
 *   isPending={isResetting}
 *   onCancel={() => setConfirmOpen(false)}
 *   onConfirm={handleReset}
 * />
 */
export default function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isPending = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={isPending ? () => {} : onCancel}
      title={title}
      icon={<AlertTriangle className={`w-5 h-5 ${destructive ? 'text-rose-400' : 'text-amber-400'}`} />}
      size="md"
      closeOnOverlayClick={!isPending}
      closeOnEscape={!isPending}
    >
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-300 leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
