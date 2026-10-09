/**
 * Test Suite: Personalized Commute Recommendation Domain Models
 *
 * Verifies:
 * 1. Enum immutability and valid categories
 * 2. RecommendationReason validation and serialization
 * 3. PreferenceAlignment evaluation across full, partial, and missing preferences
 * 4. RecommendedRouteDetail extraction from diverse route shapes
 * 5. Explainable recommendation reasons (never treating raw score as sufficient explanation)
 * 6. Handling of missing optional transport data (cost, transfers, segments)
 * 7. Fallback status when no route is feasible
 * 8. Complete model serialization and domain invariants
 */

const assert = require('assert');
const {
  RECOMMENDATION_STATUS_TYPES,
  REASON_CATEGORIES,
  ALIGNMENT_LEVELS,
  RecommendationReason,
  PreferenceAlignment,
  RecommendedRouteDetail,
  PersonalizedCommuteRecommendation
} = require('../models/PersonalizedCommuteRecommendation');
const {
  DataProvenance,
  PROVENANCE_TIERS,
  TRANSPORT_MODES
} = require('../models/CommuteContracts');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const { ValidationError } = require('../errors');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

async function runRecommendationModelTests() {
  console.log('========================================================================');
  console.log(' Running Personalized Commute Recommendation Domain Model Tests');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. CONSTANTS & ENUMS
  // --------------------------------------------------------------------------
  test('Constants: enums and categories are frozen and complete', () => {
    assert.strictEqual(Object.isFrozen(RECOMMENDATION_STATUS_TYPES), true);
    assert.strictEqual(Object.isFrozen(REASON_CATEGORIES), true);
    assert.strictEqual(Object.isFrozen(ALIGNMENT_LEVELS), true);

    assert.strictEqual(RECOMMENDATION_STATUS_TYPES.RECOMMENDED, 'RECOMMENDED');
    assert.strictEqual(RECOMMENDATION_STATUS_TYPES.FALLBACK, 'FALLBACK');
    assert.strictEqual(RECOMMENDATION_STATUS_TYPES.CAUTION, 'CAUTION');
    assert.strictEqual(RECOMMENDATION_STATUS_TYPES.INFEASIBLE, 'INFEASIBLE');

    assert.strictEqual(REASON_CATEGORIES.SCHEDULE_DEADLINE, 'SCHEDULE_DEADLINE');
    assert.strictEqual(REASON_CATEGORIES.DISRUPTION_AVOIDANCE, 'DISRUPTION_AVOIDANCE');
    assert.strictEqual(REASON_CATEGORIES.PREFERENCE_MATCH, 'PREFERENCE_MATCH');
    assert.strictEqual(REASON_CATEGORIES.FALLBACK_GUIDANCE, 'FALLBACK_GUIDANCE');
  });

  // --------------------------------------------------------------------------
  // 2. RECOMMENDATION REASON DOMAIN MODEL
  // --------------------------------------------------------------------------
  test('RecommendationReason: valid creation and serialization', () => {
    const reason = new RecommendationReason({
      category: REASON_CATEGORIES.SCHEDULE_DEADLINE,
      headline: 'Arrives 15 minutes before 09:00 lecture',
      detail: 'Estimated arrival at 08:45 allows a reliable 15-minute buffer on campus.',
      priority: 1,
      dataTier: PROVENANCE_TIERS.VERIFIED
    });

    assert.strictEqual(reason.category, 'SCHEDULE_DEADLINE');
    assert.strictEqual(reason.priority, 1);
    assert.strictEqual(reason.dataTier, 'VERIFIED');

    const json = reason.toJSON();
    assert.strictEqual(json.headline, 'Arrives 15 minutes before 09:00 lecture');
    assert.strictEqual(json.dataTier, 'VERIFIED');
  });

  test('RecommendationReason: validation fails on missing required fields', () => {
    assert.throws(() => {
      new RecommendationReason({ headline: '' });
    }, ValidationError);

    assert.throws(() => {
      new RecommendationReason({ headline: 'Valid', detail: '' });
    }, ValidationError);
  });

  // --------------------------------------------------------------------------
  // 3. PREFERENCE ALIGNMENT DOMAIN MODEL
  // --------------------------------------------------------------------------
  test('PreferenceAlignment: evaluates strong alignment when all student preferences match', () => {
    const route = {
      primaryMode: 'train',
      modesIncluded: ['train', 'walk'],
      walkingTimeMinutes: 8,
      transfers: 0,
      estimatedCostRupees: 15
    };

    const preferences = {
      preferredModes: ['train', 'metro'],
      avoidModes: ['auto'],
      walkingToleranceMinutes: 15,
      maxBudgetRupees: 50,
      maxTransfers: 1
    };

    const alignment = PreferenceAlignment.evaluate(route, preferences);

    assert.strictEqual(alignment.hasPreferences, true);
    assert.strictEqual(alignment.isAligned, true);
    assert.strictEqual(alignment.overallAlignment, 'EXCELLENT');
    assert.deepStrictEqual(alignment.preferredModesMatched, ['train']);
    assert.deepStrictEqual(alignment.avoidedModesPresent, []);
    assert.strictEqual(alignment.isWalkingCompliant, true);
    assert.strictEqual(alignment.isBudgetCompliant, true);
    assert.strictEqual(alignment.isTransferCompliant, true);
    assert.ok(alignment.matchedCriteria.length >= 3);
    assert.strictEqual(alignment.unmatchedCriteria.length, 0);

    const json = alignment.toJSON();
    assert.strictEqual(json.isAligned, true);
    assert.strictEqual(json.overallAlignment, 'EXCELLENT');
  });

  test('PreferenceAlignment: safe evaluation when student preferences are null, undefined, or empty', () => {
    const route = {
      primaryMode: 'walk',
      walkingTimeMinutes: 12,
      transfers: 0,
      estimatedCostRupees: 0
    };

    const alignNull = PreferenceAlignment.evaluate(route, null);
    assert.strictEqual(alignNull.hasPreferences, false);
    assert.strictEqual(alignNull.isAligned, true);
    assert.strictEqual(alignNull.overallAlignment, 'NEUTRAL');
    assert.strictEqual(alignNull.walkingMinutes, 12);
    assert.strictEqual(alignNull.transferCount, 0);
    assert.strictEqual(alignNull.estimatedCostRupees, 0);

    const alignEmpty = PreferenceAlignment.evaluate(route, {});
    assert.strictEqual(alignEmpty.hasPreferences, false);
    assert.strictEqual(alignEmpty.isAligned, true);
    assert.strictEqual(alignEmpty.overallAlignment, 'NEUTRAL');
  });

  test('PreferenceAlignment: detects violations and flags POOR alignment', () => {
    const route = {
      primaryMode: 'auto',
      modesIncluded: ['auto'],
      walkingTimeMinutes: 25,
      transfers: 2,
      estimatedCostRupees: 120
    };

    const preferences = {
      preferredModes: ['train', 'metro'],
      avoidModes: ['auto'],
      walkingToleranceMinutes: 10,
      maxBudgetRupees: 50,
      maxTransfers: 1
    };

    const alignment = PreferenceAlignment.evaluate(route, preferences);

    assert.strictEqual(alignment.hasPreferences, true);
    assert.strictEqual(alignment.isAligned, false);
    assert.strictEqual(alignment.overallAlignment, 'POOR');
    assert.ok(alignment.avoidedModesPresent.includes('auto'));
    assert.strictEqual(alignment.isWalkingCompliant, false);
    assert.strictEqual(alignment.isBudgetCompliant, false);
    assert.strictEqual(alignment.isTransferCompliant, false);
    assert.ok(alignment.unmatchedCriteria.length >= 3);
  });

  test('PreferenceAlignment: handles snake_case database model properties seamlessly', () => {
    const route = {
      modesIncluded: ['metro', 'bus'],
      walkingTimeMinutes: 6,
      transferCount: 1,
      estimatedCostRupees: 30
    };

    const dbPref = {
      preferred_modes: ['metro', 'bus'],
      avoid_modes: ['auto'],
      walking_tolerance_minutes: 20,
      max_budget_rupees: 100,
      max_transfers: 2
    };

    const alignment = PreferenceAlignment.evaluate(route, dbPref);
    assert.strictEqual(alignment.hasPreferences, true);
    assert.strictEqual(alignment.isAligned, true);
    assert.strictEqual(alignment.isWalkingCompliant, true);
    assert.strictEqual(alignment.isBudgetCompliant, true);
    assert.strictEqual(alignment.isTransferCompliant, true);
  });

  // --------------------------------------------------------------------------
  // 4. RECOMMENDED ROUTE DETAIL
  // --------------------------------------------------------------------------
  test('RecommendedRouteDetail: builds from candidate object with full and partial metrics', () => {
    const rawCandidate = {
      id: 'journey-wr-fast-01',
      origin: 'Borivali',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:15',
      updatedArrivalTime: '08:52',
      totalTravelTime: 37,
      baselineDuration: 32,
      additionalDisruptionDelay: 5,
      waitingTime: 4,
      walkingTime: 6,
      transitTime: 27,
      numberOfTransfers: 1,
      estimatedCost: 20,
      reliability: 'MODERATE',
      uncertainty: 'LOW',
      primaryMode: 'train',
      modesIncluded: ['train', 'walk'],
      deterministicScore: 84.5,
      scoreBreakdown: { travelTimeScore: 30, reliabilityScore: 22 },
      strengths: ['Fast transit connection', 'Low walking fatigue'],
      weaknesses: ['Minor corridor congestion (+5 min)'],
      provenance: DataProvenance.verified('Western Railway GTFS', 'Suburban schedule').toJSON()
    };

    const detail = RecommendedRouteDetail.fromRoute(rawCandidate);

    assert.strictEqual(detail.journeyId, 'journey-wr-fast-01');
    assert.strictEqual(detail.origin, 'Borivali');
    assert.strictEqual(detail.estimatedArrivalTime, '08:52');
    assert.strictEqual(detail.totalTravelTimeMinutes, 37);
    assert.strictEqual(detail.baselineDurationMinutes, 32);
    assert.strictEqual(detail.expectedDisruptionDelayMinutes, 5);
    assert.strictEqual(detail.estimatedCostRupees, 20);
    assert.strictEqual(detail.transfers, 1);
    assert.strictEqual(detail.deterministicScore, 84.5);
    assert.strictEqual(detail.provenance.sourceTier, 'VERIFIED');

    const json = detail.toJSON();
    assert.strictEqual(json.journeyId, 'journey-wr-fast-01');
    assert.strictEqual(json.totalTravelTimeMinutes, 37);
    assert.deepStrictEqual(json.strengths, ['Fast transit connection', 'Low walking fatigue']);
  });

  test('RecommendedRouteDetail: handles missing cost and missing score gracefully', () => {
    const minimalCandidate = {
      id: 'journey-walk-direct',
      origin: 'Vile Parle West',
      destination: 'DJSCE',
      departureTime: '08:40',
      estimatedArrivalTime: '08:55',
      totalDurationMinutes: 15,
      walkingTimeMinutes: 15,
      primaryMode: 'walk'
    };

    const detail = RecommendedRouteDetail.fromRoute(minimalCandidate);

    assert.strictEqual(detail.journeyId, 'journey-walk-direct');
    assert.strictEqual(detail.estimatedCostRupees, null);
    assert.strictEqual(detail.deterministicScore, null);
    assert.strictEqual(detail.scoreBreakdown, null);
    assert.strictEqual(detail.transfers, 0);
    assert.strictEqual(detail.expectedDisruptionDelayMinutes, 0);
  });

  // --------------------------------------------------------------------------
  // 5. PERSONALIZED COMMUTE RECOMMENDATION
  // --------------------------------------------------------------------------
  test('PersonalizedCommuteRecommendation: constructs rich recommendation with explainable reasons', () => {
    const route = {
      id: 'cand-metro-01',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:10',
      updatedArrivalTime: '08:35',
      totalTravelTime: 25,
      walkingTime: 5,
      numberOfTransfers: 0,
      estimatedCost: 15,
      additionalDisruptionDelay: 0,
      reliability: 'LOW',
      primaryMode: 'metro',
      modesIncluded: ['metro', 'walk'],
      deterministicScore: 92,
      provenance: DataProvenance.verified('Mumbai Metro One', 'Line 1 schedule').toJSON()
    };

    const alternative = {
      id: 'cand-bus-01',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:05',
      updatedArrivalTime: '08:45',
      totalTravelTime: 40,
      walkingTime: 8,
      numberOfTransfers: 0,
      estimatedCost: 10,
      primaryMode: 'bus',
      provenance: DataProvenance.estimated('BEST Bus Timetable').toJSON()
    };

    const preferences = {
      preferredModes: ['metro'],
      walkingToleranceMinutes: 15,
      maxBudgetRupees: 50
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(route, {
      alternatives: [alternative],
      preferences,
      targetArrivalTime: '08:50',
      context: { weatherContext: { condition: 'clear' } }
    });

    assert.strictEqual(rec.status, 'RECOMMENDED');
    assert.strictEqual(rec.isFallback, false);
    assert.strictEqual(rec.isActionable(), true);
    assert.strictEqual(rec.hasAlternatives(), true);
    assert.strictEqual(rec.alternativeRoutes.length, 1);
    assert.strictEqual(rec.estimatedTravelTimeMinutes, 25);
    assert.strictEqual(rec.estimatedArrivalTime, '08:35');
    assert.strictEqual(rec.expectedDisruptionDelayMinutes, 0);
    assert.strictEqual(rec.estimatedCostRupees, 15);
    assert.strictEqual(rec.isPreferenceAligned(), true);

    // Explainable reasons: must contain real-world context, NOT raw score alone
    assert.ok(rec.recommendationReasons.length >= 2, 'Must have multiple explainable reasons');
    const reasonsText = rec.recommendationReasons.map(r => `${r.headline}: ${r.detail}`).join(' ');

    assert.ok(!reasonsText.includes('92/100'), 'Must not treat raw composite score as the explanation');
    assert.ok(reasonsText.toLowerCase().includes('08:35') || reasonsText.toLowerCase().includes('target deadline'), 'Explains schedule advantage');
    assert.ok(reasonsText.toLowerCase().includes('clear') || reasonsText.toLowerCase().includes('disruption'), 'Explains disruption status');
    assert.ok(reasonsText.toLowerCase().includes('preferred') || reasonsText.toLowerCase().includes('metro'), 'Explains preference match');

    // Serialization test
    const json = rec.toJSON();
    assert.strictEqual(json.status, 'RECOMMENDED');
    assert.strictEqual(json.isFallback, false);
    assert.strictEqual(json.selectedRoute.journeyId, 'cand-metro-01');
    assert.strictEqual(json.alternativeRoutes.length, 1);
    assert.strictEqual(json.preferenceAlignment.isAligned, true);
    assert.ok(Array.isArray(json.recommendationReasons));
    assert.ok(Array.isArray(json.tradeOffs));
  });

  // --------------------------------------------------------------------------
  // 6. CAUTION AND DISRUPTED STATUS
  // --------------------------------------------------------------------------
  test('PersonalizedCommuteRecommendation: elevates status to CAUTION when disruption delay is severe', () => {
    const disruptedRoute = {
      id: 'cand-train-delay',
      origin: 'Bandra',
      destination: 'DJSCE',
      departureTime: '08:00',
      updatedArrivalTime: '08:55',
      totalTravelTime: 55,
      additionalDisruptionDelay: 25, // 25 min delay
      reliability: 'SEVERE',
      primaryMode: 'train',
      provenance: DataProvenance.userReported('Commuter Report', 'OHE wire breakdown').toJSON()
    };

    const rec = PersonalizedCommuteRecommendation.fromEvaluatedRoute(disruptedRoute, {
      context: { weatherContext: { condition: 'heavy_rain' } }
    });

    assert.strictEqual(rec.status, 'CAUTION');
    assert.strictEqual(rec.expectedDisruptionDelayMinutes, 25);
    assert.strictEqual(rec.hasWarnings(), true);
    assert.ok(rec.warnings.some(w => w.includes('25 minutes')));
    assert.ok(rec.warnings.some(w => w.includes('heavy_rain')));
  });

  // --------------------------------------------------------------------------
  // 7. FALLBACK STATUS WHEN NO ROUTE IS FEASIBLE
  // --------------------------------------------------------------------------
  test('PersonalizedCommuteRecommendation: creates honest fallback status when no route is feasible', () => {
    const fallbackRec = PersonalizedCommuteRecommendation.createFallback({
      reason: 'All candidate routes to D.J. Sanghvi arrive after 08:30 deadline under current Western Railway suspensions.',
      guidance: [
        'Consider leaving 20 minutes earlier at 07:40.',
        'Consider taking an auto-rickshaw to Metro Line 1 as a road alternative.'
      ],
      studentPreferences: {
        preferredModes: ['train'],
        maxWalkingMinutes: 10
      },
      context: {
        activeDisruptionsCount: 2,
        weatherCondition: 'severe'
      }
    });

    assert.strictEqual(fallbackRec.status, 'FALLBACK');
    assert.strictEqual(fallbackRec.isFallback, true);
    assert.strictEqual(fallbackRec.isActionable(), false);
    assert.strictEqual(fallbackRec.selectedRoute, null);
    assert.strictEqual(fallbackRec.alternativeRoutes.length, 0);
    assert.strictEqual(fallbackRec.estimatedTravelTimeMinutes, null);
    assert.strictEqual(fallbackRec.estimatedArrivalTime, null);
    assert.strictEqual(fallbackRec.departureTime, null);
    assert.strictEqual(fallbackRec.fallbackGuidance.length, 2);
    assert.ok(fallbackRec.fallbackReason.includes('Western Railway suspensions'));

    assert.strictEqual(fallbackRec.recommendationReasons.length, 1);
    assert.strictEqual(fallbackRec.recommendationReasons[0].category, 'FALLBACK_GUIDANCE');

    const json = fallbackRec.toJSON();
    assert.strictEqual(json.status, 'FALLBACK');
    assert.strictEqual(json.isFallback, true);
    assert.strictEqual(json.selectedRoute, null);
    assert.strictEqual(json.fallbackGuidance.length, 2);
  });

  // --------------------------------------------------------------------------
  // 8. VALIDATION INVARIANTS
  // --------------------------------------------------------------------------
  test('PersonalizedCommuteRecommendation: throws ValidationError when required fields are missing', () => {
    assert.throws(() => {
      new PersonalizedCommuteRecommendation({});
    }, ValidationError);

    assert.throws(() => {
      PersonalizedCommuteRecommendation.fromEvaluatedRoute(null);
    }, ValidationError);
  });

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRecommendationModelTests();
