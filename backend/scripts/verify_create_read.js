/**
 * Create and Read Endpoints Verification Suite
 *
 * Starts an ephemeral server instance and tests:
 * 1. Creation and retrieval of RideGroups (POST & GET).
 * 2. Retrieval of specific RideGroup by ID (404 on missing).
 * 3. Creation and retrieval of Live Disruption Reports (POST & GET).
 * 4. Retrieval of specific Live Report by ID (404 on missing).
 * 5. Creation and retrieval of Student Feedback (POST & GET).
 * 6. Rejection of invalid payloads with structured 400 ValidationErrors.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const axios = require('axios');
const { createApp } = require('../app');

console.log('====================================================');
console.log(' Running Create and Read API Endpoint Tests');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
    failed++;
  }
}

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  let baseUrl;
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
    server.on('error', reject);
  });

  try {
    // -------------------------------------------------------------
    // Test Section 1: Ride Groups (Create & Read)
    // -------------------------------------------------------------
    let createdGroupId;

    await runAsyncTest('POST /api/ride-groups creates a new student ride group', async () => {
      const res = await axios.post(`${baseUrl}/ride-groups`, {
        creator_pseudonym: 'Sneha Kulkarni',
        origin_area: 'Thane West',
        destination_college: 'VJTI Matunga',
        departure_time: '08:15 AM',
        mode: 'train',
        max_members: 4,
        notes: 'Catching 8:22 AM fast local'
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert(res.data.group.id, 'Group ID must be present');
      assert.equal(res.data.group.creator_pseudonym, 'Sneha Kulkarni');
      assert.equal(res.data.group.current_members, 1);
      createdGroupId = res.data.group.id;
    });

    await runAsyncTest('GET /api/ride-groups returns list of active ride groups', async () => {
      const res = await axios.get(`${baseUrl}/ride-groups`);
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert(Array.isArray(res.data.groups), 'groups must be an array');
      assert(res.data.groups.some(g => g.id === createdGroupId), 'Created group should be in the list');
    });

    await runAsyncTest('GET /api/ride-groups/:id returns single ride group', async () => {
      const res = await axios.get(`${baseUrl}/ride-groups/${createdGroupId}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.group.id, createdGroupId);
      assert.equal(res.data.group.destination_college, 'VJTI Matunga');
    });

    await runAsyncTest('GET /api/ride-groups/:id with invalid ID returns 404 NOT_FOUND', async () => {
      try {
        await axios.get(`${baseUrl}/ride-groups/non-existent-grp-id-999`);
        assert.fail('Should have thrown 404');
      } catch (err) {
        assert.equal(err.response.status, 404);
        assert.equal(err.response.data.code, 'NOT_FOUND');
      }
    });

    // -------------------------------------------------------------
    // Test Section 2: Disruption Reports (Create & Read)
    // -------------------------------------------------------------
    let createdReportId;

    await runAsyncTest('POST /api/live-reports creates new community disruption report', async () => {
      const res = await axios.post(`${baseUrl}/live-reports`, {
        pseudonym: 'Student_Tester_01',
        area: 'Ghatkopar Metro Station',
        route_name: 'Metro Line 1',
        mode: 'metro',
        message: 'Security lines very long at Ghatkopar concourse',
        impact: 'medium',
        durationObservedMinutes: 45
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert(res.data.report.id, 'Report ID must be present');
      assert.equal(res.data.report.area, 'Ghatkopar Metro Station');
      createdReportId = res.data.report.id;
    });

    await runAsyncTest('GET /api/live-reports returns active reports list', async () => {
      const res = await axios.get(`${baseUrl}/live-reports`);
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert(Array.isArray(res.data.reports));
      assert(res.data.reports.some(r => r.id === createdReportId));
    });

    await runAsyncTest('GET /api/live-reports/:id returns single disruption report', async () => {
      const res = await axios.get(`${baseUrl}/live-reports/${createdReportId}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.report.id, createdReportId);
      assert.equal(res.data.report.mode, 'metro');
    });

    await runAsyncTest('GET /api/live-reports/:id with missing ID returns 404 NOT_FOUND', async () => {
      try {
        await axios.get(`${baseUrl}/live-reports/non-existent-rep-999`);
        assert.fail('Should have thrown 404');
      } catch (err) {
        assert.equal(err.response.status, 404);
        assert.equal(err.response.data.code, 'NOT_FOUND');
      }
    });

    // -------------------------------------------------------------
    // Test Section 3: Student Feedback (Create & Read)
    // -------------------------------------------------------------
    const testRecId = `rec-eval-${Date.now()}`;

    await runAsyncTest('POST /api/feedback records student rating', async () => {
      const res = await axios.post(`${baseUrl}/feedback`, {
        recommendation_id: testRecId,
        is_useful: true,
        tags: ['Fast', 'Accurate'],
        comment: 'Great alternate route via Metro 2A'
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
    });

    await runAsyncTest('GET /api/feedback reads submitted feedback and rating summary', async () => {
      const res = await axios.get(`${baseUrl}/feedback?recommendation_id=${testRecId}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.summary.total, 1);
      assert.equal(res.data.summary.helpful, 1);
      assert.equal(res.data.feedback[0].recommendation_id, testRecId);
    });

    // -------------------------------------------------------------
    // Test Section 4: Input Validation (400 on malformed payloads)
    // -------------------------------------------------------------
    await runAsyncTest('POST /api/ride-groups with invalid data returns 400 VALIDATION_ERROR', async () => {
      try {
        await axios.post(`${baseUrl}/ride-groups`, {
          creator_pseudonym: 'A', // too short (< 2)
          max_members: 99 // out of bounds
        });
        assert.fail('Should have rejected invalid ride-group');
      } catch (err) {
        assert.equal(err.response.status, 400);
        assert.equal(err.response.data.code, 'VALIDATION_ERROR');
      }
    });

    await runAsyncTest('POST /api/live-reports with invalid mode returns 400 VALIDATION_ERROR', async () => {
      try {
        await axios.post(`${baseUrl}/live-reports`, {
          area: 'Dadar',
          mode: 'helicopter',
          message: 'No copters landing'
        });
        assert.fail('Should have rejected invalid mode');
      } catch (err) {
        assert.equal(err.response.status, 400);
        assert.equal(err.response.data.code, 'VALIDATION_ERROR');
      }
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` CREATE AND READ VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL CREATE AND READ API TESTS PASSED! 🎉\n');
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
