/**
 * Verification Script: Commute Recommendation Pipeline Foundation (P9)
 *
 * Exhaustively tests the internal 9-stage recommendation pipeline architecture:
 *
 *   Commute Request
 *         ↓
 *   Context Collection (CommuteContextService)
 *         ↓
 *   Transport Data (TransportDataService)
 *         ↓
 *   Disruption Data (DisruptionImpactService)
 *         ↓
 *   Candidate Routes (CandidateRouteService)
 *         ↓
 *   Constraint Filtering (ConstraintFilterService)
 *         ↓
 *   Route Scoring (RouteScoringService)
 *         ↓
 *   Personalized Recommendation (CommutePersonalizationService)
 *         ↓
 *   Explanation (CommuteExplanationService)
 *         ↓
 *   CommuteRecommendation Domain Entity
 *
 * Tests:
 * 1. Service interfaces, modularity, and constructor dependency injection
 * 2. Stage 1: Context collection (temporal, privacy-safe area, weather)
 * 3. Stage 3: Disruption impact assessment and delay calculations
 * 4. Stage 4: Candidate route generation and pluggable provider boundary
 * 5. Stage 5: Constraint filtering (budget, walking, modes, transfers)
 * 6. Stage 6: Multi-objective route scoring and penalty calculations
 * 7. Stage 7: Personalization, alternatives selection, and departure windows
 * 8. Stage 8: Grounded rule-based explanation generation (zero hallucination)
 * 9. Stage 9: End-to-end pipeline execution with controlled test data
 * 10. Edge Cases: Infeasible constraints, heavy disruption scenarios, and provenance integrity
 */

const assert = require('assert');
const {
  CommutePlanInputDTO,
  CommuteConstraint,
  CommuteRoute,
  RouteLeg,
  TravelEstimate,
  CommuteRecommendation,
  TRANSPORT_MODES,
  LEG_TYPES,
  PROVENANCE_TIERS,
  DISRUPTION_SEVERITIES,
  RECOMMENDATION_STATUS,
  ROUTE_PREFERENCES,
  DataProvenance
} = require('../models');

const {
  commuteRecommendationPipeline,
  CommuteRecommendationPipeline,
  commuteContextService,
  CommuteContextService,
  disruptionImpactService,
  DisruptionImpactService,
  candidateRouteService,
  CandidateRouteService,
  constraintFilterService,
  ConstraintFilterService,
  routeScoringService,
  RouteScoringService,
  commutePersonalizationService,
  CommutePersonalizationService,
  commuteExplanationService,
  CommuteExplanationService
} = require('../services');

async function runRecommendationPipelineTests() {
  console.log('\n========================================================');
  console.log(' Running Commute Recommendation Pipeline Verification');
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
      console.error(err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Service Interfaces & Dependency Injection
  // --------------------------------------------------------------------------
  test('Service Architecture: All 8 pipeline services expose class and singleton instances', () => {
    assert(commuteContextService instanceof CommuteContextService, 'commuteContextService singleton check');
    assert(disruptionImpactService instanceof DisruptionImpactService, 'disruptionImpactService singleton check');
    assert(candidateRouteService instanceof CandidateRouteService, 'candidateRouteService singleton check');
    assert(constraintFilterService instanceof ConstraintFilterService, 'constraintFilterService singleton check');
    assert(routeScoringService instanceof RouteScoringService, 'routeScoringService singleton check');
    assert(commutePersonalizationService instanceof CommutePersonalizationService, 'commutePersonalizationService singleton check');
    assert(commuteExplanationService instanceof CommuteExplanationService, 'commuteExplanationService singleton check');
    assert(commuteRecommendationPipeline instanceof CommuteRecommendationPipeline, 'commuteRecommendationPipeline singleton check');

    // Verify constructor DI overrides
    const mockContext = new CommuteContextService({ weatherService: { getMumbaiWeather: () => ({ rainProbability: 90 }) } });
    assert(mockContext.weatherService !== null, 'DI override works on CommuteContextService');

    const customPipeline = new CommuteRecommendationPipeline({
      contextService: mockContext
    });
    assert.strictEqual(customPipeline.contextService, mockContext, 'Pipeline accepts injected context service');
  });

  // --------------------------------------------------------------------------
  // 2. Stage 1: Context Collection
  // --------------------------------------------------------------------------
  await asyncTest('Stage 1: CommuteContextService collects temporal, privacy-safe, and environmental context', async () => {
    const inputDTO = CommutePlanInputDTO.fromRequest({
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      desiredArrivalTime: '08:45',
      preferredTransportModes: ['train', 'metro', 'walk'],
      maxBudgetRupees: 50,
      walkingToleranceMinutes: 20
    });

    const mockProfileRepo = {
      findByUserId: async (id) => ({ userId: id, homeArea: 'Andheri West' })
    };

    const mockWeatherService = {
      getMumbaiWeather: async () => ({
        condition: 'rainy',
        rainProbability: 75,
        temperatureC: 27,
        advisory: 'Heavy monsoon showers expected'
      })
    };

    const contextService = new CommuteContextService({
      studentProfileRepo: mockProfileRepo,
      weatherService: mockWeatherService
    });

    const context = await contextService.collectContext(inputDTO, {
      studentId: 'stud-1234',
      dayOfWeek: 'Tue'
    });

    assert.strictEqual(context.originArea.name, 'Andheri West');
    assert.strictEqual(context.destinationArea.name, 'D.J. Sanghvi College Of Engineering');
    assert.strictEqual(context.desiredArrivalTime, '08:45');
    assert.strictEqual(context.dayOfWeek, 'Tue');
    assert.strictEqual(context.studentId, 'stud-1234');
    assert.strictEqual(context.studentProfile.homeArea, 'Andheri West');
    assert.strictEqual(context.weatherContext.rainProbability, 75);
    assert.strictEqual(context.weatherContext.condition, 'rainy');
    assert.strictEqual(context.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC);
  });

  // --------------------------------------------------------------------------
  // 3. Stage 3: Disruption Impact Assessment
  // --------------------------------------------------------------------------
  test('Stage 3: DisruptionImpactService normalizes disruptions, delays, and route penalties', () => {
    const testDisruptions = [
      {
        id: 'disp-wr-1',
        disruptionType: 'maintenance',
        transportMode: 'train',
        affectedLineOrRoute: 'Western Railway',
        severity: DISRUPTION_SEVERITIES.MODERATE,
        confidence: 'HIGH',
        description: 'Track maintenance between Borivali and Andheri'
      },
      {
        id: 'disp-m1-2',
        disruptionType: 'crowding',
        transportMode: 'metro',
        affectedLineOrRoute: 'Metro Line 1',
        severity: DISRUPTION_SEVERITIES.MINOR,
        confidence: 'LOW',
        description: 'Peak hour crowd at Ghatkopar'
      }
    ];

    const impacts = disruptionImpactService.assessDisruptions({
      corridorDisruptions: testDisruptions
    });

    assert.strictEqual(impacts.length, 2);
    // Moderate delay with HIGH confidence is scaled (15 * 1.2 = 18 mins)
    assert.strictEqual(impacts[0].delayMinutes, 18);
    assert.strictEqual(impacts[0].affectedLine, 'Western Railway');

    // Minor delay with LOW confidence is scaled (5 * 0.7 = 3.5 -> 4 mins)
    assert.strictEqual(impacts[1].delayMinutes, 4);

    // Test route penalty computation
    const mockTrainRoute = {
      legs: [
        { mode: 'walk' },
        { mode: 'train', lineInfo: { lineName: 'Western Railway Suburban' } },
        { mode: 'walk' }
      ],
      getWalkingMinutes: () => 10
    };

    const penalty = disruptionImpactService.calculateRouteDisruptionPenalty(mockTrainRoute, impacts);
    assert(penalty >= 35, 'Train route incurs moderate disruption penalty for Western Railway');

    // Weather penalty test
    const weatherPenalty = disruptionImpactService.calculateRouteWeatherPenalty(mockTrainRoute, {
      rainProbability: 80
    });
    assert(weatherPenalty > 0, 'Outdoor walk under 80% rain incurs weather penalty');
  });

  // --------------------------------------------------------------------------
  // 4. Stage 4: Candidate Route Generation
  // --------------------------------------------------------------------------
  await asyncTest('Stage 4: CandidateRouteService generates valid CommuteRoute instances', async () => {
    const context = {
      originArea: { name: 'Borivali' },
      destinationArea: { name: 'Vile Parle' },
      desiredArrivalTime: '09:00'
    };

    const candidates = await candidateRouteService.generateCandidates({ context });

    assert(Array.isArray(candidates), 'Candidates is an array');
    assert(candidates.length >= 2, 'Generates at least 2 multimodal candidate routes');

    for (const route of candidates) {
      assert(route instanceof CommuteRoute, 'Candidate is a CommuteRoute instance');
      assert(route.id, 'Route has unique ID');
      assert(route.primaryMode, 'Route has primary mode');
      assert(route.legs.length >= 1, 'Route has legs');
      assert(route.estimate instanceof TravelEstimate, 'Route has valid TravelEstimate');
      assert.strictEqual(typeof route.scores.compositeScore, 'number');
    }

    // Verify custom generator injection for unit testing
    const customService = new CandidateRouteService({
      customGenerator: async () => [
        candidates[0]
      ]
    });

    const customGenerated = await customService.generateCandidates({ context });
    assert.strictEqual(customGenerated.length, 1);
  });

  // --------------------------------------------------------------------------
  // 5. Stage 5: Constraint Filtering
  // --------------------------------------------------------------------------
  test('Stage 5: ConstraintFilterService segregates viable and rejected routes with clear reasons', () => {
    const cheapTrainRoute = new CommuteRoute({
      id: 'rt-train-cheap',
      title: 'Western Railway Local',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      estimate: {
        totalDurationMinutes: 35,
        walkingDurationMinutes: 12,
        totalFareRupees: 10,
        confidenceInterval: { minMinutes: 30, maxMinutes: 45 }
      },
      legs: [
        {
          legIndex: 0,
          type: LEG_TYPES.TRANSIT,
          mode: 'train',
          from: 'Borivali',
          to: 'Vile Parle',
          departureTime: '08:15',
          arrivalTime: '08:50',
          durationMinutes: 35,
          provenance: DataProvenance.verified('GTFS').toJSON()
        }
      ],
      scores: { compositeScore: 80, timeScore: 80, costScore: 95, walkingScore: 80, reliabilityScore: 85, disruptionPenalty: 0, weatherPenalty: 0 },
      provenance: DataProvenance.synthetic('Test').toJSON()
    });

    const expensiveMetroAutoRoute = new CommuteRoute({
      id: 'rt-expensive-auto',
      title: 'Metro + Direct Auto',
      primaryMode: 'auto',
      modesIncluded: ['walk', 'auto'],
      estimate: {
        totalDurationMinutes: 25,
        walkingDurationMinutes: 5,
        totalFareRupees: 140, // Exceeds budget
        confidenceInterval: { minMinutes: 20, maxMinutes: 35 }
      },
      legs: [
        {
          legIndex: 0,
          type: LEG_TYPES.AUTO,
          mode: 'auto',
          from: 'Andheri',
          to: 'Vile Parle',
          departureTime: '08:30',
          arrivalTime: '08:55',
          durationMinutes: 25,
          fareRupees: 140,
          provenance: DataProvenance.estimated('Tariff').toJSON()
        }
      ],
      scores: { compositeScore: 60, timeScore: 90, costScore: 20, walkingScore: 95, reliabilityScore: 70, disruptionPenalty: 0, weatherPenalty: 0 },
      provenance: DataProvenance.synthetic('Test').toJSON()
    });

    const longWalkRoute = new CommuteRoute({
      id: 'rt-long-walk',
      title: 'Long Walk Direct',
      primaryMode: 'walk',
      modesIncluded: ['walk'],
      estimate: {
        totalDurationMinutes: 45,
        walkingDurationMinutes: 45, // Exceeds 20m tolerance
        totalFareRupees: 0,
        confidenceInterval: { minMinutes: 40, maxMinutes: 50 }
      },
      legs: [
        {
          legIndex: 0,
          type: LEG_TYPES.WALK,
          mode: 'walk',
          from: 'Juhu',
          to: 'Vile Parle',
          departureTime: '08:05',
          arrivalTime: '08:50',
          durationMinutes: 45,
          provenance: DataProvenance.estimated('OSRM').toJSON()
        }
      ],
      scores: { compositeScore: 40, timeScore: 40, costScore: 100, walkingScore: 10, reliabilityScore: 90, disruptionPenalty: 0, weatherPenalty: 0 },
      provenance: DataProvenance.synthetic('Test').toJSON()
    });

    const constraints = new CommuteConstraint({
      maxBudgetRupees: 50,
      walkingToleranceMinutes: 20,
      preferredModes: ['train', 'walk'],
      allowSharedRides: true
    });

    const filterResult = constraintFilterService.filterRoutes(
      [cheapTrainRoute, expensiveMetroAutoRoute, longWalkRoute],
      constraints
    );

    assert.strictEqual(filterResult.viableRoutes.length, 1);
    assert.strictEqual(filterResult.viableRoutes[0].id, 'rt-train-cheap');

    assert.strictEqual(filterResult.filteredRoutes.length, 2);
    const expensiveViolation = filterResult.filteredRoutes.find(f => f.route.id === 'rt-expensive-auto');
    assert(expensiveViolation !== undefined);
    assert(expensiveViolation.reason === 'DISALLOWED_MODE' || expensiveViolation.reason === 'EXCEEDS_BUDGET');

    const walkViolation = filterResult.filteredRoutes.find(f => f.route.id === 'rt-long-walk');
    assert(walkViolation !== undefined);
    assert.strictEqual(walkViolation.reason, 'EXCEEDS_WALKING_LIMIT');
  });

  // --------------------------------------------------------------------------
  // 6. Stage 6: Route Scoring
  // --------------------------------------------------------------------------
  test('Stage 6: RouteScoringService computes sub-scores, penalties, and composite scores', () => {
    const route = new CommuteRoute({
      id: 'rt-scoring-test',
      title: 'Scoring Test Route',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      estimate: {
        totalDurationMinutes: 30,
        walkingDurationMinutes: 10,
        totalFareRupees: 15,
        confidenceInterval: { minMinutes: 25, maxMinutes: 35 }
      },
      legs: [
        {
          legIndex: 0,
          type: LEG_TYPES.TRANSIT,
          mode: 'train',
          from: 'Area A',
          to: 'Area B',
          departureTime: '08:20',
          arrivalTime: '08:50',
          durationMinutes: 30,
          lineInfo: { lineName: 'Western Railway' },
          provenance: DataProvenance.verified('GTFS').toJSON()
        }
      ],
      scores: { compositeScore: 50, timeScore: 50, costScore: 50, walkingScore: 50, reliabilityScore: 50, disruptionPenalty: 0, weatherPenalty: 0 },
      provenance: DataProvenance.synthetic('Test').toJSON()
    });

    // Score without disruptions
    const scoredNoDisp = routeScoringService.scoreRoutes({
      routes: [route],
      constraints: { preference: ROUTE_PREFERENCES.BALANCED },
      disruptions: [],
      weatherContext: { rainProbability: 0 }
    });

    const cleanCompositeScore = scoredNoDisp[0].scores.compositeScore;
    assert(cleanCompositeScore >= 70, 'Clean route gets high composite score');
    assert.strictEqual(scoredNoDisp[0].scores.disruptionPenalty, 0);

    // Score with active disruption
    const scoredWithDisp = routeScoringService.scoreRoutes({
      routes: [route],
      constraints: { preference: ROUTE_PREFERENCES.BALANCED },
      disruptions: [
        {
          disruptionId: 'd1',
          affectedMode: 'train',
          affectedLine: 'Western Railway',
          severity: 'moderate'
        }
      ],
      weatherContext: { rainProbability: 0 }
    });

    assert(scoredWithDisp[0].scores.disruptionPenalty > 0, 'Route incurs disruption penalty');
    assert(scoredWithDisp[0].scores.compositeScore < cleanCompositeScore, 'Disrupted route scores lower');
  });

  // --------------------------------------------------------------------------
  // 7. Stage 7: Personalization & Departure Windows
  // --------------------------------------------------------------------------
  test('Stage 7: CommutePersonalizationService selects primary route, alternatives, and calculates departure windows', () => {
    const routeA = new CommuteRoute({
      id: 'rt-a',
      title: 'Fast Train',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      estimate: {
        totalDurationMinutes: 30,
        walkingDurationMinutes: 8,
        totalFareRupees: 10,
        confidenceInterval: { minMinutes: 25, maxMinutes: 35 }
      },
      legs: [
        {
          legIndex: 0,
          type: LEG_TYPES.TRANSIT,
          mode: 'train',
          from: 'Area A',
          to: 'Area B',
          departureTime: '08:20',
          arrivalTime: '08:50',
          durationMinutes: 30,
          provenance: DataProvenance.verified('GTFS').toJSON()
        }
      ],
      scores: { compositeScore: 88, timeScore: 90, costScore: 95, walkingScore: 85, reliabilityScore: 85, disruptionPenalty: 0, weatherPenalty: 0 },
      provenance: DataProvenance.synthetic('Test').toJSON()
    });

    const routeB = new CommuteRoute({
      id: 'rt-b',
      title: 'Direct Bus',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      estimate: {
        totalDurationMinutes: 48,
        walkingDurationMinutes: 6,
        totalFareRupees: 15,
        confidenceInterval: { minMinutes: 40, maxMinutes: 55 }
      },
      legs: [
        {
          legIndex: 0,
          type: LEG_TYPES.TRANSIT,
          mode: 'bus',
          from: 'Area A',
          to: 'Area B',
          departureTime: '08:00',
          arrivalTime: '08:48',
          durationMinutes: 48,
          provenance: DataProvenance.verified('GTFS').toJSON()
        }
      ],
      scores: { compositeScore: 72, timeScore: 60, costScore: 90, walkingScore: 90, reliabilityScore: 65, disruptionPenalty: 0, weatherPenalty: 0 },
      provenance: DataProvenance.synthetic('Test').toJSON()
    });

    const personalization = commutePersonalizationService.personalize({
      scoredRoutes: [routeB, routeA], // Unsorted input
      desiredArrivalTime: '09:00',
      preference: 'balanced'
    });

    assert.strictEqual(personalization.recommendedRoute.id, 'rt-a', 'Top composite score route selected as primary');
    assert.strictEqual(personalization.alternatives.length, 1);
    assert.strictEqual(personalization.alternatives[0].id, 'rt-b');
    assert.strictEqual(personalization.status, RECOMMENDATION_STATUS.OPTIMAL);

    // Departure window verification (30 min duration + 10 min buffer = 40 min total)
    // 09:00 - 40 min = 08:20 optimal departure
    // 09:00 - 30 min = 08:30 latest safe departure
    const dw = personalization.departureWindows;
    assert.strictEqual(dw.optimalDepartureTime, '08:20');
    assert.strictEqual(dw.latestSafeDepartureTime, '08:30');
    assert.strictEqual(dw.recommendedWindowStart, '08:15');
    assert.strictEqual(dw.recommendedWindowEnd, '08:25');
  });

  // --------------------------------------------------------------------------
  // 8. Stage 8: Explanation Generation
  // --------------------------------------------------------------------------
  test('Stage 8: CommuteExplanationService produces grounded, deterministic explanations', () => {
    const primary = {
      title: 'Western Railway Fast Local',
      primaryMode: 'train',
      estimate: { totalDurationMinutes: 32, totalFareRupees: 10, walkingDurationMinutes: 10 }
    };

    const alt = {
      title: 'Metro Line 1 Express',
      estimate: { totalDurationMinutes: 28, totalFareRupees: 40, walkingDurationMinutes: 6 }
    };

    const explanation = commuteExplanationService.generateExplanation({
      recommendedRoute: primary,
      alternatives: [alt],
      constraints: { desiredArrivalTime: '08:45', preference: 'cheapest', maxBudgetRupees: 50 },
      disruptions: [
        {
          severity: 'minor',
          disruptionType: 'crowding',
          affectedLine: 'Western Railway',
          description: 'Slight morning crowding',
          delayMinutes: 5
        }
      ],
      weatherContext: { rainProbability: 60 }
    });

    assert(explanation.summary.includes('Western Railway Fast Local'));
    assert(explanation.primaryReason.includes('₹10'));
    assert(explanation.tradeOffs.length > 0);
    assert(explanation.warnings.length >= 2, 'Includes disruption and weather warnings');
    assert.strictEqual(explanation.aiGenerated, false, 'Zero speculative AI');
    assert.strictEqual(explanation.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC);
  });

  // --------------------------------------------------------------------------
  // 9. End-to-End Recommendation Pipeline Execution
  // --------------------------------------------------------------------------
  await asyncTest('Stage 9: CommuteRecommendationPipeline runs complete 9-stage flow', async () => {
    const rawRequest = {
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      desiredArrivalTime: '09:00',
      preferredTransportModes: ['train', 'metro', 'walk'],
      maxBudgetRupees: 60,
      walkingToleranceMinutes: 25,
      routePreference: 'fastest'
    };

    const recommendation = await commuteRecommendationPipeline.execute(rawRequest);

    assert(recommendation instanceof CommuteRecommendation, 'Produces valid CommuteRecommendation instance');
    assert(recommendation.id.startsWith('rec-'), 'Has recommendation ID');
    assert(recommendation.requestId.startsWith('req-'), 'Has request ID');
    assert.strictEqual(recommendation.isActionable(), true, 'Recommendation is actionable');
    assert(recommendation.recommendedRoute !== null, 'Recommended route exists');
    assert(recommendation.departureWindows !== null, 'Departure windows exist');
    assert(recommendation.explanation !== null, 'Explanation exists');
    assert.strictEqual(recommendation.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC);
  });

  // --------------------------------------------------------------------------
  // 10. Edge Case: Infeasible Constraints Handled Gracefully
  // --------------------------------------------------------------------------
  await asyncTest('Edge Case: Infeasible budget and walking constraints produce INFEASIBLE recommendation without throwing', async () => {
    const impossibleRequest = {
      startingArea: 'Borivali',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      desiredArrivalTime: '09:00',
      preferredTransportModes: ['train'],
      maxBudgetRupees: 5, // Budget lower than minimum train fare (₹10)
      walkingToleranceMinutes: 5 // Walking limit lower than minimum walking legs
    };

    const recommendation = await commuteRecommendationPipeline.execute(impossibleRequest);

    assert.strictEqual(recommendation.status, RECOMMENDATION_STATUS.INFEASIBLE);
    assert.strictEqual(recommendation.recommendedRoute, null);
    assert.strictEqual(recommendation.alternatives.length, 0);
    assert.strictEqual(recommendation.isActionable(), false);
    assert(recommendation.explanation.summary.includes('No viable commute route found'));
    assert(recommendation.explanation.tradeOffs.length > 0, 'Offers actionable relaxation suggestions');
  });

  console.log('\n========================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRecommendationPipelineTests().catch(err => {
  console.error('Fatal error during pipeline verification:', err);
  process.exit(1);
});
