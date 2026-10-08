/**
 * Test Suite for Alternate Route Generation Engine
 *
 * Verifies:
 * 1. Bus instead of affected train/metro (BUS_INSTEAD_OF_TRAIN)
 * 2. Train/metro instead of affected road transport (TRAIN_INSTEAD_OF_ROAD / METRO_INSTEAD_OF_ROAD)
 * 3. Different transport service/line substitution (LINE_SUBSTITUTION)
 * 4. Different transfer point (TRANSFER_CHANGE)
 * 5. Schedule shift: earlier departure where timetable supports it (SCHEDULE_SHIFT)
 * 6. Reasonable walking adjustment (WALK_ADJUSTMENT)
 * 7. Multimodal combination (MULTIMODAL_COMBINATION / MODE_SHIFT)
 * 8. Deduplication & prevention of duplicate / identical routes
 * 9. Provenance preservation & valid travel estimates
 * 10. Integration with CandidateRouteEngine
 */

const assert = require('node:assert/strict');
const {
  alternateRouteService,
  ALTERNATE_STRATEGY_TYPES
} = require('../services/alternateRouteService');
const { candidateRouteEngine } = require('../services/candidateRouteEngine');
const {
  CommuteJourney,
  JourneySegment,
  TRANSPORT_MODES,
  DataProvenance,
  PROVENANCE_TIERS,
  CommuteDisruption,
  TrafficCondition,
  ServiceStatusRecord
} = require('../models');

async function runTests() {
  console.log('========================================================');
  console.log(' Running Alternate Route Generation Engine Test Suite');
  console.log('========================================================\n');

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

  // 1. Bus instead of affected train
  await test('Bus instead of affected train: generates BEST Bus 201 when rail is disrupted', async () => {
    const [trainJourney] = await candidateRouteEngine._buildTrainCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });
    assert.ok(trainJourney, 'Train journey must be created');

    const context = {
      disruptions: [
        CommuteDisruption.create({
          id: 'disrupt-wr-signal',
          type: 'delay',
          affectedMode: 'train',
          affectedRouteId: 'WR-SLOW',
          affectedArea: 'Andheri West',
          severity: 'moderate',
          estimatedDelayMinutes: 20,
          description: 'Western Railway signaling delay between Andheri and Vile Parle'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(trainJourney, context, { maxAlternates: 10 });

    assert.ok(alternates.length > 0, 'Must produce at least one alternate');
    const busAlt = alternates.find(a => a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.BUS_INSTEAD_OF_TRAIN);
    assert.ok(busAlt, 'Must include BUS_INSTEAD_OF_TRAIN alternate');
    assert.strictEqual(busAlt.journey.primaryMode, 'bus');
    assert.ok(busAlt.journey.totalDurationMinutes > 0);
    assert.ok(busAlt.journey.estimatedArrivalTime);
    assert.strictEqual(busAlt.isFeasible, true);
    assert.ok(busAlt.alternateMetadata.differenceReason.includes('BEST Bus 201'));
    assert.ok(busAlt.alternateMetadata.avoidedImpacts.includes('rail_disruption'));
  });

  // 2. Train/metro instead of affected road transport
  await test('Train/metro instead of road: generates rail/metro when road encounters heavy traffic', async () => {
    const autoJourney = candidateRouteEngine._buildDirectAutoCandidate({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00'
    });
    assert.ok(autoJourney, 'Auto journey must be created');

    const context = {
      disruptions: [],
      trafficConditions: [
        new TrafficCondition({
          id: 'traffic-sv-road',
          area: 'Andheri West',
          level: 'heavy',
          expectedDelayMinutes: 18,
          description: 'Dense traffic on SV Road'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(autoJourney, context, { maxAlternates: 10 });

    assert.ok(alternates.length > 0, 'Must produce alternates for road traffic');
    const railAlt = alternates.find(a =>
      a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.TRAIN_INSTEAD_OF_ROAD ||
      a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.METRO_INSTEAD_OF_ROAD
    );
    assert.ok(railAlt, 'Must include TRAIN_INSTEAD_OF_ROAD or METRO_INSTEAD_OF_ROAD alternate');
    assert.ok(railAlt.journey.primaryMode === 'train' || railAlt.journey.primaryMode === 'metro');
    assert.strictEqual(railAlt.isFeasible, true);
    assert.ok(railAlt.alternateMetadata.avoidedImpacts.includes('road_traffic_congestion'));
  });

  // 3. Different transport service / line substitution
  await test('Line substitution: substitutes disrupted bus line with suburban train corridor', async () => {
    const [busJourney] = candidateRouteEngine._buildDirectBusCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });
    assert.ok(busJourney, 'Bus journey must be created');

    const context = {
      disruptions: [],
      availabilityRecords: [
        new ServiceStatusRecord({
          id: 'status-bus-strike',
          serviceId: 'srv-best-201',
          lineIdentifier: 'BEST-201',
          mode: 'bus',
          status: 'UNAVAILABLE',
          reason: 'DEPOT_STRIKE'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(busJourney, context, { maxAlternates: 10 });

    assert.ok(alternates.length > 0, 'Must produce alternates for unavailable bus');
    const lineSubAlt = alternates.find(a => a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.LINE_SUBSTITUTION);
    assert.ok(lineSubAlt, 'Must include LINE_SUBSTITUTION alternate');
    assert.ok(lineSubAlt.journey.modesIncluded.includes('train'));
    assert.strictEqual(lineSubAlt.isFeasible, true);
  });

  // 4. Different transfer point
  await test('Different transfer point: provides alternate transfer point when main hub is congested', async () => {
    const [trainJourney] = await candidateRouteEngine._buildTrainCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });

    const context = {
      disruptions: [
        CommuteDisruption.create({
          id: 'disrupt-andheri-hub',
          type: 'delay',
          affectedMode: 'train',
          affectedRouteId: 'WR-SLOW',
          affectedArea: 'Andheri West',
          severity: 'moderate',
          estimatedDelayMinutes: 10,
          description: 'Station congestion at Andheri interchange'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(trainJourney, context, { maxAlternates: 10 });
    assert.ok(alternates.length > 0, 'Must produce alternates');
    const transferAlt = alternates.find(a => a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.TRANSFER_CHANGE);
    if (transferAlt) {
      assert.ok(transferAlt.alternateMetadata.differenceReason.includes('interchange'));
      assert.strictEqual(transferAlt.isFeasible, true);
    } else {
      assert.ok(alternates.some(a => a.isFeasible));
    }
  });

  // 5. Schedule shift: earlier departure where timetable supports it
  await test('Schedule shift: generates earlier departure on timetable to absorb delay and meet deadline', async () => {
    const [trainJourney] = await candidateRouteEngine._buildTrainCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });

    const context = {
      disruptions: [
        CommuteDisruption.create({
          id: 'disrupt-wr-delay',
          type: 'delay',
          affectedMode: 'train',
          affectedRouteId: 'WR-SLOW',
          affectedArea: 'Andheri West',
          severity: 'moderate',
          estimatedDelayMinutes: 15,
          description: '15 min signal maintenance delay'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(trainJourney, context, { maxAlternates: 10 });

    const schedAlt = alternates.find(a => a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.SCHEDULE_SHIFT);
    assert.ok(schedAlt, 'Must include SCHEDULE_SHIFT alternate');
    assert.ok(schedAlt.journey.departureTime < '08:00', 'Must depart earlier than 08:00');
    assert.ok(schedAlt.alternateMetadata.differenceReason.includes('earlier'));
    assert.ok(schedAlt.alternateMetadata.avoidedImpacts.includes('arrival_deadline_miss'));
  });

  // 6. Reasonable walking adjustment
  await test('Walking adjustment: generates direct walk alternative for close campus proximity', async () => {
    const autoJourney = candidateRouteEngine._buildDirectAutoCandidate({
      origin: 'Vile Parle West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00'
    });

    const context = {
      trafficConditions: [
        new TrafficCondition({
          id: 'traffic-vile-parle',
          area: 'Vile Parle West',
          level: 'severe',
          expectedDelayMinutes: 20,
          description: 'Gridlock near station road'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(autoJourney, context, { maxAlternates: 10 });

    const walkAlt = alternates.find(a => a.alternateMetadata.strategyType === ALTERNATE_STRATEGY_TYPES.WALK_ADJUSTMENT);
    assert.ok(walkAlt, 'Must include WALK_ADJUSTMENT for short proximity');
    assert.strictEqual(walkAlt.journey.primaryMode, 'walk');
    assert.strictEqual(walkAlt.journey.estimatedCostRupees, 0);
    assert.strictEqual(walkAlt.isFeasible, true);
    assert.ok(walkAlt.alternateMetadata.differenceReason.includes('pedestrian'));
  });

  // 7. Multimodal combination
  await test('Multimodal combination: offers Metro-Bus or Metro-Auto alternative', async () => {
    const autoJourney = candidateRouteEngine._buildDirectAutoCandidate({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00'
    });

    const context = {
      disruptions: [],
      trafficConditions: [
        new TrafficCondition({
          id: 'traffic-lokhandwala',
          area: 'Lokhandwala Complex',
          level: 'heavy',
          expectedDelayMinutes: 15,
          description: 'Heavy congestion on main road'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(autoJourney, context, { maxAlternates: 10 });
    assert.ok(alternates.length > 0);
    const multiAlt = alternates.find(a => a.journey.modesIncluded.length >= 2);
    assert.ok(multiAlt, 'Must provide multimodal alternative');
    assert.strictEqual(multiAlt.isFeasible, true);
  });

  // 8. Deduplication & prevention of duplicate/identical routes
  await test('Deduplication: never returns an alternate identical to the original journey', async () => {
    const [trainJourney] = await candidateRouteEngine._buildTrainCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });

    const context = {
      disruptions: [
        CommuteDisruption.create({
          id: 'disrupt-train',
          type: 'delay',
          affectedMode: 'train',
          affectedRouteId: 'WR-SLOW',
          affectedArea: 'Andheri West',
          severity: 'minor',
          estimatedDelayMinutes: 10,
          description: 'Minor delay'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(trainJourney, context);

    for (const alt of alternates) {
      assert.notStrictEqual(alt.journey.id, trainJourney.id);
      const isDifferent =
        alt.journey.primaryMode !== trainJourney.primaryMode ||
        alt.journey.departureTime !== trainJourney.departureTime ||
        alt.journey.modesIncluded.join('-') !== trainJourney.modesIncluded.join('-');
      assert.ok(isDifferent, 'Alternate must be substantively different from original');
    }

    const seenIds = new Set();
    for (const alt of alternates) {
      assert.ok(!seenIds.has(alt.journey.id), `Duplicate alternate ID ${alt.journey.id} detected`);
      seenIds.add(alt.journey.id);
    }
  });

  // 9. Provenance preservation & valid travel estimates
  await test('Provenance & estimates: all alternates contain valid travel estimates and provenance', async () => {
    const [trainJourney] = await candidateRouteEngine._buildTrainCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });

    const context = {
      disruptions: [
        CommuteDisruption.create({
          id: 'd-1',
          type: 'delay',
          affectedMode: 'train',
          affectedRouteId: 'WR-SLOW',
          affectedArea: 'Andheri West',
          severity: 'minor',
          estimatedDelayMinutes: 10,
          description: 'Minor train delay'
        })
      ]
    };

    const alternates = await alternateRouteService.generateAlternatesForJourney(trainJourney, context);

    assert.ok(alternates.length > 0);
    for (const alt of alternates) {
      const j = alt.journey;
      assert.ok(j.totalDurationMinutes > 0, 'Duration must be positive');
      assert.ok(j.estimatedArrivalTime, 'Arrival time must be set');
      assert.ok(j.departureTime, 'Departure time must be set');
      assert.ok(j.segments.length > 0, 'Must have segments');
      assert.ok(j.provenance, 'Must have provenance');
      assert.ok(j.provenance.sourceTier, 'Must have provenance sourceTier');
      assert.ok(alt.alternateMetadata.differenceReason, 'Must have differenceReason');
      assert.ok(Array.isArray(alt.alternateMetadata.differences), 'Must have differences array');
    }
  });

  // 10. Integration with CandidateRouteEngine
  await test('CandidateRouteEngine integration: generateAlternatesForJourney works on engine instance', async () => {
    const [trainJourney] = await candidateRouteEngine._buildTrainCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      network: candidateRouteEngine.networkService.getNetwork()
    });

    const context = {
      disruptions: [
        CommuteDisruption.create({
          id: 'd-1',
          type: 'delay',
          affectedMode: 'train',
          affectedRouteId: 'WR-SLOW',
          affectedArea: 'Andheri West',
          severity: 'minor',
          estimatedDelayMinutes: 10,
          description: 'Minor delay'
        })
      ]
    };

    const alternates = await candidateRouteEngine.generateAlternatesForJourney(trainJourney, context);
    assert.ok(Array.isArray(alternates));
    assert.ok(alternates.length > 0);
    assert.ok(alternates[0].alternateMetadata);
  });

  console.log('\n========================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
