/**
 * List Controls
 *
 * Pure helpers for client-side search, filter, and sort interactions.
 * Kept separate from presentation so feature pages own the state and
 * generic UI components stay dumb.
 *
 * Client-side filtering operates on data already delivered by the
 * API layer (freshness-decayed report lists and open ride groups).
 */

/**
 * Case-insensitive containment check across multiple fields.
 *
 * @param {Object} item - Row data
 * @param {string} query - Trimmed user query
 * @param {string[]} fields - Fields to search within
 * @returns {boolean}
 */
export function matchesQuery(item, query, fields) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(item?.[f] ?? '').toLowerCase().includes(q));
}

/**
 * Apply equality filters (skip empty/'all' values).
 *
 * @param {Object} item - Row data
 * @param {Object} filters - Map of field → selected value
 * @returns {boolean}
 */
export function matchesFilters(item, filters = {}) {
  return Object.entries(filters).every(([field, value]) => {
    if (value === '' || value === 'all' || value == null) return true;
    return String(item?.[field]) === String(value);
  });
}

/**
 * Sort a list copy by key with an optional direction.
 * Supports numeric and string values; stable for equal keys.
 *
 * @param {Array} items
 * @param {string} key - Sort field (or a function for derived values)
 * @param {'asc'|'desc'} [dir='asc']
 * @param {Function} [accessor] - Optional (item) => comparable value
 * @returns {Array} New sorted array (input not mutated)
 */
export function sortItems(items, key, dir = 'asc', accessor = null) {
  const get = accessor || ((it) => (typeof key === 'function' ? key(it) : it?.[key]));
  const factor = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va === vb) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * factor;
    }
    return String(va).localeCompare(String(vb)) * factor;
  });
}

/**
 * One-shot search → filter → sort pipeline.
 *
 * @param {Array} items
 * @param {Object} options
 * @param {string} [options.query=''] - Free-text query
 * @param {string[]} [options.queryFields=[]] - Fields searched by the query
 * @param {Object} [options.filters={}] - Field equality filters
 * @param {string|Function} [options.sortKey=null] - Sort field; null keeps original order
 * @param {'asc'|'desc'} [options.sortDir='asc']
 * @param {Function} [options.sortAccessor] - Optional derived value accessor
 * @returns {Array}
 */
export function applyListControls(items = [], options = {}) {
  const {
    query = '',
    queryFields = [],
    filters = {},
    sortKey = null,
    sortDir = 'asc',
    sortAccessor = null,
  } = options;

  const filtered = items.filter(
    (item) => matchesQuery(item, query, queryFields) && matchesFilters(item, filters)
  );

  if (!sortKey) return filtered;
  return sortItems(filtered, sortKey, sortDir, sortAccessor);
}

/**
 * Build the active-filter chip list for a FilterBar from current selections.
 *
 * @param {Object} selections - Map of field → selected value
 * @param {Object} labels - Map of field → human label ("Impact")
 * @param {Object} [valueLabels] - Optional map of field → { value → label } for enums
 * @param {Function} onClearField - (field) => void that resets a single filter
 * @returns {Array<{label: string, onRemove: Function}>}
 */
export function buildActiveFilters(selections, labels, valueLabels = {}, onClearField) {
  return Object.entries(selections)
    .filter(([, value]) => value !== '' && value !== 'all' && value != null)
    .map(([field, value]) => ({
      label: `${labels[field] || field}: ${valueLabels[field]?.[value] || value}`,
      ...(onClearField ? { onRemove: () => onClearField(field) } : {}),
    }));
}
