import React from 'react';

/**
 * FeatureHighlight - Reusable icon + title + description row
 *
 * Compact benefit/feature explainer used in promotional and "how it works"
 * surfaces. Renders real text (never color-only meaning) with a decorative
 * icon slot, matching the card/panel language of the existing design system.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Decorative icon (aria-hidden by caller
 *   semantics — rendered inside an aria-hidden span here)
 * @param {string} props.title - Short feature title
 * @param {string} props.description - One-or-two sentence explanation
 * @param {string} [props.className=''] - Extra wrapper classes
 *
 * @example
 * <FeatureHighlight icon={<WifiOff />} title="Works offline" description="Cached shell..." />
 */
export default function FeatureHighlight({ icon, title, description, className = '' }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-emerald-400"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="pt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>
      </div>
    </div>
  );
}
