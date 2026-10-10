/**
 * Verification Suite: Commute Personalization & Uncertainty Details
 *
 * Verifies that recommendation outputs transparently expose:
 * - Preferences applied
 * - Academic schedule context used
 * - Major factors guiding route selection
 * - Important route trade-offs
 * - Missing or stale data warnings
 * - 4-tier provenance of relevant information
 * - Qualitative uncertainty indicators based on available evidence (NO percentages)
 * - Audit details on whether AI-assisted or deterministic explanations were used
 *
 * Scenarios Tested:
 * 1. Missing context (graceful handling, DEFAULT preferences, NONE schedule context)
 * 2. Academic schedule context applied (class timing, punctuality buffer, major factors)
 * 3. Exam day schedule context (elevated 20-min buffer, exam indicator)
 * 4. Mixed provenance (VERIFIED timetable + USER_REPORTED delay + ESTIMATED walking)
 * 5. Synthetic data handled safely (never mislabeled as verified, flags hasSyntheticData)
 * 6. Stale information detection (disruptions >2h old, traffic >60m old)
 * 7. Missing data distinction (missing fare != unsafe/unavailable route)
 * 8. Absence of numerical confidence percentages (qualitative uncertainty levels only)
 * 9. Honest live feed status (hasLiveGps: false, no false live tracking claims)
 * 10. AI fallback explanation audit (TIMEOUT, PROVIDER_ERROR, MISSING_CREDENTIALS)
 * 11. AI enhanced explanation audit (AI_ASSISTED mode, provider transparency)
 * 12. Privacy safeguards (no auth tokens, other student IDs, or raw scoring internals)
 * 13. API contract integration (HTTP POST /api/commute/recommendations backward compatibility)
 * 14. Fallback response serialization (when no route meets constraints)
 */

const assert = require('assert');
const http = require('http');
const {
  PersonalizedCommuteRecommendation,
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');
const {
  personalizationUncertaintyService,
  personalizedRouteRecommendationService,
  RecommendationExplanationService,
  DepartureAdviceService,
  SafeCommuteExplanationAdapter,
  MockAiCommuteExplanationProvider,
  DeterministicCommuteExplanationProvider
} = require('../services');
const { createApp } = require('../app');
const { signToken } = require('../utils/token');

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    testsFailed++;
  }
}

function makeEvaluatedRoute(overrides = {}) {
  return {
    journeyId: 'journey-metro-01',
    id: 'journey-metro-01',
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College of Engineering',
    departureTime: '08:15',
    estimatedArrivalTime: '08:42',
    totalTravelTimeMinutes: 27,
    walkingTimeMinutes: 6,
    transfers: 0,
    estimatedCostRupees: 20,
    expectedDisruptionDelayMinutes: 0,
    reliability: 'LOW',
    uncertainty: 'LOW',
    primaryMode: 'metro',
    modesIncluded: ['metro', 'walk'],
    deterministicScore: 92,
    provenance: DataProvenance.verified('Mumbai Metro One', 'Line 1 Schedule').toJSON(),
    ...overrides
  };
}

function makeAlternativeRoute(overrides = {}) {
  return {
    journeyId: 'journey-bus-02',
    id: 'journey-bus-02',
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College of Engineering',
    departureTime: '08:10',
    estimatedArrivalTime: '08:46',
    totalTravelTimeMinutes: 36,
    walkingTimeMinutes: 10,
    transfers: 1,
    estimatedCostRupees: 15,
    expectedDisruptionDelayMinutes: 5,
    reliability: 'MODERATE',
    uncertainty: 'MODERATE',
    primaryMode: 'bus',
    modesIncluded: ['bus', 'walk'],
    deterministicScore: 78,
    provenance: DataProvenance.estimated('BEST Bus Timetable', 'Scheduled Headway').toJSON(),
    ...overrides
  };
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' Running Commute Personalization & Uncertainty Details Test Suite');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Missing context
  // --------------------------------------------------------------------------
  await test('1. Missing context handles absent schedule and preferences with sensible defaults', () => {
    const primary = makeEvaluatedRoute();
    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      preferences: null,
      context: {}
    });

    assert.strictEqual(rec.status, 'RECOMMENDED');
    assert.strictEqual(rec.isFallback, false);

    // Schedule Context
    assert.strictEqual(rec.scheduleContextUsed.hasScheduleContext, false);
    assert.strictEqual(rec.scheduleContextUsed.source, 'NONE');
    assert.strictEqual(rec.scheduleContextUsed.eventTitle, null);
    assert.strictEqual(rec.scheduleContextUsed.bufferMinutes, 0);

    // Preferences Applied
    assert.strictEqual(rec.preferencesApplied.source, 'DEFAULT');
    assert.strictEqual(rec.preferencesApplied.routePreference, 'balanced');
    assert.strictEqual(rec.preferencesApplied.preferredModes.length, 0);

    // Major Factors
    assert.ok(Array.isArray(rec.majorFactors));
    assert.ok(rec.majorFactors.length > 0);
    assert.ok(rec.majorFactors.some(f => f.factor === 'FEWER_TRANSFERS'));

    const json = rec.toJSON();
    assert.strictEqual(json.scheduleContextUsed.hasScheduleContext, false);
    assert.strictEqual(json.preferencesApplied.source, 'DEFAULT');
    assert.ok(Array.isArray(json.majorFactors));
  });

  // --------------------------------------------------------------------------
  // TEST 2: Applied academic schedule context
  // --------------------------------------------------------------------------
  await test('2. Academic schedule context exposes lecture start time, buffer, and punctuality factor', () => {
    const primary = makeEvaluatedRoute();
    const academicContext = {
      hasAcademicContext: true,
      eventTitle: 'Operating Systems Lecture',
      eventStartTime: '09:00',
      location: 'D.J. Sanghvi College of Engineering',
      isDestinationMatched: true,
      isExamDay: false,
      scheduleConflicts: []
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      preferences: { preferredModes: ['metro'], routePreference: 'fastest' },
      context: { academicContext },
      targetArrivalTime: '08:50'
    });

    assert.strictEqual(rec.scheduleContextUsed.hasScheduleContext, true);
    assert.strictEqual(rec.scheduleContextUsed.source, 'ACADEMIC_EVENT');
    assert.strictEqual(rec.scheduleContextUsed.eventTitle, 'Operating Systems Lecture');
    assert.strictEqual(rec.scheduleContextUsed.eventStartTime, '09:00');
    assert.strictEqual(rec.scheduleContextUsed.bufferMinutes, 10);
    assert.strictEqual(rec.scheduleContextUsed.isExamDay, false);
    assert.strictEqual(rec.scheduleContextUsed.hasScheduleConflict, false);

    // Preferences
    assert.strictEqual(rec.preferencesApplied.source, 'EXPLICIT_INPUT');
    assert.strictEqual(rec.preferencesApplied.routePreference, 'fastest');
    assert.deepStrictEqual(rec.preferencesApplied.preferredModes, ['metro']);

    // Major factors must include SCHEDULE_ALIGNMENT
    assert.ok(rec.majorFactors.some(f => f.factor === 'SCHEDULE_ALIGNMENT'));
    assert.ok(rec.majorFactors.some(f => f.factor === 'PREFERRED_MODE'));
  });

  // --------------------------------------------------------------------------
  // TEST 3: Exam day schedule context
  // --------------------------------------------------------------------------
  await test('3. Exam day context enforces elevated 20-minute buffer and reflects exam status', () => {
    const primary = makeEvaluatedRoute();
    const academicContext = {
      hasAcademicContext: true,
      eventTitle: 'Database Systems Midterm Examination',
      eventStartTime: '09:00',
      location: 'D.J. Sanghvi College of Engineering',
      isDestinationMatched: true,
      isExamDay: true,
      scheduleConflicts: []
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      context: { academicContext }
    });

    assert.strictEqual(rec.scheduleContextUsed.isExamDay, true);
    assert.strictEqual(rec.scheduleContextUsed.bufferMinutes, 20);
    assert.ok(rec.scheduleContextUsed.summary.includes('20-minute punctuality buffer'));
  });

  // --------------------------------------------------------------------------
  // TEST 4: Mixed provenance tracking
  // --------------------------------------------------------------------------
  await test('4. Mixed provenance tracks distinct tiers (VERIFIED, USER_REPORTED, ESTIMATED) without conflation', () => {
    const primary = makeEvaluatedRoute({
      expectedDisruptionDelayMinutes: 10,
      provenance: DataProvenance.verified('Mumbai Metro One', 'Line 1 Schedule').toJSON()
    });
    const alt = makeAlternativeRoute({
      provenance: DataProvenance.userReported('Commuter Alert Channel').toJSON()
    });

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      alternatives: [alt],
      context: {}
    });

    const prov = rec.dataQualityAndUncertainty.provenanceSummary;
    assert.ok(prov.dataTiers.includes('VERIFIED'));
    assert.ok(prov.dataTiers.includes('USER_REPORTED'));
    assert.ok(prov.dataTiers.includes('ESTIMATED'));
    assert.strictEqual(prov.allVerified, false);
    assert.strictEqual(prov.hasUnverifiedData, true);
    assert.strictEqual(prov.hasUserReportedData, true);

    const breakdown = rec.dataQualityAndUncertainty.provenanceBreakdown;
    assert.strictEqual(breakdown.schedules.tier, 'VERIFIED');
    assert.strictEqual(breakdown.disruptions.tier, 'USER_REPORTED');
    assert.strictEqual(breakdown.fares.tier, 'VERIFIED');
    assert.strictEqual(breakdown.traffic.tier, 'ESTIMATED');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Synthetic data handling
  // --------------------------------------------------------------------------
  await test('5. Synthetic data flags hasSyntheticData and never treats synthetic candidates as verified', () => {
    const syntheticPrimary = makeEvaluatedRoute({
      provenance: DataProvenance.synthetic('Synthetic Commute Benchmark Planner').toJSON()
    });

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(syntheticPrimary, {
      context: {}
    });

    assert.strictEqual(rec.dataQualityAndUncertainty.hasSyntheticData, true);
    assert.strictEqual(rec.dataQualityAndUncertainty.provenanceSummary.allVerified, false);
    assert.strictEqual(rec.dataQualityAndUncertainty.provenanceSummary.overallTier, 'SYNTHETIC');

    // Warning must be generated
    const warnings = rec.dataQualityAndUncertainty.dataQualityWarnings;
    assert.ok(warnings.some(w => w.toLowerCase().includes('synthetic simulation data')));
    assert.ok(warnings.some(w => w.toLowerCase().includes('not been verified against live')));
  });

  // --------------------------------------------------------------------------
  // TEST 6: Stale information detection
  // --------------------------------------------------------------------------
  await test('6. Stale information detection flags stale disruptions (>2h) and traffic (>1h)', () => {
    const primary = makeEvaluatedRoute();
    const now = Date.now();

    const staleDisruption = {
      id: 'disr-stale-01',
      affectedArea: 'Western Railway Borivali Line',
      updatedAt: now - (3 * 60 * 60 * 1000), // 3 hours ago (> 2h threshold)
      status: 'active'
    };

    const staleTraffic = {
      corridor: 'SV Road Andheri Junction',
      timestamp: now - (90 * 60 * 1000), // 90 minutes ago (> 60m threshold)
      level: 'moderate'
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      context: {
        disruptions: [staleDisruption],
        trafficConditions: [staleTraffic]
      },
      currentTime: now
    });

    assert.strictEqual(rec.dataQualityAndUncertainty.hasStaleData, true);
    const warnings = rec.dataQualityAndUncertainty.dataQualityWarnings;
    assert.ok(warnings.some(w => w.includes('updated over 2 hours ago and may be stale')));
    assert.ok(warnings.some(w => w.includes('older than 60 minutes and may not reflect current flow')));
  });

  // --------------------------------------------------------------------------
  // TEST 7: Missing data vs unsafe/unavailable route distinction
  // --------------------------------------------------------------------------
  await test('7. Missing data (unmetered fare) is clearly distinguished from an unavailable or unsafe route', () => {
    const unmeteredPrimary = makeEvaluatedRoute({
      estimatedCostRupees: null
    });

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(unmeteredPrimary, {
      context: {}
    });

    assert.strictEqual(rec.dataQualityAndUncertainty.hasMissingData, true);
    assert.strictEqual(rec.isActionable(), true, 'Route must remain actionable despite missing fare data');

    const warnings = rec.dataQualityAndUncertainty.dataQualityWarnings;
    assert.ok(warnings.some(w => w.includes('Fare estimate is unavailable or unmetered')));
    assert.ok(warnings.some(w => w.includes('does NOT indicate the transit service is closed, unsafe, or non-operational')));

    // Explicit missingDataNotice
    const notice = rec.dataQualityAndUncertainty.missingDataNotice;
    assert.ok(notice.includes('represent information gaps and do NOT signify that the route is unsafe, closed, or out of service'));
  });

  // --------------------------------------------------------------------------
  // TEST 8: Absence of numerical confidence percentages
  // --------------------------------------------------------------------------
  await test('8. Qualitative uncertainty indicators strictly forbid numerical confidence percentages', () => {
    const primary = makeEvaluatedRoute({
      expectedDisruptionDelayMinutes: 12
    });

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      context: { weatherContext: { condition: 'rain' } }
    });

    const uncertainty = rec.dataQualityAndUncertainty;
    assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(uncertainty.uncertaintyLevel));

    // Stringify and inspect entire payload for illegal numerical confidence percentages (e.g. "85%", "0.92 confidence")
    const serialized = JSON.stringify(uncertainty);
    const hasPercent = /\b\d{1,3}%\b/.test(serialized);
    assert.strictEqual(hasPercent, false, 'Must never generate percentage confidence strings');

    const indicators = uncertainty.indicators;
    assert.ok(Array.isArray(indicators));
    assert.ok(indicators.length > 0);
    indicators.forEach(ind => {
      assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(ind.severity));
      assert.strictEqual(typeof ind.type, 'string');
      assert.strictEqual(typeof ind.description, 'string');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 9: Honest live feed status (no false live tracking claims)
  // --------------------------------------------------------------------------
  await test('9. Live feed status explicitly states absence of real-time GPS telemetry', () => {
    const primary = makeEvaluatedRoute();
    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary);

    const liveFeed = rec.dataQualityAndUncertainty.liveFeedStatus;
    assert.strictEqual(liveFeed.hasLiveGps, false);
    assert.strictEqual(liveFeed.trackingMode, 'STATIC_TIMETABLE_AND_REPORTS');
    assert.ok(liveFeed.statement.includes('Real-time vehicle GPS tracking is not available'));
    assert.ok(liveFeed.statement.includes('published timetables'));
  });

  // --------------------------------------------------------------------------
  // TEST 10: AI fallback explanation audit
  // --------------------------------------------------------------------------
  await test('10. AI fallback explanation audit accurately captures fallback mode and reason', () => {
    const explanationService = new RecommendationExplanationService();
    const primary = makeEvaluatedRoute();
    const explanation = explanationService.explainRecommendation({ primaryRoute: primary, alternatives: [] });

    // Simulate fallback metadata from SafeCommuteExplanationAdapter
    explanation.aiMetadata = {
      isAiEnhanced: false,
      provider: 'Deterministic Grounded Engine',
      model: null,
      confidence: 'high',
      fallbackReason: 'TIMEOUT',
      validationPassed: true
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      explanation
    });

    const audit = rec.explanationAudit;
    assert.strictEqual(audit.mode, 'DETERMINISTIC');
    assert.strictEqual(audit.isAiEnhanced, false);
    assert.strictEqual(audit.fallbackOccurred, true);
    assert.strictEqual(audit.fallbackReason, 'TIMEOUT');
    assert.strictEqual(audit.validationPassed, true);
    assert.ok(audit.statement.includes('AI fallback: TIMEOUT'));
  });

  // --------------------------------------------------------------------------
  // TEST 11: AI enhanced explanation audit
  // --------------------------------------------------------------------------
  await test('11. AI enhanced explanation audit confirms AI_ASSISTED mode and provider', () => {
    const explanationService = new RecommendationExplanationService();
    const primary = makeEvaluatedRoute();
    const explanation = explanationService.explainRecommendation({ primaryRoute: primary, alternatives: [] });

    explanation.aiMetadata = {
      isAiEnhanced: true,
      provider: 'Gemini (gemini-2.5-flash)',
      model: 'gemini-2.5-flash',
      confidence: 'high',
      fallbackReason: null,
      validationPassed: true
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      explanation
    });

    const audit = rec.explanationAudit;
    assert.strictEqual(audit.mode, 'AI_ASSISTED');
    assert.strictEqual(audit.isAiEnhanced, true);
    assert.strictEqual(audit.provider, 'Gemini (gemini-2.5-flash)');
    assert.strictEqual(audit.fallbackOccurred, false);
    assert.strictEqual(audit.fallbackReason, null);
    assert.ok(audit.statement.includes('AI-assisted natural language explanation generated'));
  });

  // --------------------------------------------------------------------------
  // TEST 12: Privacy safeguards and no internal leakage
  // --------------------------------------------------------------------------
  await test('12. Privacy safeguards prevent exposure of sensitive scoring internals or other student data', () => {
    const primary = makeEvaluatedRoute();
    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(primary, {
      studentId: 'student-curr-01',
      preferences: { preferredModes: ['train'] },
      context: { studentContext: { studentId: 'student-curr-01' } }
    });

    const json = rec.toJSON();
    const serialized = JSON.stringify(json);

    // Invariants:
    // 1. Never leak raw scoring multipliers/weights
    assert.strictEqual(serialized.includes('scoreMultipliers'), false);
    assert.strictEqual(serialized.includes('weightVector'), false);
    assert.strictEqual(serialized.includes('costFunctionWeights'), false);

    // 2. Never leak sensitive credentials
    assert.strictEqual(serialized.includes('geminiApiKey'), false);
    assert.strictEqual(serialized.includes('jwtSecret'), false);
    assert.strictEqual(serialized.includes('password_hash'), false);

    // 3. Never leak other student IDs
    assert.strictEqual(serialized.includes('student-other-99'), false);
  });

  // --------------------------------------------------------------------------
  // TEST 13: HTTP POST /api/commute/recommendations backward compatibility
  // --------------------------------------------------------------------------
  await test('13. HTTP POST /api/commute/recommendations returns personalization details and uncertainty fields', async () => {
    const app = createApp();
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    const studentUser = {
      id: 'student-uncertainty-test',
      email: 'uncertainty@djsanghvi.edu',
      role: 'student'
    };
    const token = signToken({ sub: studentUser.id, email: studentUser.email, role: studentUser.role });

    try {
      const payload = JSON.stringify({
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:15',
        targetArrivalTime: '08:50',
        routePreference: 'fastest',
        preferredModes: ['metro'],
        maxWalkingMinutes: 15
      });

      const response = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/api/commute/recommendations',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${token}`
          }
        }, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });

      assert.strictEqual(response.statusCode, 200);
      const resData = response.body.data || response.body;

      // Backward compatibility assertions
      assert.strictEqual(resData.hasFeasibleRoute, true);
      assert.ok(resData.primaryRecommendedRoute);
      assert.ok(Array.isArray(resData.meaningfulAlternatives));
      assert.ok(resData.preferenceAlignment);
      assert.ok(Array.isArray(resData.recommendationReasons));
      assert.ok(Array.isArray(resData.routeTradeOffs));
      assert.ok(resData.provenance);

      // New personalization & uncertainty fields
      assert.ok(resData.personalizationDetails, 'Must include personalizationDetails');
      assert.ok(resData.dataQualityAndUncertainty, 'Must include dataQualityAndUncertainty');
      assert.ok(resData.preferencesApplied, 'Must include preferencesApplied');
      assert.ok(resData.scheduleContextUsed, 'Must include scheduleContextUsed');
      assert.ok(Array.isArray(resData.majorFactors), 'Must include majorFactors array');
      assert.ok(Array.isArray(resData.dataQualityWarnings), 'Must include dataQualityWarnings array');
      assert.ok(resData.uncertaintyDetails, 'Must include uncertaintyDetails');
      assert.ok(resData.explanationAudit, 'Must include explanationAudit');

      // Quality & Live-feed checks
      assert.strictEqual(resData.dataQualityAndUncertainty.liveFeedStatus.hasLiveGps, false);
      assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(resData.dataQualityAndUncertainty.uncertaintyLevel));
      assert.ok(['AI_ASSISTED', 'DETERMINISTIC'].includes(resData.explanationAudit.mode));
      assert.strictEqual(typeof resData.explanationAudit.isAiEnhanced, 'boolean');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // --------------------------------------------------------------------------
  // TEST 14: Fallback response serialization
  // --------------------------------------------------------------------------
  await test('14. Fallback response serializes complete personalization and data quality fields', () => {
    const fallback = PersonalizedCommuteRecommendation.createFallback({
      reason: 'No feasible routes found meeting 08:00 AM deadline under active corridor suspensions.',
      guidance: ['Consider leaving 15 minutes earlier.'],
      studentPreferences: { preferredModes: ['train'], maxWalkingMinutes: 5 }
    });

    const json = fallback.toJSON();
    assert.strictEqual(json.status, 'FALLBACK');
    assert.strictEqual(json.isFallback, true);
    assert.strictEqual(json.selectedRoute, null);

    // Fallback fields present
    assert.ok(json.personalizationDetails);
    assert.ok(json.dataQualityAndUncertainty);
    assert.strictEqual(json.dataQualityAndUncertainty.uncertaintyLevel, 'SEVERE');
    assert.ok(json.explanationAudit);
    assert.strictEqual(json.explanationAudit.mode, 'DETERMINISTIC');
    assert.ok(json.majorFactors.length > 0);
    assert.ok(json.dataQualityWarnings.length > 0);
  });

  console.log('\n========================================================================');
  console.log(` RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('========================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
