/**
 * Verification Script: Day 16 Traffic Context Integration (P9)
 *
 * Exhaustively tests integrating real-world road traffic conditions into the commute context:
 *
 * Scenarios:
 * 1. No traffic impact (normal/free-flow traffic produces 0 min added delay)
 * 2. Moderate traffic (~6 min added road travel delay)
 * 3. Heavy traffic (+12 min estimated road travel delay)
 * 4. Severe traffic (+28 min road travel delay; route marked impractical)
 * 5. Road segment affected (auto, shared_auto, bus segments incur road traffic delay)
 * 6. Non-road segment unaffected (train, metro, walk are completely immune to vehicular traffic)
 * 7. Expired traffic condition (conditions past expiryTime are ignored)
 * 8. Provenance propagation (preserves VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * 9. CommuteContextService integration (context collection enriches trafficContext)
 */

const assert = require('assert');
const {
  CommuteJourney,
  JourneySegment,
  TrafficCondition,
  TrafficContext,
  JourneyTrafficImpact,
  TRAFFIC_LEVELS,
  PROVENANCE_TIERS,
  DataProvenance
} = require('../models');

const {
  trafficService,
  TrafficService,
  commuteContextService
} = require('../services');

// Helper to create a test candidate journey
function createMockJourney(id, segments = [], options = {}) {
  const totalDuration = segments.reduce((acc, s) => acc + (s.durationMinutes || 0) + (s.waitingTimeMinutes || 0), 0);
  const totalWait = segments.reduce((acc, s) => acc + (s.waitingTimeMinutes || 0), 0);
  const totalWalk = segments.filter(s => s.mode === 'walk').reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const totalTransit = segments.filter(s => ['train', 'metro', 'bus'].includes(s.mode)).reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const modesIncluded = Array.from(new Set(segments.map(s => s.mode)));

  return new CommuteJourney({
    id,
    origin: options.origin || segments[0]?.from || 'Origin Area',
    destination: options.destination || segments[segments.length - 1]?.to || 'D.J. Sanghvi College of Engineering',
    departureTime: options.departureTime || '08:00',
    estimatedArrivalTime: options.estimatedArrivalTime || '08:45',
    totalDurationMinutes: options.totalDurationMinutes || totalDuration || 45,
    totalWaitingTimeMinutes: totalWait,
    walkingTimeMinutes: totalWalk,
    transitTimeMinutes: totalTransit,
    transferCount: Math.max(0, segments.filter(s => ['train', 'metro', 'bus'].includes(s.mode)).length - 1),
    estimatedCostRupees: options.estimatedCostRupees || 25,
    totalDistanceKm: options.totalDistanceKm || 12,
    primaryMode: options.primaryMode || modesIncluded.find(m => m !== 'walk') || 'auto',
    modesIncluded,
    segments: segments.map((s, idx) => new JourneySegment({
      segmentIndex: idx,
      type: s.type || (s.mode === 'walk' ? 'walk' : (['train', 'metro', 'bus'].includes(s.mode) ? 'transit' : 'auto')),
      mode: s.mode,
      from: s.from,
      to: s.to,
      departureTime: s.departureTime || '08:00',
      arrivalTime: s.arrivalTime || '08:20',
      durationMinutes: s.durationMinutes || 20,
      waitingTimeMinutes: s.waitingTimeMinutes || 0,
      distanceKm: s.distanceKm || 5,
      fareRupees: s.fareRupees || 10,
      serviceId: s.serviceId || null,
      lineIdentifier: s.lineIdentifier || s.serviceId || null,
      lineInfo: s.lineInfo || null,
      status: 'ACTIVE',
      provenance: DataProvenance.estimated('Test Fixture').toJSON()
    })),
    advisories: [],
    isViable: true,
    provenance: DataProvenance.estimated('Test Fixture').toJSON()
  });
}

async function runTrafficContextTests() {
  console.log('\n================================================================');
  console.log(' Day 16 Traffic Context Integration Verification');
  console.log('================================================================\n');

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
  // Scenario 1: No Traffic Impact (Normal Traffic)
  // --------------------------------------------------------------------------
  test('Scenario 1: Normal free-flow traffic produces 0 min added delay and no journey impact', () => {
    const journey = createMockJourney('journey-auto-normal', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    const normalCondition = new TrafficCondition({
      id: 'traf-normal-1',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.NORMAL,
      expectedDelayMinutes: 0,
      description: 'Free-flow traffic on SV Road',
      startTime: Date.now() - 10000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.verified('Traffic Control Center').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(journey, [normalCondition]);

    assert(impact instanceof JourneyTrafficImpact, 'Returns JourneyTrafficImpact instance');
    assert.strictEqual(impact.isUnaffected(), true, 'Journey marked unaffected');
    assert.strictEqual(impact.isAffected, false, 'isAffected is false');
    assert.strictEqual(impact.trafficLevel, TRAFFIC_LEVELS.NORMAL, 'Traffic level is normal');
    assert.strictEqual(impact.addedTravelTimeMinutes, 0, 'Added travel time is 0');
    assert.strictEqual(impact.originalDurationMinutes, 20, 'Original duration is 20');
    assert.strictEqual(impact.updatedDurationMinutes, 20, 'Updated duration is 20');
    assert.strictEqual(impact.isImpractical, false, 'isImpractical is false');
    assert.strictEqual(impact.impracticalReason, null, 'impracticalReason is null');
    assert.strictEqual(impact.affectedSegmentsCount, 0, 'Zero segments affected');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Moderate Traffic
  // --------------------------------------------------------------------------
  test('Scenario 2: Moderate traffic adds standard road delay (~6 min) without making route impractical', () => {
    const journey = createMockJourney('journey-auto-moderate', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    const moderateCondition = new TrafficCondition({
      id: 'traf-mod-1',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.MODERATE,
      expectedDelayMinutes: 6,
      description: 'Moderate traffic on SV Road due to signal queuing',
      startTime: Date.now() - 10000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.estimated('Traffic Density Heuristic').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(journey, [moderateCondition]);

    assert.strictEqual(impact.isAffected, true, 'isAffected is true');
    assert.strictEqual(impact.trafficLevel, TRAFFIC_LEVELS.MODERATE, 'Traffic level is moderate');
    assert.strictEqual(impact.addedTravelTimeMinutes, 6, 'Added travel time is 6 min');
    assert.strictEqual(impact.updatedDurationMinutes, 26, 'Updated duration is 20 + 6 = 26 min');
    assert.strictEqual(impact.isImpractical, false, 'isImpractical is false');
    assert.strictEqual(impact.affectedSegmentsCount, 1, '1 segment affected');
    assert.deepStrictEqual(impact.affectedSegmentIndices, [0], 'Segment index 0 is affected');

    // Test journey application helper
    const updatedJourney = trafficService.applyTrafficImpactToJourney(journey, impact);
    assert.strictEqual(updatedJourney.totalDurationMinutes, 26, 'Updated journey duration is 26');
    assert.strictEqual(updatedJourney.isViable, true, 'Moderate traffic preserves viability');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Heavy Traffic (+12 min Road Delay)
  // --------------------------------------------------------------------------
  test('Scenario 3: Heavy traffic adds +12 min estimated road travel delay matching specification', () => {
    const journey = createMockJourney('journey-auto-heavy', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    const heavyCondition = new TrafficCondition({
      id: 'traf-heavy-1',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.HEAVY,
      expectedDelayMinutes: 12,
      description: 'Heavy bumper-to-bumper traffic on SV Road',
      startTime: Date.now() - 10000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.userReported('Community Commuter Feed').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(journey, [heavyCondition]);

    assert.strictEqual(impact.isAffected, true, 'isAffected is true');
    assert.strictEqual(impact.trafficLevel, TRAFFIC_LEVELS.HEAVY, 'Traffic level is heavy');
    assert.strictEqual(impact.addedTravelTimeMinutes, 12, 'Heavy traffic adds exactly +12 min road travel');
    assert.strictEqual(impact.updatedDurationMinutes, 32, 'Updated duration is 20 + 12 = 32 min');
    assert.strictEqual(impact.isImpractical, false, 'Heavy traffic remains viable/practical');
    assert(impact.advisories.length > 0, 'Advisories include heavy traffic message');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Severe Traffic (Route May Become Impractical)
  // --------------------------------------------------------------------------
  test('Scenario 4: Severe traffic marks candidate road route impractical with explicit warning', () => {
    const journey = createMockJourney('journey-auto-severe', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    const severeCondition = new TrafficCondition({
      id: 'traf-sev-1',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.SEVERE,
      expectedDelayMinutes: 28,
      description: 'Severe traffic gridlock on SV Road due to vehicle breakdown and waterlogging',
      startTime: Date.now() - 10000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.verified('Traffic Police Control Room').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(journey, [severeCondition]);

    assert.strictEqual(impact.isAffected, true, 'isAffected is true');
    assert.strictEqual(impact.trafficLevel, TRAFFIC_LEVELS.SEVERE, 'Traffic level is severe');
    assert.strictEqual(impact.addedTravelTimeMinutes, 28, 'Added travel time is 28 min');
    assert.strictEqual(impact.updatedDurationMinutes, 48, 'Updated duration is 48 min');
    assert.strictEqual(impact.isImpractical, true, 'Severe traffic marks route as impractical');
    assert(impact.impracticalReason.includes('impractical'), 'impracticalReason clearly states impractical');

    // Test journey application helper marks isViable as false
    const updatedJourney = trafficService.applyTrafficImpactToJourney(journey, impact);
    assert.strictEqual(updatedJourney.isViable, false, 'Impractical journey has isViable = false');
    assert.strictEqual(updatedJourney.segments[0].status, 'DISRUPTED', 'Segment status updated to DISRUPTED');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Road Segment Affected in Multimodal Journey
  // --------------------------------------------------------------------------
  test('Scenario 5: Road segment in multimodal journey is affected while other segments are isolated', () => {
    const journey = createMockJourney('journey-multimodal-feeder', [
      { mode: 'walk', from: 'Borivali West', to: 'Borivali Station', durationMinutes: 6 },
      { mode: 'train', from: 'Borivali Station', to: 'Andheri Station', serviceId: 'WR-SLOW', durationMinutes: 20 },
      { mode: 'walk', from: 'Andheri Station East', to: 'Andheri Station West', durationMinutes: 4 },
      { mode: 'auto', from: 'Andheri Station West', to: 'D.J. Sanghvi College', durationMinutes: 15 },
      { mode: 'walk', from: 'D.J. Sanghvi Campus Gate', to: 'Main Classroom', durationMinutes: 3 }
    ], { totalDurationMinutes: 48 });

    const autoCondition = new TrafficCondition({
      id: 'traf-andheri-auto',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.HEAVY,
      expectedDelayMinutes: 12,
      description: 'Heavy traffic on SV Road feeder corridor',
      startTime: Date.now() - 10000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.userReported('Student Feed').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(journey, [autoCondition]);

    assert.strictEqual(impact.isAffected, true, 'Journey is affected');
    assert.strictEqual(impact.affectedSegmentsCount, 1, 'Only 1 segment is affected');
    assert.deepStrictEqual(impact.affectedSegmentIndices, [3], 'Exactly segment index 3 (auto) is affected');

    // Inspect individual segments
    assert.strictEqual(impact.segmentImpacts[0].isRoadMode, false, 'Walk segment is not road mode');
    assert.strictEqual(impact.segmentImpacts[0].isAffected, false, 'Walk segment is unaffected');
    assert.strictEqual(impact.segmentImpacts[1].isRoadMode, false, 'Train segment is not road mode');
    assert.strictEqual(impact.segmentImpacts[1].isAffected, false, 'Train segment is unaffected');
    assert.strictEqual(impact.segmentImpacts[3].isRoadMode, true, 'Auto segment is road mode');
    assert.strictEqual(impact.segmentImpacts[3].isAffected, true, 'Auto segment is affected');
    assert.strictEqual(impact.segmentImpacts[3].addedDelayMinutes, 12, 'Auto segment has 12 min delay');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Non-Road Segment Unaffected by Road Traffic
  // --------------------------------------------------------------------------
  test('Scenario 6: Fixed rail transit (train, metro) and pedestrian walking are completely immune to road traffic', () => {
    const trainJourney = createMockJourney('journey-train-only', [
      { mode: 'walk', from: 'Borivali', to: 'Borivali Station', durationMinutes: 8 },
      { mode: 'train', from: 'Borivali Station', to: 'Vile Parle Station', serviceId: 'WR-SLOW', durationMinutes: 28 },
      { mode: 'walk', from: 'Vile Parle Station', to: 'D.J. Sanghvi College', durationMinutes: 8 }
    ], { totalDurationMinutes: 44 });

    // Severe road gridlock on SV Road along the exact same geographic corridor
    const severeRoadCondition = new TrafficCondition({
      id: 'traf-severe-sv',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.SEVERE,
      expectedDelayMinutes: 30,
      description: 'Severe road gridlock on SV Road',
      startTime: Date.now() - 10000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.verified('Traffic Police').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(trainJourney, [severeRoadCondition]);

    assert.strictEqual(impact.isUnaffected(), true, 'Train and walk journey remains unaffected');
    assert.strictEqual(impact.isAffected, false, 'isAffected is false');
    assert.strictEqual(impact.addedTravelTimeMinutes, 0, 'Zero road delay added to train journey');
    assert.strictEqual(impact.isImpractical, false, 'Train journey is practical');
    assert.strictEqual(impact.updatedDurationMinutes, 44, 'Duration remains exactly 44 mins');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Expired Traffic Condition Ignored
  // --------------------------------------------------------------------------
  test('Scenario 7: Expired traffic conditions in the past are ignored and produce zero impact', () => {
    const journey = createMockJourney('journey-auto-expired-test', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    const now = Date.now();
    const expiredCondition = new TrafficCondition({
      id: 'traf-exp-1',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.HEAVY,
      expectedDelayMinutes: 15,
      description: 'Heavy morning peak traffic (now cleared)',
      startTime: now - 3 * 60 * 60 * 1000, // 3 hours ago
      expiryTime: now - 30 * 60 * 1000,     // Expired 30 mins ago
      provenance: DataProvenance.userReported('Past Commuter Feed').toJSON()
    });

    const impact = trafficService.evaluateJourneyTrafficImpact(journey, [expiredCondition], { currentTime: now });

    assert.strictEqual(impact.isUnaffected(), true, 'Journey is unaffected by expired condition');
    assert.strictEqual(impact.isAffected, false, 'isAffected is false');
    assert.strictEqual(impact.addedTravelTimeMinutes, 0, 'Added delay is 0');
    assert.strictEqual(impact.trafficLevel, TRAFFIC_LEVELS.NORMAL, 'Traffic level defaults to normal');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Provenance Propagation Across All 4 Tiers
  // --------------------------------------------------------------------------
  test('Scenario 8: Preserves VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC tiers across traffic impacts', () => {
    const journey = createMockJourney('journey-auto-prov', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    // 1. VERIFIED condition
    const verifiedCond = new TrafficCondition({
      id: 'traf-prov-ver',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.MODERATE,
      expectedDelayMinutes: 6,
      startTime: Date.now() - 1000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.verified('Mumbai Traffic Police').toJSON()
    });
    const verImpact = trafficService.evaluateJourneyTrafficImpact(journey, [verifiedCond]);
    assert.strictEqual(verImpact.hasVerifiedConditions(), true, 'Has verified conditions');
    assert.strictEqual(verImpact.provenance.sourceTier, PROVENANCE_TIERS.VERIFIED, 'Overall tier is VERIFIED');

    // 2. USER_REPORTED condition
    const userCond = new TrafficCondition({
      id: 'traf-prov-user',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.MODERATE,
      expectedDelayMinutes: 6,
      startTime: Date.now() - 1000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.userReported('Student Commuter Feed').toJSON()
    });
    const userImpact = trafficService.evaluateJourneyTrafficImpact(journey, [userCond]);
    assert.strictEqual(userImpact.hasUserReportedConditions(), true, 'Has user reported conditions');
    assert.strictEqual(userImpact.provenance.sourceTier, PROVENANCE_TIERS.USER_REPORTED, 'Overall tier is USER_REPORTED');

    // 3. ESTIMATED condition
    const estCond = new TrafficCondition({
      id: 'traf-prov-est',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.MODERATE,
      expectedDelayMinutes: 6,
      startTime: Date.now() - 1000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.estimated('Road Speed Probe Heuristic').toJSON()
    });
    const estImpact = trafficService.evaluateJourneyTrafficImpact(journey, [estCond]);
    assert.strictEqual(estImpact.hasEstimatedConditions(), true, 'Has estimated conditions');
    assert.strictEqual(estImpact.provenance.sourceTier, PROVENANCE_TIERS.ESTIMATED, 'Overall tier is ESTIMATED');

    // 4. SYNTHETIC condition
    const synthCond = new TrafficCondition({
      id: 'traf-prov-synth',
      area: 'SV Road',
      level: TRAFFIC_LEVELS.MODERATE,
      expectedDelayMinutes: 6,
      startTime: Date.now() - 1000,
      expiryTime: Date.now() + 3600000,
      provenance: DataProvenance.synthetic('Rush-Hour Traffic Simulation').toJSON()
    });
    const synthImpact = trafficService.evaluateJourneyTrafficImpact(journey, [synthCond]);
    assert.strictEqual(synthImpact.hasSyntheticConditions(), true, 'Has synthetic conditions');
    assert.strictEqual(synthImpact.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC, 'Overall tier is SYNTHETIC');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: CommuteContextService Integration
  // --------------------------------------------------------------------------
  await asyncTest('Scenario 9: CommuteContextService seamlessly enriches context with trafficContext', async () => {
    const mockPlanInput = {
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College',
      desiredArrivalTime: '08:45',
      preferredModes: ['auto', 'train']
    };

    const context = await commuteContextService.collectContext(mockPlanInput);

    assert(context.trafficContext !== undefined, 'trafficContext is defined on context');
    assert(typeof context.trafficContext.level === 'string', 'trafficContext has level string');
    assert(typeof context.trafficContext.expectedDelayMinutes === 'number', 'trafficContext has expectedDelayMinutes number');
    assert(typeof context.trafficContext.advisory === 'string', 'trafficContext has advisory string');
    assert(Array.isArray(context.trafficContext.conditions), 'trafficContext has conditions array');
    assert(context.trafficContext.provenance !== undefined, 'trafficContext has provenance');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTrafficContextTests();
}

module.exports = { runTrafficContextTests };
