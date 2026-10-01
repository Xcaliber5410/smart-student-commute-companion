import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

/**
 * Copy arbitrary text to the clipboard with a legacy fallback for
 * non-secure contexts where the async Clipboard API is unavailable.
 *
 * @param {string} text
 * @returns {Promise<boolean>} Whether the copy succeeded
 */
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

/**
 * ShareableCard - Reusable share/copy row for links and text
 *
 * Shows a labeled value (typically a URL) with two actions:
 * - **Copy**: always available; writes the value to the clipboard and
 *   announces the result politely via role="status".
 * - **Share**: rendered only when the browser supports the Web Share API
 *   AND an `onShare` handler is provided, so unsupported environments never
 *   see a dead button.
 *
 * @param {Object} props
 * @param {string} props.label - Visible label for the shared value
 * @param {string} props.value - The text/URL to copy (also shared as `url`/`text`)
 * @param {string} [props.description] - Optional helper text under the value
 * @param {string} [props.shareTitle] - Title used for the native share sheet
 * @param {Function} [props.onShare] - Async handler performing the native share
 * @param {string} [props.className] - Additional wrapper classes
 */
export default function ShareableCard({
  label,
  value,
  description,
  shareTitle,
  onShare,
  className = '',
}) {
  const [copyState, setCopyState] = useState('idle'); // idle | copied | failed
  const [isSharing, setIsSharing] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const isWebShareSupported =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = async () => {
    const succeeded = await copyTextToClipboard(value);
    setCopyState(succeeded ? 'copied' : 'failed');
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  const handleShare = async () => {
    if (!onShare || isSharing) return;
    setIsSharing(true);
    try {
      await onShare();
    } finally {
      setIsSharing(false);
    }
  };

  const copyStatusText =
    copyState === 'copied' ? 'Copied to clipboard' : copyState === 'failed' ? 'Copy failed — select the text and copy manually' : '';

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-white">{label}</h4>
        <p role="status" aria-live="polite" className="text-xs text-emerald-300">
          {copyStatusText}
        </p>
      </div>
      <p className="mt-2 break-all rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        {value}
      </p>
      {description && <p className="mt-2 text-xs text-slate-500">{description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          {copyState === 'copied' ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copyState === 'copied' ? 'Copied!' : 'Copy'}
        </button>
        {isWebShareSupported && onShare && (
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            {isSharing ? 'Sharing…' : 'Share'}
          </button>
        )}
      </div>
    </div>
  );
}
