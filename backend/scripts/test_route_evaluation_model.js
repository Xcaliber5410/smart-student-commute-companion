/**
 * Focused Unit Tests for RouteEvaluation Domain Model and Service
 *
 * Verifies:
 * 1. Total travel time (baseline vs context-updated)
 * 2. Additional disruption delay & arrival time calculation
 * 3. Waiting time, walking time, transit time, transfers, estimated cost
 * 4. Affected segments & unavailable segments
 * 5. Reliability / uncertainty indicators
 * 6. Feasibility & operational statuses
 * 7. 4-tier provenance preservation
 * 8. Route weakness detection & reason codes
 * 9. Batch evaluation across candidate routes
 */

const assert = require('node:assert/strict');
const {
  RouteEvaluation,
  ROUTE_WEAKNESS_CODES
} = require('../models/RouteEvaluation');
const { routeEvaluationService } = require('../services/routeEvaluationService');
const { CommuteJourney } = require('../models/CommuteJourney');
const { UnifiedJourneyImpact } = require('../models/UnifiedJourneyImpact');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');

function runTests() {
  console.log('====================================================');
  console.log(' Running RouteEvaluation Domain & Service Tests');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // Helper to create a realistic candidate journey
  function createSampleJourney(overrides = {}) {
    return new CommuteJourney({
      id: overrides.id || 'cand-test-1',
      origin: overrides.origin || 'Andheri West',
      destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
      departureTime: overrides.departureTime || '08:00',
      estimatedArrivalTime: overrides.estimatedArrivalTime || '08:35',
      totalDurationMinutes: overrides.totalDurationMinutes ?? 35,
      totalWaitingTimeMinutes: overrides.totalWaitingTimeMinutes ?? 4,
      walkingTimeMinutes: overrides.walkingTimeMinutes ?? 8,
      transitTimeMinutes: overrides.transitTimeMinutes ?? 23,
      transferCount: overrides.transferCount ?? 1,
      estimatedCostRupees: overrides.estimatedCostRupees ?? 25,
      totalDistanceKm: overrides.totalDistanceKm ?? 4.5,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
      isViable: overrides.isViable !== undefined ? overrides.isViable : true,
      segments: overrides.segments || [
        {
          segmentIndex: 0,
          type: 'WALK',
          mode: 'walk',
          from: 'Andheri West',
          to: 'DN Nagar Metro',
          departureTime: '08:00',
          arrivalTime: '08:08',
          durationMinutes: 8,
          waitingTimeMinutes: 0,
          distanceKm: 0.6,
          fareRupees: 0
        },
        {
          segmentIndex: 1,
          type: 'TRANSIT',
          mode: 'metro',
          from: 'DN Nagar Metro',
          to: 'Andheri Metro',
          departureTime: '08:12',
          arrivalTime: '08:35',
          durationMinutes: 23,
          waitingTimeMinutes: 4,
          distanceKm: 3.9,
          fareRupees: 25
        }
      ],
      provenance: overrides.provenance || DataProvenance.estimated('Test Candidate Engine')
    });
  }

  // 1. Clean Route Evaluation
  test('Clean route: baseline matches total travel time, zero disruption delay, operational status', () => {
    const journey = createSampleJourney();
    const cleanImpact = UnifiedJourneyImpact.clean(journey);

    const evaluation = routeEvaluationService.evaluateRoute(journey, cleanImpact);

    assert.strictEqual(evaluation.journeyId, 'cand-test-1');
    assert.strictEqual(evaluation.baselineTravelTime, 35);
    assert.strictEqual(evaluation.totalTravelTime, 35);
    assert.strictEqual(evaluation.additionalDisruptionDelay, 0);
    assert.strictEqual(evaluation.totalAdditionalDelay, 0);
    assert.strictEqual(evaluation.waitingTime, 4);
    assert.strictEqual(evaluation.walkingTime, 8);
    assert.strictEqual(evaluation.transitTime, 23);
    assert.strictEqual(evaluation.numberOfTransfers, 1);
    assert.strictEqual(evaluation.estimatedCost, 25);
    assert.strictEqual(evaluation.isFeasible, true);
    assert.strictEqual(evaluation.feasibilityReason, 'OPERATIONAL');
    assert.strictEqual(evaluation.reliability, 'LOW');
    assert.strictEqual(evaluation.uncertainty, 'LOW');
    assert.deepStrictEqual(evaluation.affectedSegments, []);
    assert.deepStrictEqual(evaluation.unavailableSegments, []);
    assert.strictEqual(evaluation.hasWeaknesses(), false);
    assert.deepStrictEqual(evaluation.weaknesses, []);
  });

  // 2. Disrupted Route Evaluation
  test('Disrupted route: adds disruption delay, updates arrival time, detects DISRUPTION_DELAY weakness', () => {
    const journey = createSampleJourney({ totalDurationMinutes: 30, estimatedArrivalTime: '08:30' });
    const impact = new UnifiedJourneyImpact({
      journeyId: journey.id,
      isFeasible: true,
      feasibilityReason: 'OPERATIONAL',
      totalAdditionalDelayMinutes: 15,
      originalDurationMinutes: 30,
      updatedDurationMinutes: 45,
      disruptionDelayMinutes: 15,
      disruptionImpact: {
        isAffected: true,
        totalDelayMinutes: 15
      },
      reliabilityIndicator: 'MODERATE',
      affectedSegments: [
        {
          segmentIndex: 1,
          mode: 'metro',
          from: 'DN Nagar Metro',
          to: 'Andheri Metro',
          isAffected: true,
          isUsable: true,
          delayMinutes: 15,
          reasons: ['Track circuit glitch']
        }
      ],
      reasonCodes: ['DISRUPTION_DELAY']
    });

    const evaluation = routeEvaluationService.evaluateRoute(journey, impact);

    assert.strictEqual(evaluation.baselineTravelTime, 30);
    assert.strictEqual(evaluation.totalTravelTime, 45);
    assert.strictEqual(evaluation.additionalDisruptionDelay, 15);
    assert.strictEqual(evaluation.totalAdditionalDelay, 15);
    assert.strictEqual(evaluation.estimatedArrivalTime, '08:30');
    assert.strictEqual(evaluation.updatedArrivalTime, '08:45');
    assert.strictEqual(evaluation.affectedSegments.length, 1);
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.DISRUPTION_DELAY));
    assert.ok(evaluation.hasDisruptions());
    assert.strictEqual(evaluation.isFeasible, true);
  });

  // 3. Infeasible Route Evaluation with Unavailable Segment
  test('Infeasible route: marks isFeasible=false, captures unavailable segment and reason codes', () => {
    const journey = createSampleJourney();
    const impact = new UnifiedJourneyImpact({
      journeyId: journey.id,
      isFeasible: false,
      feasibilityReason: 'SERVICE_UNAVAILABLE',
      totalAdditionalDelayMinutes: 0,
      originalDurationMinutes: 35,
      updatedDurationMinutes: 35,
      unavailableSegments: [
        {
          segmentIndex: 1,
          mode: 'metro',
          from: 'DN Nagar Metro',
          to: 'Andheri Metro',
          status: 'UNAVAILABLE',
          reason: 'Power grid shutdown'
        }
      ],
      reasonCodes: ['SERVICE_UNAVAILABLE', 'JOURNEY_INFEASIBLE']
    });

    const evaluation = routeEvaluationService.evaluateRoute(journey, impact);

    assert.strictEqual(evaluation.isFeasible, false);
    assert.strictEqual(evaluation.feasibilityReason, 'SERVICE_UNAVAILABLE');
    assert.strictEqual(evaluation.unavailableSegments.length, 1);
    assert.ok(evaluation.hasUnavailableSegments());
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.JOURNEY_INFEASIBLE));
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.SERVICE_UNAVAILABLE));
  });

  // 4. Multiple Weaknesses Detection
  test('Weakness detection: detects high walking, excessive transfers, high waiting, and high cost', () => {
    const highBurdenJourney = createSampleJourney({
      walkingTimeMinutes: 22, // > 15 min threshold
      transferCount: 3,       // >= 2 threshold
      totalWaitingTimeMinutes: 14, // > 10 min threshold
      estimatedCostRupees: 75  // > 60 Rs threshold
    });

    const impact = new UnifiedJourneyImpact({
      journeyId: highBurdenJourney.id,
      isFeasible: true,
      feasibilityReason: 'OPERATIONAL',
      totalAdditionalDelayMinutes: 0,
      originalDurationMinutes: 50,
      updatedDurationMinutes: 50,
      reliabilityIndicator: 'HIGH',
      reasonCodes: []
    });

    const evaluation = routeEvaluationService.evaluateRoute(highBurdenJourney, impact);

    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.HIGH_WALKING_BURDEN));
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.EXCESSIVE_TRANSFERS));
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.HIGH_WAITING_TIME));
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.HIGH_COST));
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.HIGH_UNCERTAINTY));
    assert.strictEqual(evaluation.hasWeaknesses(), true);
  });

  // 5. Road Traffic & Weather Weakness Detection
  test('Traffic & Weather: captures road congestion and adverse weather impact', () => {
    const autoJourney = createSampleJourney({
      primaryMode: 'auto',
      modesIncluded: ['auto']
    });

    const impact = new UnifiedJourneyImpact({
      journeyId: autoJourney.id,
      isFeasible: true,
      feasibilityReason: 'OPERATIONAL',
      totalAdditionalDelayMinutes: 12,
      originalDurationMinutes: 25,
      updatedDurationMinutes: 37,
      trafficImpact: {
        level: 'heavy',
        addedTravelTimeMinutes: 8
      },
      weatherImpact: {
        condition: 'heavy_rain',
        totalAddedTravelTimeMinutes: 4,
        walkingInconvenience: { level: 'HIGH' }
      },
      reasonCodes: ['ROAD_TRAFFIC_CONGESTION', 'WEATHER_IMPACT']
    });

    const evaluation = routeEvaluationService.evaluateRoute(autoJourney, impact);

    assert.strictEqual(evaluation.trafficImpact.level, 'heavy');
    assert.strictEqual(evaluation.trafficImpact.addedTravelTimeMinutes, 8);
    assert.strictEqual(evaluation.weatherImpact.condition, 'heavy_rain');
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.ROAD_TRAFFIC_CONGESTION));
    assert.ok(evaluation.weaknesses.includes(ROUTE_WEAKNESS_CODES.WEATHER_IMPACT));
  });

  // 6. Provenance Preservation
  test('Provenance: aggregates contributing tiers and preserves DataProvenance metadata', () => {
    const journey = createSampleJourney({
      provenance: DataProvenance.verified('Official GTFS Mumbai', 'Timetable schedule')
    });

    const impact = new UnifiedJourneyImpact({
      journeyId: journey.id,
      isFeasible: true,
      totalAdditionalDelayMinutes: 5,
      originalDurationMinutes: 30,
      updatedDurationMinutes: 35,
      dataTiers: [PROVENANCE_TIERS.VERIFIED, PROVENANCE_TIERS.USER_REPORTED],
      provenance: DataProvenance.userReported('Commuter Alert WhatsApp', 'Crowdsourced delay')
    });

    const evaluation = routeEvaluationService.evaluateRoute(journey, impact);

    assert.ok(evaluation.dataTiers.includes(PROVENANCE_TIERS.VERIFIED));
    assert.ok(evaluation.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED));
    assert.ok(evaluation.provenance instanceof DataProvenance);
    assert.strictEqual(evaluation.provenance.sourceTier, PROVENANCE_TIERS.USER_REPORTED);
  });

  // 7. Batch Evaluation
  test('Batch evaluation: processes multiple candidate journeys consistently', () => {
    const journey1 = createSampleJourney({ id: 'cand-batch-1', totalDurationMinutes: 30 });
    const journey2 = createSampleJourney({ id: 'cand-batch-2', totalDurationMinutes: 45, transferCount: 2 });

    const impact1 = UnifiedJourneyImpact.clean(journey1);
    const impact2 = new UnifiedJourneyImpact({
      journeyId: journey2.id,
      isFeasible: true,
      totalAdditionalDelayMinutes: 10,
      originalDurationMinutes: 45,
      updatedDurationMinutes: 55,
      reasonCodes: ['ROAD_TRAFFIC_CONGESTION']
    });

    const evaluations = routeEvaluationService.evaluateRoutes([journey1, journey2], [impact1, impact2]);

    assert.strictEqual(evaluations.length, 2);
    assert.strictEqual(evaluations[0].journeyId, 'cand-batch-1');
    assert.strictEqual(evaluations[0].totalTravelTime, 30);
    assert.strictEqual(evaluations[1].journeyId, 'cand-batch-2');
    assert.strictEqual(evaluations[1].totalTravelTime, 55);
    assert.ok(evaluations[1].weaknesses.includes(ROUTE_WEAKNESS_CODES.EXCESSIVE_TRANSFERS));
  });

  // 8. Serialization
  test('toJSON serialization returns valid clean plain object', () => {
    const journey = createSampleJourney();
    const cleanImpact = UnifiedJourneyImpact.clean(journey);
    const evaluation = routeEvaluationService.evaluateRoute(journey, cleanImpact);

    const json = evaluation.toJSON();
    assert.strictEqual(typeof json, 'object');
    assert.strictEqual(json.journeyId, 'cand-test-1');
    assert.strictEqual(json.totalTravelTime, 35);
    assert.strictEqual(typeof json.provenance, 'object');
    assert.ok(Array.isArray(json.weaknesses));
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
