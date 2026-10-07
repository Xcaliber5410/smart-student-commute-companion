/**
 * Verification Script: Day 16 Disruption Impact Analysis Engine (P9)
 *
 * Exhaustively tests calculating the deterministic impact of real-world disruptions on candidate journeys:
 *
 * Scenarios:
 * 1. Unaffected route (disruptions on other lines/areas do not touch journey)
 * 2. Delayed segment (affects single segment, increases travel time, journey remains feasible)
 * 3. Unavailable service (service suspension / cancellation makes segment and journey infeasible)
 * 4. Affected multimodal journey (affects multiple segments across transit modes, increases wait + travel)
 * 5. Route made impossible (route closure / critical barrier makes journey infeasible, requires alternative)
 * 6. Multiple simultaneous disruptions (evaluates diverse candidate set against concurrent network disruptions)
 * 7. Provenance propagation (preserves VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC across all levels)
 * 8. Backward-compatibility with Day 14 recommendation pipeline methods
 */

const assert = require('assert');
const {
  CommuteJourney,
  JourneySegment,
  CommuteDisruption,
  JourneyDisruptionImpact,
  DISRUPTION_CATEGORIES,
  IMPACT_SCOPES,
  FEASIBILITY_REASONS,
  PROVENANCE_TIERS,
  DISRUPTION_SEVERITIES,
  DataProvenance
} = require('../models');

const {
  disruptionImpactService,
  DisruptionImpactService
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
    primaryMode: options.primaryMode || modesIncluded.find(m => m !== 'walk') || 'train',
    modesIncluded,
    segments: segments.map((s, idx) => new JourneySegment({
      segmentIndex: idx,
      type: s.type || (s.mode === 'walk' ? 'walk' : 'transit'),
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

function runDisruptionImpactTests() {
  console.log('\n================================================================');
  console.log(' Day 16 Disruption Impact Analysis Engine Verification');
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

  // --------------------------------------------------------------------------
  // Scenario 1: Unaffected Route
  // --------------------------------------------------------------------------
  test('Scenario 1: Unaffected route receives clean non-impacted status with zero added delay', () => {
    const journey = createMockJourney('journey-wr-train', [
      { mode: 'walk', from: 'Borivali West', to: 'Borivali Station', durationMinutes: 8 },
      { mode: 'train', from: 'Borivali Station', to: 'Vile Parle Station', serviceId: 'WR-SLOW', durationMinutes: 28 },
      { mode: 'walk', from: 'Vile Parle Station', to: 'D.J. Sanghvi College', durationMinutes: 10 }
    ], { totalDurationMinutes: 46 });

    // Disruptions located on Central Railway (Thane) and Colaba Metro Line 3
    const unrelatedDisruptions = [
      new CommuteDisruption({
        id: 'disr-cr-thane',
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'CR-SLOW',
        affectedArea: 'Thane - Mulund',
        severity: 'severe',
        description: 'Signal failure near Thane on Central Railway',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 25,
        provenance: DataProvenance.verified('Central Railway Bulletin').toJSON()
      }),
      new CommuteDisruption({
        id: 'disr-colaba-waterlog',
        type: 'waterlogging',
        affectedMode: 'auto',
        affectedRouteId: null,
        affectedArea: 'Colaba Causeway',
        severity: 'moderate',
        description: 'Waterlogging along Colaba Causeway',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 15,
        provenance: DataProvenance.userReported('Community Feed').toJSON()
      })
    ];

    const impact = disruptionImpactService.evaluateJourneyImpact(journey, unrelatedDisruptions);

    assert(impact instanceof JourneyDisruptionImpact, 'Returns JourneyDisruptionImpact instance');
    assert.strictEqual(impact.isUnaffected(), true, 'Journey should be marked unaffected');
    assert.strictEqual(impact.isAffected, false, 'isAffected must be false');
    assert.strictEqual(impact.isFeasible, true, 'isFeasible must remain true');
    assert.strictEqual(impact.feasibilityReason, FEASIBILITY_REASONS.OPERATIONAL, 'Feasibility is OPERATIONAL');
    assert.strictEqual(impact.impactScope, IMPACT_SCOPES.NONE, 'Impact scope must be NONE');
    assert.strictEqual(impact.affectedSegmentsCount, 0, 'Zero segments affected');
    assert.strictEqual(impact.affectedSegmentIndices.length, 0, 'No segment indices affected');
    assert.strictEqual(impact.totalDelayMinutes, 0, 'Total delay is 0');
    assert.strictEqual(impact.addedTravelTimeMinutes, 0, 'Added travel time is 0');
    assert.strictEqual(impact.addedWaitingTimeMinutes, 0, 'Added waiting time is 0');
    assert.strictEqual(impact.updatedDurationMinutes, 46, 'Updated duration matches original duration');
    assert.strictEqual(impact.requiresAlternative, false, 'Does not require alternative');
    assert.strictEqual(impact.disruptions.length, 0, 'No disruptions matched');
    assert.strictEqual(impact.hasVerifiedDisruptions(), true, 'Has clean verified baseline');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Delayed Segment (Single Segment Impact)
  // --------------------------------------------------------------------------
  test('Scenario 2: Single segment road traffic delay increases expected travel time while preserving feasibility', () => {
    const journey = createMockJourney('journey-direct-auto', [
      { mode: 'auto', from: 'Andheri West', to: 'D.J. Sanghvi College', durationMinutes: 22, waitingTimeMinutes: 3 }
    ], { totalDurationMinutes: 25 });

    const roadTrafficDisruption = new CommuteDisruption({
      id: 'disr-sv-traffic',
      type: 'traffic',
      affectedMode: 'auto',
      affectedRouteId: null,
      affectedArea: 'Andheri West - Vile Parle',
      severity: 'moderate',
      description: 'Heavy bumper-to-bumper traffic congestion on SV Road between Andheri West and Vile Parle',
      startTime: Date.now() - 15000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 14,
      provenance: DataProvenance.userReported('Traffic Police Alert', 'Heavy traffic reported', 'HIGH').toJSON()
    });

    const impact = disruptionImpactService.evaluateJourneyImpact(journey, [roadTrafficDisruption]);

    assert.strictEqual(impact.isAffected, true, 'isAffected must be true');
    assert.strictEqual(impact.isFeasible, true, 'isFeasible must remain true for moderate delay');
    assert.strictEqual(impact.isSingleSegment(), true, 'isSingleSegment must be true');
    assert.strictEqual(impact.impactScope, IMPACT_SCOPES.SINGLE_SEGMENT, 'Impact scope is SINGLE_SEGMENT');
    assert.strictEqual(impact.affectedSegmentsCount, 1, 'Exactly 1 segment affected');
    assert.deepStrictEqual(impact.affectedSegmentIndices, [0], 'Segment index 0 is affected');
    assert.strictEqual(impact.addedTravelTimeMinutes, 14, 'Added travel time is 14 minutes');
    assert.strictEqual(impact.addedWaitingTimeMinutes, 0, 'No added waiting time for road traffic');
    assert.strictEqual(impact.totalDelayMinutes, 14, 'Total delay is 14 minutes');
    assert.strictEqual(impact.updatedDurationMinutes, 39, 'Updated duration is 25 + 14 = 39 minutes');
    assert.strictEqual(impact.requiresAlternative, false, 'Moderate delay does not require alternative');

    // Test journey clone/application
    const updatedJourney = disruptionImpactService.applyImpactToJourney(journey, impact);
    assert.strictEqual(updatedJourney.totalDurationMinutes, 39, 'Updated journey duration is 39');
    assert.strictEqual(updatedJourney.segments[0].status, 'DISRUPTED', 'Segment status updated to DISRUPTED');
    assert.strictEqual(updatedJourney.segments[0].durationMinutes, 36, 'Segment duration updated to 22 + 14 = 36');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Unavailable Service (Suspension / Cancellation)
  // --------------------------------------------------------------------------
  test('Scenario 3: Transport service suspension marks segment and journey infeasible, requiring alternative', () => {
    const journey = createMockJourney('journey-bus-commute', [
      { mode: 'walk', from: 'Andheri West', to: 'Andheri Bus Station', durationMinutes: 5 },
      { mode: 'bus', from: 'Andheri Bus Station', to: 'Irla / D.J. Sanghvi', serviceId: 'BEST-201', durationMinutes: 18 },
      { mode: 'walk', from: 'Irla / D.J. Sanghvi', to: 'D.J. Sanghvi College', durationMinutes: 4 }
    ], { totalDurationMinutes: 27 });

    const busSuspensionDisruption = new CommuteDisruption({
      id: 'disr-best-strike',
      type: 'service_suspension',
      affectedMode: 'bus',
      affectedRouteId: 'BEST-201',
      affectedArea: 'Andheri West - Juhu',
      severity: 'severe',
      description: 'BEST Route 201 suspended due to flash depot staff strike outside Andheri',
      startTime: Date.now() - 20000,
      endTime: Date.now() + 7200000,
      status: 'active',
      estimatedDelayMinutes: 45,
      provenance: DataProvenance.verified('BEST Undertaking Press Release', 'Official strike announcement', 'HIGH').toJSON()
    });

    const impact = disruptionImpactService.evaluateJourneyImpact(journey, [busSuspensionDisruption]);

    assert.strictEqual(impact.isAffected, true, 'isAffected must be true');
    assert.strictEqual(impact.isFeasible, false, 'isFeasible must be false for suspended service');
    assert.strictEqual(impact.isJourneyInfeasible(), true, 'isJourneyInfeasible() returns true');
    assert.strictEqual(impact.feasibilityReason, FEASIBILITY_REASONS.SERVICE_SUSPENDED, 'Feasibility reason is SERVICE_SUSPENDED');
    assert.strictEqual(impact.requiresAlternative, true, 'requiresAlternative must be true');
    assert.strictEqual(impact.requiresAlternativeConnection(), true, 'requiresAlternativeConnection() returns true');
    assert(impact.alternativeReason.includes('BUS'), 'Alternative reason mentions BUS leg');
    assert(impact.alternativeReason.includes('infeasible'), 'Alternative reason states infeasible');

    // Check segment-level impact
    const busSegmentImpact = impact.segmentImpacts[1];
    assert.strictEqual(busSegmentImpact.isAffected, true, 'Bus segment is affected');
    assert.strictEqual(busSegmentImpact.isFeasible, false, 'Bus segment is infeasible');
    assert.strictEqual(busSegmentImpact.feasibilityReason, FEASIBILITY_REASONS.SERVICE_SUSPENDED, 'Segment feasibility reason is SERVICE_SUSPENDED');

    // Applied journey verification
    const updatedJourney = disruptionImpactService.applyImpactToJourney(journey, impact);
    assert.strictEqual(updatedJourney.isViable, false, 'Updated journey viability is false');
    assert.strictEqual(updatedJourney.segments[1].status, 'SUSPENDED', 'Bus segment marked SUSPENDED');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Affected Multimodal Journey (Multiple Segments Affected)
  // --------------------------------------------------------------------------
  test('Scenario 4: Multimodal journey with Metro crowding and BEST Bus delay incurs both wait and travel delays', () => {
    const journey = createMockJourney('journey-multimodal-lokhandwala', [
      { mode: 'walk', from: 'Lokhandwala', to: 'Versova Metro', durationMinutes: 10 },
      { mode: 'metro', from: 'Versova Metro', to: 'DN Nagar Metro', serviceId: 'Line-1', lineIdentifier: 'Line-1', durationMinutes: 6, waitingTimeMinutes: 4 },
      { mode: 'walk', from: 'DN Nagar Metro', to: 'DN Nagar Bus Stop', durationMinutes: 3 },
      { mode: 'bus', from: 'DN Nagar Bus Stop', to: 'Irla', serviceId: 'BEST-201', lineIdentifier: 'BEST-201', durationMinutes: 14, waitingTimeMinutes: 5 },
      { mode: 'walk', from: 'Irla', to: 'D.J. Sanghvi College', durationMinutes: 5 }
    ], { totalDurationMinutes: 47 });

    const metroCrowdingDisruption = new CommuteDisruption({
      id: 'disr-metro-crowd',
      type: 'crowding',
      affectedMode: 'metro',
      affectedRouteId: 'Line-1',
      affectedArea: 'Versova - Andheri',
      severity: 'moderate',
      description: 'Morning rush-hour overcrowding on Metro Line 1: queue delays of 1-2 trains at Versova',
      startTime: Date.now() - 10000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 10,
      provenance: DataProvenance.synthetic('Peak Hour Commute Crowd Simulator', 'Simulation model', 'MEDIUM').toJSON()
    });

    const busTrafficDisruption = new CommuteDisruption({
      id: 'disr-bus-delay',
      type: 'delay',
      affectedMode: 'bus',
      affectedRouteId: 'BEST-201',
      affectedArea: 'DN Nagar - Vile Parle',
      severity: 'moderate',
      description: 'BEST Route 201 experiencing 12 min traffic delay on Link Road / Gulmohar Road',
      startTime: Date.now() - 10000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 12,
      provenance: DataProvenance.userReported('Student Commuter BEST Feed', 'Crowdsourced bus GPS', 'HIGH').toJSON()
    });

    const impact = disruptionImpactService.evaluateJourneyImpact(journey, [metroCrowdingDisruption, busTrafficDisruption]);

    assert.strictEqual(impact.isAffected, true, 'Journey is affected');
    assert.strictEqual(impact.isFeasible, true, 'Journey remains feasible');
    assert.strictEqual(impact.isMultipleSegments(), true, 'isMultipleSegments() must be true');
    assert.strictEqual(impact.impactScope, IMPACT_SCOPES.MULTIPLE_SEGMENTS, 'Impact scope is MULTIPLE_SEGMENTS');
    assert.strictEqual(impact.affectedSegmentsCount, 2, 'Exactly 2 segments affected');
    assert.deepStrictEqual(impact.affectedSegmentIndices, [1, 3], 'Segments 1 (metro) and 3 (bus) are affected');

    // Metro crowding adds wait time (~7 mins) and travel delay (~3 mins)
    // Bus traffic adds 12 mins travel delay
    assert(impact.addedWaitingTimeMinutes >= 5, 'Waiting time increased due to Metro queue');
    assert(impact.addedTravelTimeMinutes >= 12, 'Travel time increased due to bus road traffic');
    assert.strictEqual(impact.totalDelayMinutes, impact.addedTravelTimeMinutes + impact.addedWaitingTimeMinutes, 'Total delay is sum of travel + wait');
    assert.strictEqual(impact.updatedDurationMinutes, 47 + impact.totalDelayMinutes, 'Updated duration properly accounts for total delay');

    // Walking segments (0, 2, 4) should remain unaffected
    assert.strictEqual(impact.segmentImpacts[0].isAffected, false, 'First walk unaffected');
    assert.strictEqual(impact.segmentImpacts[2].isAffected, false, 'Transfer walk unaffected');
    assert.strictEqual(impact.segmentImpacts[4].isAffected, false, 'Campus walk unaffected');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Route Made Impossible (Route Closure / Critical Flooding)
  // --------------------------------------------------------------------------
  test('Scenario 5: Route closure or critical flooding marks journey infeasible and mandates alternative route', () => {
    const journey = createMockJourney('journey-borivali-train', [
      { mode: 'walk', from: 'Borivali West', to: 'Borivali Station', durationMinutes: 8 },
      { mode: 'train', from: 'Borivali Station', to: 'Vile Parle Station', serviceId: 'WR-SLOW', durationMinutes: 30 },
      { mode: 'walk', from: 'Vile Parle Station', to: 'D.J. Sanghvi College', durationMinutes: 8 }
    ], { totalDurationMinutes: 46 });

    const trackClosureDisruption = new CommuteDisruption({
      id: 'disr-wr-closure',
      type: 'route_closure',
      affectedMode: 'train',
      affectedRouteId: 'WR-SLOW',
      affectedArea: 'Borivali - Andheri',
      severity: 'critical',
      description: 'Emergency Mega Block and rail fracture near Malad. Western Railway slow corridor closed indefinitely.',
      startTime: Date.now() - 30000,
      endTime: Date.now() + 10800000,
      status: 'active',
      estimatedDelayMinutes: 60,
      provenance: DataProvenance.verified('Western Railway Official Bulletin', 'Track fracture alert', 'HIGH').toJSON()
    });

    const impact = disruptionImpactService.evaluateJourneyImpact(journey, [trackClosureDisruption]);

    assert.strictEqual(impact.isAffected, true, 'isAffected must be true');
    assert.strictEqual(impact.isFeasible, false, 'isFeasible must be false for route closure');
    assert.strictEqual(impact.isJourneyInfeasible(), true, 'isJourneyInfeasible() must be true');
    assert.strictEqual(impact.feasibilityReason, FEASIBILITY_REASONS.ROUTE_CLOSED, 'Feasibility reason is ROUTE_CLOSED');
    assert.strictEqual(impact.requiresAlternative, true, 'requiresAlternative must be true');
    assert(impact.alternativeReason.includes('TRAIN'), 'Alternative reason mentions TRAIN leg');
    assert(impact.alternativeReason.includes('ROUTE_CLOSED'), 'Alternative reason states ROUTE_CLOSED');

    const updatedJourney = disruptionImpactService.applyImpactToJourney(journey, impact);
    assert.strictEqual(updatedJourney.isViable, false, 'Updated journey viability is false');
    assert.strictEqual(updatedJourney.segments[1].status, 'SUSPENDED', 'Train segment status is SUSPENDED');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Multiple Simultaneous Disruptions Across Candidate Set
  // --------------------------------------------------------------------------
  test('Scenario 6: Evaluates multiple diverse candidate routes against multiple concurrent disruptions', () => {
    // 4 concurrent disruptions in Mumbai transit network
    const networkDisruptions = [
      // 1. Train delay (WR-SLOW)
      new CommuteDisruption({
        id: 'disr-net-wr-maint',
        type: 'maintenance',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Borivali - Andheri',
        severity: 'moderate',
        description: 'Scheduled maintenance speed restriction on WR slow line',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 15,
        provenance: DataProvenance.verified('Western Railway').toJSON()
      }),
      // 2. Road closure at Milan Subway
      new CommuteDisruption({
        id: 'disr-net-milan-flood',
        type: 'waterlogging',
        affectedMode: 'auto',
        affectedRouteId: null,
        affectedArea: 'Milan Subway',
        severity: 'critical',
        description: 'Milan Subway completely flooded and closed to all road traffic',
        startTime: Date.now() - 15000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 30,
        provenance: DataProvenance.estimated('Monsoon Drainage Model').toJSON()
      }),
      // 3. Auto refusal at Andheri Station West
      new CommuteDisruption({
        id: 'disr-net-auto-refusal',
        type: 'auto_refusal',
        affectedMode: 'auto',
        affectedRouteId: null,
        affectedArea: 'Andheri Station West',
        severity: 'moderate',
        description: 'Severe auto-rickshaw queue and refusals outside Andheri Station West',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 16,
        provenance: DataProvenance.userReported('Commuter Feed').toJSON()
      }),
      // 4. Metro rush hour crowding
      new CommuteDisruption({
        id: 'disr-net-metro-rush',
        type: 'crowding',
        affectedMode: 'metro',
        affectedRouteId: 'Line-1',
        affectedArea: 'Versova - Andheri',
        severity: 'minor',
        description: 'Peak morning college rush-hour density simulated on Metro Line 1',
        startTime: Date.now() - 5000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 8,
        provenance: DataProvenance.synthetic('Rush-Hour Simulator').toJSON()
      })
    ];

    // 4 candidate journeys
    const candidateTrain = createMockJourney('cand-1-train', [
      { mode: 'walk', from: 'Borivali', to: 'Borivali Station', durationMinutes: 6 },
      { mode: 'train', from: 'Borivali Station', to: 'Vile Parle Station', serviceId: 'WR-SLOW', durationMinutes: 30 },
      { mode: 'walk', from: 'Vile Parle Station', to: 'D.J. Sanghvi', durationMinutes: 8 }
    ], { totalDurationMinutes: 44 });

    const candidateAutoViaMilan = createMockJourney('cand-2-auto-milan', [
      { mode: 'auto', from: 'Santacruz West', to: 'D.J. Sanghvi via Milan Subway', durationMinutes: 20 }
    ], { totalDurationMinutes: 20 });

    const candidateAutoFromAndheri = createMockJourney('cand-3-auto-andheri', [
      { mode: 'auto', from: 'Andheri Station West', to: 'D.J. Sanghvi College', durationMinutes: 15 }
    ], { totalDurationMinutes: 15 });

    const candidateMetro = createMockJourney('cand-4-metro-bus', [
      { mode: 'walk', from: 'Versova', to: 'Versova Metro', durationMinutes: 5 },
      { mode: 'metro', from: 'Versova Metro', to: 'Andheri Metro', serviceId: 'Line-1', durationMinutes: 10 },
      { mode: 'walk', from: 'Andheri Metro', to: 'D.J. Sanghvi', durationMinutes: 15 }
    ], { totalDurationMinutes: 30 });

    const batchResults = disruptionImpactService.evaluateCandidateJourneys([
      candidateTrain,
      candidateAutoViaMilan,
      candidateAutoFromAndheri,
      candidateMetro
    ], networkDisruptions);

    assert.strictEqual(batchResults.length, 4, 'Evaluates all 4 candidate journeys');

    // 1. Train candidate: affected by WR maintenance, +15m delay, feasible
    const trainImpact = batchResults[0].impact;
    assert.strictEqual(trainImpact.isAffected, true);
    assert.strictEqual(trainImpact.isFeasible, true);
    assert.strictEqual(trainImpact.addedTravelTimeMinutes, 15);

    // 2. Auto via Milan Subway: affected by critical waterlogging closure, infeasible!
    const milanImpact = batchResults[1].impact;
    assert.strictEqual(milanImpact.isAffected, true);
    assert.strictEqual(milanImpact.isFeasible, false);
    assert.strictEqual(milanImpact.feasibilityReason, FEASIBILITY_REASONS.WEATHER_IMPASSABLE);
    assert.strictEqual(milanImpact.requiresAlternative, true);

    // 3. Auto from Andheri West: affected by auto refusal, +16m wait time, feasible
    const andheriImpact = batchResults[2].impact;
    assert.strictEqual(andheriImpact.isAffected, true);
    assert.strictEqual(andheriImpact.isFeasible, true);
    assert.strictEqual(andheriImpact.addedWaitingTimeMinutes, 16);

    // 4. Metro candidate: affected by Line 1 rush hour crowding, +wait time, feasible
    const metroImpact = batchResults[3].impact;
    assert.strictEqual(metroImpact.isAffected, true);
    assert.strictEqual(metroImpact.isFeasible, true);
    assert(metroImpact.addedWaitingTimeMinutes > 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Provenance Propagation Across All 4 Tiers
  // --------------------------------------------------------------------------
  test('Scenario 7: Accurately preserves and propagates VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC tiers', () => {
    const journey = createMockJourney('journey-prov-test', [
      { mode: 'train', from: 'Borivali Station', to: 'Andheri Station', serviceId: 'WR-SLOW', durationMinutes: 20 },
      { mode: 'auto', from: 'Andheri Station West', to: 'D.J. Sanghvi College', durationMinutes: 15 }
    ], { totalDurationMinutes: 35 });

    // 1. Test VERIFIED disruption
    const verifiedDisruption = new CommuteDisruption({
      id: 'disr-prov-verified',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'WR-SLOW',
      affectedArea: 'Borivali - Andheri',
      severity: 'moderate',
      description: 'Western Railway official track work',
      startTime: Date.now() - 10000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 10,
      provenance: DataProvenance.verified('Western Railway Official Bulletin', 'Official bulletin', 'HIGH').toJSON()
    });

    const verifiedImpact = disruptionImpactService.evaluateJourneyImpact(journey, [verifiedDisruption]);
    assert.strictEqual(verifiedImpact.hasVerifiedDisruptions(), true, 'Discloses verified disruptions');
    assert.strictEqual(verifiedImpact.provenance.sourceTier, PROVENANCE_TIERS.VERIFIED, 'Overall tier is VERIFIED');
    assert.strictEqual(verifiedImpact.disruptions[0].provenance.sourceTier, PROVENANCE_TIERS.VERIFIED, 'Segment disruption tier is VERIFIED');

    // 2. Test USER_REPORTED disruption
    const userReportedDisruption = new CommuteDisruption({
      id: 'disr-prov-user',
      type: 'auto_refusal',
      affectedMode: 'auto',
      affectedRouteId: null,
      affectedArea: 'Andheri Station West',
      severity: 'moderate',
      description: 'Auto-rickshaw queue reported by students',
      startTime: Date.now() - 10000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 12,
      provenance: DataProvenance.userReported('Community Commuter Feed', 'Student alert', 'MEDIUM').toJSON()
    });

    const userImpact = disruptionImpactService.evaluateJourneyImpact(journey, [userReportedDisruption]);
    assert.strictEqual(userImpact.hasUserReportedDisruptions(), true, 'Discloses user-reported disruptions');
    assert.strictEqual(userImpact.provenance.sourceTier, PROVENANCE_TIERS.USER_REPORTED, 'Overall tier is USER_REPORTED');
    assert.strictEqual(userImpact.disruptions[0].provenance.sourceTier, PROVENANCE_TIERS.USER_REPORTED, 'Segment disruption tier is USER_REPORTED');

    // 3. Test ESTIMATED disruption
    const estimatedDisruption = new CommuteDisruption({
      id: 'disr-prov-estimated',
      type: 'traffic',
      affectedMode: 'auto',
      affectedRouteId: null,
      affectedArea: 'Andheri Station West',
      severity: 'moderate',
      description: 'Road traffic estimated by sensor heuristic',
      startTime: Date.now() - 10000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 10,
      provenance: DataProvenance.estimated('Traffic Density Heuristic', 'Sensor heuristic', 'HIGH').toJSON()
    });

    const estimatedImpact = disruptionImpactService.evaluateJourneyImpact(journey, [estimatedDisruption]);
    assert.strictEqual(estimatedImpact.hasEstimatedDisruptions(), true, 'Discloses estimated disruptions');
    assert.strictEqual(estimatedImpact.provenance.sourceTier, PROVENANCE_TIERS.ESTIMATED, 'Overall tier is ESTIMATED');

    // 4. Test SYNTHETIC disruption
    const syntheticDisruption = new CommuteDisruption({
      id: 'disr-prov-synthetic',
      type: 'crowding',
      affectedMode: 'train',
      affectedRouteId: 'WR-SLOW',
      affectedArea: 'Borivali - Andheri',
      severity: 'minor',
      description: 'Simulated peak hour crowd loading',
      startTime: Date.now() - 10000,
      endTime: Date.now() + 3600000,
      status: 'active',
      estimatedDelayMinutes: 5,
      provenance: DataProvenance.synthetic('Peak Hour Simulation Model', 'Simulated loading', 'MEDIUM').toJSON()
    });

    const syntheticImpact = disruptionImpactService.evaluateJourneyImpact(journey, [syntheticDisruption]);
    assert.strictEqual(syntheticImpact.hasSyntheticDisruptions(), true, 'Discloses synthetic disruptions');
    assert.strictEqual(syntheticImpact.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC, 'Overall tier is SYNTHETIC');

    // 5. Test Composite Tiers (VERIFIED + USER_REPORTED)
    const compositeImpact = disruptionImpactService.evaluateJourneyImpact(journey, [verifiedDisruption, userReportedDisruption]);
    assert(compositeImpact.dataTiers.includes(PROVENANCE_TIERS.VERIFIED), 'Contains VERIFIED tier');
    assert(compositeImpact.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED), 'Contains USER_REPORTED tier');
    assert.strictEqual(compositeImpact.disruptions.length, 2, 'Tracks 2 disruptions');
    assert.strictEqual(compositeImpact.disruptions[0].provenance.sourceTier, PROVENANCE_TIERS.VERIFIED, 'First disruption retains VERIFIED tier');
    assert.strictEqual(compositeImpact.disruptions[1].provenance.sourceTier, PROVENANCE_TIERS.USER_REPORTED, 'Second disruption retains USER_REPORTED tier');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Backward-Compatibility with Recommendation Pipeline
  // --------------------------------------------------------------------------
  test('Scenario 8: Preserves Day 14 pipeline scoring interfaces and calculation helpers', () => {
    const rawDisruptions = [
      {
        id: 'disp-test-1',
        disruptionType: 'maintenance',
        transportMode: 'train',
        affectedLineOrRoute: 'Western Railway',
        severity: DISRUPTION_SEVERITIES.MODERATE,
        confidence: 'HIGH',
        description: 'Track maintenance'
      }
    ];

    const impacts = disruptionImpactService.assessDisruptions({
      corridorDisruptions: rawDisruptions
    });

    assert.strictEqual(impacts.length, 1, 'Assesses 1 disruption');
    // Moderate delay (15) with HIGH confidence (1.2) = 18 mins
    assert.strictEqual(impacts[0].delayMinutes, 18, 'Moderate HIGH confidence delay is 18 mins');

    const mockRoute = {
      legs: [
        { mode: 'train', lineInfo: { lineName: 'Western Railway Suburban' } }
      ],
      getWalkingMinutes: () => 15
    };

    const penalty = disruptionImpactService.calculateRouteDisruptionPenalty(mockRoute, impacts);
    assert(penalty >= 35, 'Computes route disruption penalty');

    const weatherPenalty = disruptionImpactService.calculateRouteWeatherPenalty(mockRoute, {
      rainProbability: 70
    });
    assert(weatherPenalty > 0, 'Computes weather walking penalty');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runDisruptionImpactTests();
}

module.exports = { runDisruptionImpactTests };
