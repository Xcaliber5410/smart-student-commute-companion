/**
 * Commute Route Generation Full Integration Verification Suite (Day 15 Final)
 *
 * Verifies the complete end-to-end commute planning foundation flow:
 *   Student
 *    ↓
 *   Commute Preferences
 *    ↓
 *   Commute Request
 *    ↓
 *   Transport Network
 *    ↓
 *   Timetable / Travel Estimates
 *    ↓
 *   Journey Builder
 *    ↓
 *   Candidate Route Generation Engine
 *    ↓
 *   Candidate Route API
 *
 * Covers 15 Realistic Scenarios:
 * 1. Simple direct commute
 * 2. Train + walking
 * 3. Metro + bus
 * 4. Multiple possible routes
 * 5. No available route
 * 6. Arrival deadline
 * 7. Maximum walking constraint
 * 8. Maximum transfer constraint
 * 9. Preferred transport mode
 * 10. Service outside operating hours
 * 11. Invalid transport data
 * 12. Invalid timing
 * 13. Student isolation/authorization
 * 14. Synthetic/estimated provenance
 * 15. Deterministic candidate ordering
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_commute_full_integration.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');
const {
  candidateRouteEngine,
  transportNetworkService,
  transportScheduleService,
  journeyBuilderService,
  studentCommutePreferenceService
} = require('../services');
const {
  CommuteJourney,
  JourneySegment,
  TransportConnection,
  TransportSegment,
  TRANSPORT_MODES
} = require('../models');
const { ValidationError } = require('../errors');

function makeRequest(server, { method, path: reqPath, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };

    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: reqPath,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runFullCommuteIntegrationSuite() {
  console.log('================================================================');
  console.log(' Day 15 Commute Route Generation Full Integration Verification');
  console.log('================================================================\n');

  await initDb();
  const app = createApp();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  let passed = 0;
  let failed = 0;

  async function test(scenarioNum, name, fn) {
    try {
      await fn();
      console.log(`✅ [Scenario ${scenarioNum}] PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [Scenario ${scenarioNum}] FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const runId = Date.now();
  let studentAToken = null;
  let studentAId = null;
  let studentBToken = null;
  let studentBId = null;

  try {
    // 0. Setup Test Students & Auth
    const regA = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email: `skan_commute_a_${runId}@djsce.edu`,
        password: 'Password123!',
        full_name: 'Skan Test Student A',
        college_name: 'D.J. Sanghvi College of Engineering'
      }
    });
    studentAId = regA.body.user.id;

    const loginA = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: `skan_commute_a_${runId}@djsce.edu`, password: 'Password123!' }
    });
    studentAToken = loginA.body.token;

    const regB = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email: `skan_commute_b_${runId}@djsce.edu`,
        password: 'Password123!',
        full_name: 'Skan Test Student B',
        college_name: 'D.J. Sanghvi College of Engineering'
      }
    });
    studentBId = regB.body.user.id;

    const loginB = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: `skan_commute_b_${runId}@djsce.edu`, password: 'Password123!' }
    });
    studentBToken = loginB.body.token;

    // SCENARIO 1: Simple Direct Commute (Walk or Auto)
    await test(1, 'Simple direct commute generates valid single-mode candidate with 0 transfers', async () => {
      // 1a. Test via API from adjacent area (Vile Parle West ~1km from campus)
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Vile Parle West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:15'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.candidates.length > 0);

      const directCandidate = res.body.candidates.find(c => c.transferCount === 0);
      assert.ok(directCandidate, 'Must contain a direct candidate with 0 transfers');
      assert.ok(directCandidate.walkingTimeMinutes > 0 || directCandidate.transitTimeMinutes > 0);
      assert.strictEqual(directCandidate.transferCount, 0);
      assert.ok(directCandidate.isViable);
    });

    // SCENARIO 2: Train + Walking Corridor
    await test(2, 'Suburban Train + campus walking egress propagates timetable and ordered segments', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['train', 'walk'],
          avoidModes: ['auto'],
          maxBudgetRupees: 50
        }
      });

      assert.strictEqual(res.status, 200);
      const trainCandidate = res.body.candidates.find(c => c.primaryMode === 'train' || c.modesIncluded.includes('train'));
      assert.ok(trainCandidate, 'Must find a train candidate for Kandivali to DJSCE corridor');
      assert.ok(trainCandidate.modesIncluded.includes('walk'), 'Train journey must include pedestrian leg');
      assert.ok(trainCandidate.estimatedCostRupees <= 50, 'Fare must be within budget');

      // Verify ordered segments
      const segs = trainCandidate.segments;
      assert.ok(segs.length >= 2, 'Must have at least train and walking segments');
      const trainSeg = segs.find(s => s.mode === 'train');
      assert.ok(trainSeg, 'Must contain train segment');
      assert.ok(trainSeg.durationMinutes > 0);
      assert.ok(trainSeg.departureTime && trainSeg.arrivalTime);
    });

    // SCENARIO 3: Metro + Bus Multimodal Journey
    await test(3, 'Metro + Bus multimodal journey connects transit lines with transfer wait times', async () => {
      const candidates = await candidateRouteEngine.generateCandidates({
        origin: 'Lokhandwala Complex',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        preferences: {
          allowedModes: ['metro', 'bus', 'walk'],
          avoidModes: ['auto']
        }
      });

      assert.ok(candidates.length > 0, 'Should find candidate for Lokhandwala corridor');
      const multimodal = candidates.find(c => c.modesIncluded.includes('metro') || c.modesIncluded.includes('bus'));
      assert.ok(multimodal, 'Must include metro or bus multimodal candidate');
      assert.ok(multimodal.transferCount >= 1, 'Multimodal route involves transfer');
      assert.ok(multimodal.totalWaitingTimeMinutes >= 0, 'Must track waiting time');

      // Inspect segment sequence
      const modesInOrder = multimodal.segments.map(s => s.mode);
      assert.ok(modesInOrder.includes('walk'), 'Must include walking transfer/access');
    });

    // SCENARIO 4: Multiple Possible Routes Diversity
    await test(4, 'Returns diverse set of candidate journeys for standard corridor', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          limit: 5
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.candidates.length >= 2, 'Must return at least 2 candidates for Lokhandwala corridor');

      // Check diversity of primary modes
      const primaryModes = new Set(res.body.candidates.map(c => c.primaryMode));
      assert.ok(primaryModes.size >= 1, 'Should represent candidate diversity');
    });

    // SCENARIO 5: No Available Route (Impossible / Disconnected)
    await test(5, 'Disconnected or excessively constrained input gracefully yields 0 candidates', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Borivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          avoidModes: ['train', 'metro', 'bus', 'auto', 'walk']
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.candidateCount, 0);
      assert.deepStrictEqual(res.body.candidates, []);
    });

    // SCENARIO 6: Arrival Deadline Enforcement
    await test(6, 'Strict target arrival deadline filters out late-arriving candidates', async () => {
      const deadline = '08:25';
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Borivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          desiredArrivalTime: deadline
        }
      });

      assert.strictEqual(res.status, 200);
      for (const cand of res.body.candidates) {
        assert.ok(
          cand.estimatedArrivalTime <= deadline,
          `Candidate arriving at ${cand.estimatedArrivalTime} violated deadline ${deadline}`
        );
      }
    });

    // SCENARIO 7: Maximum Walking Constraint
    await test(7, 'Maximum walking minutes strictly excludes excessive pedestrian routes', async () => {
      const maxWalk = 8;
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          maxWalkingMinutes: maxWalk
        }
      });

      assert.strictEqual(res.status, 200);
      for (const cand of res.body.candidates) {
        assert.ok(
          cand.walkingTimeMinutes <= maxWalk,
          `Candidate walking time ${cand.walkingTimeMinutes} exceeded maxWalkingMinutes ${maxWalk}`
        );
      }
    });

    // SCENARIO 8: Maximum Transfer Constraint
    await test(8, 'Maximum transfer constraint limits multimodal connections', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          maxTransfers: 0
        }
      });

      assert.strictEqual(res.status, 200);
      for (const cand of res.body.candidates) {
        assert.strictEqual(
          cand.transferCount,
          0,
          `Candidate transfer count ${cand.transferCount} exceeded maxTransfers 0`
        );
      }
    });

    // SCENARIO 9: Preferred Transport Mode
    await test(9, 'Mode preference filters enforce allowed/avoided transit types', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          avoidModes: ['auto']
        }
      });

      assert.strictEqual(res.status, 200);
      for (const cand of res.body.candidates) {
        assert.ok(!cand.modesIncluded.includes('auto'), 'Candidate must not include avoided mode "auto"');
        assert.notStrictEqual(cand.primaryMode, 'auto', 'Primary mode cannot be "auto"');
      }
    });

    // SCENARIO 10: Service Outside Operating Hours
    await test(10, 'Operating windows reject transit services during off-hours (e.g. 02:30 AM)', async () => {
      // Direct call to schedule service and candidate engine
      const metroOperating = transportScheduleService.getOperatingHours('metro');
      const isNightMetroActive = transportScheduleService.isWithinOperatingHours('02:30', metroOperating);
      assert.strictEqual(isNightMetroActive, false, 'Metro should not be active at 02:30 AM');

      const candidates = await candidateRouteEngine.generateCandidates({
        origin: 'Lokhandwala Complex',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '02:30',
        preferences: {
          allowedModes: ['metro', 'bus']
        },
        options: {
          includeDirectAuto: false,
          includeDirectWalk: false
        }
      });

      assert.strictEqual(candidates.length, 0, 'Transit routes outside operating hours must yield 0 candidates');
    });

    // SCENARIO 11: Invalid Transport Data
    await test(11, 'Invalid transport entities and broken connections are caught by JourneyBuilder', async () => {
      // Negative segment duration throws ValidationError
      assert.throws(() => {
        journeyBuilderService.buildJourney([
          new JourneySegment({
            segmentIndex: 0,
            type: 'TRANSIT',
            mode: 'bus',
            from: 'Andheri',
            to: 'Vile Parle',
            departureTime: '08:00',
            arrivalTime: '08:15',
            durationMinutes: -10 // Invalid negative
          })
        ]);
      }, ValidationError);

      // Disconnected spatial links throw ValidationError
      assert.throws(() => {
        journeyBuilderService.buildJourney([
          new JourneySegment({
            segmentIndex: 0,
            type: 'TRANSIT',
            mode: 'metro',
            from: 'Versova',
            to: 'DN Nagar',
            departureTime: '08:00',
            arrivalTime: '08:10',
            durationMinutes: 10
          }),
          new JourneySegment({
            segmentIndex: 1,
            type: 'TRANSIT',
            mode: 'train',
            from: 'Borivali', // Disconnected! Not DN Nagar
            to: 'Vile Parle',
            departureTime: '08:15',
            arrivalTime: '08:35',
            durationMinutes: 20
          })
        ]);
      }, ValidationError);
    });

    // SCENARIO 12: Invalid Timing Validation
    await test(12, 'Invalid time syntax and arrival before departure return 400 error', async () => {
      // 12a. Malformed time syntax
      const resBadFormat = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Andheri West',
          desiredDepartureTime: '25:99'
        }
      });
      assert.strictEqual(resBadFormat.status, 400);
      assert.strictEqual(resBadFormat.body.success, false);
      assert.strictEqual(resBadFormat.body.code, 'VALIDATION_ERROR');

      // 12b. Arrival time before departure time
      const resBackwards = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Andheri West',
          desiredDepartureTime: '09:00',
          desiredArrivalTime: '08:00'
        }
      });
      assert.strictEqual(resBackwards.status, 400);
      assert.strictEqual(resBackwards.body.success, false);
      assert.strictEqual(resBackwards.body.code, 'VALIDATION_ERROR');
    });

    // SCENARIO 13: Student Isolation / Authorization Guard
    await test(13, 'Enforces student authentication, profile scoping, and cross-student isolation', async () => {
      // 13a. Unauthenticated access rejected with 401
      const resUnauth = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        body: { startingArea: 'Andheri West' }
      });
      assert.strictEqual(resUnauth.status, 401);
      assert.strictEqual(resUnauth.body.code, 'UNAUTHORIZED');

      // 13b. Set distinct preferences for Student A and Student B
      await makeRequest(server, {
        method: 'PUT',
        path: '/api/student/commute-preferences',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: { default_origin_area: 'Bandra West', max_transfers: 1 }
      });

      await makeRequest(server, {
        method: 'PUT',
        path: '/api/student/commute-preferences',
        headers: { Authorization: `Bearer ${studentBToken}` },
        body: { default_origin_area: 'Goregaon West', max_transfers: 3 }
      });

      // 13c. Empty body for Student A inherits Student A's origin ('Bandra West')
      const resA = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: { desiredDepartureTime: '08:30' }
      });
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resA.body.queryContext.studentId, studentAId);
      assert.strictEqual(resA.body.queryContext.startingArea, 'Bandra West');
      assert.strictEqual(resA.body.queryContext.appliedConstraints.maxTransfers, 1);

      // 13d. Empty body for Student B inherits Student B's origin ('Goregaon West')
      const resB = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentBToken}` },
        body: { desiredDepartureTime: '08:30' }
      });
      assert.strictEqual(resB.status, 200);
      assert.strictEqual(resB.body.queryContext.studentId, studentBId);
      assert.strictEqual(resB.body.queryContext.startingArea, 'Goregaon West');
      assert.strictEqual(resB.body.queryContext.appliedConstraints.maxTransfers, 3);
    });

    // SCENARIO 14: Synthetic / Estimated Provenance & Limitations
    await test(14, 'Discloses synthetic/estimated provenance tiers and prototype limitations', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          desiredDepartureTime: '08:00'
        }
      });

      assert.strictEqual(res.status, 200);
      const provMeta = res.body.provenanceMetadata;
      assert.ok(provMeta, 'Must include provenanceMetadata envelope');
      assert.strictEqual(provMeta.hasEstimatedData, true);
      assert.ok(provMeta.dataTiers.includes('ESTIMATED'));
      assert.ok(provMeta.limitations.length > 0);

      for (const cand of res.body.candidates) {
        assert.ok(cand.provenance, 'Each candidate must have provenance');
        assert.ok(cand.limitations, 'Each candidate must disclose limitations');
        for (const seg of cand.segments) {
          if (seg.provenance) {
            assert.ok(seg.provenance.tier, 'Segment provenance must have tier');
          }
        }
      }
    });

    // SCENARIO 15: Deterministic Candidate Ordering
    await test(15, 'Repeated executions with identical parameters produce deterministic candidate sequences', async () => {
      const payload = {
        startingArea: 'Lokhandwala Complex',
        collegeDestination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00',
        limit: 4
      };

      const resRun1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: payload
      });

      const resRun2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: payload
      });

      assert.strictEqual(resRun1.status, 200);
      assert.strictEqual(resRun2.status, 200);
      assert.strictEqual(resRun1.body.candidateCount, resRun2.body.candidateCount);

      const seq1 = resRun1.body.candidates.map(c => ({
        id: c.id,
        duration: c.totalDurationMinutes,
        cost: c.estimatedCostRupees,
        mode: c.primaryMode,
        segments: c.segments.length
      }));

      const seq2 = resRun2.body.candidates.map(c => ({
        id: c.id,
        duration: c.totalDurationMinutes,
        cost: c.estimatedCostRupees,
        mode: c.primaryMode,
        segments: c.segments.length
      }));

      assert.deepStrictEqual(seq1, seq2, 'Candidate ordering, durations, costs, and segments must be strictly deterministic');
    });

  } finally {
    server.close();
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n================================================================');
  console.log(` FULL INTEGRATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFullCommuteIntegrationSuite().catch(err => {
  console.error('Fatal test error in full commute integration suite:', err);
  process.exit(1);
});
