/**
 * Journey Representation & Journey Builder Verification Script
 *
 * Verifies:
 * - Single-mode journey creation (direct walk, auto, train)
 * - Multimodal journey assembly (Area A → Walk → Metro → Transfer → Bus → Walk → College)
 * - Modal transfers and waiting time accounting
 * - First-mile, transfer, and last-mile walking segments
 * - Spatial connection validation (rejects broken, non-adjacent stop links)
 * - Chronological & non-overlapping timing validation (rejects negative or impossible timings)
 * - Unavailable / suspended service rejection
 * - Origin and destination consistency validation
 * - Integration with CommuteRoute contract conversion
 * - Network-to-journey pipeline integration
 */

const assert = require('assert');
const {
  journeyBuilderService,
  JourneyBuilderService
} = require('../services/journeyBuilderService');
const { transportScheduleService } = require('../services/transportScheduleService');
const {
  CommuteJourney,
  JourneySegment,
  JOURNEY_SEGMENT_TYPES,
  RouteLeg,
  CommuteRoute,
  TransportSegment,
  TransportConnection,
  TRANSPORT_MODES,
  LEG_TYPES
} = require('../models');
const { ValidationError } = require('../errors');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('\n========================================================');
console.log(' Running Candidate Journey & Journey Builder Verification');
console.log('========================================================\n');

// ============================================================================
// SUITE 1: SINGLE-MODE JOURNEYS
// ============================================================================

test('Single-Mode: Builds direct walking journey with zero transfers', () => {
  const journey = journeyBuilderService.buildSingleModeJourney({
    origin: 'Vile Parle West',
    destination: 'D.J. Sanghvi College of Engineering',
    mode: 'walk',
    departureTime: '08:15',
    durationMinutes: 12,
    distanceKm: 0.9,
    fareRupees: 0
  });

  assert(journey instanceof CommuteJourney, 'Must return CommuteJourney instance');
  assert.strictEqual(journey.origin, 'Vile Parle West');
  assert.strictEqual(journey.destination, 'D.J. Sanghvi College of Engineering');
  assert.strictEqual(journey.departureTime, '08:15');
  assert.strictEqual(journey.estimatedArrivalTime, '08:27');
  assert.strictEqual(journey.totalDurationMinutes, 12);
  assert.strictEqual(journey.walkingTimeMinutes, 12);
  assert.strictEqual(journey.transitTimeMinutes, 0);
  assert.strictEqual(journey.transferCount, 0);
  assert.strictEqual(journey.estimatedCostRupees, 0);
  assert.strictEqual(journey.isDirect(), true);
  assert.strictEqual(journey.primaryMode, 'walk');
  assert.deepStrictEqual(journey.modesIncluded, ['walk']);
  assert.strictEqual(journey.segments.length, 1);
});

test('Single-Mode: Builds direct auto-rickshaw journey with hailing wait time', () => {
  const journey = journeyBuilderService.buildSingleModeJourney({
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College of Engineering',
    mode: 'auto',
    departureTime: '08:00',
    durationMinutes: 18,
    waitingTimeMinutes: 3,
    distanceKm: 4.2,
    fareRupees: 55
  });

  assert.strictEqual(journey.origin, 'Andheri West');
  assert.strictEqual(journey.destination, 'D.J. Sanghvi College of Engineering');
  assert.strictEqual(journey.totalDurationMinutes, 18);
  assert.strictEqual(journey.totalWaitingTimeMinutes, 3);
  assert.strictEqual(journey.transitTimeMinutes, 18);
  assert.strictEqual(journey.estimatedCostRupees, 55);
  assert.strictEqual(journey.transferCount, 0);
  assert.strictEqual(journey.primaryMode, 'auto');
});

// ============================================================================
// SUITE 2: MULTIMODAL JOURNEY ASSEMBLY (CANONICAL COMMUTE)
// ============================================================================

test('Multimodal: Assembles canonical 5-segment journey (Area A → Walk → Metro → Bus → Walk → College)', () => {
  // Ordered 5-segment student journey
  const segments = [
    new JourneySegment({
      segmentIndex: 0,
      type: LEG_TYPES.WALK,
      mode: 'walk',
      from: 'Area A (Lokhandwala)',
      to: 'Versova Metro Station',
      departureTime: '08:00',
      arrivalTime: '08:06',
      durationMinutes: 6,
      distanceKm: 0.5,
      fareRupees: 0
    }),
    new JourneySegment({
      segmentIndex: 1,
      type: LEG_TYPES.TRANSIT,
      mode: 'metro',
      from: 'Versova Metro Station',
      to: 'DN Nagar Metro Station',
      departureTime: '08:08',
      arrivalTime: '08:13',
      durationMinutes: 5,
      waitingTimeMinutes: 2, // 08:06 to 08:08 wait
      distanceKm: 2.2,
      fareRupees: 10,
      lineIdentifier: 'Line-1'
    }),
    new JourneySegment({
      segmentIndex: 2,
      type: JOURNEY_SEGMENT_TYPES.TRANSFER,
      mode: 'walk',
      from: 'DN Nagar Metro Station',
      to: 'Andheri West Bus Stand',
      departureTime: '08:13',
      arrivalTime: '08:16',
      durationMinutes: 3,
      waitingTimeMinutes: 0,
      distanceKm: 0.2,
      fareRupees: 0
    }),
    new JourneySegment({
      segmentIndex: 3,
      type: LEG_TYPES.TRANSIT,
      mode: 'bus',
      from: 'Andheri West Bus Stand',
      to: 'Irla / D.J. Sanghvi Bus Stop',
      departureTime: '08:20',
      arrivalTime: '08:34',
      durationMinutes: 14,
      waitingTimeMinutes: 4, // 08:16 to 08:20 wait
      distanceKm: 3.5,
      fareRupees: 6,
      lineIdentifier: 'BEST-201'
    }),
    new JourneySegment({
      segmentIndex: 4,
      type: LEG_TYPES.WALK,
      mode: 'walk',
      from: 'Irla / D.J. Sanghvi Bus Stop',
      to: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:34',
      arrivalTime: '08:38',
      durationMinutes: 4,
      distanceKm: 0.3,
      fareRupees: 0
    })
  ];

  const journey = journeyBuilderService.buildJourney(segments, {
    origin: 'Area A (Lokhandwala)',
    destination: 'D.J. Sanghvi College of Engineering'
  });

  assert(journey instanceof CommuteJourney);
  assert.strictEqual(journey.origin, 'Area A (Lokhandwala)');
  assert.strictEqual(journey.destination, 'D.J. Sanghvi College of Engineering');
  assert.strictEqual(journey.departureTime, '08:00');
  assert.strictEqual(journey.estimatedArrivalTime, '08:38');
  assert.strictEqual(journey.totalDurationMinutes, 38, '08:00 to 08:38 is 38 minutes');

  // Breakdown checks
  assert.strictEqual(journey.walkingTimeMinutes, 13, '6m walk + 3m transfer + 4m walk = 13m');
  assert.strictEqual(journey.transitTimeMinutes, 19, '5m metro + 14m bus = 19m');
  assert.strictEqual(journey.totalWaitingTimeMinutes, 6, '2m metro wait + 4m bus wait = 6m');
  assert.strictEqual(journey.estimatedCostRupees, 16, '₹10 Metro + ₹6 Bus = ₹16');
  assert.strictEqual(journey.transferCount, 1, '1 transfer between Metro and Bus');

  // Modality checks
  assert(journey.hasMode('walk'));
  assert(journey.hasMode('metro'));
  assert(journey.hasMode('bus'));
  assert(!journey.isDirect());

  // CommuteRoute contract conversion
  const commuteRoute = journey.toCommuteRoute();
  assert(commuteRoute instanceof CommuteRoute, 'Must convert cleanly to CommuteRoute');
  assert.strictEqual(commuteRoute.legs.length, 5);
  assert.strictEqual(commuteRoute.estimate.totalDurationMinutes, 38);
  assert.strictEqual(commuteRoute.estimate.totalFareRupees, 16);
  assert.strictEqual(commuteRoute.getTransferCount(), 1);
});

// ============================================================================
// SUITE 3: TRANSFERS & WALKING BREAKDOWN
// ============================================================================

test('Transfers: Correctly calculates interchange gaps and transfer counts', () => {
  const trainToMetroSegments = [
    new JourneySegment({
      segmentIndex: 0,
      mode: 'train',
      from: 'Borivali Station',
      to: 'Andheri Station',
      departureTime: '08:00',
      arrivalTime: '08:22',
      durationMinutes: 22,
      fareRupees: 10,
      lineIdentifier: 'WR-SLOW'
    }),
    new JourneySegment({
      segmentIndex: 1,
      type: JOURNEY_SEGMENT_TYPES.TRANSFER,
      mode: 'walk',
      from: 'Andheri Station',
      to: 'Andheri Metro Station',
      departureTime: '08:22',
      arrivalTime: '08:26',
      durationMinutes: 4,
      fareRupees: 0
    }),
    new JourneySegment({
      segmentIndex: 2,
      mode: 'metro',
      from: 'Andheri Metro Station',
      to: 'Ghatkopar Metro Station',
      departureTime: '08:30', // 4 minute wait after transfer
      arrivalTime: '08:42',
      durationMinutes: 12,
      fareRupees: 20,
      lineIdentifier: 'Line-1'
    })
  ];

  const journey = journeyBuilderService.buildJourney(trainToMetroSegments);
  assert.strictEqual(journey.transferCount, 1);
  assert.strictEqual(journey.totalWaitingTimeMinutes, 4, '4 minute gap between arrival at metro and departure');
  assert.strictEqual(journey.transitTimeMinutes, 34);
  assert.strictEqual(journey.walkingTimeMinutes, 4);
  assert.strictEqual(journey.estimatedCostRupees, 30);
});

// ============================================================================
// SUITE 4: INVALID CONNECTIONS (SPATIAL BREAKS)
// ============================================================================

test('Invalid Connections: Rejects broken spatial chains where stops do not connect', () => {
  const brokenSegments = [
    new JourneySegment({
      segmentIndex: 0,
      mode: 'metro',
      from: 'Versova Metro Station',
      to: 'DN Nagar Metro Station',
      departureTime: '08:00',
      arrivalTime: '08:05',
      durationMinutes: 5
    }),
    new JourneySegment({
      segmentIndex: 1,
      mode: 'bus',
      // Starts at Dadar Station instead of DN Nagar!
      from: 'Dadar Western Station',
      to: 'Vile Parle Station',
      departureTime: '08:15',
      arrivalTime: '08:35',
      durationMinutes: 20
    })
  ];

  assert.throws(() => {
    journeyBuilderService.buildJourney(brokenSegments);
  }, /Segments do not connect/);
});

// ============================================================================
// SUITE 5: IMPOSSIBLE TIMING VALIDATION
// ============================================================================

test('Impossible Timing: Rejects overlapping departures (segment leaves before previous arrives)', () => {
  const overlappingSegments = [
    new JourneySegment({
      segmentIndex: 0,
      mode: 'train',
      from: 'Borivali Station',
      to: 'Andheri Station',
      departureTime: '08:00',
      arrivalTime: '08:30', // Arrives at 08:30
      durationMinutes: 30
    }),
    new JourneySegment({
      segmentIndex: 1,
      mode: 'bus',
      from: 'Andheri Station',
      to: 'Vile Parle',
      departureTime: '08:20', // Departs at 08:20 (10 minutes before train arrives!)
      arrivalTime: '08:40',
      durationMinutes: 20
    })
  ];

  assert.throws(() => {
    journeyBuilderService.buildJourney(overlappingSegments);
  }, /Impossible timing: Segment 1 departs at 08:20 before Segment 0 arrives at 08:30/);
});

test('Impossible Timing: Rejects negative duration or waiting times', () => {
  assert.throws(() => {
    new JourneySegment({
      mode: 'walk',
      from: 'Point A',
      to: 'Point B',
      departureTime: '08:00',
      arrivalTime: '08:10',
      durationMinutes: -5 // Negative duration
    });
  }, ValidationError);

  assert.throws(() => {
    new JourneySegment({
      mode: 'walk',
      from: 'Point A',
      to: 'Point B',
      departureTime: '08:00',
      arrivalTime: '08:10',
      durationMinutes: 10,
      waitingTimeMinutes: -3 // Negative waiting time
    });
  }, ValidationError);
});

// ============================================================================
// SUITE 6: MISSING & UNAVAILABLE SERVICE VALIDATION
// ============================================================================

test('Unavailable Service: Rejects suspended or inactive transit segments', () => {
  const suspendedSegment = new JourneySegment({
    segmentIndex: 0,
    mode: 'metro',
    from: 'Versova',
    to: 'DN Nagar',
    departureTime: '08:00',
    arrivalTime: '08:05',
    durationMinutes: 5,
    status: 'SUSPENDED' // Disrupted / Suspended line
  });

  assert.throws(() => {
    journeyBuilderService.buildJourney([suspendedSegment]);
  }, /Unavailable service at segment 0.*status is SUSPENDED/);
});

test('Missing Service: Rejects unsupported transport modes', () => {
  assert.throws(() => {
    new JourneySegment({
      mode: 'teleportation',
      from: 'A',
      to: 'B',
      departureTime: '08:00',
      arrivalTime: '08:05',
      durationMinutes: 5
    });
  }, ValidationError);
});

// ============================================================================
// SUITE 7: ORIGIN & DESTINATION CONSISTENCY
// ============================================================================

test('Consistency: Validates requested origin and destination match journey endpoints', () => {
  const validSegment = new JourneySegment({
    segmentIndex: 0,
    mode: 'walk',
    from: 'Lokhandwala',
    to: 'D.J. Sanghvi College',
    departureTime: '08:00',
    arrivalTime: '08:25',
    durationMinutes: 25
  });

  // Mismatched origin
  assert.throws(() => {
    journeyBuilderService.buildJourney([validSegment], {
      origin: 'Bandra West',
      destination: 'D.J. Sanghvi College'
    });
  }, /Journey origin mismatch/);

  // Mismatched destination
  assert.throws(() => {
    journeyBuilderService.buildJourney([validSegment], {
      origin: 'Lokhandwala',
      destination: 'IIT Bombay Powai'
    });
  }, /Journey destination mismatch/);
});

// ============================================================================
// SUITE 8: NETWORK-TO-JOURNEY INTEGRATION
// ============================================================================

test('Network Integration: Builds validated CommuteJourney from network graph steps', () => {
  const steps = [
    new TransportConnection({
      id: 'net-walk-1',
      connectionType: 'WALKING_ACCESS',
      fromStopId: 'AREA_LOKHANDWALA',
      toStopId: 'METRO_VERSOVA',
      fromArea: 'Lokhandwala',
      toArea: 'Versova Metro',
      mode: 'walk',
      durationMinutes: 6,
      status: 'ACTIVE'
    }),
    new TransportSegment({
      id: 'net-metro-1',
      serviceId: 'srv-metro-1',
      mode: 'metro',
      lineIdentifier: 'Line-1',
      fromStopId: 'METRO_VERSOVA',
      toStopId: 'METRO_DNNAGAR',
      fromArea: 'Versova Metro',
      toArea: 'DN Nagar Metro',
      durationMinutes: 5,
      fareRupees: 10,
      status: 'ACTIVE'
    }),
    new TransportConnection({
      id: 'net-transfer-1',
      connectionType: 'TRANSFER',
      fromStopId: 'METRO_DNNAGAR',
      toStopId: 'BUS_ANDHERI_W',
      fromArea: 'DN Nagar Metro',
      toArea: 'Andheri West Bus Stand',
      mode: 'walk',
      durationMinutes: 3,
      transferPenaltyMin: 2,
      status: 'ACTIVE'
    }),
    new TransportSegment({
      id: 'net-bus-1',
      serviceId: 'srv-best-201',
      mode: 'bus',
      lineIdentifier: 'BEST-201',
      fromStopId: 'BUS_ANDHERI_W',
      toStopId: 'BUS_IRLA_DJS',
      fromArea: 'Andheri West Bus Stand',
      toArea: 'Irla / D.J. Sanghvi',
      durationMinutes: 14,
      fareRupees: 6,
      status: 'ACTIVE'
    }),
    new TransportConnection({
      id: 'net-walk-2',
      connectionType: 'WALKING_ACCESS',
      fromStopId: 'BUS_IRLA_DJS',
      toStopId: 'COLLEGE_DJS',
      fromArea: 'Irla / D.J. Sanghvi',
      toArea: 'D.J. Sanghvi College of Engineering',
      mode: 'walk',
      durationMinutes: 4,
      status: 'ACTIVE'
    })
  ];

  const journey = journeyBuilderService.buildMultimodalFromNetwork(steps, {
    origin: 'Lokhandwala',
    destination: 'D.J. Sanghvi College of Engineering',
    initialDepartureTime: '08:00'
  });

  assert(journey instanceof CommuteJourney);
  assert.strictEqual(journey.segments.length, 5);
  assert(journey.totalDurationMinutes >= 32);
  assert.strictEqual(journey.estimatedCostRupees, 16);
  assert.strictEqual(journey.isViable, true);
});

console.log('\n========================================================');
console.log(` Results: ${passedTests} passed, ${totalTests - passedTests} failed`);
console.log('========================================================\n');

if (totalTests !== passedTests) {
  process.exit(1);
}
