/**
 * Verification Test Battery: Day 16 Transport Availability Service
 *
 * Validates:
 * 1. Available service (usable, 0 added delay, low uncertainty)
 * 2. Delayed service (usable, expected delay applied, moderate uncertainty)
 * 3. Limited availability (usable but degraded, increased wait/headway, high uncertainty)
 * 4. Unavailable service (not usable, route declared non-viable / requires alternative)
 * 5. Suspended service (not usable, official agency suspension flags journey unusable)
 * 6. Expired status (past records are discarded, defaults to available baseline)
 * 7. Affected candidate route (multimodal candidate journey degraded or blocked by availability)
 * 8. Unaffected candidate route (route on unaffected lines/corridors remains fully available)
 * 9. Provenance propagation (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * 10. CommuteContextService integration (enriches Stage 1 context with availability signals)
 */

const assert = require('assert');
const {
  SERVICE_AVAILABILITY_STATUSES,
  isStatusUsable,
  ServiceStatusRecord,
  SegmentAvailabilityImpact,
  JourneyAvailabilityImpact
} = require('../models/TransportAvailability');
const {
  CommuteJourney,
  JourneySegment,
  DataProvenance,
  PROVENANCE_TIERS,
  TRANSPORT_MODES
} = require('../models');
const {
  transportAvailabilityService,
  TransportAvailabilityService
} = require('../services/transportAvailabilityService');
const { commuteContextService } = require('../services/commuteContextService');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

async function asyncTest(description, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

// Helper: builds a multimodal journey (Walk + Train + Auto)
function createTrainAutoJourney() {
  return new CommuteJourney({
    id: 'journey-train-auto-test',
    origin: 'Borivali West',
    destination: 'D.J. Sanghvi College of Engineering',
    departureTime: '08:00',
    estimatedArrivalTime: '08:45',
    totalDurationMinutes: 45,
    totalWaitingTimeMinutes: 5,
    walkingTimeMinutes: 10,
    transitTimeMinutes: 35,
    totalDistanceKm: 18.0,
    transferCount: 1,
    estimatedCostRupees: 35,
    primaryMode: 'train',
    modesIncluded: ['walk', 'train', 'auto'],
    isViable: true,
    provenance: DataProvenance.estimated('Test Fixture').toJSON(),
    segments: [
      new JourneySegment({
        segmentIndex: 0,
        type: 'walk',
        mode: 'walk',
        from: 'Borivali Home',
        to: 'Borivali Station West',
        departureTime: '08:00',
        arrivalTime: '08:10',
        durationMinutes: 10,
        waitingTimeMinutes: 0,
        distanceKm: 0.8,
        fareRupees: 0,
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      }),
      new JourneySegment({
        segmentIndex: 1,
        type: 'transit',
        mode: 'train',
        from: 'Borivali Station',
        to: 'Andheri Station',
        departureTime: '08:12',
        arrivalTime: '08:34',
        durationMinutes: 22,
        waitingTimeMinutes: 2,
        distanceKm: 14.0,
        fareRupees: 10,
        serviceId: 'WR-SLOW',
        lineIdentifier: 'WR-SLOW',
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      }),
      new JourneySegment({
        segmentIndex: 2,
        type: 'auto',
        mode: 'auto',
        from: 'Andheri Station West',
        to: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:37',
        arrivalTime: '08:45',
        durationMinutes: 8,
        waitingTimeMinutes: 3,
        distanceKm: 3.2,
        fareRupees: 25,
        serviceId: 'AUTO-ANDHERI',
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      })
    ]
  });
}

// Helper: builds an unaffected candidate route (Metro Line 1 + Walk)
function createMetroWalkJourney() {
  return new CommuteJourney({
    id: 'journey-metro-walk-clean',
    origin: 'Ghatkopar East',
    destination: 'DN Nagar Station',
    departureTime: '08:15',
    estimatedArrivalTime: '08:40',
    totalDurationMinutes: 25,
    totalWaitingTimeMinutes: 3,
    walkingTimeMinutes: 5,
    transitTimeMinutes: 20,
    totalDistanceKm: 11.5,
    transferCount: 0,
    estimatedCostRupees: 20,
    primaryMode: 'metro',
    modesIncluded: ['metro', 'walk'],
    isViable: true,
    provenance: DataProvenance.estimated('Test Fixture').toJSON(),
    segments: [
      new JourneySegment({
        segmentIndex: 0,
        type: 'transit',
        mode: 'metro',
        from: 'Ghatkopar Metro',
        to: 'DN Nagar Metro',
        departureTime: '08:15',
        arrivalTime: '08:35',
        durationMinutes: 20,
        waitingTimeMinutes: 3,
        distanceKm: 11.0,
        fareRupees: 20,
        serviceId: 'Line-1-Main',
        lineIdentifier: 'Line-1',
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      }),
      new JourneySegment({
        segmentIndex: 1,
        type: 'walk',
        mode: 'walk',
        from: 'DN Nagar Metro',
        to: 'Target Campus Gate',
        departureTime: '08:35',
        arrivalTime: '08:40',
        durationMinutes: 5,
        waitingTimeMinutes: 0,
        distanceKm: 0.5,
        fareRupees: 0,
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      })
    ]
  });
}

async function runAvailabilityTests() {
  console.log('\n================================================================');
  console.log(' Day 16 Transport Availability Service Verification');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 1: Available Service
  // --------------------------------------------------------------------------
  test('Scenario 1: Available service is usable with 0 added delay and low uncertainty', () => {
    const record = new ServiceStatusRecord({
      id: 'avail-rec-metro-normal',
      serviceId: 'Line-1-Main',
      mode: 'metro',
      status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE,
      expectedDelayMinutes: 0,
      addedWaitMinutes: 0,
      uncertaintyLevel: 'LOW',
      reason: 'On-time operations'
    });

    const testSegment = { mode: 'metro', serviceId: 'Line-1-Main', from: 'Ghatkopar', to: 'Andheri' };
    const usability = transportAvailabilityService.isSegmentUsable(testSegment, { records: [record] });
    assert.strictEqual(usability.usable, true, 'Available service is usable');
    assert.strictEqual(usability.status, SERVICE_AVAILABILITY_STATUSES.AVAILABLE);

    const impact = transportAvailabilityService.evaluateSegmentAvailability(testSegment, { records: [record] });
    assert.strictEqual(impact.isUsable, true);
    assert.strictEqual(impact.status, SERVICE_AVAILABILITY_STATUSES.AVAILABLE);
    assert.strictEqual(impact.totalDelayMinutes, 0);
    assert.strictEqual(impact.uncertaintyLevel, 'LOW');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Delayed Service
  // --------------------------------------------------------------------------
  test('Scenario 2: Delayed service remains usable while applying expected en-route delays', () => {
    const record = new ServiceStatusRecord({
      id: 'avail-rec-wr-delay',
      serviceId: 'WR-SLOW',
      mode: 'train',
      status: SERVICE_AVAILABILITY_STATUSES.DELAYED,
      expectedDelayMinutes: 8,
      addedWaitMinutes: 3,
      uncertaintyLevel: 'MODERATE',
      reason: 'Signal inspection at Bandra'
    });

    const testSegment = { mode: 'train', serviceId: 'WR-SLOW', from: 'Borivali', to: 'Andheri' };
    const usability = transportAvailabilityService.isSegmentUsable(testSegment, { records: [record] });
    assert.strictEqual(usability.usable, true, 'Delayed service remains usable');
    assert.strictEqual(usability.status, SERVICE_AVAILABILITY_STATUSES.DELAYED);

    const impact = transportAvailabilityService.evaluateSegmentAvailability(testSegment, { records: [record] });
    assert.strictEqual(impact.isUsable, true);
    assert.strictEqual(impact.status, SERVICE_AVAILABILITY_STATUSES.DELAYED);
    assert.strictEqual(impact.addedTravelTimeMinutes, 8);
    assert.strictEqual(impact.addedWaitMinutes, 3);
    assert.strictEqual(impact.totalDelayMinutes, 11);
    assert.strictEqual(impact.uncertaintyLevel, 'MODERATE');
    assert(impact.advisory.includes('running with +8 min delay'));
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Limited Availability (Auto Shortage / Headway Increase)
  // --------------------------------------------------------------------------
  test('Scenario 3: Limited availability captures auto shortages or missed bus headways with high uncertainty', () => {
    const record = new ServiceStatusRecord({
      id: 'avail-rec-andheri-auto-limit',
      mode: 'auto',
      area: 'Andheri Station West',
      status: SERVICE_AVAILABILITY_STATUSES.LIMITED,
      expectedDelayMinutes: 0,
      addedWaitMinutes: 14,
      uncertaintyLevel: 'HIGH',
      reason: 'Long passenger queue outside station'
    });

    const autoSegment = { mode: 'auto', from: 'Andheri Station West', to: 'D.J. Sanghvi College' };
    const usability = transportAvailabilityService.isSegmentUsable(autoSegment, { records: [record] });
    assert.strictEqual(usability.usable, true, 'Limited service remains usable');
    assert.strictEqual(usability.status, SERVICE_AVAILABILITY_STATUSES.LIMITED);

    const impact = transportAvailabilityService.evaluateSegmentAvailability(autoSegment, { records: [record] });
    assert.strictEqual(impact.isUsable, true);
    assert.strictEqual(impact.status, SERVICE_AVAILABILITY_STATUSES.LIMITED);
    assert.strictEqual(impact.addedWaitMinutes, 14);
    assert.strictEqual(impact.uncertaintyLevel, 'HIGH');
    assert(impact.advisory.includes('+14 min expected wait'));
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Unavailable Service
  // --------------------------------------------------------------------------
  test('Scenario 4: Unavailable service marks segment not usable with clear explanation', () => {
    const record = new ServiceStatusRecord({
      id: 'avail-rec-sharedauto-empty',
      mode: 'shared_auto',
      area: 'Vile Parle West',
      status: SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE,
      expectedDelayMinutes: 0,
      addedWaitMinutes: 0,
      uncertaintyLevel: 'SEVERE',
      reason: 'Shared auto stand completely empty'
    });

    const sharedAutoSegment = { mode: 'shared_auto', from: 'Vile Parle West', to: 'DJSCE' };
    const usability = transportAvailabilityService.isSegmentUsable(sharedAutoSegment, { records: [record] });
    assert.strictEqual(usability.usable, false, 'Unavailable service is NOT usable');
    assert.strictEqual(usability.status, SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE);
    assert.strictEqual(usability.reason, 'Shared auto stand completely empty');

    const impact = transportAvailabilityService.evaluateSegmentAvailability(sharedAutoSegment, { records: [record] });
    assert.strictEqual(impact.isUsable, false);
    assert.strictEqual(impact.status, SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Suspended Service
  // --------------------------------------------------------------------------
  test('Scenario 5: Suspended transit service halts usage and marks segment suspended', () => {
    const record = new ServiceStatusRecord({
      id: 'avail-rec-metro-susp',
      serviceId: 'Line-1',
      mode: 'metro',
      status: SERVICE_AVAILABILITY_STATUSES.SUSPENDED,
      uncertaintyLevel: 'SEVERE',
      reason: 'Power traction maintenance'
    });

    const metroSegment = { mode: 'metro', serviceId: 'Line-1', from: 'Versova', to: 'Andheri' };
    const usability = transportAvailabilityService.isSegmentUsable(metroSegment, { records: [record] });
    assert.strictEqual(usability.usable, false, 'Suspended service is NOT usable');
    assert.strictEqual(usability.status, SERVICE_AVAILABILITY_STATUSES.SUSPENDED);

    const impact = transportAvailabilityService.evaluateSegmentAvailability(metroSegment, { records: [record] });
    assert.strictEqual(impact.isUsable, false);
    assert.strictEqual(impact.status, SERVICE_AVAILABILITY_STATUSES.SUSPENDED);
    assert(impact.advisory.includes('suspended'));
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Expired Status Record
  // --------------------------------------------------------------------------
  test('Scenario 6: Expired status records are ignored and default cleanly to available', () => {
    const pastTime = Date.now() - 3600000;
    const expiredRecord = new ServiceStatusRecord({
      id: 'avail-rec-old-strike',
      mode: 'bus',
      serviceId: 'BEST-201',
      status: SERVICE_AVAILABILITY_STATUSES.SUSPENDED,
      effectiveTime: pastTime - 7200000,
      expiryTime: pastTime - 1800000, // expired 30 mins before pastTime
      reason: 'Historical bus depot strike'
    });

    const busSegment = { mode: 'bus', serviceId: 'BEST-201', from: 'Andheri', to: 'Juhu' };
    const usability = transportAvailabilityService.isSegmentUsable(busSegment, {
      records: [expiredRecord],
      currentTime: pastTime
    });

    assert.strictEqual(usability.usable, true, 'Expired status is discarded; segment is usable');
    assert.strictEqual(usability.status, SERVICE_AVAILABILITY_STATUSES.AVAILABLE);

    const impact = transportAvailabilityService.evaluateSegmentAvailability(busSegment, {
      records: [expiredRecord],
      currentTime: pastTime
    });
    assert.strictEqual(impact.isUsable, true);
    assert.strictEqual(impact.status, SERVICE_AVAILABILITY_STATUSES.AVAILABLE);
    assert.strictEqual(impact.totalDelayMinutes, 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Affected Candidate Route Evaluation
  // --------------------------------------------------------------------------
  test('Scenario 7: Candidate journey with delayed train and limited auto updates duration and arrival time', () => {
    const journey = createTrainAutoJourney();
    const initialDuration = journey.totalDurationMinutes;
    const initialArrival = journey.estimatedArrivalTime;

    const records = [
      new ServiceStatusRecord({
        id: 'rec-wr-delay',
        serviceId: 'WR-SLOW',
        mode: 'train',
        status: SERVICE_AVAILABILITY_STATUSES.DELAYED,
        expectedDelayMinutes: 7,
        addedWaitMinutes: 2,
        uncertaintyLevel: 'MODERATE',
        reason: 'Signal maintenance'
      }),
      new ServiceStatusRecord({
        id: 'rec-andheri-auto-queue',
        mode: 'auto',
        area: 'Andheri Station West',
        status: SERVICE_AVAILABILITY_STATUSES.LIMITED,
        expectedDelayMinutes: 0,
        addedWaitMinutes: 10,
        uncertaintyLevel: 'HIGH',
        reason: 'Evening rush queue'
      })
    ];

    const journeyImpact = transportAvailabilityService.evaluateJourneyAvailability(journey, records);

    assert.strictEqual(journeyImpact.isUsable, true, 'Journey remains usable');
    assert.strictEqual(journeyImpact.status, SERVICE_AVAILABILITY_STATUSES.LIMITED, 'Dominant status is LIMITED');
    assert.strictEqual(journeyImpact.totalAddedTravelTimeMinutes, 7);
    assert.strictEqual(journeyImpact.totalAddedWaitMinutes, 12);
    assert.strictEqual(journeyImpact.totalDelayMinutes, 19);
    assert.strictEqual(journeyImpact.affectedSegmentsCount, 2);
    assert.strictEqual(journeyImpact.uncertaintyLevel, 'HIGH');

    const updatedJourney = transportAvailabilityService.applyAvailabilityToJourney(journey, journeyImpact);
    assert.strictEqual(updatedJourney.totalDurationMinutes, initialDuration + 19);
    assert.notStrictEqual(updatedJourney.estimatedArrivalTime, initialArrival);
    assert.strictEqual(updatedJourney.isViable, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Unaffected Candidate Route
  // --------------------------------------------------------------------------
  test('Scenario 8: Candidate journey on unaffected corridor remains 100% available with zero delay', () => {
    const cleanJourney = createMetroWalkJourney();
    const initialDuration = cleanJourney.totalDurationMinutes;

    // Active records affecting Western Railway and Bus, but NOT Metro Line 1
    const records = [
      new ServiceStatusRecord({
        id: 'rec-wr-disturb',
        serviceId: 'WR-FAST',
        mode: 'train',
        status: SERVICE_AVAILABILITY_STATUSES.SUSPENDED,
        reason: 'Line block'
      }),
      new ServiceStatusRecord({
        id: 'rec-bus-delay',
        serviceId: 'BEST-339',
        mode: 'bus',
        status: SERVICE_AVAILABILITY_STATUSES.DELAYED,
        expectedDelayMinutes: 20
      })
    ];

    const journeyImpact = transportAvailabilityService.evaluateJourneyAvailability(cleanJourney, records);

    assert.strictEqual(journeyImpact.isUsable, true, 'Clean journey is usable');
    assert.strictEqual(journeyImpact.isAvailable(), true, 'isAvailable helper returns true');
    assert.strictEqual(journeyImpact.hasDegradedService(), false, 'hasDegradedService is false');
    assert.strictEqual(journeyImpact.status, SERVICE_AVAILABILITY_STATUSES.AVAILABLE);
    assert.strictEqual(journeyImpact.totalDelayMinutes, 0);
    assert.strictEqual(journeyImpact.affectedSegmentsCount, 0);
    assert.strictEqual(journeyImpact.uncertaintyLevel, 'LOW');

    const updated = transportAvailabilityService.applyAvailabilityToJourney(cleanJourney, journeyImpact);
    assert.strictEqual(updated.totalDurationMinutes, initialDuration);
    assert.strictEqual(updated.isViable, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Provenance Propagation (All 4 Tiers)
  // --------------------------------------------------------------------------
  test('Scenario 9: Preserves VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC tiers', () => {
    const prototypeRecords = transportAvailabilityService.seedPrototypeStatusRecords();
    assert(prototypeRecords.length >= 5, 'Seeds at least 5 prototype availability records');

    const verified = prototypeRecords.find(r => r.provenance.sourceTier === PROVENANCE_TIERS.VERIFIED);
    const user = prototypeRecords.find(r => r.provenance.sourceTier === PROVENANCE_TIERS.USER_REPORTED);
    const est = prototypeRecords.find(r => r.provenance.sourceTier === PROVENANCE_TIERS.ESTIMATED);
    const synth = prototypeRecords.find(r => r.provenance.sourceTier === PROVENANCE_TIERS.SYNTHETIC);

    assert(verified !== undefined, 'Found VERIFIED record');
    assert(user !== undefined, 'Found USER_REPORTED record');
    assert(est !== undefined, 'Found ESTIMATED record');
    assert(synth !== undefined, 'Found SYNTHETIC record');

    const journey = createTrainAutoJourney();
    const impact = transportAvailabilityService.evaluateJourneyAvailability(journey, prototypeRecords);

    assert(impact.hasVerifiedData(), 'Propagates VERIFIED data tier');
    assert(impact.hasUserReportedData(), 'Propagates USER_REPORTED data tier');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: CommuteContextService Integration
  // --------------------------------------------------------------------------
  await asyncTest('Scenario 10: CommuteContextService seamlessly enriches Stage 1 context with availability signals', async () => {
    const mockPlanInput = {
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      desiredArrivalTime: '08:45',
      preferredModes: ['auto', 'train']
    };

    const context = await commuteContextService.collectContext(mockPlanInput);

    assert(context.availabilityContext !== undefined, 'availabilityContext is present in context');
    assert(typeof context.availabilityContext.status === 'string', 'availabilityContext has status');
    assert(typeof context.availabilityContext.isUsable === 'boolean', 'availabilityContext has isUsable boolean');
    assert(Array.isArray(context.availabilityContext.records), 'availabilityContext has records array');
    assert(context.availabilityContext.provenance !== undefined, 'availabilityContext has provenance');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAvailabilityTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
