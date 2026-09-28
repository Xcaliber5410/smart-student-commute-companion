import React, { useRef } from 'react';

/**
 * Tabs - Reusable accessible tab / segmented control
 *
 * Presentation-only tab strip used to switch between related views of the
 * same data. State (which tab is active) is owned by the caller.
 *
 * Accessibility:
 * - role="tablist" / role="tab" with aria-selected
 * - Roving tabindex: only the active tab is in the tab order
 * - Arrow keys / Home / End move focus between tabs and activate them
 * - Each tab links to its panel via aria-controls (use the exported
 *   TabPanel with the same idPrefix so the ids line up)
 *
 * @param {Object} props
 * @param {Array<{id: string, label: React.ReactNode, icon?: React.ComponentType, count?: number, disabled?: boolean}>} props.tabs
 * @param {string} props.activeTab - Id of the currently selected tab
 * @param {Function} props.onChange - Called with the new tab id
 * @param {string} [props.ariaLabel='Sections'] - Accessible tablist label
 * @param {string} [props.idPrefix='tabs'] - Prefix used for tab/panel ids
 * @param {'sm'|'md'} [props.size='md'] - Control size
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <Tabs
 *   idPrefix="transit-results"
 *   ariaLabel="Transit result type"
 *   tabs={[{ id: 'stops', label: 'Stops', count: 12 }]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 */
export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  ariaLabel = 'Sections',
  idPrefix = 'tabs',
  size = 'md',
  className = '',
}) {
  const listRef = useRef(null);

  const handleKeyDown = (e) => {
    const enabled = tabs.filter((t) => !t.disabled);
    if (enabled.length === 0) return;

    const currentIdx = enabled.findIndex((t) => t.id === activeTab);
    let nextIdx = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (currentIdx + 1) % enabled.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (currentIdx - 1 + enabled.length) % enabled.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = enabled.length - 1;
    }

    if (nextIdx === null || nextIdx === currentIdx) return;
    e.preventDefault();

    const next = enabled[nextIdx];
    onChange?.(next.id);
    const nextButton = listRef.current?.querySelector(`[data-tab-id="${next.id}"]`);
    nextButton?.focus();
  };

  const sizeClasses =
    size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`inline-flex flex-wrap gap-1 bg-slate-950/70 border border-slate-800 rounded-xl p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            data-tab-id={tab.id}
            onClick={() => !tab.disabled && onChange?.(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:ring-offset-slate-950 disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses} ${
              isActive
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-700/70'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * TabPanel - Panel that pairs with a Tabs instance.
 * Renders the active panel only and wires aria-labelledby correctly.
 *
 * @param {Object} props
 * @param {string} props.idPrefix - Same prefix passed to Tabs
 * @param {string} props.tabId - Id of the tab that owns this panel
 * @param {React.ReactNode} props.children - Panel content
 * @param {string} [props.className=''] - Additional wrapper classes
 */
export function TabPanel({ idPrefix = 'tabs', tabId, children, className = '' }) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabId}`}
      aria-labelledby={`${idPrefix}-tab-${tabId}`}
      tabIndex={0}
      className={`focus:outline-none focus:ring-2 focus:ring-emerald-500/40 rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}
