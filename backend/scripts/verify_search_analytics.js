/**
 * Search Analytics, Telemetry & Abuse Protection Verification Suite
 *
 * Validates:
 * 1. Search execution tracking (success, failure, duration, result count, zero-results).
 * 2. Privacy preservation (zero retention of raw query text, passwords, or secrets).
 * 3. Abuse safeguards (in-memory sliding window rate limiting throwing 429 TooManyRequestsError).
 * 4. Validation failure tracking (invalid types, boundary violations).
 * 5. Aggregate metrics computation (average/p95 latency, type usage, filter distribution).
 * 6. Service-level integration with StudentSearchService.
 */

const assert = require('assert/strict');
const { searchAnalyticsService, SearchAnalyticsService } = require('../services/searchAnalyticsService');
const { studentSearchService } = require('../services/studentSearchService');
const { userRepository } = require('../repositories/UserRepository');
const { BadRequestError, TooManyRequestsError } = require('../errors');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failedTests++;
  }
}

async function run() {
  console.log('====================================================');
  console.log(' Running Search Analytics & Safeguards Test Suite');
  console.log('====================================================\n');

  searchAnalyticsService.reset();

  // -----------------------------------------------------------------
  // 1. Telemetry Recording & Privacy Safeguards
  // -----------------------------------------------------------------
  await test('Privacy Safeguard: telemetry records metadata without retaining raw query text', () => {
    const rawSensitiveQuery = 'SecretExamQuestions 2026';
    const event = searchAnalyticsService.recordSearchExecution({
      studentUserId: 'student-test-1',
      types: ['course', 'assignment'],
      durationMs: 3.5,
      resultCount: 5,
      options: { query: rawSensitiveQuery, courseId: 'c-101' },
      success: true
    });

    assert.equal(event.studentUserId, 'student-test-1');
    assert.equal(event.hasQuery, true);
    assert.equal(event.queryLength, rawSensitiveQuery.length);
    assert.equal(event.queryTokens, 2);
    assert.equal(event.filters.course, true);
    assert.equal(event.filters.status, false);
    assert.equal(event.durationMs, 3.5);
    assert.equal(event.resultCount, 5);

    // CRITICAL: Raw query text MUST NOT be in the event object
    assert.equal(event.query, undefined, 'Raw query property must not exist');
    assert.equal(event.q, undefined, 'Raw q property must not exist');
    assert.equal(JSON.stringify(event).includes(rawSensitiveQuery), false, 'Raw sensitive query string must never appear in telemetry JSON');
  });

  // -----------------------------------------------------------------
  // 2. Aggregate Metrics Tracking
  // -----------------------------------------------------------------
  await test('Aggregate Metrics: calculates totals, averages, zero-result rates and type usage', () => {
    searchAnalyticsService.reset();

    // 1st search: successful with results
    searchAnalyticsService.recordSearchExecution({
      studentUserId: 's1',
      types: ['course'],
      durationMs: 10,
      resultCount: 4,
      options: { q: 'algorithms' },
      success: true
    });

    // 2nd search: successful with 0 results
    searchAnalyticsService.recordSearchExecution({
      studentUserId: 's1',
      types: ['assignment'],
      durationMs: 20,
      resultCount: 0,
      options: { q: 'nonexistent' },
      success: true
    });

    // 3rd search: failed search
    searchAnalyticsService.recordSearchExecution({
      studentUserId: 's2',
      types: ['goal'],
      durationMs: 5,
      resultCount: 0,
      options: {},
      success: false,
      errorCode: 'FORBIDDEN'
    });

    const summary = searchAnalyticsService.getAnalyticsSummary();

    assert.equal(summary.operationalSummary.totalSearches, 3);
    assert.equal(summary.operationalSummary.successfulSearches, 2);
    assert.equal(summary.operationalSummary.failedSearches, 1);
    assert.equal(summary.operationalSummary.successRatePercentage, 66.7);

    assert.equal(summary.resultsVolume.totalResultsReturned, 4);
    assert.equal(summary.resultsVolume.zeroResultSearchesCount, 1);
    assert.equal(summary.resultsVolume.zeroResultRatePercentage, 33.3);

    // Performance metrics
    assert.equal(summary.performanceLatency.minDurationMs, 5);
    assert.equal(summary.performanceLatency.maxDurationMs, 20);
    assert.equal(summary.performanceLatency.averageDurationMs, 11.67);
    assert.ok(summary.performanceLatency.p95DurationMs > 0);

    // Type usage
    assert.equal(summary.entityTypeUsage.course, 1);
    assert.equal(summary.entityTypeUsage.assignment, 1);
    assert.equal(summary.entityTypeUsage.goal, 1);
  });

  // -----------------------------------------------------------------
  // 3. Validation Failure Recording
  // -----------------------------------------------------------------
  await test('Validation Failures: records rejected queries with sanitized failure reason', () => {
    searchAnalyticsService.reset();

    searchAnalyticsService.recordValidationFailure({
      studentUserId: 'student-99',
      endpoint: '/api/student/search',
      reason: "Invalid search entity type 'bogus_type'",
      details: { rejectedType: 'bogus_type' }
    });

    assert.equal(searchAnalyticsService.validationFailures.length, 1);
    const failure = searchAnalyticsService.validationFailures[0];
    assert.equal(failure.studentUserId, 'student-99');
    assert.equal(failure.endpoint, '/api/student/search');
    assert.equal(failure.reason, "Invalid search entity type 'bogus_type'");

    const summary = searchAnalyticsService.getAnalyticsSummary();
    assert.equal(summary.operationalSummary.validationFailuresCount, 1);
  });

  // -----------------------------------------------------------------
  // 4. Abuse Protection & Rate Limiting Safeguards
  // -----------------------------------------------------------------
  await test('Abuse Safeguard: sliding-window rate limiter allows normal requests and rejects excessive bursts with 429', () => {
    const testLimiter = new SearchAnalyticsService({
      maxRequests: 3,
      windowMs: 5000 // 5 seconds
    });

    const clientId = 'abusive-bot-client';

    // 1st request -> allowed
    assert.doesNotThrow(() => testLimiter.enforceRateLimit(clientId));
    const status1 = testLimiter.checkRateLimit(clientId);
    assert.equal(status1.remaining, 2);

    // 2nd request -> allowed
    assert.doesNotThrow(() => testLimiter.enforceRateLimit(clientId));

    // 3rd request -> allowed (limit reached)
    assert.doesNotThrow(() => testLimiter.enforceRateLimit(clientId));
    const status3 = testLimiter.checkRateLimit(clientId);
    assert.equal(status3.remaining, 0);

    // 4th request -> MUST throw TooManyRequestsError (429)
    assert.throws(
      () => testLimiter.enforceRateLimit(clientId),
      (err) => {
        assert.ok(err instanceof TooManyRequestsError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'TOO_MANY_REQUESTS');
        assert.ok(err.details.retryAfterSeconds >= 1);
        return true;
      }
    );

    // Rate limit exceeded count is recorded in analytics
    const summary = testLimiter.getAnalyticsSummary();
    assert.equal(summary.operationalSummary.rateLimitExceededCount, 1);
  });

  // -----------------------------------------------------------------
  // 5. Service-Level Integration with StudentSearchService
  // -----------------------------------------------------------------
  await test('Service Integration: StudentSearchService automatically records telemetry across queries and errors', () => {
    searchAnalyticsService.reset();

    const suffix = Date.now().toString(36);
    const testUser = userRepository.create({
      email: `search_obs_${suffix}@example.com`,
      password: 'Password123!',
      full_name: `Obs User ${suffix}`,
      role: 'student',
      college_name: 'DJSCE'
    });

    // 1. Empty query search execution
    const resEmpty = studentSearchService.search(testUser.id, testUser, { query: '' });
    assert.equal(resEmpty.total, 0);

    // 2. Normal search execution
    const resNormal = studentSearchService.search(testUser.id, testUser, { query: 'test query' });
    assert.equal(typeof resNormal.executionDurationMs, 'number');
    assert.ok(resNormal.executionDurationMs >= 0);

    // 3. Validation failure execution (invalid type)
    assert.throws(
      () => studentSearchService.search(testUser.id, testUser, { query: 'test', types: 'invalid_type_xyz' }),
      BadRequestError
    );

    // Verify analytics summary captured all operations
    const summary = studentSearchService.getAnalyticsSummary();
    assert.equal(summary.operationalSummary.totalSearches, 3, 'Should record all 3 search attempts');
    assert.equal(summary.operationalSummary.successfulSearches, 2, '2 successful searches');
    assert.equal(summary.operationalSummary.failedSearches, 1, '1 failed search');
    assert.equal(summary.operationalSummary.validationFailuresCount, 1, '1 validation failure');
    assert.equal(summary.queryCharacteristics.emptyQuerySearchesCount, 1, '1 empty query search');
    assert.ok(summary.performanceLatency.averageDurationMs >= 0);
  });

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log(` SEARCH ANALYTICS VERIFICATION: ${passedTests} passed, ${failedTests} failed`);
  console.log('----------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error running search analytics verification:', err);
  process.exit(1);
});
