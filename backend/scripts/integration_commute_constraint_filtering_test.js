/**
 * Commute Route Constraint Filtering API Integration Test Suite
 *
 * Verifies the REST API response for constraint-filtered commute candidates:
 *   POST /api/commute/candidates
 *   POST /api/student/commute/candidates
 *
 * Tests:
 * 1. Default / Unconstrained: Accepted candidates returned with filterStatus: 'ACCEPTED'
 * 2. Tight Arrival Deadline: Candidates arriving after deadline marked REJECTED with ARRIVAL_TOO_LATE
 * 3. Max Transfers Constraint: Routes requiring extra transfers marked REJECTED with TOO_MANY_TRANSFERS
 * 4. Max Walking Minutes Constraint: Long-walking routes marked REJECTED with WALKING_LIMIT_EXCEEDED
 * 5. Budget Limit Constraint: High-fare routes marked REJECTED with BUDGET_EXCEEDED
 * 6. Excluded Modes Constraint: Routes with avoidModes marked REJECTED with EXCLUDED_MODE
 * 7. Non-Discard Invariant: rejectedCandidates array exposes all rejected routes with full violations
 * 8. Soft Preferences Invariant: Preferred modes and routing preferences inform softPreferences without rejecting
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_commute_constraint_filtering_api.db');
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

async function runConstraintFilteringApiTests() {
  console.log('===============================================================');
  console.log(' Running Commute Constraint Filtering API Integration Tests');
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

  try {
    const runId = Date.now();
    const email = `constraint_student_${runId}@djsce.edu`;
    const password = 'Password123!';

    // Register and authenticate a test student
    const regRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email,
        password,
        full_name: 'Constraint Student',
        college_name: 'D.J. Sanghvi College of Engineering'
      }
    });
    assert.strictEqual(regRes.status, 201);

    const loginRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email, password }
    });
    assert.strictEqual(loginRes.status, 200);
    const token = loginRes.body.token;
    assert.ok(token);

    // -------------------------------------------------------------------------
    // 1. Default / Unconstrained Query
    // -------------------------------------------------------------------------
    await test('Default Query: exposes filterSummary, acceptedCandidateCount, and filterStatus', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(typeof res.body.acceptedCandidateCount, 'number');
      assert.strictEqual(typeof res.body.rejectedCandidateCount, 'number');
      assert.ok(res.body.filterSummary);
      assert.strictEqual(res.body.filterSummary.totalEvaluated, res.body.totalEvaluatedCount);
      assert.ok(Array.isArray(res.body.rejectedCandidates));

      for (const cand of res.body.candidates) {
        assert.ok(['ACCEPTED', 'REJECTED'].includes(cand.filterStatus));
        assert.strictEqual(typeof cand.isAccepted, 'boolean');
        assert.ok(Array.isArray(cand.constraintViolations));
        assert.ok(Array.isArray(cand.rejectionReasonCodes));
      }
    });

    // -------------------------------------------------------------------------
    // 2. Strict Arrival Deadline (ARRIVAL_TOO_LATE)
    // -------------------------------------------------------------------------
    await test('Strict Arrival Deadline: rejects routes arriving past deadline with ARRIVAL_TOO_LATE', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          desiredArrivalTime: '08:20' // Very tight 20 min from Kandivali (normally 40+ min)
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.rejectedCandidateCount > 0);
      assert.ok(res.body.filterSummary.rejectionBreakdown.ARRIVAL_TOO_LATE > 0);

      const lateCand = res.body.rejectedCandidates.find(r => r.reasonCodes.includes('ARRIVAL_TOO_LATE'));
      assert.ok(lateCand, 'Must include rejected candidate with ARRIVAL_TOO_LATE');
      assert.strictEqual(lateCand.primaryReasonCode, 'ARRIVAL_TOO_LATE');
      assert.ok(lateCand.violations.some(v => v.reasonCode === 'ARRIVAL_TOO_LATE'));
    });

    // -------------------------------------------------------------------------
    // 3. Maximum Transfers Constraint (TOO_MANY_TRANSFERS)
    // -------------------------------------------------------------------------
    await test('Max Transfers Constraint: rejects routes exceeding transfer limit with TOO_MANY_TRANSFERS', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Borivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          maxTransfers: 0 // Direct routes only, multimodal transfers invalid
        }
      });

      assert.strictEqual(res.status, 200);
      const multiTransferRejected = res.body.rejectedCandidates.find(r => r.reasonCodes.includes('TOO_MANY_TRANSFERS'));
      if (multiTransferRejected) {
        assert.ok(multiTransferRejected.violations.some(v => v.field === 'maxTransfers'));
        assert.strictEqual(multiTransferRejected.metrics.transferCount > 0, true);
      }
    });

    // -------------------------------------------------------------------------
    // 4. Maximum Walking Minutes Constraint (WALKING_LIMIT_EXCEEDED)
    // -------------------------------------------------------------------------
    await test('Walking Minutes Constraint: rejects routes exceeding walking tolerance with WALKING_LIMIT_EXCEEDED', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          maxWalkingMinutes: 3 // Extreme low walking tolerance
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.rejectedCandidateCount > 0);
      assert.ok(res.body.filterSummary.rejectionBreakdown.WALKING_LIMIT_EXCEEDED > 0);

      const walkingRejected = res.body.rejectedCandidates.find(r => r.reasonCodes.includes('WALKING_LIMIT_EXCEEDED'));
      assert.ok(walkingRejected);
      assert.strictEqual(walkingRejected.primaryReasonCode, 'WALKING_LIMIT_EXCEEDED');
      assert.ok(walkingRejected.violations.some(v => v.reasonCode === 'WALKING_LIMIT_EXCEEDED'));
    });

    // -------------------------------------------------------------------------
    // 5. Maximum Budget Limit Constraint (BUDGET_EXCEEDED)
    // -------------------------------------------------------------------------
    await test('Budget Constraint: rejects routes exceeding budget with BUDGET_EXCEEDED', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          maxBudgetRupees: 5 // Trains/buses may cost 10-25, autos cost 50+
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.rejectedCandidateCount > 0);
      assert.ok(res.body.filterSummary.rejectionBreakdown.BUDGET_EXCEEDED > 0);

      const budgetRejected = res.body.rejectedCandidates.find(r => r.reasonCodes.includes('BUDGET_EXCEEDED'));
      assert.ok(budgetRejected);
      assert.ok(budgetRejected.violations.some(v => v.reasonCode === 'BUDGET_EXCEEDED'));
    });

    // -------------------------------------------------------------------------
    // 6. Excluded Transport Modes (EXCLUDED_MODE)
    // -------------------------------------------------------------------------
    await test('Excluded Transport Modes: rejects routes with avoidModes with EXCLUDED_MODE', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Vile Parle West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          avoidModes: ['auto']
        }
      });

      assert.strictEqual(res.status, 200);
      const autoRejected = res.body.rejectedCandidates.find(r => r.reasonCodes.includes('EXCLUDED_MODE'));
      assert.ok(autoRejected, 'Must include rejected candidate with EXCLUDED_MODE in rejectedCandidates');
      assert.strictEqual(autoRejected.primaryReasonCode, 'EXCLUDED_MODE');
      assert.ok(!res.body.candidates.some(c => c.modesIncluded.includes('auto')), 'Accepted candidates must not contain auto');

      // Test with includeRejected: true
      const resWithRejected = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Vile Parle West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          avoidModes: ['auto'],
          includeRejected: true
        }
      });
      assert.strictEqual(resWithRejected.status, 200);
      const autoInCandidates = resWithRejected.body.candidates.find(c => c.modesIncluded.includes('auto'));
      if (autoInCandidates) {
        assert.strictEqual(autoInCandidates.filterStatus, 'REJECTED');
        assert.ok(autoInCandidates.rejectionReasonCodes.includes('EXCLUDED_MODE'));
      }
    });

    // -------------------------------------------------------------------------
    // 7. Non-Discard Invariant: No routes silently discarded
    // -------------------------------------------------------------------------
    await test('Non-Discard Invariant: rejected routes are preserved with full violation detail', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/commute/candidates', // alias route
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Borivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          maxWalkingMinutes: 4
        }
      });

      assert.strictEqual(res.status, 200);
      const { candidateCount, acceptedCandidateCount, rejectedCandidateCount, totalEvaluatedCount, rejectedCandidates } = res.body;
      assert.strictEqual(acceptedCandidateCount + rejectedCandidateCount, totalEvaluatedCount);
      assert.strictEqual(rejectedCandidates.length, rejectedCandidateCount);

      if (rejectedCandidates.length > 0) {
        const first = rejectedCandidates[0];
        assert.ok(first.candidateId);
        assert.ok(first.primaryReasonCode);
        assert.ok(first.reasonCodes.length > 0);
        assert.ok(first.violations.length > 0);
        assert.ok(first.violations[0].constraintType === 'HARD');
        assert.ok(first.violations[0].message);
      }
    });

    // -------------------------------------------------------------------------
    // 8. Soft Preferences Invariant
    // -------------------------------------------------------------------------
    await test('Soft Preferences Invariant: preferences inform softPreferences without rejecting route', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['metro'],
          preference: 'fastest'
        }
      });

      assert.strictEqual(res.status, 200);
      const acceptedCand = res.body.candidates.find(c => c.filterStatus === 'ACCEPTED');
      if (acceptedCand) {
        assert.ok(acceptedCand.softPreferences);
        assert.strictEqual(acceptedCand.softPreferences.preferenceType, 'fastest');
        assert.strictEqual(typeof acceptedCand.softPreferences.affinityScore, 'number');
        assert.ok(Array.isArray(acceptedCand.softPreferences.notes));
      }
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

runConstraintFilteringApiTests();
