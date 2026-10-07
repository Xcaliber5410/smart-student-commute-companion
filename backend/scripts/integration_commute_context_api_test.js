/**
 * Commute Context-Aware Route API Integration Test Suite
 *
 * Verifies the extended candidate route API endpoints:
 *   POST /api/commute/candidates
 *   POST /api/student/commute/candidates
 *
 * Validates:
 * - Authorization enforcement (401 without Bearer token, 401 with invalid token)
 * - Clean route (0 delay, CLEAN_JOURNEY, baseline equals updated travel time)
 * - Disrupted route (transit disruption delay, DISRUPTION_DELAY, affectedSegments)
 * - Traffic-affected route (road traffic delay, ROAD_TRAFFIC_CONGESTION)
 * - Unavailable transport (service unavailable, isFeasible=false, SERVICE_UNAVAILABLE)
 * - Multiple candidates with different impacts (rail vs road differential impacts)
 * - No feasible routes (all candidate routes blocked, 200 OK with feasibleCandidateCount=0)
 * - Provenance (multi-tier tracking: VERIFIED, USER_REPORTED, ESTIMATED, MIXED_PROVENANCE)
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_commute_context_api.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');

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

async function runCommuteContextApiTests() {
  console.log('===============================================================');
  console.log(' Running Commute Context-Aware Route API Integration Tests');
  console.log('===============================================================\n');

  await initDb();
  const app = createApp();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const runId = Date.now();
  let studentToken = null;
  let studentId = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Authorization
    // -------------------------------------------------------------------------
    await test('Authorization: rejects unauthenticated requests with 401', async () => {
      // 1a. Missing token on canonical endpoint
      const res1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(res1.status, 401);
      assert.strictEqual(res1.body.success, false);
      assert.strictEqual(res1.body.code, 'UNAUTHORIZED');

      // 1b. Missing token on student alias endpoint
      const res2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/commute/candidates',
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(res2.status, 401);
      assert.strictEqual(res2.body.success, false);

      // 1c. Invalid token
      const res3 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: 'Bearer invalid_signature_token_xyz' },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(res3.status, 401);
      assert.strictEqual(res3.body.success, false);
    });

    // Setup: Register and authenticate test student
    await test('Setup: registers and authenticates test student', async () => {
      const email = `commute_context_${runId}@djsce.edu`;
      const password = 'Password123!';
      const regRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email,
          password,
          full_name: 'Context Test Student',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(regRes.status, 201);
      studentId = regRes.body.user.id;

      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password }
      });
      assert.strictEqual(loginRes.status, 200);
      studentToken = loginRes.body.token;
      assert.ok(studentToken);
    });

    // -------------------------------------------------------------------------
    // 2. Clean Route
    // -------------------------------------------------------------------------
    await test('Clean Route: exposes baseline equals updated travel time with CLEAN_JOURNEY code', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          disruptions: [],
          trafficConditions: [],
          weatherContext: { condition: 'clear' },
          availabilityRecords: []
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.candidateCount > 0);
      assert.strictEqual(res.body.feasibleCandidateCount, res.body.candidateCount);
      assert.strictEqual(res.body.infeasibleCandidateCount, 0);

      const firstCand = res.body.candidates[0];
      // 2a. Baseline vs contextual distinction
      assert.ok(firstCand.baselineTravel, 'Candidate must include baselineTravel');
      assert.strictEqual(typeof firstCand.baselineTravel.durationMinutes, 'number');
      assert.strictEqual(typeof firstCand.baselineTravel.estimatedArrivalTime, 'string');
      assert.strictEqual(firstCand.baselineTravel.durationMinutes, firstCand.totalDurationMinutes);
      assert.strictEqual(firstCand.baselineTravel.estimatedArrivalTime, firstCand.estimatedArrivalTime);

      // 2b. Contextual impact object
      assert.ok(firstCand.contextualImpact, 'Candidate must include contextualImpact');
      assert.strictEqual(firstCand.contextualImpact.isFeasible, true);
      assert.strictEqual(firstCand.contextualImpact.totalAdditionalDelayMinutes, 0);
      assert.strictEqual(firstCand.contextualImpact.disruptionDelayMinutes, 0);
      assert.strictEqual(firstCand.contextualImpact.trafficDelayMinutes, 0);
      assert.strictEqual(firstCand.contextualImpact.weatherDelayMinutes, 0);
      assert.strictEqual(firstCand.contextualImpact.availabilityDelayMinutes, 0);
      assert.deepStrictEqual(firstCand.contextualImpact.affectedSegments, []);
      assert.deepStrictEqual(firstCand.contextualImpact.unavailableSegments, []);

      // 2c. Reason codes & feasibility
      assert.strictEqual(firstCand.isFeasible, true);
      assert.strictEqual(firstCand.totalAdditionalDelayMinutes, 0);
      assert.strictEqual(firstCand.additionalDisruptionDelayMinutes, 0);
      assert.ok(firstCand.reasonCodes.includes('CLEAN_JOURNEY'), 'Must include CLEAN_JOURNEY code');
      assert.ok(firstCand.contextualImpact.reasonCodes.includes('CLEAN_JOURNEY'));
    });

    // -------------------------------------------------------------------------
    // 3. Disrupted Route
    // -------------------------------------------------------------------------
    await test('Disrupted Route: incorporates disruption delay, affected segments, and reason codes', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['train', 'walk'],
          disruptions: [
            {
              id: 'dis-wr-slow-signaling',
              affectedArea: 'Western Railway',
              affectedRouteId: 'WR-SLOW',
              affectedMode: 'train',
              disruptionType: 'SIGNAL_FAILURE',
              severity: 'MODERATE',
              estimatedDelayMinutes: 17,
              status: 'ACTIVE',
              description: 'Signaling issue between Malad and Andheri causing 17 min delay'
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const trainCand = res.body.candidates.find(c => c.primaryMode === 'train' || c.modesIncluded.includes('train'));
      assert.ok(trainCand, 'Must find train candidate for Kandivali corridor');

      // 3a. Disruption delay applied additively to baseline
      assert.ok(trainCand.additionalDisruptionDelayMinutes >= 17);
      assert.strictEqual(trainCand.contextualImpact.disruptionDelayMinutes, trainCand.additionalDisruptionDelayMinutes);
      assert.ok(trainCand.totalAdditionalDelayMinutes >= 17);
      assert.strictEqual(
        trainCand.totalDurationMinutes,
        trainCand.baselineTravel.durationMinutes + trainCand.totalAdditionalDelayMinutes
      );
      assert.notStrictEqual(trainCand.estimatedArrivalTime, trainCand.baselineTravel.estimatedArrivalTime);

      // 3b. Reason codes & affected segments
      assert.ok(trainCand.reasonCodes.includes('DISRUPTION_DELAY'));
      assert.ok(trainCand.contextualImpact.reasonCodes.includes('DISRUPTION_DELAY'));
      assert.ok(trainCand.affectedSegments.length > 0);
      const trainAffSeg = trainCand.affectedSegments.find(s => s.mode === 'train');
      assert.ok(trainAffSeg, 'Train segment must be marked affected');
      assert.ok(trainAffSeg.delayMinutes >= 17);

      // 3c. Feasibility remains true (moderate delay does not render train impassable)
      assert.strictEqual(trainCand.isFeasible, true);
      assert.strictEqual(trainCand.contextualImpact.isFeasible, true);
    });

    // -------------------------------------------------------------------------
    // 4. Traffic-Affected Route
    // -------------------------------------------------------------------------
    await test('Traffic-Affected Route: applies road congestion delay to vehicular segments', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:15',
          preferredModes: ['auto', 'walk'],
          trafficConditions: [
            {
              id: 'traf-sv-road-heavy',
              area: 'sv road',
              level: 'heavy',
              expectedDelayMinutes: 13,
              affectedModes: ['auto'],
              description: 'Heavy bottleneck traffic along SV Road'
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const autoCand = res.body.candidates.find(c => c.primaryMode === 'auto' || c.modesIncluded.includes('auto'));
      assert.ok(autoCand, 'Must find auto candidate');

      // 4a. Traffic impact applied
      assert.strictEqual(autoCand.trafficImpact.addedTravelTimeMinutes, 13);
      assert.strictEqual(autoCand.contextualImpact.trafficDelayMinutes, 13);
      assert.ok(autoCand.totalAdditionalDelayMinutes >= 13);
      assert.strictEqual(
        autoCand.totalDurationMinutes,
        autoCand.baselineTravel.durationMinutes + autoCand.totalAdditionalDelayMinutes
      );

      // 4b. Reason code and affected segments
      assert.ok(autoCand.reasonCodes.includes('ROAD_TRAFFIC_CONGESTION'));
      assert.ok(autoCand.contextualImpact.reasonCodes.includes('ROAD_TRAFFIC_CONGESTION'));
      const autoSeg = autoCand.segments.find(s => s.mode === 'auto');
      assert.ok(autoSeg, 'Must find auto segment');
      assert.strictEqual(autoSeg.isAffected, true);
      assert.ok(autoSeg.contextDelayMinutes >= 13);
    });

    // -------------------------------------------------------------------------
    // 5. Unavailable Transport
    // -------------------------------------------------------------------------
    await test('Unavailable Transport: marks affected candidate infeasible with SERVICE_UNAVAILABLE', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['auto', 'walk'],
          availabilityRecords: [
            {
              id: 'avail-auto-depleted',
              mode: 'auto',
              status: 'UNAVAILABLE',
              reason: 'Auto stand completely depleted / drivers refusing rides',
              isUsable: false
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const autoCand = res.body.candidates.find(c => c.primaryMode === 'auto' || c.modesIncluded.includes('auto'));
      assert.ok(autoCand, 'Must find auto candidate');

      // 5a. Feasibility clearly falsified
      assert.strictEqual(autoCand.isFeasible, false);
      assert.strictEqual(autoCand.isViable, false);
      assert.strictEqual(autoCand.feasibilityReason, 'SERVICE_UNAVAILABLE');
      assert.strictEqual(autoCand.contextualImpact.isFeasible, false);
      assert.strictEqual(autoCand.contextualImpact.feasibilityReason, 'SERVICE_UNAVAILABLE');

      // 5b. Reason codes clearly disclose infeasibility
      assert.ok(autoCand.reasonCodes.includes('SERVICE_UNAVAILABLE'));
      assert.ok(autoCand.reasonCodes.includes('JOURNEY_INFEASIBLE'));

      // 5c. Baseline estimate preserved while context flags route as infeasible
      assert.ok(autoCand.baselineTravel.durationMinutes > 0, 'Baseline travel estimate is preserved');
      assert.ok(autoCand.unavailableSegments.some(s => s.mode === 'auto'));
    });

    // -------------------------------------------------------------------------
    // 6. Multiple Candidates with Different Impacts
    // -------------------------------------------------------------------------
    await test('Multiple Candidates: exhibits modal differential impacts across diverse options', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          limit: 5,
          trafficConditions: [
            {
              id: 'traf-link-road-heavy',
              area: 'Link Road',
              level: 'heavy',
              expectedDelayMinutes: 20,
              affectedModes: ['auto'],
              description: 'Gridlock along Link Road affecting surface vehicles'
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.candidates.length >= 2, 'Should return multiple candidates for Lokhandwala corridor');

      const autoCand = res.body.candidates.find(c => c.primaryMode === 'auto');
      const multimodalCand = res.body.candidates.find(c => c.primaryMode === 'metro' || c.modesIncluded.includes('metro'));

      assert.ok(autoCand, 'Should have direct auto candidate');
      assert.ok(multimodalCand, 'Should have multimodal metro candidate');

      // 6a. Auto candidate receives road traffic delay
      assert.ok(autoCand.totalAdditionalDelayMinutes >= 20);
      assert.ok(autoCand.reasonCodes.includes('ROAD_TRAFFIC_CONGESTION'));

      // 6b. Metro candidate segment is sheltered from road traffic
      const metroSeg = multimodalCand.segments.find(s => s.mode === 'metro');
      assert.ok(metroSeg);
      assert.strictEqual(metroSeg.isAffected, false);
      assert.strictEqual(metroSeg.contextDelayMinutes, 0);

      // 6c. Differential verification
      assert.notStrictEqual(
        autoCand.totalAdditionalDelayMinutes,
        multimodalCand.contextualImpact.trafficDelayMinutes,
        'Auto route and metro route must exhibit different traffic impacts'
      );
    });

    // -------------------------------------------------------------------------
    // 7. No Feasible Routes
    // -------------------------------------------------------------------------
    await test('No Feasible Routes: returns 200 with candidateCount > 0 and feasibleCandidateCount = 0', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          availabilityRecords: [
            { id: 'av-tr', mode: 'train', status: 'SUSPENDED', isUsable: false, reason: 'Power grid failure' },
            { id: 'av-mt', mode: 'metro', status: 'SUSPENDED', isUsable: false, reason: 'Overhead wire snap' },
            { id: 'av-bu', mode: 'bus', status: 'SUSPENDED', isUsable: false, reason: 'Depot waterlogging' },
            { id: 'av-au', mode: 'auto', status: 'UNAVAILABLE', isUsable: false, reason: 'City-wide transport bandh' },
            { id: 'av-sh', mode: 'shared_auto', status: 'UNAVAILABLE', isUsable: false, reason: 'City-wide transport bandh' }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.candidateCount > 0, 'Candidates should be generated from transport graph');
      assert.strictEqual(res.body.feasibleCandidateCount, 0, 'No candidate should be feasible');
      assert.strictEqual(res.body.infeasibleCandidateCount, res.body.candidateCount);
      assert.strictEqual(res.body.contextSummary.hasInfeasibleCandidates, true);

      // Verify every candidate is marked infeasible
      for (const cand of res.body.candidates) {
        assert.strictEqual(cand.isFeasible, false);
        assert.strictEqual(cand.contextualImpact.isFeasible, false);
        assert.ok(
          cand.reasonCodes.includes('JOURNEY_INFEASIBLE') ||
          cand.reasonCodes.includes('SERVICE_SUSPENDED') ||
          cand.reasonCodes.includes('SERVICE_UNAVAILABLE')
        );
      }
    });

    // -------------------------------------------------------------------------
    // 8. Provenance & Multi-Source Attribution
    // -------------------------------------------------------------------------
    await test('Provenance: propagates 4-tier provenance metadata and MIXED_PROVENANCE reason code', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['train', 'walk'],
          disruptions: [
            {
              id: 'dis-wr-ver',
              affectedArea: 'Western Railway',
              affectedRouteId: 'WR-SLOW',
              affectedMode: 'train',
              disruptionType: 'TRACK_MAINTENANCE',
              severity: 'MODERATE',
              estimatedDelayMinutes: 9,
              status: 'ACTIVE',
              provenance: {
                tier: 'VERIFIED',
                sourceTier: 'VERIFIED',
                provider: 'Western Railway Control Center'
              }
            }
          ],
          trafficConditions: [
            {
              id: 'traf-user-rep',
              area: 'sv road',
              level: 'moderate',
              expectedDelayMinutes: 6,
              affectedModes: ['auto'],
              provenance: {
                tier: 'USER_REPORTED',
                sourceTier: 'USER_REPORTED',
                provider: 'Student Commute Forum'
              }
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);

      // 8a. Top-level envelope provenance metadata
      const meta = res.body.provenanceMetadata;
      assert.ok(meta, 'Must include provenanceMetadata');
      assert.ok(Array.isArray(meta.dataTiers), 'dataTiers must be an array');
      assert.ok(meta.dataTiers.includes('VERIFIED'), 'Must include VERIFIED tier');
      assert.ok(meta.dataTiers.includes('USER_REPORTED'), 'Must include USER_REPORTED tier');
      assert.ok(meta.dataTiers.includes('ESTIMATED'), 'Must include ESTIMATED tier');
      assert.strictEqual(meta.hasVerifiedData, true);
      assert.strictEqual(meta.hasUserReportedData, true);
      assert.strictEqual(meta.hasEstimatedData, true);

      // 8b. Candidate provenance and mixed provenance code
      const firstCand = res.body.candidates[0];
      assert.ok(firstCand.provenance, 'Candidate must contain provenance');
      assert.ok(firstCand.contextualImpact.dataTiers.length >= 1);
      assert.ok(firstCand.provenance.contextTiers.length >= 1);

      // Check segment provenance
      assert.ok(firstCand.segments[0].provenance, 'Segments must carry provenance');
      assert.ok(firstCand.segments[0].provenance.tier, 'Segment provenance must declare tier');
    });

  } finally {
    server.close();
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCommuteContextApiTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
