/**
 * Unit & Integration Tests for SafeCommuteExplanationAdapter
 *
 * Verifies:
 * 1. Valid AI output: Natural language enhanced without altering underlying deterministic metrics.
 * 2. Invalid output rejection:
 *    - Malformed JSON / missing fields
 *    - Hallucinated travel duration
 *    - False "fastest" claims when route is not fastest
 *    - Fabricated exact fares when cost is null
 *    - False "verified" claims for synthetic data
 *    - False "0 transfers" claims when route has transfers
 * 3. Timeout fallback: Bounded timeout triggers clean fallback to deterministic explanation.
 * 4. Provider error fallback: Network / HTTP 500 errors fall back gracefully without unhandled exceptions.
 * 5. Missing credentials: Unconfigured providers fall back immediately without network calls.
 * 6. Privacy-safe payload builder: Scrubs door numbers, GPS coordinates, student IDs, and tokens.
 * 7. Deterministic authority: Route selection, scores, and feasibility remain 100% authoritative.
 * 8. Pipeline integration: PersonalizedRouteRecommendationService integrates safely with adapter.
 */

const assert = require('node:assert/strict');
const {
  SafeCommuteExplanationAdapter,
  MockAiCommuteExplanationProvider,
  GeminiCommuteExplanationProvider,
  DeterministicCommuteExplanationProvider,
  buildPrivacySafePromptPayload,
  validateAiExplanationOutput,
  sanitizeCoarseArea,
  AI_FALLBACK_REASONS
} = require('../services/safeCommuteExplanationAdapter');
const {
  RecommendationExplanationService
} = require('../services/recommendationExplanationService');
const {
  PersonalizedRouteRecommendationService
} = require('../services/personalizedRouteRecommendationService');
const {
  PersonalizedRecommendationExplanation
} = require('../models/PersonalizedRecommendationExplanation');
const {
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Safe Commute Explanation Adapter Unit & Integration Tests');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // Helper factory for mock primary route
  function createMockRoute(overrides = {}) {
    const id = overrides.id || overrides.journeyId || 'route-metro-fast';
    const departureTime = overrides.departureTime || '08:00';
    const duration = overrides.totalTravelTimeMinutes ?? 25;
    const estimatedArrivalTime = overrides.estimatedArrivalTime || '08:25';

    return {
      journeyId: id,
      id,
      origin: overrides.origin || 'Andheri West',
      destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
      departureTime,
      estimatedArrivalTime,
      totalTravelTimeMinutes: duration,
      totalDurationMinutes: duration,
      walkingTimeMinutes: overrides.walkingTimeMinutes ?? 5,
      transfers: overrides.transfers ?? 0,
      numberOfTransfers: overrides.transfers ?? 0,
      estimatedCostRupees: overrides.estimatedCostRupees !== undefined ? overrides.estimatedCostRupees : 20,
      expectedDisruptionDelayMinutes: overrides.expectedDisruptionDelayMinutes ?? 0,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
      reliability: overrides.reliability || 'LOW',
      affectedSegments: overrides.affectedSegments || [],
      provenance: overrides.provenance || DataProvenance.verified('Official Metro Feed').toJSON()
    };
  }

  const explanationService = new RecommendationExplanationService();

  // 1. Valid AI Output Enhancement
  await test('1. Valid AI output enhances natural language while strictly preserving underlying metrics', async () => {
    const primaryRoute = createMockRoute({
      totalTravelTimeMinutes: 25,
      departureTime: '08:00',
      estimatedArrivalTime: '08:25',
      transfers: 0,
      estimatedCostRupees: 20
    });
    const deterministicExpl = explanationService.explainRecommendation({
      primaryRoute,
      targetArrivalTime: '09:00'
    });

    const mockProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Take the Metro Line 2A for a direct 25-minute journey arriving comfortably before your deadline.',
        selectionReason: 'This route was selected because it avoids street-level traffic, takes only 25 minutes, and requires 0 transfers.',
        tradeOffSummary: 'Fastest transit option with minimal walking.',
        disruptionSummary: 'Operating on clear corridors.',
        uncertaintySummary: 'Grounded in published timetables.'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: mockProvider });
    const enhanced = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.ok(enhanced instanceof PersonalizedRecommendationExplanation);
    assert.strictEqual(enhanced.summary, 'Take the Metro Line 2A for a direct 25-minute journey arriving comfortably before your deadline.');
    assert.strictEqual(enhanced.selectionReason, 'This route was selected because it avoids street-level traffic, takes only 25 minutes, and requires 0 transfers.');
    // Underlying metrics must remain bit-for-bit identical to ground truth
    assert.strictEqual(enhanced.timingExplanation.travelTimeMinutes, 25);
    assert.strictEqual(enhanced.timingExplanation.departureTime, '08:00');
    assert.strictEqual(enhanced.timingExplanation.estimatedArrivalTime, '08:25');
    assert.strictEqual(enhanced.timingExplanation.marginMinutes, 35);
    assert.ok(enhanced.aiMetadata);
    assert.strictEqual(enhanced.aiMetadata.isAiEnhanced, true);
    assert.strictEqual(enhanced.aiMetadata.validationPassed, true);
    assert.strictEqual(enhanced.aiMetadata.fallbackReason, null);
  });

  // 2A. Invalid Output: Malformed JSON or missing fields
  await test('2A. Rejects malformed output / missing fields and falls back to deterministic explanation', async () => {
    const primaryRoute = createMockRoute();
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute });

    const brokenProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        // Missing summary and selectionReason!
        somethingElse: 'invalid'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: brokenProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.summary, deterministicExpl.summary);
    assert.strictEqual(result.selectionReason, deterministicExpl.selectionReason);
    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.VALIDATION_FAILED);
    assert.strictEqual(result.aiMetadata.validationPassed, false);
  });

  // 2B. Invalid Output: Hallucinated Duration
  await test('2B. Rejects hallucinated travel duration and falls back to deterministic explanation', async () => {
    const primaryRoute = createMockRoute({ totalTravelTimeMinutes: 25 });
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute });

    const hallucinatingProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Take the bus for a 55 minutes commute across town.', // Hallucinates 55m when route is 25m!
        selectionReason: 'Offers a 55 minutes ride with comfortable seats.'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: hallucinatingProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.summary, deterministicExpl.summary, 'Must retain deterministic summary');
    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.VALIDATION_FAILED);
  });

  // 2C. Invalid Output: False "Fastest" Claim
  await test('2C. Rejects false "fastest" claim when alternative route is actually faster', async () => {
    const primaryRoute = createMockRoute({ id: 'primary-bus', totalTravelTimeMinutes: 40 });
    const fasterAlt = createMockRoute({ id: 'alt-metro', totalTravelTimeMinutes: 20 });
    const deterministicExpl = explanationService.explainRecommendation({
      primaryRoute,
      alternatives: [fasterAlt]
    });

    const deceptiveProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Recommended as the fastest route connecting your area in 40 minutes.', // Primary is NOT fastest!
        selectionReason: 'This route delivers the fastest travel time among options.'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: deceptiveProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute, alternativeRoutes: [fasterAlt] },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.summary, deterministicExpl.summary);
    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.VALIDATION_FAILED);
  });

  // 2D. Invalid Output: Fabricated Exact Fare when Cost is Null
  await test('2D. Rejects fabricated exact fare when transit cost is unmetered or null', async () => {
    const autoRoute = createMockRoute({ estimatedCostRupees: null }); // Unmetered fare
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute: autoRoute });

    const fabricatingCostProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Take auto to campus with an exact fare of ₹85.', // Fabricated exact fare!
        selectionReason: 'Selected for direct door-to-door convenience costing exactly ₹85.'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: fabricatingCostProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: autoRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.VALIDATION_FAILED);
  });

  // 2E. Invalid Output: False "Verified" Claim for Synthetic Data
  await test('2E. Rejects false claim that synthetic data is officially verified live GPS', async () => {
    const synthRoute = createMockRoute({
      provenance: DataProvenance.synthetic('Synthetic Commuter Planner').toJSON()
    });
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute: synthRoute });

    const upgradingProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Route backed by officially verified live GPS tracking data.', // False claim on synthetic data!
        selectionReason: 'Selected using verified live transit feeds.'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: upgradingProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: synthRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.VALIDATION_FAILED);
  });

  // 2F. Invalid Output: False "0 Transfers" Claim
  await test('2F. Rejects false "0 transfers" claim when route requires transfers', async () => {
    const transferRoute = createMockRoute({ transfers: 2 });
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute: transferRoute });

    const inaccurateTransferProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Enjoy a direct non-stop journey with 0 transfers to college.', // False! Route has 2 transfers!
        selectionReason: 'Direct connection without modal changes.'
      }
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: inaccurateTransferProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: transferRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.VALIDATION_FAILED);
  });

  // 3. Timeout Fallback
  await test('3. Bounded timeout triggers clean fallback to deterministic explanation', async () => {
    const primaryRoute = createMockRoute();
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute });

    // Mock provider with delay exceeding bounded timeout
    const hangingProvider = new MockAiCommuteExplanationProvider({
      delayMs: 300 // Exceeds 50ms timeout
    });

    const adapter = new SafeCommuteExplanationAdapter({
      provider: hangingProvider,
      timeoutMs: 50 // Short bounded timeout for test
    });

    const startTime = Date.now();
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed < 200, `Execution should finish within bounded timeout window (took ${elapsed}ms)`);
    assert.strictEqual(result.summary, deterministicExpl.summary);
    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.TIMEOUT);
  });

  // 4. Provider Error Fallback
  await test('4. Provider network/HTTP error falls back safely without unhandled exception', async () => {
    const primaryRoute = createMockRoute();
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute });

    const failingProvider = new MockAiCommuteExplanationProvider({
      shouldFail: true,
      errorMessage: 'Remote API returned HTTP 503 Service Unavailable'
    });

    const adapter = new SafeCommuteExplanationAdapter({ provider: failingProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.summary, deterministicExpl.summary);
    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.PROVIDER_ERROR);
  });

  // 5. Missing Credentials Handling
  await test('5. Unconfigured provider falls back immediately without network calls', async () => {
    const primaryRoute = createMockRoute();
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute });

    // Gemini provider with empty API key
    const unconfiguredGemini = new GeminiCommuteExplanationProvider({ apiKey: '' });
    assert.strictEqual(unconfiguredGemini.isConfigured(), false);

    const adapter = new SafeCommuteExplanationAdapter({ provider: unconfiguredGemini });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.strictEqual(result.summary, deterministicExpl.summary);
    assert.strictEqual(result.aiMetadata.isAiEnhanced, false);
    assert.strictEqual(result.aiMetadata.fallbackReason, AI_FALLBACK_REASONS.MISSING_CREDENTIALS);
  });

  // 6. Privacy-Safe Payload Builder
  await test('6. Privacy-safe payload builder scrubs door numbers, GPS coordinates, student IDs, and tokens', () => {
    const rawRoute = {
      journeyId: 'j-privacy-test',
      origin: 'Flat 402, Building 7, Room 12, 19.1234, 72.8361, Andheri West, 400058',
      destination: 'Room 302, D.J. Sanghvi College of Engineering',
      totalTravelTimeMinutes: 28,
      departureTime: '08:00',
      estimatedArrivalTime: '08:28',
      transfers: 1,
      walkingTimeMinutes: 6,
      estimatedCostRupees: 20
    };

    const recommendation = {
      studentId: 'student-secret-uuid-9999',
      userToken: 'bearer-secret-token-abcdef',
      selectedRoute: rawRoute,
      alternativeRoutes: []
    };

    const deterministicExpl = explanationService.explainRecommendation({
      primaryRoute: rawRoute
    });

    const payload = buildPrivacySafePromptPayload(recommendation, deterministicExpl);

    // 1. Must NOT contain sensitive IDs or tokens
    const jsonStr = JSON.stringify(payload);
    assert.ok(!jsonStr.includes('student-secret-uuid-9999'), 'Payload must not contain student ID');
    assert.ok(!jsonStr.includes('bearer-secret-token-abcdef'), 'Payload must not contain user tokens');

    // 2. Must scrub door numbers, PIN codes, and GPS coordinates
    assert.ok(!payload.originArea.includes('Flat 402'), 'Door numbers must be stripped');
    assert.ok(!payload.originArea.includes('19.1234'), 'GPS coordinates must be stripped');
    assert.ok(!payload.originArea.includes('400058'), 'PIN codes must be stripped');
    assert.ok(payload.originArea.includes('Andheri West'), 'Coarse zone must be preserved');

    // 3. Structured route metrics must be present
    assert.strictEqual(payload.primaryRoute.totalTravelTimeMinutes, 28);
    assert.strictEqual(payload.primaryRoute.transfers, 1);
    assert.strictEqual(payload.primaryRoute.estimatedCostRupees, 20);
  });

  // 7. Deterministic Authority Preserved
  await test('7. Deterministic recommendation selection, ranking, and feasibility remain 100% authoritative', async () => {
    const candMetro = {
      id: 'auth-metro',
      candidateId: 'auth-metro',
      journeyId: 'auth-metro',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      estimatedArrivalTime: '08:25',
      totalDurationMinutes: 25,
      totalTravelTimeMinutes: 25,
      walkingTimeMinutes: 5,
      transferCount: 0,
      numberOfTransfers: 0,
      estimatedCostRupees: 20,
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro'],
      isFeasible: true,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 5 },
        { type: 'TRANSIT', mode: 'metro', durationMinutes: 20 }
      ],
      baselineTravel: {
        departureTime: '08:00',
        estimatedArrivalTime: '08:25',
        durationMinutes: 25,
        walkingTimeMinutes: 5,
        transferCount: 0,
        estimatedCostRupees: 20
      },
      provenance: DataProvenance.verified('Official Metro Schedule').toJSON()
    };

    const candBus = {
      id: 'auth-bus',
      candidateId: 'auth-bus',
      journeyId: 'auth-bus',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      estimatedArrivalTime: '08:42',
      totalDurationMinutes: 42,
      totalTravelTimeMinutes: 42,
      walkingTimeMinutes: 8,
      transferCount: 1,
      numberOfTransfers: 1,
      estimatedCostRupees: 10,
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      isFeasible: true,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 8 },
        { type: 'TRANSIT', mode: 'bus', durationMinutes: 34 }
      ],
      baselineTravel: {
        departureTime: '08:00',
        estimatedArrivalTime: '08:42',
        durationMinutes: 42,
        walkingTimeMinutes: 8,
        transferCount: 1,
        estimatedCostRupees: 10
      },
      provenance: DataProvenance.verified('BEST Bus Schedule').toJSON()
    };

    const mockAiProvider = new MockAiCommuteExplanationProvider({
      mockOutput: {
        summary: 'Metro Line 2A is the optimal route taking 25 minutes without transfers.',
        selectionReason: 'Direct connection that reaches college before 09:00 AM.'
      }
    });

    const recService = new PersonalizedRouteRecommendationService({
      aiExplanationAdapter: new SafeCommuteExplanationAdapter({ provider: mockAiProvider })
    });

    const rec = await recService.getRecommendation({
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      candidates: [candMetro, candBus],
      targetArrivalTime: '09:00',
      preferences: { route_preference: 'fastest' }
    });

    // 1. Authoritative selection must remain candMetro
    assert.strictEqual(rec.selectedRoute.journeyId, 'auth-metro');
    assert.strictEqual(rec.estimatedTravelTimeMinutes, 25);
    assert.strictEqual(rec.departureTime, '08:00');
    assert.strictEqual(rec.estimatedArrivalTime, '08:25');
    assert.strictEqual(rec.isActionable(), true);

    // 2. Explanation has AI natural language attached with metadata
    assert.ok(rec.explanation);
    assert.strictEqual(rec.explanation.summary, 'Metro Line 2A is the optimal route taking 25 minutes without transfers.');
    assert.strictEqual(rec.explanation.aiMetadata.isAiEnhanced, true);
    assert.strictEqual(rec.explanation.aiMetadata.validationPassed, true);
  });

  // 8. Deterministic Commute Explanation Provider (Offline Mode)
  await test('8. Deterministic provider functions completely offline without network calls', async () => {
    const detProvider = new DeterministicCommuteExplanationProvider();
    assert.strictEqual(detProvider.isConfigured(), true);

    const primaryRoute = createMockRoute({ totalTravelTimeMinutes: 30 });
    const deterministicExpl = explanationService.explainRecommendation({ primaryRoute });

    const adapter = new SafeCommuteExplanationAdapter({ provider: detProvider });
    const result = await adapter.enhanceExplanation({
      recommendation: { selectedRoute: primaryRoute },
      deterministicExplanation: deterministicExpl
    });

    assert.ok(result instanceof PersonalizedRecommendationExplanation);
    assert.strictEqual(result.aiMetadata.provider, 'Deterministic Grounded Engine');
    assert.strictEqual(result.aiMetadata.isAiEnhanced, true);
  });

  // Run all tests
  setTimeout(() => {
    console.log('\n========================================================================');
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }, 100);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
