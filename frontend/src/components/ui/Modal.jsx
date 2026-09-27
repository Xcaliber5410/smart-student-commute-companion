import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal - Reusable dialog container
 *
 * Shared shell for all dialogs/forms/confirmations so overlays are not
 * reimplemented per feature. Provides:
 * - Semantic dialog behavior (role="dialog", aria-modal, accessible name)
 * - Reliable open/close state (rendered only when `isOpen`)
 * - Escape-key close (configurable)
 * - Explicit close button with accessible label
 * - Background interaction prevention (full-screen overlay + scroll lock)
 * - Focus management: moves focus into the dialog on open, keeps Tab
 *   cycling inside, and returns focus to the trigger on close
 * - Mobile-safe layout: capped height with internal scrolling, no
 *   viewport overflow
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Function} props.onClose - Close handler (Escape/close button/overlay)
 * @param {React.ReactNode} props.title - Dialog title (accessible name)
 * @param {React.ReactNode} [props.icon] - Decorative icon before the title
 * @param {React.ReactNode} props.children - Dialog body content
 * @param {string} [props.footer] - Footer slot (actions)
 * @param {'sm'|'md'|'lg'} [props.size='lg'] - Max width variant
 * @param {boolean} [props.closeOnOverlayClick=true] - Close when clicking the backdrop
 * @param {boolean} [props.closeOnEscape=true] - Close on Escape
 * @param {string} [props.overlayClassName=''] - Extra classes for the overlay
 *
 * @example
 * <Modal isOpen={open} onClose={close} title="Post a Report" icon={<AlertTriangle />}>
 *   <form>...</form>
 * </Modal>
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  size = 'lg',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  overlayClassName = '',
}) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = useId();

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }[size] || 'max-w-lg';

  // Focus management: move focus in on open, return it to the trigger on close
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement;

    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable || dialog)?.focus();

    // Prevent background scrolling while open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      const trigger = previouslyFocusedRef.current;
      if (trigger && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };
  }, [isOpen]);

  // Escape close + focus trap (Tab cycles within the dialog)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto ${overlayClassName}`}
      onMouseDown={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-slate-900 border border-slate-700/80 rounded-2xl w-full ${sizeClasses} max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden shadow-2xl my-auto focus:outline-none`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span aria-hidden="true" className="shrink-0">{icon}</span>}
            <h3 id={titleId} className="text-base font-bold text-white truncate">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body (scrolls when content exceeds viewport) */}
        <div className="overflow-y-auto min-h-0">{children}</div>

        {/* Optional footer actions */}
        {footer && (
          <div className="shrink-0 border-t border-slate-800 bg-slate-950/40 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
