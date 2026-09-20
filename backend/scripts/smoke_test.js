/**
 * Foundation Smoke Test Suite
 *
 * Validates backend application initialization, health check endpoints,
 * and centralized error handling in an isolated test environment.
 * Runs with zero external credential dependencies and zero persistent data mutation.
 */

const assert = require('assert');
const http = require('http');
const axios = require('axios');
const { createApp } = require('../app');

console.log('====================================================');
console.log(' Running Backend Foundation Smoke Tests');
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
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

async function runSmokeTests() {
  // 1. Application Initialization Test
  let app;
  await runAsyncTest('Backend application initializes cleanly with middleware and routes', async () => {
    app = createApp();
    assert(typeof app === 'function', 'createApp must return an Express application function');
    assert(typeof app.listen === 'function', 'App instance must support listening for HTTP traffic');
    assert(typeof app.handle === 'function', 'App instance must have request dispatcher');
  });

  // 2. Start ephemeral test server on dynamic port (port 0 avoids port collisions)
  const server = http.createServer(app);
  let testPort;
  let baseUrl;

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      baseUrl = `http://127.0.0.1:${testPort}`;
      resolve();
    });
    server.on('error', reject);
  });

  try {
    // 3. Test GET /health (Root Health Check)
    await runAsyncTest('GET /health returns HTTP 200 with service status, Mumbai city, uptime, and timestamp', async () => {
      const res = await axios.get(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200, 'Root health endpoint must return 200');
      assert.strictEqual(res.data.status, 'ok', 'Status must be "ok"');
      assert.strictEqual(res.data.service, 'Smart Student Commute Companion API');
      assert.strictEqual(res.data.city, 'Mumbai');
      assert.strictEqual(typeof res.data.uptime, 'number', 'Uptime must be a valid number');
      assert(typeof res.data.timestamp === 'string', 'Timestamp must be an ISO string');
      assert(!isNaN(Date.parse(res.data.timestamp)), 'Timestamp must be valid ISO format');

      // Security verification: zero credentials or secrets exposed
      const sensitiveKeys = ['GEMINI_API_KEY', 'apiKey', 'token', 'secret', 'password', 'env'];
      for (const key of sensitiveKeys) {
        assert.strictEqual(res.data[key], undefined, `Health endpoint must not expose sensitive key: ${key}`);
      }
    });

    // 4. Test GET /api/health (API-prefixed Health Check)
    await runAsyncTest('GET /api/health returns HTTP 200 with matching schema', async () => {
      const res = await axios.get(`${baseUrl}/api/health`);
      assert.strictEqual(res.status, 200, 'API health endpoint must return 200');
      assert.strictEqual(res.data.status, 'ok');
      assert.strictEqual(res.data.city, 'Mumbai');
    });

    // 5. Test Centralized 404 Handling
    await runAsyncTest('Unmapped endpoint returns structured JSON 404 NOT_FOUND', async () => {
      try {
        await axios.get(`${baseUrl}/api/unmapped-smoke-test-endpoint`);
        assert.fail('Expected 404 error');
      } catch (err) {
        assert(err.response, 'Expected HTTP error response');
        assert.strictEqual(err.response.status, 404, 'Status must be 404');
        assert.strictEqual(err.response.data.code, 'NOT_FOUND');
        assert.strictEqual(err.response.data.statusCode, 404);
        assert(err.response.data.timestamp, 'Response must include timestamp');
      }
    });

    // 6. Test Centralized 400 Validation Error Handling
    await runAsyncTest('Invalid payload returns structured JSON 400 VALIDATION_ERROR with details', async () => {
      try {
        await axios.post(`${baseUrl}/api/plan`, {
          origin: '',
          destination: 'VJTI Matunga'
        });
        assert.fail('Expected 400 validation error');
      } catch (err) {
        assert(err.response, 'Expected HTTP error response');
        assert.strictEqual(err.response.status, 400, 'Status must be 400');
        assert.strictEqual(err.response.data.error, 'Validation failed');
        assert.strictEqual(err.response.data.code, 'VALIDATION_ERROR');
        assert.strictEqual(err.response.data.statusCode, 400);
        assert(err.response.data.details, 'Response must include schema validation details');
      }
    });
  } finally {
    // 7. Teardown
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n----------------------------------------------------');
  console.log(` SMOKE TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL BACKEND FOUNDATION SMOKE TESTS PASSED! 🎉\n');
  }
}

runSmokeTests().catch((err) => {
  console.error('Fatal smoke test runner error:', err);
  process.exit(1);
});
