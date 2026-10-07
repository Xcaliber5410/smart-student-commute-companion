/**
 * Verification Test Battery: CommuteContextEngine & UnifiedJourneyImpact
 *
 * Validates the Unified Commute Context Engine across all required test scenarios:
 * 1. Clean journey (zero delays, normal baseline)
 * 2. One disruption (single transit disruption)
 * 3. Traffic + disruption (road congestion + transit incident)
 * 4. Weather + traffic (monsoon rain + vehicular congestion)
 * 5. Unavailable transport (vehicle shortage / empty auto stand)
 * 6. Multiple simultaneous impacts (disruption + traffic + weather + availability)
 * 7. Infeasible journey (suspended transit / impassable route)
 * 8. Mixed provenance (multi-source attribution)
 *
 * Plus journey decoration and batch evaluation validation.
 */

const assert = require('assert');
const {
  CommuteContextEngine,
  commuteContextEngine
} = require('../services/commuteContextEngine');
const {
  UnifiedJourneyImpact,
  UNIFIED_REASON_CODES,
  UNIFIED_FEASIBILITY_STATUSES
} = require('../models/UnifiedJourneyImpact');
const {
  CommuteJourney,
  JourneySegment,
  CommuteDisruption,
  DataProvenance,
  PROVENANCE_TIERS,
  TRAFFIC_LEVELS,
  WEATHER_CONDITIONS,
  SERVICE_AVAILABILITY_STATUSES
} = require('../models');

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

// ============================================================================
// HELPER FACTORIES FOR TEST CANDIDATE JOURNEYS
// ============================================================================

function createCandidateMultimodalJourney(id = 'journey-multimodal-1') {
  return new CommuteJourney({
    id,
    origin: 'Dadar',
    destination: 'D.J. Sanghvi College, Vile Parle',
    departureTime: '08:00',
    estimatedArrivalTime: '08:44',
    totalDurationMinutes: 44,
    totalWaitingTimeMinutes: 5,
    walkingTimeMinutes: 7,
    transitTimeMinutes: 20,
    transferCount: 1,
    estimatedCostRupees: 35,
    totalDistanceKm: 14.2,
    primaryMode: 'train',
    modesIncluded: ['walk', 'train', 'auto'],
    segments: [
      new JourneySegment({
        segmentIndex: 0,
        type: 'walk',
        mode: 'walk',
        from: 'Dadar West',
        to: 'Dadar Station',
        departureTime: '08:00',
        arrivalTime: '08:04',
        durationMinutes: 4,
        waitingTimeMinutes: 0,
        distanceKm: 0.3,
        fareRupees: 0,
        provenance: DataProvenance.verified('OSRM Pedestrian Routing')
      }),
      new JourneySegment({
        segmentIndex: 1,
        type: 'transit',
        mode: 'train',
        from: 'Dadar Station',
        to: 'Andheri Station',
        departureTime: '08:05',
        arrivalTime: '08:25',
        durationMinutes: 20,
        waitingTimeMinutes: 1,
        distanceKm: 11.5,
        fareRupees: 10,
        serviceId: 'WR-SLOW',
        lineIdentifier: 'Western Railway',
        transitDetails: {
          lineName: 'Western Railway Slow Local',
          headwayMinutes: 4
        },
        provenance: DataProvenance.verified('WR Official Timetable')
      }),
      new JourneySegment({
        segmentIndex: 2,
        type: 'auto',
        mode: 'auto',
        from: 'Andheri Station West',
        to: 'D.J. Sanghvi College, Vile Parle',
        departureTime: '08:27',
        arrivalTime: '08:44',
        durationMinutes: 17,
        waitingTimeMinutes: 2,
        distanceKm: 2.2,
        fareRupees: 25,
        roadDetails: {
          corridor: 'SV Road'
        },
        provenance: DataProvenance.estimated('OSRM Road Routing')
      }),
      new JourneySegment({
        segmentIndex: 3,
        type: 'walk',
        mode: 'walk',
        from: 'College Dropoff Gate',
        to: 'DJ Sanghvi Campus',
        departureTime: '08:44',
        arrivalTime: '08:47',
        durationMinutes: 3,
        waitingTimeMinutes: 0,
        distanceKm: 0.2,
        fareRupees: 0,
        provenance: DataProvenance.verified('Campus Map')
      })
    ],
    provenance: DataProvenance.verified('Commute Journey Builder')
  });
}

function createCandidateRoadJourney(id = 'journey-road-1') {
  return new CommuteJourney({
    id,
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College, Vile Parle',
    departureTime: '08:15',
    estimatedArrivalTime: '08:35',
    totalDurationMinutes: 20,
    totalWaitingTimeMinutes: 3,
    walkingTimeMinutes: 4,
    transitTimeMinutes: 0,
    transferCount: 0,
    estimatedCostRupees: 30,
    totalDistanceKm: 2.5,
    primaryMode: 'auto',
    modesIncluded: ['walk', 'auto'],
    segments: [
      new JourneySegment({
        segmentIndex: 0,
        type: 'walk',
        mode: 'walk',
        from: 'Lokhandwala Complex',
        to: 'Link Road Auto Stand',
        departureTime: '08:15',
        arrivalTime: '08:18',
        durationMinutes: 3,
        waitingTimeMinutes: 0,
        distanceKm: 0.2,
        fareRupees: 0,
        provenance: DataProvenance.verified('Pedestrian Router')
      }),
      new JourneySegment({
        segmentIndex: 1,
        type: 'auto',
        mode: 'auto',
        from: 'Link Road Auto Stand',
        to: 'D.J. Sanghvi College, Vile Parle',
        departureTime: '08:18',
        arrivalTime: '08:34',
        durationMinutes: 16,
        waitingTimeMinutes: 0,
        distanceKm: 2.2,
        fareRupees: 30,
        roadDetails: { corridor: 'Link Road' },
        provenance: DataProvenance.estimated('Road Traffic Engine')
      }),
      new JourneySegment({
        segmentIndex: 2,
        type: 'walk',
        mode: 'walk',
        from: 'Gate 2',
        to: 'Main Building',
        departureTime: '08:34',
        arrivalTime: '08:35',
        durationMinutes: 1,
        waitingTimeMinutes: 0,
        distanceKm: 0.1,
        fareRupees: 0,
        provenance: DataProvenance.verified('Pedestrian Router')
      })
    ],
    provenance: DataProvenance.estimated('Journey Builder')
  });
}

// ============================================================================
// TEST BATTERY
// ============================================================================

console.log('\n============================================================');
console.log('--- TEST SUITE: COMMUTE CONTEXT ENGINE & UNIFIED IMPACT ---');
console.log('============================================================\n');

// 1. Clean Journey
runTest('Scenario 1: Clean journey returns zero additional delay and clean reason codes', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-1');

  const context = {
    disruptions: [],
    trafficConditions: [],
    weatherContext: { condition: 'clear' },
    availabilityRecords: []
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact instanceof UnifiedJourneyImpact, true, 'Should return UnifiedJourneyImpact instance');
  assert.strictEqual(impact.isFeasible, true, 'Clean journey must be feasible');
  assert.strictEqual(impact.feasibilityReason, UNIFIED_FEASIBILITY_STATUSES.OPERATIONAL);
  assert.strictEqual(impact.totalAdditionalDelayMinutes, 0, 'Clean journey must have 0 added delay');
  assert.strictEqual(impact.updatedDurationMinutes, journey.totalDurationMinutes);
  assert.strictEqual(impact.unavailableSegments.length, 0, 'Clean journey has no unavailable segments');
  assert.strictEqual(impact.dominantTransportStatus, 'AVAILABLE');
  assert.strictEqual(impact.reliabilityIndicator, 'LOW');
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.CLEAN_JOURNEY), true, 'Must include CLEAN_JOURNEY code');
  assert.strictEqual(impact.isClean(), true, 'isClean() helper should return true');
});

// 2. One Disruption
runTest('Scenario 2: One transit disruption adds isolated disruption delay', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-2');

  const now = Date.now();
  const disruption = new CommuteDisruption({
    id: 'dis-wr-slow-delay',
    type: 'delay',
    affectedMode: 'train',
    affectedRouteId: 'WR-SLOW',
    affectedArea: 'Dadar - Andheri',
    severity: 'moderate',
    description: 'Western Railway Slow Local signaling delay between Dadar and Andheri',
    startTime: now - 5 * 60 * 1000,
    endTime: now + 60 * 60 * 1000,
    status: 'active',
    estimatedDelayMinutes: 10,
    provenance: DataProvenance.verified('WR Control Center').toJSON()
  });

  const context = {
    disruptions: [disruption],
    trafficConditions: [],
    weatherContext: { condition: 'clear' },
    availabilityRecords: []
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.isFeasible, true);
  assert.strictEqual(impact.totalAdditionalDelayMinutes, 10, 'Expected 10m disruption delay');
  assert.strictEqual(impact.updatedDurationMinutes, journey.totalDurationMinutes + 10);
  assert.strictEqual(impact.hasDisruptions(), true);
  assert.strictEqual(impact.hasTraffic(), false);
  assert.strictEqual(impact.hasWeatherImpact(), false);
  assert.strictEqual(impact.hasAvailabilityIssues(), false);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.DISRUPTION_DELAY), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.CLEAN_JOURNEY), false);
  assert.strictEqual(impact.affectedSegments.length >= 1, true);
  assert.strictEqual(impact.affectedSegments[0].segmentIndex, 1, 'Train segment at index 1 must be affected');
});

// 3. Traffic + Disruption
runTest('Scenario 3: Road traffic + transit disruption combine delays additively', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-3');

  const now = Date.now();
  // Transit disruption on train segment: +12m
  const disruption = new CommuteDisruption({
    id: 'dis-wr-slow-delay-2',
    type: 'delay',
    affectedMode: 'train',
    affectedRouteId: 'WR-SLOW',
    affectedArea: 'Dadar - Andheri',
    severity: 'moderate',
    description: 'Track maintenance between Bandra and Andheri',
    startTime: now - 5 * 60 * 1000,
    endTime: now + 60 * 60 * 1000,
    status: 'active',
    estimatedDelayMinutes: 12,
    provenance: DataProvenance.verified('WR Operations').toJSON()
  });

  // Road traffic on auto segment (SV Road): moderate traffic +6m
  const trafficCondition = {
    id: 'traf-sv-road',
    area: 'SV Road',
    level: TRAFFIC_LEVELS.MODERATE,
    expectedDelayMinutes: 6,
    affectedModes: ['auto', 'bus'],
    startTime: now - 10 * 60 * 1000,
    expiryTime: now + 60 * 60 * 1000,
    provenance: DataProvenance.estimated('Traffic Density Heuristic').toJSON()
  };

  const context = {
    disruptions: [disruption],
    trafficConditions: [trafficCondition],
    weatherContext: { condition: 'clear' },
    availabilityRecords: []
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.isFeasible, true);
  assert.strictEqual(impact.totalAdditionalDelayMinutes, 18, 'Expected 12m disruption + 6m traffic = 18m delay');
  assert.strictEqual(impact.hasDisruptions(), true);
  assert.strictEqual(impact.hasTraffic(), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.DISRUPTION_DELAY), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.ROAD_TRAFFIC_CONGESTION), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.MULTIPLE_SIMULTANEOUS_IMPACTS), true);

  // Validate segment-by-segment isolation
  const trainSeg = impact.affectedSegments.find(s => s.segmentIndex === 1);
  const autoSeg = impact.affectedSegments.find(s => s.segmentIndex === 2);
  assert.strictEqual(Boolean(trainSeg), true, 'Train segment should be affected');
  assert.strictEqual(Boolean(autoSeg), true, 'Auto segment should be affected');
  assert.strictEqual(trainSeg.impacts.disruption !== null, true);
  assert.strictEqual(trainSeg.impacts.traffic === null, true, 'Train must not have traffic impact');
  assert.strictEqual(autoSeg.impacts.traffic !== null, true);
});

// 4. Weather + Traffic
runTest('Scenario 4: Monsoon weather + road traffic combine environmental road delays', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateRoadJourney('journey-test-4');

  const now = Date.now();
  // Road traffic on Link Road: heavy (+12m)
  const trafficCondition = {
    id: 'traf-link-road-heavy',
    area: 'Link Road',
    level: TRAFFIC_LEVELS.HEAVY,
    expectedDelayMinutes: 12,
    affectedModes: ['auto', 'bus'],
    startTime: now - 5 * 60 * 1000,
    expiryTime: now + 60 * 60 * 1000,
    provenance: DataProvenance.verified('Traffic Police Control').toJSON()
  };

  // Weather: moderate rain (+4m road delay)
  const weatherContext = {
    condition: WEATHER_CONDITIONS.RAIN,
    roadDelayMinutes: 4,
    precipitationProbability: 75,
    walkingInconvenienceLevel: 'MODERATE',
    travelUncertaintyLevel: 'MODERATE',
    provenance: DataProvenance.verified('IMD Regional Center').toJSON()
  };

  const context = {
    disruptions: [],
    trafficConditions: [trafficCondition],
    weatherContext,
    availabilityRecords: []
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.isFeasible, true);
  assert.strictEqual(impact.hasTraffic(), true);
  assert.strictEqual(impact.hasWeatherImpact(), true);
  assert.strictEqual(impact.hasDisruptions(), false);
  assert.strictEqual(impact.totalAdditionalDelayMinutes >= 16, true, 'Combined delay should include traffic + weather');
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.ROAD_TRAFFIC_CONGESTION), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.WEATHER_IMPACT), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.MULTIPLE_SIMULTANEOUS_IMPACTS), true);
});

// 5. Unavailable Transport
runTest('Scenario 5: Unavailable transport makes journey infeasible and reports unavailable segments', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-5');

  const now = Date.now();
  // Auto stand at Andheri West is empty / unavailable
  const availabilityRecord = {
    id: 'status-auto-empty',
    mode: 'auto',
    area: 'Andheri West',
    status: SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE,
    reason: 'Zero autorickshaws available at station queue; extensive student line',
    effectiveTime: now - 10 * 60 * 1000,
    expiryTime: now + 50 * 60 * 1000,
    provenance: DataProvenance.userReported('Student Commuter App').toJSON()
  };

  const context = {
    disruptions: [],
    trafficConditions: [],
    weatherContext: { condition: 'clear' },
    availabilityRecords: [availabilityRecord]
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.isFeasible, false, 'Journey must be infeasible when segment is unavailable');
  assert.strictEqual(impact.feasibilityReason, UNIFIED_FEASIBILITY_STATUSES.SERVICE_UNAVAILABLE);
  assert.strictEqual(impact.unavailableSegments.length, 1, 'Should record exactly 1 unavailable segment');
  assert.strictEqual(impact.unavailableSegments[0].segmentIndex, 2, 'Auto segment at index 2 must be unavailable');
  assert.strictEqual(impact.unavailableSegments[0].status, 'UNAVAILABLE');
  assert.strictEqual(impact.dominantTransportStatus, 'UNAVAILABLE');
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.SERVICE_UNAVAILABLE), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.JOURNEY_INFEASIBLE), true);
});

// 6. Multiple Simultaneous Impacts
runTest('Scenario 6: Multiple simultaneous impacts (disruption + traffic + weather + degraded availability)', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-6');

  const now = Date.now();
  // 1. Train disruption: +8m
  const disruption = new CommuteDisruption({
    id: 'dis-signal-slow',
    type: 'delay',
    affectedMode: 'train',
    affectedRouteId: 'WR-SLOW',
    affectedArea: 'Dadar - Andheri',
    severity: 'moderate',
    description: 'Signal maintenance delay on Western Railway',
    startTime: now - 10 * 60 * 1000,
    endTime: now + 60 * 60 * 1000,
    status: 'active',
    estimatedDelayMinutes: 8,
    provenance: DataProvenance.verified('WR Operations').toJSON()
  });

  // 2. Road traffic on SV Road: moderate (+6m)
  const trafficCondition = {
    id: 'traf-sv-road-mod',
    area: 'SV Road',
    level: TRAFFIC_LEVELS.MODERATE,
    expectedDelayMinutes: 6,
    affectedModes: ['auto'],
    startTime: now - 5 * 60 * 1000,
    expiryTime: now + 60 * 60 * 1000,
    provenance: DataProvenance.estimated('Traffic Density Heuristic').toJSON()
  };

  // 3. Rain weather (+4m road delay)
  const weatherContext = {
    condition: WEATHER_CONDITIONS.RAIN,
    roadDelayMinutes: 4,
    walkingInconvenienceLevel: 'MODERATE',
    travelUncertaintyLevel: 'MODERATE',
    provenance: DataProvenance.verified('IMD Regional Center').toJSON()
  };

  // 4. Auto availability limited (+10m wait)
  const availabilityRecord = {
    id: 'status-auto-limited',
    mode: 'auto',
    area: 'Andheri West',
    status: SERVICE_AVAILABILITY_STATUSES.LIMITED,
    expectedDelayMinutes: 0,
    addedWaitMinutes: 10,
    uncertaintyLevel: 'HIGH',
    reason: 'Reduced auto availability during rain shower',
    effectiveTime: now - 10 * 60 * 1000,
    expiryTime: now + 50 * 60 * 1000,
    provenance: DataProvenance.userReported('Commuter Report').toJSON()
  };

  const context = {
    disruptions: [disruption],
    trafficConditions: [trafficCondition],
    weatherContext,
    availabilityRecords: [availabilityRecord]
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.isFeasible, true, 'Degraded availability still remains feasible');
  assert.strictEqual(impact.hasDisruptions(), true);
  assert.strictEqual(impact.hasTraffic(), true);
  assert.strictEqual(impact.hasWeatherImpact(), true);
  assert.strictEqual(impact.hasAvailabilityIssues(), true);

  // Total delay calculation: 8m disruption + 6m traffic + ~4m weather + 10m auto wait = 28m
  assert.strictEqual(impact.totalAdditionalDelayMinutes >= 28, true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.MULTIPLE_SIMULTANEOUS_IMPACTS), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.TRANSIT_SERVICE_DEGRADED), true);
  assert.strictEqual(impact.advisories.length >= 3, true, 'Should consolidate advisories from multiple sources');
});

// 7. Infeasible Journey
runTest('Scenario 7: Suspended transit service halts route and marks journey infeasible', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-7');

  const now = Date.now();
  // Western Railway service suspended
  const suspendedRecord = {
    id: 'status-wr-suspended',
    serviceId: 'WR-SLOW',
    lineIdentifier: 'Western Railway',
    mode: 'train',
    area: 'Dadar - Andheri',
    status: SERVICE_AVAILABILITY_STATUSES.SUSPENDED,
    reason: 'Major power failure halts Western Railway suburban services',
    effectiveTime: now - 15 * 60 * 1000,
    expiryTime: now + 60 * 60 * 1000,
    provenance: DataProvenance.verified('Western Railway Public Relations').toJSON()
  };

  const context = {
    disruptions: [],
    trafficConditions: [],
    weatherContext: { condition: 'clear' },
    availabilityRecords: [suspendedRecord]
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.isFeasible, false);
  assert.strictEqual(impact.feasibilityReason, UNIFIED_FEASIBILITY_STATUSES.SERVICE_SUSPENDED);
  assert.strictEqual(impact.dominantTransportStatus, 'SUSPENDED');
  assert.strictEqual(impact.unavailableSegments.length, 1);
  assert.strictEqual(impact.unavailableSegments[0].segmentIndex, 1);
  assert.strictEqual(impact.reliabilityIndicator, 'SEVERE');
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.SERVICE_SUSPENDED), true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.JOURNEY_INFEASIBLE), true);
});

// 8. Mixed Provenance
runTest('Scenario 8: Multi-source inputs accurately track mixed provenance tiers', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-8');

  const now = Date.now();
  // 1. Disruption from VERIFIED authority
  const disruption = new CommuteDisruption({
    id: 'dis-wr-verified',
    type: 'delay',
    affectedMode: 'train',
    affectedRouteId: 'WR-SLOW',
    affectedArea: 'Dadar - Andheri',
    severity: 'minor',
    description: 'Minor signaling delay',
    startTime: now - 5 * 60 * 1000,
    endTime: now + 60 * 60 * 1000,
    status: 'active',
    estimatedDelayMinutes: 5,
    provenance: DataProvenance.verified('Official Railway Notice').toJSON()
  });

  // 2. Traffic from USER_REPORTED commuters
  const trafficCondition = {
    id: 'traf-user-reported',
    area: 'SV Road',
    level: TRAFFIC_LEVELS.MODERATE,
    expectedDelayMinutes: 6,
    affectedModes: ['auto'],
    startTime: now - 5 * 60 * 1000,
    expiryTime: now + 60 * 60 * 1000,
    provenance: DataProvenance.userReported('Community Commuter Network').toJSON()
  };

  // 3. Weather from ESTIMATED sensor model
  const weatherContext = {
    condition: WEATHER_CONDITIONS.RAIN,
    roadDelayMinutes: 3,
    precipitationProbability: 60,
    provenance: DataProvenance.estimated('Radar Nowcast Algorithm').toJSON()
  };

  const context = {
    disruptions: [disruption],
    trafficConditions: [trafficCondition],
    weatherContext,
    availabilityRecords: []
  };

  const impact = engine.evaluateJourney(journey, context);

  assert.strictEqual(impact.hasProvenanceTier(PROVENANCE_TIERS.VERIFIED), true, 'Must include VERIFIED tier');
  assert.strictEqual(impact.hasProvenanceTier(PROVENANCE_TIERS.USER_REPORTED), true, 'Must include USER_REPORTED tier');
  assert.strictEqual(impact.hasProvenanceTier(PROVENANCE_TIERS.ESTIMATED), true, 'Must include ESTIMATED tier');
  assert.strictEqual(impact.dataTiers.length >= 3, true);
  assert.strictEqual(impact.reasonCodes.includes(UNIFIED_REASON_CODES.MIXED_PROVENANCE), true);
  assert.strictEqual(typeof impact.provenance.provider, 'string');
});

// 9. Candidate Journey Decoration (applyUnifiedImpactToJourney)
runTest('Scenario 9: Journey decoration updates arrival time and viability flags', () => {
  const engine = new CommuteContextEngine();
  const journey = createCandidateMultimodalJourney('journey-test-9');

  const now = Date.now();
  const disruption = new CommuteDisruption({
    id: 'dis-decoration-test',
    type: 'delay',
    affectedMode: 'train',
    affectedRouteId: 'WR-SLOW',
    affectedArea: 'Dadar - Andheri',
    severity: 'moderate',
    description: 'Track repair speed restriction',
    startTime: now - 5 * 60 * 1000,
    endTime: now + 60 * 60 * 1000,
    status: 'active',
    estimatedDelayMinutes: 16,
    provenance: DataProvenance.verified('WR Control').toJSON()
  });

  const impact = engine.evaluateJourney(journey, {
    disruptions: [disruption],
    trafficConditions: [],
    weatherContext: { condition: 'clear' },
    availabilityRecords: []
  });
  assert.strictEqual(impact.totalAdditionalDelayMinutes, 16);

  const originalDeparture = journey.departureTime; // 08:00
  const decorated = engine.applyUnifiedImpactToJourney(journey, impact);

  assert.strictEqual(decorated.totalDurationMinutes, 44 + 16, 'Duration must be 60m');
  assert.strictEqual(decorated.estimatedArrivalTime, '09:00', 'Arrival time should update from 08:44 to 09:00');
  assert.strictEqual(decorated.isViable, true);
  assert.strictEqual(decorated.unifiedImpact !== undefined, true);
});

// 10. Batch Evaluation (evaluateCandidateJourneys)
runTest('Scenario 10: Batch evaluation evaluates multiple candidate journeys correctly', () => {
  const engine = new CommuteContextEngine();
  const journeys = [
    createCandidateMultimodalJourney('batch-journey-1'),
    createCandidateRoadJourney('batch-journey-2')
  ];

  const now = Date.now();
  const trafficCondition = {
    id: 'traf-batch-test',
    area: 'Link Road',
    level: TRAFFIC_LEVELS.HEAVY,
    expectedDelayMinutes: 12,
    affectedModes: ['auto'],
    startTime: now - 5 * 60 * 1000,
    expiryTime: now + 60 * 60 * 1000,
    provenance: DataProvenance.verified('Traffic Control').toJSON()
  };

  const results = engine.evaluateCandidateJourneys(journeys, {
    trafficConditions: [trafficCondition]
  });

  assert.strictEqual(Array.isArray(results), true);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].journeyId, 'batch-journey-1');
  assert.strictEqual(results[1].journeyId, 'batch-journey-2');
  // Link Road traffic impacts road journey 2, but not Dadar-Andheri multimodal journey 1
  assert.strictEqual(results[1].hasTraffic(), true, 'Journey 2 on Link Road must have traffic impact');
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n============================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED:      ${passedTests}`);
console.log(`FAILED:      ${failedTests}`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL COMMUTE CONTEXT ENGINE TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}
