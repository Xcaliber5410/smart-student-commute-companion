/**
 * Candidate Route Generation Engine Verification Suite
 *
 * Verifies:
 * - Multiple viable candidates generation (train, metro+bus, bus+walk, auto, walk)
 * - No feasible route behavior when network is disconnected or constraints are impossible
 * - Transfer constraints enforcement (e.g. maxTransfers = 0 filters multimodal routes)
 * - Walking constraints enforcement (e.g. maxWalkingMinutes = 5 filters 10m+ walk routes)
 * - Arrival deadline enforcement (e.g. targetArrivalTime filters late arrivals)
 * - Unavailable / suspended service rejection
 * - Deterministic output invariant (same inputs -> exact same candidate sequence)
 * - Mode preferences filtering (allowedModes, avoidModes)
 * - Integration with CommuteRecommendationPipeline (Stage 4)
 */

const assert = require('assert');
const {
  candidateRouteEngine,
  CandidateRouteEngine
} = require('../services/candidateRouteEngine');
const {
  candidateRouteService,
  CandidateRouteService
} = require('../services/candidateRouteService');
const { transportNetworkService } = require('../services/transportNetworkService');
const {
  CommuteJourney,
  CommuteRoute,
  TRANSPORT_MODES
} = require('../models');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('\n========================================================');
  console.log(' Running Candidate Route Generation Engine Verification');
  console.log('========================================================\n');

  // ============================================================================
  // SUITE 1: MULTIPLE CANDIDATE GENERATION
  // ============================================================================

  await test('Multiple Candidates: Generates diverse candidate set for Lokhandwala to D.J. Sanghvi', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00'
    });

    assert(Array.isArray(candidates), 'Must return an array of candidates');
    assert(candidates.length >= 2, `Expected at least 2 candidates, got ${candidates.length}`);

    // Validate that every candidate is an instance of CommuteJourney
    for (const cand of candidates) {
      assert(cand instanceof CommuteJourney, 'Every candidate must be a CommuteJourney instance');
      assert(cand.segments.length > 0, 'Every candidate must have ordered segments');
      assert.strictEqual(cand.origin, 'Lokhandwala Complex');
      assert.strictEqual(cand.destination, 'D.J. Sanghvi College of Engineering');
      assert(cand.totalDurationMinutes > 0, 'Duration must be positive');
      assert(cand.estimatedArrivalTime > cand.departureTime, 'Arrival must be after departure');
    }

    // Check diversity: Should have multimodal (e.g. Metro + Bus) and direct (e.g. Auto)
    const modes = candidates.map(c => c.primaryMode);
    assert(modes.includes('auto') || modes.includes('metro'), 'Should include auto or metro among candidates');
  });

  await test('Multiple Candidates: Generates suburban train and auto candidates for Borivali to D.J. Sanghvi', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Borivali West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00'
    });

    assert(candidates.length >= 2, `Expected at least 2 candidates from Borivali, got ${candidates.length}`);
    const primaryModes = candidates.map(c => c.primaryMode);
    assert(primaryModes.includes('train'), 'Should include suburban train route for Borivali corridor');
    assert(primaryModes.includes('auto'), 'Should include direct auto option for Borivali');
  });

  // ============================================================================
  // SUITE 2: NO FEASIBLE ROUTE
  // ============================================================================

  await test('No Feasible Route: Disconnected origin returns empty array when transit and auto unavailable', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Faraway Island Without Transit',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      preferences: {
        avoidModes: ['auto', 'walk'] // Disallow fallback auto & walk
      },
      options: {
        includeDirectAuto: false,
        includeDirectWalk: false
      }
    });

    assert(Array.isArray(candidates), 'Must return an array');
    assert.strictEqual(candidates.length, 0, 'Disconnected origin without transit or auto must yield 0 candidates');
  });

  // ============================================================================
  // SUITE 3: TRANSFER CONSTRAINTS
  // ============================================================================

  await test('Transfer Constraints: maxTransfers = 0 filters out all multimodal transfer routes', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      constraints: {
        maxTransfers: 0
      }
    });

    assert(candidates.length > 0, 'Should return direct routes (e.g. direct auto)');
    for (const cand of candidates) {
      assert.strictEqual(cand.transferCount, 0, `Candidate ${cand.id} must have 0 transfers, got ${cand.transferCount}`);
    }
  });

  await test('Transfer Constraints: maxTransfers = 1 allows 1-transfer routes but rejects 2-transfer routes', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      constraints: {
        maxTransfers: 1
      }
    });

    for (const cand of candidates) {
      assert(cand.transferCount <= 1, `Candidate ${cand.id} must have at most 1 transfer, got ${cand.transferCount}`);
    }
  });

  // ============================================================================
  // SUITE 4: WALKING CONSTRAINTS
  // ============================================================================

  await test('Walking Constraints: maxWalkingMinutes = 5 rejects routes requiring 10m+ campus walk', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Borivali West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      constraints: {
        maxWalkingMinutes: 5
      }
    });

    for (const cand of candidates) {
      assert(cand.walkingTimeMinutes <= 5,
        `Candidate ${cand.id} exceeded walking limit: got ${cand.walkingTimeMinutes}m walking, max allowed is 5m`
      );
    }

    // Direct auto has 0 walking minutes, so it should still be present
    const hasAuto = candidates.some(c => c.primaryMode === 'auto');
    assert(hasAuto, 'Auto candidate with minimal walking should be retained');
  });

  // ============================================================================
  // SUITE 5: ARRIVAL DEADLINE CONSTRAINT
  // ============================================================================

  await test('Arrival Deadline: Filters out candidates arriving after required deadline', async () => {
    // Departure at 08:00. Lokhandwala to DJS via Metro+Bus takes ~35m (arrival ~08:35).
    // Auto takes ~20m (arrival ~08:23).
    const deadlineCandidates = await candidateRouteEngine.generateCandidates({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      targetArrivalTime: '08:25' // Tight 25m deadline
    });

    assert(deadlineCandidates.length > 0, 'Should retain fast candidate that arrives before 08:25');
    for (const cand of deadlineCandidates) {
      assert(cand.estimatedArrivalTime <= '08:25',
        `Candidate ${cand.id} arrived at ${cand.estimatedArrivalTime}, missing deadline 08:25`
      );
    }

    // An impossible deadline (e.g. 08:05) should filter out everything
    const impossibleDeadlineCandidates = await candidateRouteEngine.generateCandidates({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      targetArrivalTime: '08:05'
    });
    assert.strictEqual(impossibleDeadlineCandidates.length, 0, 'Impossible deadline must reject all candidates');
  });

  // ============================================================================
  // SUITE 6: UNAVAILABLE SERVICE REJECTION
  // ============================================================================

  await test('Unavailable Services: Rejects routes relying on suspended or inactive transit segments', async () => {
    // Temporarily suspend Western Railway Borivali-Kandivali segment
    const network = transportNetworkService.getNetwork({ refresh: true });
    const wrSegment = network.getAllSegments().find(s => s.id === 'seg-wr-borivali-kandivali');
    assert(wrSegment, 'WR Borivali segment must exist in network');

    const originalStatus = wrSegment.status;
    try {
      wrSegment.status = 'SUSPENDED';

      const candidates = await candidateRouteEngine.generateCandidates({
        origin: 'Borivali West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        options: {
          includeDirectAuto: false // Disallow auto so we only check train corridor
        }
      });

      // No train candidate should be accepted while the segment is suspended
      const hasTrainCandidate = candidates.some(c => c.primaryMode === 'train');
      assert.strictEqual(hasTrainCandidate, false, 'Candidate with suspended train segment must be rejected');
    } finally {
      wrSegment.status = originalStatus;
    }
  });

  // ============================================================================
  // SUITE 7: DETERMINISTIC OUTPUT INVARIANT
  // ============================================================================

  await test('Deterministic Output: Same parameters yield identical candidate set and properties', async () => {
    const params = {
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:15',
      constraints: {
        maxTransfers: 2,
        maxWalkingMinutes: 20
      }
    };

    const run1 = await candidateRouteEngine.generateCandidates(params);
    const run2 = await candidateRouteEngine.generateCandidates(params);

    assert.strictEqual(run1.length, run2.length, 'Candidate counts must match exactly across repeated runs');

    for (let i = 0; i < run1.length; i++) {
      const c1 = run1[i];
      const c2 = run2[i];
      assert.strictEqual(c1.primaryMode, c2.primaryMode, `Primary mode mismatch at index ${i}`);
      assert.strictEqual(c1.departureTime, c2.departureTime, `Departure time mismatch at index ${i}`);
      assert.strictEqual(c1.estimatedArrivalTime, c2.estimatedArrivalTime, `Arrival time mismatch at index ${i}`);
      assert.strictEqual(c1.totalDurationMinutes, c2.totalDurationMinutes, `Duration mismatch at index ${i}`);
      assert.strictEqual(c1.transferCount, c2.transferCount, `Transfer count mismatch at index ${i}`);
      assert.strictEqual(c1.estimatedCostRupees, c2.estimatedCostRupees, `Cost mismatch at index ${i}`);
      assert.deepStrictEqual(c1.modesIncluded, c2.modesIncluded, `Modes mismatch at index ${i}`);
      assert.strictEqual(c1.segments.length, c2.segments.length, `Segment count mismatch at index ${i}`);
    }
  });

  // ============================================================================
  // SUITE 8: MODE PREFERENCES FILTERING
  // ============================================================================

  await test('Mode Preferences: avoidModes: ["auto"] excludes all auto-rickshaw routes', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Lokhandwala Complex',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      preferences: {
        avoidModes: ['auto', 'shared_auto']
      }
    });

    for (const cand of candidates) {
      assert(!cand.modesIncluded.includes('auto'), 'Auto must not be included');
      assert(!cand.modesIncluded.includes('shared_auto'), 'Shared auto must not be included');
    }
  });

  await test('Mode Preferences: allowedModes: ["bus", "walk"] permits only bus and walking legs', async () => {
    const candidates = await candidateRouteEngine.generateCandidates({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      preferences: {
        allowedModes: ['bus', 'walk']
      }
    });

    for (const cand of candidates) {
      assert(cand.modesIncluded.every(m => m === 'bus' || m === 'walk'),
        `Candidate ${cand.id} contained unallowed mode: ${cand.modesIncluded.join(', ')}`
      );
    }
  });

  // ============================================================================
  // SUITE 9: PIPELINE INTEGRATION (STAGE 4 COMPATIBILITY)
  // ============================================================================

  await test('Pipeline Integration: candidateRouteService produces CommuteRoute instances', async () => {
    const context = {
      originArea: { name: 'Lokhandwala' },
      destinationArea: { name: 'D.J. Sanghvi College of Engineering' },
      desiredDepartureTime: '08:00',
      constraints: {
        maxTransfers: 2,
        maxWalkingMinutes: 20
      }
    };

    const routes = await candidateRouteService.generateCandidates({ context });
    assert(Array.isArray(routes), 'Must return an array of routes');
    assert(routes.length > 0, 'Must produce candidate routes');

    for (const r of routes) {
      assert(r instanceof CommuteRoute, 'Each generated item must be a valid CommuteRoute instance');
      assert(r.estimate, 'Route must have an estimate');
      assert(r.legs && r.legs.length > 0, 'Route must have legs');
      assert(r.scores, 'Route must have scores structure');
    }
  });

  console.log('\n========================================================');
  console.log(` Results: ${passedTests} passed, ${totalTests - passedTests} failed`);
  console.log('========================================================\n');
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
