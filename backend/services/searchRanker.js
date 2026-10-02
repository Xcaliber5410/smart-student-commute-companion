/**
 * Search Ranking & Deterministic Scoring Engine
 *
 * Implements lightweight, deterministic relevance ranking for cross-domain student search:
 * - Exact matches rank above partial/substring matches
 * - Beginning-of-field matches rank above interior/later matches
 * - Primary title/name matches rank above secondary identifiers and descriptions
 * - Closer textual matches (higher coverage density) rank above sprawling matches
 * - Multi-token cohesion boosts items containing all query terms together
 * - Deterministic 5-tier secondary sorting eliminates unstable or random ordering
 * - Strictly isolated and testable without external dependencies or heavy algorithms
 */

const RANKING_WEIGHTS = {
  // Title / Primary Name
  EXACT_TITLE_MATCH: 150,
  PREFIX_TITLE_MATCH: 85,
  WORD_BOUNDARY_TITLE_MATCH: 55,
  SUBSTRING_TITLE_MATCH: 35,
  MAX_TITLE_COVERAGE_BONUS: 30,

  // Secondary Identifiers (course code, origin/dest, route tag)
  EXACT_IDENTIFIER_MATCH: 100,
  PREFIX_IDENTIFIER_MATCH: 50,
  WORD_BOUNDARY_IDENTIFIER_MATCH: 35,
  SUBSTRING_IDENTIFIER_MATCH: 20,
  MAX_IDENTIFIER_COVERAGE_BONUS: 20,

  // Subtitle / Categorization
  EXACT_SUBTITLE_MATCH: 50,
  PREFIX_SUBTITLE_MATCH: 25,
  SUBSTRING_SUBTITLE_MATCH: 15,

  // Descriptive Fields (description, notes, summary, message, snippet)
  WORD_BOUNDARY_DESC_MATCH: 20,
  SUBSTRING_DESC_MATCH: 10,

  // Multi-Token Cohesion
  ALL_TOKENS_IN_TITLE: 45,
  ALL_TOKENS_IN_ANY_FIELD: 20,
  TOKEN_IN_TITLE_WEIGHT: 12,

  // Status & Lifecycle Modifiers
  ACTIVE_STATUS_BOOST: 6,
  TERMINAL_STATUS_PENALTY: -6,

  // Priority Boost
  HIGH_PRIORITY_BOOST: 5,

  // Recency Modifiers
  RECENT_7_DAYS_BOOST: 5,
  RECENT_30_DAYS_BOOST: 2
};

const ACTIVE_STATUSES = new Set(['active', 'pending', 'scheduled', 'unread', 'saved']);
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'archived', 'read', 'dismissed']);

/**
 * Escapes regex special characters in user input.
 *
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes text by lowercasing, trimming, and collapsing whitespace.
 *
 * @param {*} val
 * @returns {string}
 */
function normalizeText(val) {
  if (val == null) return '';
  return String(val).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculates a coverage bonus proportional to query density in the field.
 * Closer textual matches (e.g. query "Algorithms" in "Algorithms" vs "Intro to Advanced Algorithms...")
 * receive higher bonuses.
 *
 * @param {string} query
 * @param {string} field
 * @param {number} maxBonus
 * @returns {number}
 */
function calculateCoverageBonus(query, field, maxBonus) {
  if (!query || !field) return 0;
  const ratio = Math.min(1, query.length / Math.max(query.length, field.length));
  return Math.round(ratio * maxBonus);
}

/**
 * Extracts normalized searchable fields from a canonical student search item.
 *
 * @param {object} item
 * @returns {object}
 */
function extractSearchableFields(item) {
  const title = normalizeText(item.title);
  const subtitle = normalizeText(item.subtitle);

  // Extract secondary identifiers (course code, origin, destination, location)
  const identifiers = [];
  if (item.metadata?.courseCode) identifiers.push(normalizeText(item.metadata.courseCode));
  if (item.metadata?.code) identifiers.push(normalizeText(item.metadata.code));
  if (item.metadata?.origin) identifiers.push(normalizeText(item.metadata.origin));
  if (item.metadata?.destination) identifiers.push(normalizeText(item.metadata.destination));
  if (item.metadata?.location) identifiers.push(normalizeText(item.metadata.location));
  if (item.metadata?.tags && Array.isArray(item.metadata.tags)) {
    for (const t of item.metadata.tags) {
      identifiers.push(normalizeText(t));
    }
  }

  // Extract descriptive fields
  const descriptions = [];
  if (item.description) descriptions.push(normalizeText(item.description));
  if (item.snippet) descriptions.push(normalizeText(item.snippet));
  if (item.metadata?.notes) descriptions.push(normalizeText(item.metadata.notes));
  if (item.metadata?.summary) descriptions.push(normalizeText(item.metadata.summary));
  if (item.metadata?.department) descriptions.push(normalizeText(item.metadata.department));
  if (item.metadata?.instructor) descriptions.push(normalizeText(item.metadata.instructor));

  return {
    title,
    subtitle,
    identifiers,
    descriptions,
    status: (item.status || '').toLowerCase(),
    priority: (item.metadata?.priority || '').toLowerCase(),
    timestamp: item.updatedAt || item.createdAt || 0
  };
}

/**
 * Precompiles query matching regular expressions once per query execution.
 *
 * @param {string} query
 * @returns {object}
 */
function compileQueryPatterns(query) {
  const cleanQuery = normalizeText(query);
  if (!cleanQuery) {
    return { cleanQuery: '', tokens: [], wordRegex: null, tokenRegexes: [] };
  }

  const escaped = escapeRegExp(cleanQuery);
  let wordRegex = null;
  try {
    wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
  } catch (_) {
    wordRegex = null;
  }

  const tokens = cleanQuery.split(' ').filter(t => t.length > 0);
  const tokenRegexes = tokens.map(t => {
    try {
      return new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i');
    } catch (_) {
      return null;
    }
  });

  return {
    cleanQuery,
    tokens,
    wordRegex,
    tokenRegexes
  };
}

/**
 * Calculates a deterministic relevance score for a search candidate item.
 *
 * @param {object} item - Normalized student search item
 * @param {string} query - Raw search query
 * @param {object} [patterns] - Optional precompiled patterns from compileQueryPatterns
 * @returns {number} Deterministic integer score (>= 1)
 */
function calculateRelevanceScore(item, query, patterns = null) {
  const p = patterns || compileQueryPatterns(query);
  const { cleanQuery, tokens, wordRegex } = p;

  if (!cleanQuery) return 1;

  let score = 0;
  const fields = extractSearchableFields(item);
  const { title, subtitle, identifiers, descriptions, status, priority, timestamp } = fields;

  // -----------------------------------------------------------------
  // 1. Primary Title / Name Evaluation (Highest Priority)
  // -----------------------------------------------------------------
  if (title) {
    if (title === cleanQuery) {
      // 1.1 Exact match on primary title
      score += RANKING_WEIGHTS.EXACT_TITLE_MATCH;
      score += RANKING_WEIGHTS.MAX_TITLE_COVERAGE_BONUS;
    } else if (title.startsWith(cleanQuery)) {
      // 1.2 Beginning-of-field match on title
      score += RANKING_WEIGHTS.PREFIX_TITLE_MATCH;
      score += calculateCoverageBonus(cleanQuery, title, RANKING_WEIGHTS.MAX_TITLE_COVERAGE_BONUS);
    } else if (wordRegex && wordRegex.test(title)) {
      // 1.3 Whole-word boundary match within title
      score += RANKING_WEIGHTS.WORD_BOUNDARY_TITLE_MATCH;
      score += calculateCoverageBonus(cleanQuery, title, RANKING_WEIGHTS.MAX_TITLE_COVERAGE_BONUS);
    } else if (title.includes(cleanQuery)) {
      // 1.4 Interior partial substring match in title
      score += RANKING_WEIGHTS.SUBSTRING_TITLE_MATCH;
      score += calculateCoverageBonus(cleanQuery, title, RANKING_WEIGHTS.MAX_TITLE_COVERAGE_BONUS);
    }
  }

  // -----------------------------------------------------------------
  // 2. Secondary Identifiers (Course Code, Origin, Destination, Tags)
  // -----------------------------------------------------------------
  let matchedIdentifierScore = 0;
  for (const idf of identifiers) {
    if (!idf) continue;
    if (idf === cleanQuery) {
      const idfScore = RANKING_WEIGHTS.EXACT_IDENTIFIER_MATCH +
        calculateCoverageBonus(cleanQuery, idf, RANKING_WEIGHTS.MAX_IDENTIFIER_COVERAGE_BONUS);
      if (idfScore > matchedIdentifierScore) matchedIdentifierScore = idfScore;
    } else if (idf.startsWith(cleanQuery)) {
      const idfScore = RANKING_WEIGHTS.PREFIX_IDENTIFIER_MATCH +
        calculateCoverageBonus(cleanQuery, idf, RANKING_WEIGHTS.MAX_IDENTIFIER_COVERAGE_BONUS);
      if (idfScore > matchedIdentifierScore) matchedIdentifierScore = idfScore;
    } else if (wordRegex && wordRegex.test(idf)) {
      const idfScore = RANKING_WEIGHTS.WORD_BOUNDARY_IDENTIFIER_MATCH +
        calculateCoverageBonus(cleanQuery, idf, RANKING_WEIGHTS.MAX_IDENTIFIER_COVERAGE_BONUS);
      if (idfScore > matchedIdentifierScore) matchedIdentifierScore = idfScore;
    } else if (idf.includes(cleanQuery)) {
      const idfScore = RANKING_WEIGHTS.SUBSTRING_IDENTIFIER_MATCH;
      if (idfScore > matchedIdentifierScore) matchedIdentifierScore = idfScore;
    }
  }
  score += matchedIdentifierScore;

  // -----------------------------------------------------------------
  // 3. Subtitle / Type / Categorization Evaluation
  // -----------------------------------------------------------------
  if (subtitle) {
    if (subtitle === cleanQuery) {
      score += RANKING_WEIGHTS.EXACT_SUBTITLE_MATCH;
    } else if (subtitle.startsWith(cleanQuery)) {
      score += RANKING_WEIGHTS.PREFIX_SUBTITLE_MATCH;
    } else if (subtitle.includes(cleanQuery)) {
      score += RANKING_WEIGHTS.SUBSTRING_SUBTITLE_MATCH;
    }
  }

  // -----------------------------------------------------------------
  // 4. Descriptive / Lower-Priority Fields (Notes, Message, Snippet)
  // -----------------------------------------------------------------
  let matchedDescScore = 0;
  for (const desc of descriptions) {
    if (!desc) continue;
    if (wordRegex && wordRegex.test(desc)) {
      if (RANKING_WEIGHTS.WORD_BOUNDARY_DESC_MATCH > matchedDescScore) {
        matchedDescScore = RANKING_WEIGHTS.WORD_BOUNDARY_DESC_MATCH;
      }
    } else if (desc.includes(cleanQuery)) {
      if (RANKING_WEIGHTS.SUBSTRING_DESC_MATCH > matchedDescScore) {
        matchedDescScore = RANKING_WEIGHTS.SUBSTRING_DESC_MATCH;
      }
    }
  }
  score += matchedDescScore;

  // -----------------------------------------------------------------
  // 5. Multi-Token Query Density & Cohesion
  // -----------------------------------------------------------------
  if (tokens.length > 1) {
    let tokensInTitle = 0;
    let tokensInAnyField = 0;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const tokRegex = p.tokenRegexes[i];

      const matchedTitle = (tokRegex && tokRegex.test(title)) || title.includes(tok);
      if (matchedTitle) tokensInTitle++;

      let matchedAny = matchedTitle;
      if (!matchedAny && subtitle.includes(tok)) matchedAny = true;
      if (!matchedAny && identifiers.some(id => id.includes(tok))) matchedAny = true;
      if (!matchedAny && descriptions.some(d => d.includes(tok))) matchedAny = true;

      if (matchedAny) tokensInAnyField++;
    }

    if (tokensInTitle === tokens.length) {
      score += RANKING_WEIGHTS.ALL_TOKENS_IN_TITLE;
    } else if (tokensInTitle > 0) {
      score += tokensInTitle * RANKING_WEIGHTS.TOKEN_IN_TITLE_WEIGHT;
    }

    if (tokensInAnyField === tokens.length) {
      score += RANKING_WEIGHTS.ALL_TOKENS_IN_ANY_FIELD;
    }
  }

  // -----------------------------------------------------------------
  // 6. Practical Lifecycle & Status Modifiers
  // -----------------------------------------------------------------
  if (ACTIVE_STATUSES.has(status)) {
    score += RANKING_WEIGHTS.ACTIVE_STATUS_BOOST;
  } else if (TERMINAL_STATUSES.has(status)) {
    score += RANKING_WEIGHTS.TERMINAL_STATUS_PENALTY;
  }

  if (priority === 'high' || priority === 'urgent') {
    score += RANKING_WEIGHTS.HIGH_PRIORITY_BOOST;
  }

  // -----------------------------------------------------------------
  // 7. Recency Boost
  // -----------------------------------------------------------------
  if (timestamp > 0) {
    const now = Date.now();
    const ageMs = now - timestamp;
    if (ageMs >= 0) {
      if (ageMs <= 7 * 24 * 60 * 60 * 1000) {
        score += RANKING_WEIGHTS.RECENT_7_DAYS_BOOST;
      } else if (ageMs <= 30 * 24 * 60 * 60 * 1000) {
        score += RANKING_WEIGHTS.RECENT_30_DAYS_BOOST;
      }
    }
  }

  return Math.max(1, Math.round(score));
}

/**
 * Strictly deterministic 5-tier comparator for ranking search results:
 * 1. relevanceScore DESC (Highest scored result first)
 * 2. Recency DESC (Newer/recently updated items first)
 * 3. Title ASC (Alphabetical order by title)
 * 4. Type ASC (Predictable entity type ordering)
 * 5. ID ASC (Unique tiebreaker ensuring zero random order changes)
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareRankedItems(a, b) {
  // 1. Primary: Relevance Score
  const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
  if (scoreDiff !== 0) return scoreDiff;

  // 2. Secondary: Recency
  const timeA = a.updatedAt || a.createdAt || 0;
  const timeB = b.updatedAt || b.createdAt || 0;
  if (timeB !== timeA) return timeB - timeA;

  // 3. Tertiary: Alphabetical Title
  const titleA = a.title || '';
  const titleB = b.title || '';
  const titleDiff = titleA.localeCompare(titleB);
  if (titleDiff !== 0) return titleDiff;

  // 4. Quaternary: Entity Type
  const typeA = a.type || '';
  const typeB = b.type || '';
  const typeDiff = typeA.localeCompare(typeB);
  if (typeDiff !== 0) return typeDiff;

  // 5. Quinary: Unique ID Tiebreaker (Absolute determinism)
  const idA = a.id || '';
  const idB = b.id || '';
  return idA.localeCompare(idB);
}

/**
 * Scores and deterministically sorts a collection of search candidates.
 *
 * @param {Array<object>} items
 * @param {string} query
 * @returns {Array<object>} Sorted array of items with assigned relevanceScore
 */
function rankSearchResults(items, query) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const patterns = compileQueryPatterns(query);
  for (const item of items) {
    item.relevanceScore = calculateRelevanceScore(item, query, patterns);
  }

  return items.sort(compareRankedItems);
}

module.exports = {
  RANKING_WEIGHTS,
  escapeRegExp,
  normalizeText,
  calculateCoverageBonus,
  extractSearchableFields,
  compileQueryPatterns,
  calculateRelevanceScore,
  compareRankedItems,
  rankSearchResults
};
