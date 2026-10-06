/**
 * Transport Schedules and Travel-Time Estimates Verification Script
 *
 * Verifies:
 * - Time conversion and waiting time calculation (with midnight crossing)
 * - Operating window checking (daytime and overnight windows)
 * - Day-of-week service availability
 * - Normal schedule lookup from database timetable trips
 * - Multiple departure options within a time window
 * - Frequency and headway-based timetable synthesis
 * - No-service periods (outside operating hours, non-operating days, suspended segments)
 * - Edge-of-day cases (23:55 to 00:15 midnight wrap)
 * - Invalid inputs and error boundaries
 * - Multi-segment sequential itinerary propagation
 */

const assert = require('assert');
const {
  transportScheduleService,
  TransportScheduleService,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_HEADWAYS
} = require('../services/transportScheduleService');
const { transportNetworkRepository } = require('../repositories/TransportNetworkRepository');
const { transportRepository } = require('../repositories/TransportRepository');
const {
  TransportSegment,
  TransportConnection,
  TransportTimetableOption,
  SegmentTravelEstimate,
  RouteLeg,
  TravelEstimate,
  TRANSPORT_MODES,
  PROVENANCE_TIERS
} = require('../models');
const { ValidationError, NotFoundError } = require('../errors');

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
console.log(' Running Transport Schedules & Travel-Time Verification');
console.log('========================================================\n');

// 0. Ensure foundation seeds exist
transportRepository.seedInitialTransportData();
transportNetworkRepository.seedPrototypeNetwork(true);
transportScheduleService.seedRichTimetables(true);

// ============================================================================
// SUITE 1: TIME UTILITIES & MATH
// ============================================================================

test('Time Math: Converts HH:MM to minutes past midnight and back', () => {
  assert.strictEqual(transportScheduleService.timeToMinutes('00:00'), 0);
  assert.strictEqual(transportScheduleService.timeToMinutes('08:15'), 495);
  assert.strictEqual(transportScheduleService.timeToMinutes('12:00'), 720);
  assert.strictEqual(transportScheduleService.timeToMinutes('23:59'), 1439);

  assert.strictEqual(transportScheduleService.minutesToTime(0), '00:00');
  assert.strictEqual(transportScheduleService.minutesToTime(495), '08:15');
  assert.strictEqual(transportScheduleService.minutesToTime(1439), '23:59');
  assert.strictEqual(transportScheduleService.minutesToTime(1440), '00:00', 'Should wrap 1440m to 00:00');
  assert.strictEqual(transportScheduleService.minutesToTime(1470), '00:30', 'Should wrap 1470m to 00:30');
  assert.strictEqual(transportScheduleService.minutesToTime(-15), '23:45', 'Should wrap negative minutes backwards');
});

test('Time Math: Calculates waiting time including midnight crossing', () => {
  // Normal daytime wait
  assert.strictEqual(transportScheduleService.calculateWaitTime('08:00', '08:15'), 15);
  assert.strictEqual(transportScheduleService.calculateWaitTime('08:05', '08:05'), 0);
  assert.strictEqual(transportScheduleService.calculateWaitTime('08:05', '08:30'), 25);

  // Midnight crossover: requested 23:50, scheduled 00:10 next morning
  const crossoverWait = transportScheduleService.calculateWaitTime('23:50', '00:10');
  assert.strictEqual(crossoverWait, 20, 'Should correctly compute 20 min wait across midnight');
});

test('Time Math: Normalizes date objects, ISO strings, and day names', () => {
  assert.strictEqual(transportScheduleService.normalizeDayOfWeek('Monday'), 'Mon');
  assert.strictEqual(transportScheduleService.normalizeDayOfWeek('mon'), 'Mon');
  assert.strictEqual(transportScheduleService.normalizeDayOfWeek('Wednesday'), 'Wed');
  assert.strictEqual(transportScheduleService.normalizeDayOfWeek('SUN'), 'Sun');

  // ISO Date: 2026-10-06 is a Tuesday
  assert.strictEqual(transportScheduleService.normalizeDayOfWeek('2026-10-06'), 'Tue');

  // Date object: Sunday Oct 11, 2026
  const sundayDate = new Date('2026-10-11T10:00:00Z');
  assert.strictEqual(transportScheduleService.normalizeDayOfWeek(sundayDate), 'Sun');
});

// ============================================================================
// SUITE 2: OPERATING HOURS & AVAILABILITY
// ============================================================================

test('Operating Hours: Validates standard daytime transit windows', () => {
  const metroHours = DEFAULT_OPERATING_HOURS[TRANSPORT_MODES.METRO]; // 05:30 to 23:45
  assert.strictEqual(metroHours.start, '05:30');
  assert.strictEqual(metroHours.end, '23:45');

  assert.strictEqual(transportScheduleService.isWithinOperatingHours('08:00', metroHours), true);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('05:30', metroHours), true);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('23:45', metroHours), true);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('02:30', metroHours), false, 'Late night should be closed');
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('05:15', metroHours), false, 'Before start should be closed');
});

test('Operating Hours: Handles overnight windows spanning midnight (Suburban Rail)', () => {
  const trainHours = DEFAULT_OPERATING_HOURS[TRANSPORT_MODES.TRAIN]; // 04:15 to 01:15
  assert.strictEqual(trainHours.start, '04:15');
  assert.strictEqual(trainHours.end, '01:15');

  // Inside hours
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('08:00', trainHours), true);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('23:55', trainHours), true);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('00:30', trainHours), true);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('01:15', trainHours), true);

  // Outside hours (night maintenance window: 01:16 to 04:14)
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('02:00', trainHours), false);
  assert.strictEqual(transportScheduleService.isWithinOperatingHours('03:45', trainHours), false);
});

// ============================================================================
// SUITE 3: NORMAL SCHEDULE LOOKUP (DATABASE TRIPS)
// ============================================================================

test('Schedule Lookup: Retrieves database timetable departures for suburban train', () => {
  const wrSegment = new TransportSegment({
    id: 'seg-wr-borivali-vileparle',
    serviceId: 'srv-wr-slow',
    mode: 'train',
    lineIdentifier: 'WR-SLOW',
    fromStopId: 'STN_BORIVALI',
    toStopId: 'STN_VILEPARLE',
    fromArea: 'Borivali West',
    toArea: 'Vile Parle West',
    durationMinutes: 28,
    distanceKm: 15.2,
    fareRupees: 10,
    status: 'ACTIVE',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  });

  const estimate = transportScheduleService.getDeparturesForSegment(wrSegment, {
    targetTime: '08:05',
    date: 'Mon',
    windowMinutes: 30
  });

  assert(estimate instanceof SegmentTravelEstimate, 'Must return SegmentTravelEstimate');
  assert.strictEqual(estimate.isServiceAvailable, true, 'Service should be available on Monday at 08:05');
  assert.strictEqual(estimate.availabilityReason, 'OPERATIONAL');
  assert(estimate.departures.length > 0, 'Must return at least one departure');

  // First scheduled trip after 08:05 is 08:15 (TRIP_WR_903)
  const primary = estimate.nextAvailableDeparture;
  assert(primary !== null, 'Must have nextAvailableDeparture');
  assert.strictEqual(primary.scheduledDeparture, '08:15');
  assert.strictEqual(primary.scheduledArrival, '08:43');
  assert.strictEqual(primary.waitingTimeMinutes, 10, 'Wait time from 08:05 to 08:15 should be 10m');
  assert.strictEqual(primary.durationMinutes, 28);
  assert.strictEqual(primary.totalDurationMinutes, 38);
  assert.strictEqual(primary.provenance.sourceTier, PROVENANCE_TIERS.VERIFIED);

  // Expected travel time summary
  assert.strictEqual(estimate.expectedTravelTime.waitingTimeMinutes, 10);
  assert.strictEqual(estimate.expectedTravelTime.segmentDurationMinutes, 28);
  assert.strictEqual(estimate.expectedTravelTime.totalDurationMinutes, 38);
  assert(estimate.expectedTravelTime.confidenceInterval.minMinutes <= estimate.expectedTravelTime.confidenceInterval.maxMinutes);

  // Conversion to RouteLeg
  const leg = primary.toRouteLeg(1);
  assert(leg instanceof RouteLeg, 'Must convert to RouteLeg');
  assert.strictEqual(leg.mode, 'train');
  assert.strictEqual(leg.departureTime, '08:15');
  assert.strictEqual(leg.arrivalTime, '08:43');

  // Conversion to TravelEstimate
  const travelEst = estimate.toTravelEstimate();
  assert(travelEst instanceof TravelEstimate, 'Must convert to TravelEstimate');
  assert.strictEqual(travelEst.totalDurationMinutes, 38);
  assert.strictEqual(travelEst.transitDurationMinutes, 28);
});

// ============================================================================
// SUITE 4: MULTIPLE DEPARTURES WITHIN WINDOW
// ============================================================================

test('Multiple Departures: Returns sorted departure opportunities in window', () => {
  const metroSegment = {
    id: 'seg-metro-test',
    serviceId: 'srv-metro-1',
    mode: 'metro',
    lineIdentifier: 'Line-1',
    fromStopId: 'METRO_VERSOVA',
    toStopId: 'METRO_DNNAGAR',
    fromArea: 'Versova',
    toArea: 'DN Nagar',
    durationMinutes: 5,
    distanceKm: 2.2,
    fareRupees: 10,
    status: 'ACTIVE',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  };

  const estimate = transportScheduleService.getDeparturesForSegment(metroSegment, {
    targetTime: '08:00',
    windowMinutes: 20,
    limit: 4
  });

  assert(estimate.departures.length >= 3, 'Should return at least 3 departures in 20m window for metro');
  assert.strictEqual(estimate.departures[0].scheduledDeparture, '08:00');
  assert.strictEqual(estimate.departures[1].scheduledDeparture, '08:04');
  assert.strictEqual(estimate.departures[2].scheduledDeparture, '08:08');

  // Verify waiting times increase monotonically
  assert.strictEqual(estimate.departures[0].waitingTimeMinutes, 0);
  assert.strictEqual(estimate.departures[1].waitingTimeMinutes, 4);
  assert.strictEqual(estimate.departures[2].waitingTimeMinutes, 8);
});

// ============================================================================
// SUITE 5: FREQUENCY & HEADWAY SYNTHESIS
// ============================================================================

test('Headway Synthesis: Generates synthetic timetable for high-frequency corridor', () => {
  // Segment without explicit DB schedules
  const busSegment = {
    id: 'seg-bus-synthetic',
    serviceId: 'srv-best-unseeded',
    mode: 'bus',
    lineIdentifier: 'BEST-505',
    fromStopId: 'BUS_JUHU',
    toStopId: 'BUS_VILEPARLE',
    fromArea: 'Juhu Circle',
    toArea: 'Vile Parle West',
    durationMinutes: 12,
    distanceKm: 3.0,
    fareRupees: 6,
    status: 'ACTIVE',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  };

  const estimate = transportScheduleService.getDeparturesForSegment(busSegment, {
    targetTime: '08:30',
    windowMinutes: 30
  });

  assert.strictEqual(estimate.isServiceAvailable, true);
  assert(estimate.departures.length >= 2, 'Should synthesize at least 2 bus departures in 30m window');
  assert.strictEqual(estimate.departures[0].provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC);
  assert(estimate.departures[0].frequencyMinutes >= 10, 'Bus frequency should reflect peak/off-peak headway');
});

test('Reverse Lookup: Filters departures to meet target arrival time', () => {
  const metroSegment = {
    id: 'seg-metro-test',
    serviceId: 'srv-metro-1',
    mode: 'metro',
    lineIdentifier: 'Line-1',
    fromStopId: 'METRO_VERSOVA',
    toStopId: 'METRO_DNNAGAR',
    fromArea: 'Versova',
    toArea: 'DN Nagar',
    durationMinutes: 5,
    distanceKm: 2.2,
    fareRupees: 10,
    status: 'ACTIVE',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  };

  // Must arrive at DN Nagar by 08:15
  const estimate = transportScheduleService.getDeparturesForSegment(metroSegment, {
    targetTime: '08:00',
    targetArrivalTime: '08:15',
    windowMinutes: 30
  });

  assert(estimate.departures.length > 0, 'Should find viable departures');
  for (const opt of estimate.departures) {
    const arrM = transportScheduleService.timeToMinutes(opt.scheduledArrival);
    assert(arrM <= transportScheduleService.timeToMinutes('08:15'), 'All returned options must arrive by 08:15');
  }
});

// ============================================================================
// SUITE 6: WAITING TIME & MODAL VARIATIONS
// ============================================================================

test('Modal Variations: Walking, Auto On-Demand, and Modal Transfer links', () => {
  // 1. Pedestrian Walking Segment
  const walkSeg = {
    id: 'seg-walk-1',
    mode: 'walk',
    lineIdentifier: 'Walk',
    fromStopId: 'STOP_A',
    toStopId: 'STOP_B',
    fromArea: 'Area A',
    toArea: 'Area B',
    durationMinutes: 6,
    distanceKm: 0.5,
    fareRupees: 0,
    status: 'ACTIVE'
  };
  const walkEst = transportScheduleService.getDeparturesForSegment(walkSeg, { targetTime: '08:00' });
  assert.strictEqual(walkEst.expectedTravelTime.waitingTimeMinutes, 0, 'Walk has zero waiting time');
  assert.strictEqual(walkEst.expectedTravelTime.totalDurationMinutes, 6);

  // 2. Auto-Rickshaw On-Demand Segment
  const autoSeg = {
    id: 'seg-auto-1',
    mode: 'auto',
    lineIdentifier: 'Auto',
    fromStopId: 'STAND_A',
    toStopId: 'STAND_B',
    fromArea: 'Area A',
    toArea: 'Area B',
    durationMinutes: 8,
    distanceKm: 2.0,
    fareRupees: 28,
    status: 'ACTIVE'
  };
  const autoEst = transportScheduleService.getDeparturesForSegment(autoSeg, { targetTime: '08:00' });
  assert.strictEqual(autoEst.expectedTravelTime.waitingTimeMinutes, 3, 'Auto has average 3m street hailing time');
  assert.strictEqual(autoEst.expectedTravelTime.totalDurationMinutes, 11);

  // 3. Modal Transfer Connection
  const transferConn = new TransportConnection({
    id: 'conn-transfer-test',
    connectionType: 'TRANSFER',
    fromStopId: 'METRO_DNNAGAR',
    toStopId: 'BUS_ANDHERI',
    fromArea: 'DN Nagar Metro',
    toArea: 'BEST Bus Stop',
    mode: 'walk',
    distanceKm: 0.2,
    durationMinutes: 2,
    fareRupees: 0,
    transferPenaltyMin: 3,
    status: 'ACTIVE'
  });
  const transferEst = transportScheduleService.estimateConnection(transferConn, { targetTime: '08:15' });
  assert.strictEqual(transferEst.expectedTravelTime.waitingTimeMinutes, 3, 'Transfer wait equals penalty');
  assert.strictEqual(transferEst.expectedTravelTime.segmentDurationMinutes, 2);
  assert.strictEqual(transferEst.expectedTravelTime.totalDurationMinutes, 5);
});

test('Multi-Segment Itinerary: Propagates sequential departure clocks across multimodal journey', () => {
  // Realistic 5-leg journey: Area A -> Walk -> Metro -> Walk -> Bus -> Walk -> College
  const walk1 = new TransportConnection({
    id: 'c-walk-1',
    connectionType: 'WALKING_ACCESS',
    fromStopId: 'AREA_A',
    toStopId: 'METRO_VERSOVA',
    fromArea: 'Area A',
    toArea: 'Versova Metro',
    mode: 'walk',
    durationMinutes: 6,
    status: 'ACTIVE'
  });

  const metro = new TransportSegment({
    id: 's-metro',
    serviceId: 'srv-metro-1',
    mode: 'metro',
    lineIdentifier: 'Line-1',
    fromStopId: 'METRO_VERSOVA',
    toStopId: 'METRO_DNNAGAR',
    fromArea: 'Versova Metro',
    toArea: 'DN Nagar Metro',
    durationMinutes: 5,
    distanceKm: 2.2,
    fareRupees: 10,
    status: 'ACTIVE'
  });

  const transferWalk = new TransportConnection({
    id: 'c-transfer-2',
    connectionType: 'TRANSFER',
    fromStopId: 'METRO_DNNAGAR',
    toStopId: 'BUS_ANDHERI_W',
    fromArea: 'DN Nagar Metro',
    toArea: 'Andheri West Bus Stand',
    mode: 'walk',
    durationMinutes: 3,
    transferPenaltyMin: 2,
    status: 'ACTIVE'
  });

  const bus = new TransportSegment({
    id: 's-bus',
    serviceId: 'srv-best-201',
    mode: 'bus',
    lineIdentifier: 'BEST-201',
    fromStopId: 'BUS_ANDHERI_W',
    toStopId: 'BUS_IRLA_DJS',
    fromArea: 'Andheri West Bus Stand',
    toArea: 'Irla / D.J. Sanghvi',
    durationMinutes: 14,
    distanceKm: 3.5,
    fareRupees: 6,
    status: 'ACTIVE'
  });

  const walkFinal = new TransportConnection({
    id: 'c-walk-3',
    connectionType: 'WALKING_ACCESS',
    fromStopId: 'BUS_IRLA_DJS',
    toStopId: 'COLLEGE_DJS',
    fromArea: 'Irla Bus Stop',
    toArea: 'D.J. Sanghvi College',
    mode: 'walk',
    durationMinutes: 4,
    status: 'ACTIVE'
  });

  const itinerary = transportScheduleService.estimateMultiSegmentJourney([
    walk1,
    metro,
    transferWalk,
    bus,
    walkFinal
  ], { initialDepartureTime: '08:00', date: 'Mon' });

  assert.strictEqual(itinerary.initialDepartureTime, '08:00');
  assert(itinerary.finalArrivalTime > '08:30', 'Arrival should be after 08:30');
  assert(itinerary.totalJourneyMinutes > 30, 'Total journey duration should exceed 30 min');
  assert.strictEqual(itinerary.totalFareRupees, 16, 'Expected ₹10 Metro + ₹6 Bus fare');
  assert(itinerary.totalTransitMinutes > 0);
  assert(itinerary.totalWalkingMinutes > 0);
  assert(itinerary.travelEstimate instanceof TravelEstimate);
});

// ============================================================================
// SUITE 7: NO-SERVICE PERIODS & STATUS AWARENESS
// ============================================================================

test('No-Service Periods: Correctly flags requests outside operating hours', () => {
  const metroSegment = {
    id: 'seg-metro-night',
    serviceId: 'srv-metro-1',
    mode: 'metro',
    lineIdentifier: 'Line-1',
    fromStopId: 'METRO_VERSOVA',
    toStopId: 'METRO_DNNAGAR',
    fromArea: 'Versova',
    toArea: 'DN Nagar',
    durationMinutes: 5,
    status: 'ACTIVE'
  };

  // 02:30 AM is outside Metro operating hours (05:30 - 23:45)
  const estimate = transportScheduleService.getDeparturesForSegment(metroSegment, {
    targetTime: '02:30',
    date: 'Mon'
  });

  assert.strictEqual(estimate.isServiceAvailable, false);
  assert.strictEqual(estimate.availabilityReason, 'OUTSIDE_OPERATING_HOURS');
  assert.strictEqual(estimate.departures.length, 0);
  assert(estimate.nextAvailableDeparture !== null, 'Should indicate morning first service');
  assert.strictEqual(estimate.nextAvailableDeparture.scheduledDeparture, '05:30');
});

test('No-Service Periods: Rejects requests on non-operating days', () => {
  const weekdayOnlyBus = {
    id: 'seg-bus-weekday',
    serviceId: 'srv-bus-wd',
    mode: 'bus',
    lineIdentifier: 'BEST-EXPRESS',
    fromStopId: 'STOP_A',
    toStopId: 'STOP_B',
    fromArea: 'Area A',
    toArea: 'Area B',
    durationMinutes: 20,
    status: 'ACTIVE',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  };

  // Query on Sunday
  const estimate = transportScheduleService.getDeparturesForSegment(weekdayOnlyBus, {
    targetTime: '08:30',
    date: 'Sun'
  });

  assert.strictEqual(estimate.isServiceAvailable, false);
  assert.strictEqual(estimate.availabilityReason, 'NO_SERVICE_ON_DAY');
  assert.strictEqual(estimate.departures.length, 0);
});

test('Status Awareness: Suspended segments return SERVICE_SUSPENDED', () => {
  const suspendedSeg = {
    id: 'seg-suspended',
    mode: 'train',
    lineIdentifier: 'WR-SUSPENDED',
    fromStopId: 'STOP_A',
    toStopId: 'STOP_B',
    fromArea: 'Area A',
    toArea: 'Area B',
    durationMinutes: 15,
    status: 'SUSPENDED'
  };

  const estimate = transportScheduleService.getDeparturesForSegment(suspendedSeg, {
    targetTime: '08:30'
  });

  assert.strictEqual(estimate.isServiceAvailable, false);
  assert.strictEqual(estimate.availabilityReason, 'SERVICE_SUSPENDED');
  assert.strictEqual(estimate.departures.length, 0);
});

// ============================================================================
// SUITE 8: EDGE-OF-DAY & MIDNIGHT-CROSSING CASES
// ============================================================================

test('Edge-of-Day: Handles midnight departure crossings and wrap times', () => {
  const lateTrainSeg = {
    id: 'seg-late-train',
    mode: 'train',
    lineIdentifier: 'WR-NIGHT',
    fromStopId: 'STN_CHURCHGATE',
    toStopId: 'STN_BORIVALI',
    fromArea: 'Churchgate',
    toArea: 'Borivali',
    durationMinutes: 35,
    distanceKm: 25.0,
    fareRupees: 15,
    status: 'ACTIVE',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  };

  // Departure requested at 23:55, with 30m window reaching into next day (00:25)
  const estimate = transportScheduleService.getDeparturesForSegment(lateTrainSeg, {
    targetTime: '23:55',
    windowMinutes: 30
  });

  assert.strictEqual(estimate.isServiceAvailable, true);
  assert(estimate.departures.length > 0, 'Should find midnight departure');

  const dep = estimate.departures[0];
  // Arrival calculation across midnight
  const depM = transportScheduleService.timeToMinutes(dep.scheduledDeparture);
  const arrM = transportScheduleService.timeToMinutes(dep.scheduledArrival);
  let expectedDiff = arrM - depM;
  if (expectedDiff < 0) expectedDiff += 1440;
  assert.strictEqual(expectedDiff, dep.durationMinutes, 'Arrival time must exactly equal departure + duration');
});

// ============================================================================
// SUITE 9: INVALID INPUT & ERROR BOUNDARIES
// ============================================================================

test('Error Boundaries: Throws ValidationError on missing or invalid segment', () => {
  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment(null);
  }, ValidationError);

  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment({ invalid: true });
  }, ValidationError);
});

test('Error Boundaries: Throws NotFoundError on non-existent string segment ID', () => {
  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment('non-existent-segment-id-999');
  }, NotFoundError);
});

test('Error Boundaries: Throws ValidationError on invalid time formats', () => {
  const dummySeg = {
    id: 'dummy',
    mode: 'walk',
    lineIdentifier: 'Walk',
    fromStopId: 'STOP_A',
    toStopId: 'STOP_B',
    fromArea: 'Area A',
    toArea: 'Area B',
    durationMinutes: 5,
    status: 'ACTIVE'
  };

  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment(dummySeg, { targetTime: '25:00' });
  }, ValidationError);

  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment(dummySeg, { targetTime: '8:65' });
  }, ValidationError);

  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment(dummySeg, { targetTime: 'not-a-time' });
  }, ValidationError);

  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment(dummySeg, { targetTime: '08:00', targetArrivalTime: 'invalid' });
  }, ValidationError);

  assert.throws(() => {
    transportScheduleService.getDeparturesForSegment(dummySeg, { targetTime: '08:00', windowMinutes: -10 });
  }, ValidationError);
});

console.log('\n========================================================');
console.log(` Results: ${passedTests} passed, ${totalTests - passedTests} failed`);
console.log('========================================================\n');

if (totalTests !== passedTests) {
  process.exit(1);
}
