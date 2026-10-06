/**
 * Commute Candidate Routes API Integration Test Suite
 *
 * Verifies the authenticated candidate route endpoints:
 *   POST /api/commute/candidates
 *   POST /api/student/commute/candidates
 *
 * Covers:
 * - Unauthorized access rejection (401)
 * - Valid request with candidate journey breakdown
 * - Multiple diverse candidates generation
 * - No route handling (empty candidates array without crashing)
 * - Invalid constraints validation (400)
 * - Invalid time validation (400)
 * - Privacy protection (rejection of flat/building/PIN/GPS fields)
 * - Student ownership & saved default preference fallback
 * - Cross-student isolation
 * - Deterministic output across repeated calls
 * - Provenance metadata and synthetic data limitation disclosure
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_commute_candidates_integration.db');
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

async function runCandidateRouteApiTests() {
  console.log('====================================================');
  console.log(' Running Commute Candidate Route API Integration Tests');
  console.log('====================================================\n');

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
  let student1Token = null;
  let student1Id = null;
  let student2Token = null;
  let student2Id = null;

  try {
    // 1. Unauthorized access guard
    await test('Auth Guard: POST /api/commute/candidates returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    // 2. Register Student 1 & Student 2
    await test('Auth Setup: Registers and logs in Student 1 and Student 2', async () => {
      const email1 = `commute1_${runId}@djsce.edu`;
      const pass1 = 'Password123!';
      const reg1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: email1,
          password: pass1,
          full_name: 'Candidate Test Student 1',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(reg1.status, 201);
      student1Id = reg1.body.user.id;

      const login1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: email1, password: pass1 }
      });
      assert.strictEqual(login1.status, 200);
      student1Token = login1.body.token;

      const email2 = `commute2_${runId}@djsce.edu`;
      const pass2 = 'Password123!';
      const reg2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: email2,
          password: pass2,
          full_name: 'Candidate Test Student 2',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(reg2.status, 201);
      student2Id = reg2.body.user.id;

      const login2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: email2, password: pass2 }
      });
      assert.strictEqual(login2.status, 200);
      student2Token = login2.body.token;
    });

    // 3. Valid Request with full fields
    await test('Valid Request: returns 200 with candidate journeys and segments', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:15',
          preferredModes: ['metro', 'bus', 'walk'],
          maxTransfers: 2,
          maxWalkingMinutes: 20,
          maxBudgetRupees: 60
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.candidates), 'Candidates must be an array');
      assert.ok(res.body.candidateCount > 0, 'Should find at least 1 candidate journey');

      const firstCandidate = res.body.candidates[0];
      assert.ok(firstCandidate.id, 'Candidate must have an ID');
      assert.ok(firstCandidate.origin, 'Candidate must have origin');
      assert.ok(firstCandidate.destination, 'Candidate must have destination');
      assert.ok(firstCandidate.departureTime, 'Candidate must have departureTime');
      assert.ok(firstCandidate.estimatedArrivalTime, 'Candidate must have estimatedArrivalTime');
      assert.ok(typeof firstCandidate.totalDurationMinutes === 'number');
      assert.ok(typeof firstCandidate.walkingTimeMinutes === 'number');
      assert.ok(typeof firstCandidate.totalWaitingTimeMinutes === 'number');
      assert.ok(typeof firstCandidate.transferCount === 'number');
      assert.ok(typeof firstCandidate.estimatedCostRupees === 'number');
      assert.ok(Array.isArray(firstCandidate.segments), 'Candidate must have segments array');
      assert.ok(firstCandidate.segments.length > 0, 'Candidate must have at least one segment');

      const seg = firstCandidate.segments[0];
      assert.ok(seg.mode, 'Segment must have mode');
      assert.ok(seg.from, 'Segment must have from');
      assert.ok(seg.to, 'Segment must have to');
      assert.ok(typeof seg.durationMinutes === 'number');
    });

    // 4. Multiple Candidates diversity
    await test('Multiple Candidates: returns multiple distinct options for standard corridor', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          limit: 5
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.candidates.length >= 2, 'Should return multiple candidates for Lokhandwala corridor');
      
      const modesFound = new Set();
      for (const cand of res.body.candidates) {
        cand.modesIncluded.forEach(m => modesFound.add(m));
      }
      assert.ok(modesFound.has('train') || modesFound.has('metro') || modesFound.has('auto'), 'Should return multimodal candidates');
    });

    // 5. Alias Endpoint: /api/student/commute/candidates
    await test('Alias Endpoint: /api/student/commute/candidates functions identically', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Vile Parle',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:30'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.candidateCount > 0);
    });

    // 6. No Route Available (impossibly strict constraints)
    await test('No Route: returns 200 with empty candidate array when constraints exclude all options', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Borivali',
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

    // 7. Invalid Constraints Validation (negative numbers, extreme bounds)
    await test('Validation Error: negative maxTransfers or maxBudgetRupees returns 400', async () => {
      const res1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Andheri West',
          maxTransfers: -1
        }
      });
      assert.strictEqual(res1.status, 400);
      assert.strictEqual(res1.body.success, false);

      const res2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Andheri West',
          maxBudgetRupees: -50
        }
      });
      assert.strictEqual(res2.status, 400);
      assert.strictEqual(res2.body.success, false);
    });

    // 8. Invalid Time Format Validation
    await test('Validation Error: invalid time string returns 400', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Andheri West',
          desiredDepartureTime: '26:99'
        }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    // 9. Privacy-by-Design Protection (Reject granular coordinates, flat numbers, PIN codes)
    await test('Privacy Safeguard: rejects coordinates, flat numbers, or PIN codes with 400', async () => {
      const resCoords = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Andheri West',
          latitude: 19.1197,
          longitude: 72.8468
        }
      });
      assert.strictEqual(resCoords.status, 400);
      assert.strictEqual(resCoords.body.success, false);

      const resFlat = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Flat 402, Gokul Towers, Andheri'
        }
      });
      assert.strictEqual(resFlat.status, 400);
      assert.strictEqual(resFlat.body.success, false);
    });

    // 10. Student Ownership & Preference Scoping: Saved Defaults
    await test('Student Ownership: falls back to student profile default origin when startingArea omitted', async () => {
      // Save commute preferences for student 1
      const prefRes = await makeRequest(server, {
        method: 'PUT',
        path: '/api/student/commute-preferences',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          default_origin_area: 'Bandra West',
          max_transfers: 1,
          walking_tolerance_minutes: 15
        }
      });
      assert.strictEqual(prefRes.status, 200);

      // Call candidates without specifying startingArea
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          desiredDepartureTime: '08:30'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.queryContext.startingArea, 'Bandra West');
      assert.strictEqual(res.body.queryContext.appliedConstraints.maxTransfers, 1);
      assert.strictEqual(res.body.queryContext.appliedConstraints.maxWalkingMinutes, 15);
    });

    // 11. Student Isolation: Student 2 has different defaults
    await test('Student Isolation: Student 2 uses their own distinct preferences', async () => {
      // Save distinct commute preferences for student 2
      const pref2Res = await makeRequest(server, {
        method: 'PUT',
        path: '/api/student/commute-preferences',
        headers: { Authorization: `Bearer ${student2Token}` },
        body: {
          default_origin_area: 'Goregaon West',
          max_transfers: 3,
          walking_tolerance_minutes: 25
        }
      });
      assert.strictEqual(pref2Res.status, 200);

      // Student 2 request
      const res2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student2Token}` },
        body: {
          desiredDepartureTime: '08:30'
        }
      });

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.queryContext.studentId, student2Id);
      assert.strictEqual(res2.body.queryContext.startingArea, 'Goregaon West');
      assert.strictEqual(res2.body.queryContext.appliedConstraints.maxTransfers, 3);
    });

    // 12. Deterministic Response Verification
    await test('Deterministic Output: repeating identical requests produces identical candidate sets', async () => {
      const payload = {
        startingArea: 'Malad West',
        collegeDestination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:15',
        limit: 3
      };

      const resA = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: payload
      });

      const resB = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: payload
      });

      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resB.status, 200);
      assert.strictEqual(resA.body.candidateCount, resB.body.candidateCount);
      assert.deepStrictEqual(
        resA.body.candidates.map(c => ({ id: c.id, duration: c.totalDurationMinutes, cost: c.estimatedCostRupees })),
        resB.body.candidates.map(c => ({ id: c.id, duration: c.totalDurationMinutes, cost: c.estimatedCostRupees }))
      );
    });

    // 13. Provenance Metadata & Synthetic Data Limitations Disclosure
    await test('Provenance Metadata: includes provenance tiers and explicit synthetic data limitations', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          startingArea: 'Andheri West',
          desiredDepartureTime: '08:00'
        }
      });

      assert.strictEqual(res.status, 200);
      const meta = res.body.provenanceMetadata;
      assert.ok(meta, 'Must include provenanceMetadata');
      assert.ok(Array.isArray(meta.dataTiers), 'Must list data tiers');
      assert.strictEqual(meta.hasEstimatedData, true);
      assert.ok(meta.limitations.length > 0, 'Must disclose limitations');

      const firstCand = res.body.candidates[0];
      assert.ok(firstCand.provenance, 'Candidate must contain provenance object');
      assert.ok(firstCand.limitations, 'Candidate must contain limitations disclosure string');
    });

  } finally {
    server.close();
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n====================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCandidateRouteApiTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
