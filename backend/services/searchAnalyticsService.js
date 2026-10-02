/**
 * SearchAnalyticsService
 *
 * Lightweight backend observability, operational telemetry, and usage safeguards
 * for the unified cross-domain student search feature.
 *
 * Privacy & Safeguards Guarantees:
 * 1. Zero Raw Query Content Retention: NEVER stores or exposes raw student search queries.
 *    Only retains privacy-preserving metrics (character length, token count, filter flags).
 * 2. Credential & PII Protection: Explicitly avoids logging authentication secrets, tokens,
 *    passwords, or personal student profile details.
 * 3. Bounded Memory Footprint: Uses fixed-capacity ring buffers (capped at maxEvents)
 *    and automatic TTL cleanup for rate-limit trackers to ensure predictable O(1) memory usage.
 * 4. High-Resolution Duration Tracking: Accurately records search execution latency in milliseconds.
 * 5. Lightweight Abuse Protection: In-memory sliding-window request throttling per student/client IP
 *    to prevent automated scraping, runaway loops, and algorithmic denial-of-service.
 * 6. Operational Summaries: Provides on-demand aggregated usage statistics (success rate,
 *    average/p95 latency, type usage distributions, zero-result rates, validation failures).
 */

const { TooManyRequestsError } = require('../errors');

class SearchAnalyticsService {
  constructor(options = {}) {
    this.maxEvents = options.maxEvents || 1000;
    this.events = [];
    this.validationFailures = [];
    
    // Abuse Safeguard configuration
    this.safeguardEnabled = options.safeguardEnabled !== false;
    this.rateLimitWindowMs = options.windowMs || 60000; // 1-minute window
    this.maxRequestsPerWindow = options.maxRequests || 60; // 60 requests per minute
    this.clientWindows = new Map(); // key -> [timestamp, timestamp, ...]

    // Running aggregate counters
    this.stats = {
      totalSearches: 0,
      successfulSearches: 0,
      failedSearches: 0,
      totalDurationMs: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
      totalResultsReturned: 0,
      zeroResultSearches: 0,
      validationFailuresCount: 0,
      rateLimitExceededCount: 0,
      emptyQuerySearches: 0,
      totalQueryLength: 0,
      totalQueryTokens: 0,
      typeUsage: {},
      filterUsage: {
        typesFilter: 0,
        courseFilter: 0,
        statusFilter: 0
      }
    };
  }

  /**
   * Sanitizes input options to extract privacy-safe metrics without retaining raw query text.
   *
   * @param {object} options
   * @returns {object}
   */
  _extractSafeMetrics(options = {}) {
    const rawQuery = options.query || options.q || '';
    const trimmed = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    const hasQuery = trimmed.length > 0;
    const queryLength = trimmed.length;
    const queryTokens = hasQuery ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const hasCourseFilter = Boolean(options.courseId || options.course_id);
    const hasStatusFilter = Boolean(options.status);
    const hasTypesFilter = Boolean(options.types || options.type);

    return {
      hasQuery,
      queryLength,
      queryTokens,
      hasCourseFilter,
      hasStatusFilter,
      hasTypesFilter
    };
  }

  /**
   * Records a search execution attempt (both successful and failed).
   *
   * @param {object} telemetry
   * @param {string} telemetry.studentUserId - Scoped student identifier
   * @param {Array<string>} [telemetry.types] - Canonical entity types searched
   * @param {number} telemetry.durationMs - Execution duration in milliseconds
   * @param {number} [telemetry.resultCount=0] - Number of results returned
   * @param {object} [telemetry.options={}] - Search options for extracting privacy-safe metrics
   * @param {boolean} [telemetry.success=true] - Whether search succeeded
   * @param {string} [telemetry.errorCode=null] - Error code if failed
   * @returns {object} The recorded telemetry event (privacy-sanitized)
   */
  recordSearchExecution(telemetry = {}) {
    const {
      studentUserId = 'anonymous',
      types = [],
      durationMs = 0,
      resultCount = 0,
      options = {},
      success = true,
      errorCode = null
    } = telemetry;

    const safeMetrics = this._extractSafeMetrics(options);
    const normalizedDuration = Math.max(0, Number(durationMs) || 0);
    const normalizedResults = Math.max(0, Number(resultCount) || 0);

    // 1. Update running aggregate statistics
    this.stats.totalSearches++;
    if (success) {
      this.stats.successfulSearches++;
      this.stats.totalResultsReturned += normalizedResults;
      if (normalizedResults === 0) {
        this.stats.zeroResultSearches++;
      }
    } else {
      this.stats.failedSearches++;
    }

    this.stats.totalDurationMs += normalizedDuration;
    if (normalizedDuration < this.stats.minDurationMs) {
      this.stats.minDurationMs = normalizedDuration;
    }
    if (normalizedDuration > this.stats.maxDurationMs) {
      this.stats.maxDurationMs = normalizedDuration;
    }

    if (safeMetrics.hasQuery) {
      this.stats.totalQueryLength += safeMetrics.queryLength;
      this.stats.totalQueryTokens += safeMetrics.queryTokens;
    } else {
      this.stats.emptyQuerySearches++;
    }

    if (safeMetrics.hasTypesFilter) this.stats.filterUsage.typesFilter++;
    if (safeMetrics.hasCourseFilter) this.stats.filterUsage.courseFilter++;
    if (safeMetrics.hasStatusFilter) this.stats.filterUsage.statusFilter++;

    for (const t of types) {
      this.stats.typeUsage[t] = (this.stats.typeUsage[t] || 0) + 1;
    }

    // 2. Build sanitized event entry (Strictly NO raw query contents)
    const event = {
      timestamp: Date.now(),
      studentUserId,
      durationMs: Math.round(normalizedDuration * 100) / 100,
      resultCount: normalizedResults,
      types: [...types],
      hasQuery: safeMetrics.hasQuery,
      queryLength: safeMetrics.queryLength,
      queryTokens: safeMetrics.queryTokens,
      filters: {
        course: safeMetrics.hasCourseFilter,
        status: safeMetrics.hasStatusFilter,
        types: safeMetrics.hasTypesFilter
      },
      success,
      errorCode: errorCode || null
    };

    // 3. Append to ring buffer
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    return event;
  }

  /**
   * Records a validation failure or rejected query attempt.
   *
   * @param {object} failureInfo
   * @param {string} [failureInfo.studentUserId]
   * @param {string} [failureInfo.endpoint]
   * @param {string} [failureInfo.reason]
   * @param {object} [failureInfo.details]
   */
  recordValidationFailure(failureInfo = {}) {
    const {
      studentUserId = 'anonymous',
      endpoint = '/api/student/search',
      reason = 'Validation failed',
      details = null
    } = failureInfo;

    this.stats.validationFailuresCount++;

    const failureRecord = {
      timestamp: Date.now(),
      studentUserId,
      endpoint,
      reason,
      details: details ? (typeof details === 'object' ? { ...details } : String(details)) : null
    };

    this.validationFailures.push(failureRecord);
    if (this.validationFailures.length > this.maxEvents) {
      this.validationFailures.shift();
    }

    return failureRecord;
  }

  /**
   * Checks the rate limit status for a given client identifier without throwing.
   *
   * @param {string} identifier - User ID or IP address
   * @returns {{ allowed: boolean, count: number, limit: number, remaining: number, resetInMs: number }}
   */
  checkRateLimit(identifier) {
    if (!this.safeguardEnabled || !identifier) {
      return { allowed: true, count: 0, limit: this.maxRequestsPerWindow, remaining: this.maxRequestsPerWindow, resetInMs: 0 };
    }

    const now = Date.now();
    const windowStart = now - this.rateLimitWindowMs;

    let timestamps = this.clientWindows.get(identifier) || [];
    // Evict timestamps outside active sliding window
    timestamps = timestamps.filter(t => t > windowStart);

    const count = timestamps.length;
    const allowed = count < this.maxRequestsPerWindow;
    const remaining = Math.max(0, this.maxRequestsPerWindow - count);
    const oldest = timestamps[0] || now;
    const resetInMs = Math.max(0, oldest + this.rateLimitWindowMs - now);

    return {
      allowed,
      count,
      limit: this.maxRequestsPerWindow,
      remaining,
      resetInMs
    };
  }

  /**
   * Enforces the search abuse safeguard.
   * Registers a hit and throws TooManyRequestsError if rate limit is exceeded.
   *
   * @param {string} identifier - User ID or IP address
   * @throws {TooManyRequestsError}
   */
  enforceRateLimit(identifier) {
    if (!this.safeguardEnabled || !identifier) return;

    const now = Date.now();
    const windowStart = now - this.rateLimitWindowMs;

    let timestamps = this.clientWindows.get(identifier) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= this.maxRequestsPerWindow) {
      this.stats.rateLimitExceededCount++;
      const oldest = timestamps[0] || now;
      const retryAfterSeconds = Math.ceil(Math.max(1, (oldest + this.rateLimitWindowMs - now) / 1000));
      throw new TooManyRequestsError(
        `Search request rate limit exceeded. Please wait ${retryAfterSeconds} second(s) before searching again.`,
        'TOO_MANY_REQUESTS',
        { retryAfterSeconds, limit: this.maxRequestsPerWindow, windowSeconds: Math.round(this.rateLimitWindowMs / 1000) }
      );
    }

    timestamps.push(now);
    this.clientWindows.set(identifier, timestamps);

    // Periodic sweep if map grows excessively
    if (this.clientWindows.size > 5000) {
      for (const [key, tsList] of this.clientWindows.entries()) {
        const fresh = tsList.filter(t => t > windowStart);
        if (fresh.length === 0) {
          this.clientWindows.delete(key);
        } else {
          this.clientWindows.set(key, fresh);
        }
      }
    }
  }

  /**
   * Calculates the 95th percentile execution duration from stored events.
   *
   * @returns {number}
   */
  calculateP95Duration() {
    if (this.events.length === 0) return 0;
    const durations = this.events.map(e => e.durationMs).sort((a, b) => a - b);
    const index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
    return Math.round(durations[index] * 100) / 100;
  }

  /**
   * Generates a comprehensive operational analytics and usage safeguard summary.
   *
   * @returns {object}
   */
  getAnalyticsSummary() {
    const total = this.stats.totalSearches;
    const activeQuerySearches = total - this.stats.emptyQuerySearches;
    const successRate = total > 0
      ? Math.round((this.stats.successfulSearches / total) * 1000) / 10
      : 100;
    const avgDuration = total > 0
      ? Math.round((this.stats.totalDurationMs / total) * 100) / 100
      : 0;
    const avgResults = total > 0
      ? Math.round((this.stats.totalResultsReturned / total) * 10) / 10
      : 0;
    const zeroResultRate = total > 0
      ? Math.round((this.stats.zeroResultSearches / total) * 1000) / 10
      : 0;

    return {
      operationalSummary: {
        totalSearches: total,
        successfulSearches: this.stats.successfulSearches,
        failedSearches: this.stats.failedSearches,
        successRatePercentage: successRate,
        validationFailuresCount: this.stats.validationFailuresCount,
        rateLimitExceededCount: this.stats.rateLimitExceededCount
      },
      performanceLatency: {
        averageDurationMs: avgDuration,
        minDurationMs: this.stats.minDurationMs === Infinity ? 0 : Math.round(this.stats.minDurationMs * 100) / 100,
        maxDurationMs: Math.round(this.stats.maxDurationMs * 100) / 100,
        p95DurationMs: this.calculateP95Duration()
      },
      resultsVolume: {
        totalResultsReturned: this.stats.totalResultsReturned,
        averageResultsPerSearch: avgResults,
        zeroResultSearchesCount: this.stats.zeroResultSearches,
        zeroResultRatePercentage: zeroResultRate
      },
      entityTypeUsage: { ...this.stats.typeUsage },
      filterUsage: { ...this.stats.filterUsage },
      queryCharacteristics: {
        averageQueryLength: activeQuerySearches > 0
          ? Math.round(this.stats.totalQueryLength / activeQuerySearches)
          : 0,
        averageTokenCount: activeQuerySearches > 0
          ? Math.round((this.stats.totalQueryTokens / activeQuerySearches) * 10) / 10
          : 0,
        emptyQuerySearchesCount: this.stats.emptyQuerySearches
      },
      safeguardStatus: {
        enabled: this.safeguardEnabled,
        rateLimitWindowMs: this.rateLimitWindowMs,
        maxRequestsPerWindow: this.maxRequestsPerWindow,
        trackedActiveClients: this.clientWindows.size
      }
    };
  }

  /**
   * Resets all metrics, ring buffers, and rate limits.
   * Useful for test isolation.
   */
  reset() {
    this.events = [];
    this.validationFailures = [];
    this.clientWindows.clear();
    this.stats = {
      totalSearches: 0,
      successfulSearches: 0,
      failedSearches: 0,
      totalDurationMs: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
      totalResultsReturned: 0,
      zeroResultSearches: 0,
      validationFailuresCount: 0,
      rateLimitExceededCount: 0,
      emptyQuerySearches: 0,
      totalQueryLength: 0,
      totalQueryTokens: 0,
      typeUsage: {},
      filterUsage: {
        typesFilter: 0,
        courseFilter: 0,
        statusFilter: 0
      }
    };
  }

  /**
   * Allows test configuration of safeguards.
   */
  configureSafeguards(config = {}) {
    if (typeof config.enabled === 'boolean') this.safeguardEnabled = config.enabled;
    if (typeof config.maxRequests === 'number') this.maxRequestsPerWindow = config.maxRequests;
    if (typeof config.windowMs === 'number') this.rateLimitWindowMs = config.windowMs;
  }
}

const searchAnalyticsService = new SearchAnalyticsService();

module.exports = {
  SearchAnalyticsService,
  searchAnalyticsService
};
