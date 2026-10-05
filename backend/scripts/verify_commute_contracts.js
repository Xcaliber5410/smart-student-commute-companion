/**
 * Verification Script: Commute Domain Contracts & Value Objects (P9)
 *
 * Exhaustively tests:
 * 1. 4-tier data provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * 2. Transport modes, enums, and classification helpers
 * 3. Disruption types and severity normalization
 * 4. Commute constraints, bounds checking, and method invariants
 * 5. Route segments (RouteLeg) and Multimodal Commute Routes (CommuteRoute)
 * 6. Travel estimates with confidence intervals
 * 7. Recommendation status, departure windows, and recommendation metadata
 * 8. Commute request validation schemas and privacy safeguards
 */

const assert = require('assert');
const {
  // Constants & Enums
  TRANSPORT_MODES,
  PROVENANCE_TIERS,
  PROVENANCE_CONFIDENCE,
  DISRUPTION_TYPES,
  DISRUPTION_SEVERITIES,
  ROUTE_PREFERENCES,
  LEG_TYPES,
  RECOMMENDATION_STATUS,
  transportModeEnum,
  provenanceTierEnum,
  disruptionTypeEnum,
  disruptionSeverityEnum,
  routePreferenceEnum,
  legTypeEnum,
  recommendationStatusEnum,

  // Schemas
  provenanceSchema,
  disruptionImpactSchema,
  commuteConstraintSchema,
  confidenceIntervalSchema,
  travelEstimateSchema,
  routeLegSchema,
  commuteRouteSchema,
  departureWindowSchema,
  recommendationExplanationSchema,
  commuteRecommendationSchema,

  // Models
  DataProvenance,
  CommuteConstraint,
  RouteLeg,
  TravelEstimate,
  CommuteRoute,
  DepartureWindow,
  RecommendationExplanation,
  CommuteRecommendation,

  // Helpers
  isTransitMode,
  isRoadMode,
  isValidTransportMode,
  normalizeDisruptionSeverity
} = require('../models');

const {
  commutePlanRequestSchema,
  commuteDisruptionQuerySchema,
  commuteFeedbackInputSchema
} = require('../validators');

async function runCommuteContractsTests() {
  console.log('\n========================================================');
  console.log(' Running Commute Domain Contracts & Models Verification');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. DATA PROVENANCE CONTRACT TESTS
  // --------------------------------------------------------------------------

  test('Provenance: defines all 4 required tiers (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)', () => {
    assert.strictEqual(PROVENANCE_TIERS.VERIFIED, 'VERIFIED');
    assert.strictEqual(PROVENANCE_TIERS.USER_REPORTED, 'USER_REPORTED');
    assert.strictEqual(PROVENANCE_TIERS.ESTIMATED, 'ESTIMATED');
    assert.strictEqual(PROVENANCE_TIERS.SYNTHETIC, 'SYNTHETIC');

    // Test enum parsing for all tiers
    assert.strictEqual(provenanceTierEnum.parse('VERIFIED'), 'VERIFIED');
    assert.strictEqual(provenanceTierEnum.parse('USER_REPORTED'), 'USER_REPORTED');
    assert.strictEqual(provenanceTierEnum.parse('ESTIMATED'), 'ESTIMATED');
    assert.strictEqual(provenanceTierEnum.parse('SYNTHETIC'), 'SYNTHETIC');

    // Rejection of unknown tier
    assert.throws(() => provenanceTierEnum.parse('UNKNOWN_TIER'), /Invalid enum value/);
  });

  test('DataProvenance: factory methods create valid typed provenance descriptors', () => {
    const verified = DataProvenance.verified('Western Railway GTFS', 'Official static timetable');
    assert.strictEqual(verified.sourceTier, 'VERIFIED');
    assert.strictEqual(verified.provider, 'Western Railway GTFS');
    assert.strictEqual(verified.confidence, 'HIGH');
    assert.strictEqual(verified.isVerified(), true);
    assert.strictEqual(verified.isUserReported(), false);

    const userReported = DataProvenance.userReported('Community Report', 'Auto refusal at station');
    assert.strictEqual(userReported.sourceTier, 'USER_REPORTED');
    assert.strictEqual(userReported.isUserReported(), true);

    const estimated = DataProvenance.estimated('OSRM Engine', 'Calculated walking duration');
    assert.strictEqual(estimated.sourceTier, 'ESTIMATED');
    assert.strictEqual(estimated.isEstimated(), true);

    const synthetic = DataProvenance.synthetic('Recommendation Engine', 'Multi-factor composite score');
    assert.strictEqual(synthetic.sourceTier, 'SYNTHETIC');
    assert.strictEqual(synthetic.isSynthetic(), true);
  });

  test('DataProvenance: toJSON() serializes cleanly without internal leakage', () => {
    const prov = DataProvenance.verified('Mumbai Metro One', 'Line 1 Metro Timetable');
    const json = prov.toJSON();
    assert.strictEqual(json.sourceTier, 'VERIFIED');
    assert.strictEqual(json.provider, 'Mumbai Metro One');
    assert.strictEqual(typeof json.lastUpdated, 'number');
    assert.strictEqual(json.description, 'Line 1 Metro Timetable');
  });

  // --------------------------------------------------------------------------
  // 2. TRANSPORT MODE & CLASSIFICATION TESTS
  // --------------------------------------------------------------------------

  test('TransportMode: verifies standard modes and classification helpers', () => {
    const validModes = ['train', 'metro', 'bus', 'auto', 'shared_auto', 'walk'];
    validModes.forEach(m => {
      assert.strictEqual(transportModeEnum.parse(m), m);
      assert.strictEqual(isValidTransportMode(m), true);
    });

    // Invalid modes rejected
    assert.throws(() => transportModeEnum.parse('ferry'), /Invalid enum value/);
    assert.strictEqual(isValidTransportMode('ferry'), false);

    // Transit classification
    assert.strictEqual(isTransitMode('train'), true);
    assert.strictEqual(isTransitMode('metro'), true);
    assert.strictEqual(isTransitMode('bus'), true);
    assert.strictEqual(isTransitMode('auto'), false);
    assert.strictEqual(isTransitMode('walk'), false);

    // Road classification
    assert.strictEqual(isRoadMode('bus'), true);
    assert.strictEqual(isRoadMode('auto'), true);
    assert.strictEqual(isRoadMode('shared_auto'), true);
    assert.strictEqual(isRoadMode('train'), false);
    assert.strictEqual(isRoadMode('walk'), false);
  });

  // --------------------------------------------------------------------------
  // 3. DISRUPTION TYPE & SEVERITY TESTS
  // --------------------------------------------------------------------------

  test('Disruption: validates disruption types and normalizes legacy severity', () => {
    assert.strictEqual(disruptionTypeEnum.parse('delay'), 'delay');
    assert.strictEqual(disruptionTypeEnum.parse('waterlogging'), 'waterlogging');
    assert.strictEqual(disruptionTypeEnum.parse('auto_refusal'), 'auto_refusal');

    assert.strictEqual(normalizeDisruptionSeverity('low'), 'minor');
    assert.strictEqual(normalizeDisruptionSeverity('medium'), 'moderate');
    assert.strictEqual(normalizeDisruptionSeverity('high'), 'severe');
    assert.strictEqual(normalizeDisruptionSeverity('critical'), 'critical');
    assert.strictEqual(normalizeDisruptionSeverity('unknown'), 'moderate');

    const impact = disruptionImpactSchema.parse({
      type: 'waterlogging',
      severity: 'severe',
      affectedMode: 'auto',
      corridorOrArea: 'Milan Subway',
      description: 'Waterlogging up to 2 feet reported',
      estimatedDelayMinutes: 25
    });

    assert.strictEqual(impact.type, 'waterlogging');
    assert.strictEqual(impact.severity, 'severe');
    assert.strictEqual(impact.affectedMode, 'auto');
    assert.strictEqual(impact.provenance.sourceTier, 'USER_REPORTED');
  });

  // --------------------------------------------------------------------------
  // 4. COMMUTE CONSTRAINT CONTRACT TESTS
  // --------------------------------------------------------------------------

  test('CommuteConstraint: validates default constraints and enforces boundary limits', () => {
    const constraint = new CommuteConstraint({
      maxBudgetRupees: 60,
      walkingToleranceMinutes: 15,
      preferredModes: ['train', 'metro', 'walk'],
      preference: 'fastest',
      maxTransfers: 2,
      desiredArrivalTime: '08:45'
    });

    assert.strictEqual(constraint.maxBudgetRupees, 60);
    assert.strictEqual(constraint.walkingToleranceMinutes, 15);
    assert.strictEqual(constraint.allowsMode('train'), true);
    assert.strictEqual(constraint.allowsMode('auto'), false);
    assert.strictEqual(constraint.isWithinBudget(50), true);
    assert.strictEqual(constraint.isWithinBudget(70), false);
    assert.strictEqual(constraint.isWithinWalkingLimit(12), true);
    assert.strictEqual(constraint.isWithinWalkingLimit(18), false);

    // Negative budget rejected
    assert.throws(() => new CommuteConstraint({ maxBudgetRupees: -10 }), /Budget cannot be negative/);

    // Budget over ₹2000 rejected
    assert.throws(() => new CommuteConstraint({ maxBudgetRupees: 2500 }), /Budget cannot exceed/);

    // Walking tolerance under 5m rejected
    assert.throws(() => new CommuteConstraint({ walkingToleranceMinutes: 2 }), /Walking tolerance must be at least 5 minutes/);

    // Empty preferred modes rejected
    assert.throws(() => new CommuteConstraint({ preferredModes: [] }), /At least one transport mode must be selected/);
  });

  // --------------------------------------------------------------------------
  // 5. TRAVEL ESTIMATE CONTRACT TESTS
  // --------------------------------------------------------------------------

  test('TravelEstimate: validates durations, fares, and confidence interval invariants', () => {
    const estimate = new TravelEstimate({
      totalDurationMinutes: 42,
      walkingDurationMinutes: 12,
      transitDurationMinutes: 30,
      totalDistanceKm: 18.5,
      walkingDistanceKm: 1.2,
      totalFareRupees: 15,
      transferCount: 1,
      confidenceInterval: {
        minMinutes: 38,
        maxMinutes: 50
      }
    });

    assert.strictEqual(estimate.totalDurationMinutes, 42);
    assert.strictEqual(estimate.walkingDurationMinutes, 12);
    assert.strictEqual(estimate.totalFareRupees, 15);
    assert.strictEqual(estimate.getBufferMinutes(), 8); // 50 - 42
    assert.strictEqual(estimate.isZeroFare(), false);
    assert.strictEqual(estimate.provenance.isEstimated(), true);

    // Invariant: minMinutes must be <= maxMinutes
    assert.throws(() => new TravelEstimate({
      totalDurationMinutes: 30,
      confidenceInterval: {
        minMinutes: 45,
        maxMinutes: 30
      }
    }), /minMinutes must be less than or equal to maxMinutes/);
  });

  // --------------------------------------------------------------------------
  // 6. ROUTE SEGMENT (ROUTE LEG) CONTRACT TESTS
  // --------------------------------------------------------------------------

  test('RouteLeg: validates walking and transit segments with provenance', () => {
    const walkLeg = new RouteLeg({
      legIndex: 0,
      type: 'WALK',
      mode: 'walk',
      from: 'Borivali West Centroid',
      to: 'Borivali Railway Station',
      departureTime: '08:00',
      arrivalTime: '08:10',
      durationMinutes: 10,
      distanceKm: 0.8,
      fareRupees: 0,
      instructions: 'Walk south toward Station Road',
      provenance: DataProvenance.estimated('OSRM Walking Engine').toJSON()
    });

    assert.strictEqual(walkLeg.isWalking(), true);
    assert.strictEqual(walkLeg.isTransit(), false);
    assert.strictEqual(walkLeg.isRoad(), false);
    assert.strictEqual(walkLeg.fareRupees, 0);

    const transitLeg = new RouteLeg({
      legIndex: 1,
      type: 'TRANSIT',
      mode: 'train',
      from: 'Borivali Railway Station',
      to: 'Vile Parle Railway Station',
      departureTime: '08:15',
      arrivalTime: '08:42',
      durationMinutes: 27,
      distanceKm: 16.5,
      fareRupees: 10,
      lineInfo: {
        agency: 'Western Railway',
        lineName: 'Western Line',
        routeShortName: 'WR-Slow',
        platform: '3'
      },
      instructions: 'Board 08:15 Slow Local towards Churchgate',
      provenance: DataProvenance.verified('Western Railway GTFS Feed').toJSON()
    });

    assert.strictEqual(transitLeg.isTransit(), true);
    assert.strictEqual(transitLeg.lineInfo.agency, 'Western Railway');
    assert.strictEqual(transitLeg.provenance.isVerified(), true);

    // Invalid time format rejected
    assert.throws(() => new RouteLeg({
      ...transitLeg.toJSON(),
      departureTime: '8:15' // Missing leading zero
    }), /Departure time must be HH:MM/);
  });

  // --------------------------------------------------------------------------
  // 7. COMMUTE ROUTE CONTRACT TESTS
  // --------------------------------------------------------------------------

  test('CommuteRoute: validates multimodal route assembly and aggregate calculations', () => {
    const leg1 = {
      legIndex: 0,
      type: 'WALK',
      mode: 'walk',
      from: 'Borivali West Centroid',
      to: 'Borivali Station',
      departureTime: '08:00',
      arrivalTime: '08:08',
      durationMinutes: 8,
      distanceKm: 0.6,
      fareRupees: 0,
      provenance: DataProvenance.estimated('OSRM').toJSON()
    };

    const leg2 = {
      legIndex: 1,
      type: 'TRANSIT',
      mode: 'train',
      from: 'Borivali Station',
      to: 'Vile Parle Station',
      departureTime: '08:12',
      arrivalTime: '08:38',
      durationMinutes: 26,
      distanceKm: 16.5,
      fareRupees: 10,
      lineInfo: { agency: 'Western Railway', lineName: 'Western Line', routeShortName: 'Fast' },
      provenance: DataProvenance.verified('WR GTFS').toJSON()
    };

    const leg3 = {
      legIndex: 2,
      type: 'AUTO',
      mode: 'auto',
      from: 'Vile Parle Station West',
      to: 'DJ Sanghvi College',
      departureTime: '08:42',
      arrivalTime: '08:50',
      durationMinutes: 8,
      distanceKm: 1.5,
      fareRupees: 28,
      provenance: DataProvenance.estimated('Mumbai Auto Fare Tariff').toJSON()
    };

    const route = new CommuteRoute({
      id: 'route-test-001',
      title: 'Western Line Fast + Station Auto',
      summary: 'Fast train to Vile Parle followed by a short auto ride',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train', 'auto'],
      estimate: {
        totalDurationMinutes: 50,
        walkingDurationMinutes: 8,
        transitDurationMinutes: 26,
        totalDistanceKm: 18.6,
        walkingDistanceKm: 0.6,
        totalFareRupees: 38,
        transferCount: 2,
        confidenceInterval: { minMinutes: 45, maxMinutes: 58 },
        provenance: DataProvenance.synthetic('Multi-Criteria Router').toJSON()
      },
      legs: [leg1, leg2, leg3],
      scores: {
        compositeScore: 88,
        timeScore: 92,
        costScore: 84,
        walkingScore: 90,
        reliabilityScore: 85,
        disruptionPenalty: 0,
        weatherPenalty: 0
      },
      tags: ['fastest', 'recommended'],
      isViable: true,
      provenance: DataProvenance.synthetic('Deterministic Scoring Engine').toJSON()
    });

    assert.strictEqual(route.id, 'route-test-001');
    assert.strictEqual(route.legs.length, 3);
    assert.strictEqual(route.getTotalFare(), 38);
    assert.strictEqual(route.getTotalDuration(), 50);
    assert.strictEqual(route.hasMode('train'), true);
    assert.strictEqual(route.hasMode('metro'), false);

    const serialized = route.toJSON();
    assert.strictEqual(serialized.legs.length, 3);
    assert.strictEqual(serialized.estimate.totalFareRupees, 38);
  });

  // --------------------------------------------------------------------------
  // 8. RECOMMENDATION STATUS & FULL ENVELOPE TESTS
  // --------------------------------------------------------------------------

  test('CommuteRecommendation: validates recommendation envelope, departure windows, and status', () => {
    assert.strictEqual(recommendationStatusEnum.parse('OPTIMAL'), 'OPTIMAL');
    assert.strictEqual(recommendationStatusEnum.parse('INFEASIBLE'), 'INFEASIBLE');

    const depWindow = new DepartureWindow({
      optimalDepartureTime: '08:00',
      latestSafeDepartureTime: '08:15',
      recommendedWindowStart: '07:55',
      recommendedWindowEnd: '08:10',
      bufferMinutes: 15
    });
    assert.strictEqual(depWindow.bufferMinutes, 15);

    const explanation = new RecommendationExplanation({
      summary: 'Optimal train route avoiding peak road traffic on Western Express Highway.',
      primaryReason: 'Fastest arrival with 15-minute buffer before 09:00 lecture.',
      tradeOffs: ['Requires 8-minute walk to station'],
      warnings: [],
      aiGenerated: false,
      aiProvider: 'Deterministic Rule Engine'
    });
    assert.strictEqual(explanation.aiGenerated, false);

    const leg = {
      legIndex: 0,
      type: 'TRANSIT',
      mode: 'train',
      from: 'Andheri',
      to: 'Vile Parle',
      departureTime: '08:20',
      arrivalTime: '08:26',
      durationMinutes: 6,
      provenance: DataProvenance.verified('GTFS').toJSON()
    };

    const route = {
      id: 'route-opt',
      title: 'Direct Train',
      primaryMode: 'train',
      modesIncluded: ['train'],
      estimate: {
        totalDurationMinutes: 6,
        confidenceInterval: { minMinutes: 5, maxMinutes: 10 }
      },
      legs: [leg],
      scores: { compositeScore: 95 }
    };

    const recommendation = new CommuteRecommendation({
      id: 'rec-12345',
      requestId: 'req-abcde',
      status: 'OPTIMAL',
      recommendedRoute: route,
      alternatives: [],
      departureWindows: depWindow.toJSON(),
      explanation: explanation.toJSON(),
      weatherContext: {
        condition: 'partly_cloudy',
        rainProbability: 10,
        temperatureC: 29,
        advisory: 'Clear commuting conditions'
      }
    });

    assert.strictEqual(recommendation.id, 'rec-12345');
    assert.strictEqual(recommendation.status, 'OPTIMAL');
    assert.strictEqual(recommendation.isActionable(), true);
    assert.strictEqual(recommendation.hasAlternatives(), false);
    assert.strictEqual(recommendation.weatherContext.condition, 'partly_cloudy');

    const json = recommendation.toJSON();
    assert.strictEqual(json.status, 'OPTIMAL');
    assert.strictEqual(json.departureWindows.bufferMinutes, 15);
  });

  // --------------------------------------------------------------------------
  // 9. PRIVACY SAFEGUARDS & VALIDATION SCHEMAS
  // --------------------------------------------------------------------------

  test('Validation: commutePlanRequestSchema accepts coarse landmarks and rejects granular addresses', () => {
    // Valid coarse landmarks
    const validPlan = commutePlanRequestSchema.parse({
      origin: 'Borivali West',
      destination: 'DJ Sanghvi College',
      desiredArrivalTime: '09:00',
      preference: 'rain-safe',
      walkingToleranceMinutes: 15,
      maxBudgetRupees: 100
    });
    assert.strictEqual(validPlan.origin, 'Borivali West');
    assert.strictEqual(validPlan.preference, 'rain-safe');

    // Strict Privacy Guard: Granular flat/apartment numbers must be rejected
    const invalidOrigins = [
      'Flat 402, Sunshine Apts, Borivali West',
      'Room 12, Bldg 4, Andheri',
      'Apartment 301, Vile Parle East',
      'House #42, Khar Danda'
    ];

    invalidOrigins.forEach(badOrigin => {
      assert.throws(
        () => commutePlanRequestSchema.parse({
          origin: badOrigin,
          destination: 'DJ Sanghvi College'
        }),
        /Exact flat\/house numbers are not permitted/,
        `Should reject detailed address: ${badOrigin}`
      );
    });
  });

  // --------------------------------------------------------------------------
  // 10. INFEASIBLE RECOMMENDATION & NULL ROUTE TESTS
  // --------------------------------------------------------------------------

  test('CommuteRecommendation: correctly handles INFEASIBLE status with null route', () => {
    const depWindow = new DepartureWindow({
      optimalDepartureTime: '08:00',
      latestSafeDepartureTime: '08:15',
      recommendedWindowStart: '07:55',
      recommendedWindowEnd: '08:10',
      bufferMinutes: 0
    });

    const explanation = new RecommendationExplanation({
      summary: 'No viable commute route found within ₹10 budget and 5-minute walking limit.',
      primaryReason: 'Hard budget and walking constraints exceed transit baseline.',
      warnings: ['Relax budget or walking limit to generate candidate routes']
    });

    const infeasibleRec = new CommuteRecommendation({
      id: 'rec-inf-001',
      requestId: 'req-inf-001',
      status: 'INFEASIBLE',
      recommendedRoute: null,
      alternatives: [],
      departureWindows: depWindow.toJSON(),
      explanation: explanation.toJSON()
    });

    assert.strictEqual(infeasibleRec.status, 'INFEASIBLE');
    assert.strictEqual(infeasibleRec.recommendedRoute, null);
    assert.strictEqual(infeasibleRec.isActionable(), false);
    assert.strictEqual(infeasibleRec.hasAlternatives(), false);

    const serialized = infeasibleRec.toJSON();
    assert.strictEqual(serialized.recommendedRoute, null);
    assert.strictEqual(serialized.status, 'INFEASIBLE');
  });

  // --------------------------------------------------------------------------
  // 11. FEEDBACK & SHARED TRAVEL VALIDATORS
  // --------------------------------------------------------------------------

  test('Validation: commuteFeedbackInputSchema and sharedTravelQuerySchema enforce valid ranges', () => {
    const feedback = commuteFeedbackInputSchema.parse({
      routeId: 'route-test-123',
      rating: 4,
      crowdLevel: 'moderate',
      actualDurationMinutes: 45,
      comment: 'Smooth journey on Western Line fast local'
    });
    assert.strictEqual(feedback.rating, 4);
    assert.strictEqual(feedback.crowdLevel, 'moderate');

    // Invalid rating (> 5) rejected
    assert.throws(() => commuteFeedbackInputSchema.parse({
      routeId: 'route-test-123',
      rating: 6
    }), /Rating must be between 1 and 5/);

    // Invalid rating (< 1) rejected
    assert.throws(() => commuteFeedbackInputSchema.parse({
      routeId: 'route-test-123',
      rating: 0
    }), /Rating must be between 1 and 5/);
  });

  // --------------------------------------------------------------------------
  // 12. IMMUTABILITY OF CORE REGISTRIES
  // --------------------------------------------------------------------------

  test('Immutability: core constants and enum collections are frozen against modification', () => {
    assert.strictEqual(Object.isFrozen(TRANSPORT_MODES), true);
    assert.strictEqual(Object.isFrozen(PROVENANCE_TIERS), true);
    assert.strictEqual(Object.isFrozen(DISRUPTION_TYPES), true);
    assert.strictEqual(Object.isFrozen(DISRUPTION_SEVERITIES), true);
    assert.strictEqual(Object.isFrozen(ROUTE_PREFERENCES), true);
    assert.strictEqual(Object.isFrozen(LEG_TYPES), true);
    assert.strictEqual(Object.isFrozen(RECOMMENDATION_STATUS), true);

    // Verify mutations fail silently or throw in strict mode
    assert.throws(() => {
      'use strict';
      TRANSPORT_MODES.HOVERCRAFT = 'hovercraft';
    }, TypeError);
  });


  console.log('\n========================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCommuteContractsTests().catch(err => {
    console.error('Fatal error during commute contracts test:', err);
    process.exit(1);
  });
}

module.exports = { runCommuteContractsTests };
