const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');

function request(server, { method, path, headers = {}, body = null }) {
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
        path,
        method,
        headers: reqHeaders
      },
      res => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
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

async function main() {
  console.log('====================================================');
  console.log(' Running Update and Delete API Test Suite (Task 4/7)');
  console.log('====================================================\n');

  process.env.NODE_ENV = 'test';

  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

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
      failed++;
    }
  }

  try {
    // Setup test records
    const createGroupRes = await request(server, {
      method: 'POST',
      path: '/api/ride-groups',
      body: {
        creator_pseudonym: 'UpdateTester',
        origin_area: 'Andheri',
        destination_college: 'DJSCE',
        departure_time: '08:30 AM',
        mode: 'Auto Share',
        max_members: 4,
        notes: 'Initial notes'
      }
    });
    assert.strictEqual(createGroupRes.status, 201);
    const groupId = createGroupRes.body.group.id;

    const createReportRes = await request(server, {
      method: 'POST',
      path: '/api/live-reports',
      body: {
        pseudonym: 'UpdateRider',
        area: 'Vile Parle',
        mode: 'metro',
        message: 'Platform overcrowding observed',
        impact: 'medium'
      }
    });
    assert.strictEqual(createReportRes.status, 201);
    const reportId = createReportRes.body.report.id;

    const createFeedbackRes = await request(server, {
      method: 'POST',
      path: '/api/feedback',
      body: {
        recommendation_id: 'rec-test-upd',
        is_useful: true,
        tags: ['fast'],
        comment: 'Initial feedback'
      }
    });
    assert.strictEqual(createFeedbackRes.status, 201);
    // Find feedback ID from list
    const listFbRes = await request(server, {
      method: 'GET',
      path: '/api/feedback?recommendation_id=rec-test-upd'
    });
    const feedbackId = listFbRes.body.feedback[0].id;

    // 1. Update Ride Group successfully
    await test('PATCH /api/ride-groups/:id updates notes and departure time', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: `/api/ride-groups/${groupId}`,
        body: {
          departure_time: '09:00 AM',
          notes: 'Updated: meeting near station gate 2'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.group.departure_time, '09:00 AM');
      assert.strictEqual(res.body.group.notes, 'Updated: meeting near station gate 2');
    });

    // 2. Reject capacity violation (max_members < current_members)
    await test('PATCH /api/ride-groups/:id rejects max_members below current members', async () => {
      // First join to make current_members = 2
      await request(server, { method: 'POST', path: `/api/ride-groups/${groupId}/join` });
      
      const res = await request(server, {
        method: 'PATCH',
        path: `/api/ride-groups/${groupId}`,
        body: {
          max_members: 1 // Invalid since schema requires min 2, but let's test bad request error
        }
      });
      assert.strictEqual(res.status, 400);
    });

    // 3. Reject empty update body
    await test('PATCH /api/ride-groups/:id rejects empty update body', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: `/api/ride-groups/${groupId}`,
        body: {}
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });

    // 4. Update non-existent ride group returns 404
    await test('PATCH /api/ride-groups/nonexistent returns 404', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: '/api/ride-groups/grp-nonexistent-999',
        body: { notes: 'New notes' }
      });
      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error);
    });

    // 5. Delete ride group successfully
    await test('DELETE /api/ride-groups/:id removes ride group', async () => {
      const res = await request(server, {
        method: 'DELETE',
        path: `/api/ride-groups/${groupId}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.id, groupId);

      // Verify it no longer exists
      const getRes = await request(server, {
        method: 'GET',
        path: `/api/ride-groups/${groupId}`
      });
      assert.strictEqual(getRes.status, 404);
    });

    // 6. Delete already deleted ride group returns 404
    await test('DELETE /api/ride-groups/:id for non-existent group returns 404', async () => {
      const res = await request(server, {
        method: 'DELETE',
        path: `/api/ride-groups/${groupId}`
      });
      assert.strictEqual(res.status, 404);
    });

    // 7. Update live report successfully
    await test('PATCH /api/live-reports/:id updates status and impact', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: `/api/live-reports/${reportId}`,
        body: {
          status: 'resolved',
          impact: 'low'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.report.status, 'resolved');
      assert.strictEqual(res.body.report.impact, 'low');
    });

    // 8. Reject invalid report update status
    await test('PATCH /api/live-reports/:id rejects invalid status enum', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: `/api/live-reports/${reportId}`,
        body: {
          status: 'invalid_status_value'
        }
      });
      assert.strictEqual(res.status, 400);
    });

    // 9. Update non-existent report returns 404
    await test('PATCH /api/live-reports/nonexistent returns 404', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: '/api/live-reports/rep-nonexistent-999',
        body: { status: 'resolved' }
      });
      assert.strictEqual(res.status, 404);
    });

    // 10. Delete live report successfully
    await test('DELETE /api/live-reports/:id deletes report', async () => {
      const res = await request(server, {
        method: 'DELETE',
        path: `/api/live-reports/${reportId}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.id, reportId);

      // Verify read returns 404
      const getRes = await request(server, {
        method: 'GET',
        path: `/api/live-reports/${reportId}`
      });
      assert.strictEqual(getRes.status, 404);
    });

    // 11. Delete non-existent report returns 404
    await test('DELETE /api/live-reports/:id for non-existent report returns 404', async () => {
      const res = await request(server, {
        method: 'DELETE',
        path: `/api/live-reports/${reportId}`
      });
      assert.strictEqual(res.status, 404);
    });

    // 12. Update feedback successfully
    await test('PATCH /api/feedback/:id updates comment and tags', async () => {
      const res = await request(server, {
        method: 'PATCH',
        path: `/api/feedback/${feedbackId}`,
        body: {
          comment: 'Updated student review: Very smooth commute!',
          tags: ['fast', 'reliable']
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.feedback.comment, 'Updated student review: Very smooth commute!');
      assert.deepStrictEqual(res.body.feedback.tags, ['fast', 'reliable']);
    });

    // 13. Delete feedback successfully
    await test('DELETE /api/feedback/:id deletes feedback', async () => {
      const res = await request(server, {
        method: 'DELETE',
        path: `/api/feedback/${feedbackId}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    // 14. Delete non-existent feedback returns 404
    await test('DELETE /api/feedback/:id for non-existent feedback returns 404', async () => {
      const res = await request(server, {
        method: 'DELETE',
        path: `/api/feedback/${feedbackId}`
      });
      assert.strictEqual(res.status, 404);
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` UPDATE & DELETE VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL UPDATE & DELETE CHECKS PASSED! 🎉\n');
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
