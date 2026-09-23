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
  console.log(' Running API Response Conventions Test Suite (Task 6/7)');
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
    // 1. Success created response standard
    await test('POST 201 response adheres to standard envelope (success: true, timestamp)', async () => {
      const res = await request(server, {
        method: 'POST',
        path: '/api/ride-groups',
        body: {
          creator_pseudonym: 'FormatTester',
          origin_area: 'Dadar',
          destination_college: 'DJSCE',
          departure_time: '08:00 AM',
          mode: 'train'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.timestamp);
      assert.ok(Date.parse(res.body.timestamp));
      assert.ok(res.body.group);
    });

    // 2. Collection response standard
    await test('GET collection response adheres to standard envelope with pagination', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups?limit=5' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.timestamp);
      assert.ok(Array.isArray(res.body.groups));
      assert.ok(res.body.pagination);
      assert.strictEqual(typeof res.body.pagination.page, 'number');
      assert.strictEqual(typeof res.body.pagination.limit, 'number');
    });

    // 3. Error response standard: validation error
    await test('Validation failure adheres to standard error envelope (success: false, code, timestamp)', async () => {
      const res = await request(server, {
        method: 'POST',
        path: '/api/ride-groups',
        body: { creator_pseudonym: 'X' } // Invalid: missing fields and < 2 chars
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.timestamp);
      assert.ok(res.body.details);
    });

    // 4. Error response standard: 404 not found
    await test('Missing record error adheres to standard error envelope', async () => {
      const res = await request(server, {
        method: 'GET',
        path: '/api/ride-groups/grp-missing-format-check'
      });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'NOT_FOUND');
      assert.ok(res.body.timestamp);
    });

    // 5. Production error sanitization
    await test('Production unexpected error masks stack traces and internal messages', async () => {
      const { errorHandler } = require('../middleware/errorHandler');

      let responseCode = null;
      let responseBody = null;
      const mockRes = {
        status(code) { responseCode = code; return this; },
        json(data) { responseBody = data; return this; }
      };
      const mockReq = { method: 'GET', originalUrl: '/test-crash' };

      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        errorHandler(new Error('Database password was supersecret123'), mockReq, mockRes, () => {});
        assert.strictEqual(responseCode, 500);
        assert.strictEqual(responseBody.success, false);
        assert.strictEqual(responseBody.message, 'An unexpected error occurred. Please try again later.');
        assert.strictEqual(responseBody.stack, undefined);
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` API RESPONSE CONVENTIONS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL API RESPONSE CONVENTION CHECKS PASSED! 🎉\n');
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
