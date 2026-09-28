import React, { useId } from 'react';
import { Search, X } from 'lucide-react';

/**
 * SearchInput - Reusable labeled search control
 *
 * Presentation-only text search box with:
 * - Accessible label (visually hidden by default) associated to the input
 * - Decorative search icon (hidden from assistive tech)
 * - Clear button that appears only when a query is present
 *
 * Query state is owned by the caller — this component never fetches or
 * applies the query itself.
 *
 * @param {Object} props
 * @param {string} props.value - Current query string
 * @param {Function} props.onChange - Called with the new query string
 * @param {string} [props.label='Search'] - Accessible input label
 * @param {string} [props.placeholder='Search...'] - Placeholder text
 * @param {Function} [props.onClear] - Optional extra callback after clearing
 * @param {string} [props.className=''] - Additional wrapper classes
 *
 * @example
 * <SearchInput
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search area or message..."
 * />
 */
export default function SearchInput({
  value,
  onChange,
  label = 'Search',
  placeholder = 'Search...',
  onClear,
  className = '',
}) {
  const id = useId();

  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
  };

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2.5 rounded-xl text-xs bg-slate-950/80 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
