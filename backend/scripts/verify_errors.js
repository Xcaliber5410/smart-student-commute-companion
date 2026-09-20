const assert = require('assert');
const http = require('http');
const axios = require('axios');
const { createApp } = require('../app');
const { AppError, NotFoundError } = require('../errors');

console.log('====================================================');
console.log(' Running Centralized Error Handling Test Suite');
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

async function startTestServer(appInstance, port = 5088) {
  const server = http.createServer(appInstance);
  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function runAllTests() {
  // TEST 1: Validation error handling (400 Bad Request)
  const app = createApp();
  const testHost = await startTestServer(app, 5088);

  try {
    await runAsyncTest('Validation error returns status 400 with consistent structure and details', async () => {
      try {
        await axios.post(`${testHost.baseUrl}/api/plan`, {
          origin: '', // invalid: min 2 chars
          destination: 'VJTI Mumbai'
        });
        assert.fail('Expected 400 Validation Error, but request succeeded');
      } catch (err) {
        assert(err.response, 'Expected HTTP response error');
        assert.strictEqual(err.response.status, 400, 'Status must be 400');
        const data = err.response.data;
        assert.strictEqual(data.error, 'Validation failed');
        assert.strictEqual(data.code, 'VALIDATION_ERROR');
        assert.strictEqual(data.statusCode, 400);
        assert(data.details, 'Error details must contain schema validation issues');
        assert(data.timestamp, 'Error response must contain ISO timestamp');
      }
    });

    // TEST 2: Known operational error (404 Not Found on business logic)
    await runAsyncTest('Known application error (ride group not found) returns 404 with standard error body', async () => {
      try {
        await axios.post(`${testHost.baseUrl}/api/ride-groups/non-existent-group-id-999/join`);
        assert.fail('Expected 404 Not Found, but request succeeded');
      } catch (err) {
        assert(err.response, 'Expected HTTP response error');
        assert.strictEqual(err.response.status, 404, 'Status must be 404');
        const data = err.response.data;
        assert.strictEqual(data.error, 'Ride group not found');
        assert.strictEqual(data.code, 'NOT_FOUND');
        assert.strictEqual(data.statusCode, 404);
        assert(data.timestamp, 'Timestamp must be present');
      }
    });

    // TEST 3: Unmatched route 404 catch-all
    await runAsyncTest('Unmatched API routes return standard 404 JSON instead of Express HTML', async () => {
      try {
        await axios.get(`${testHost.baseUrl}/api/non-existent-endpoint`);
        assert.fail('Expected 404 Not Found');
      } catch (err) {
        assert(err.response, 'Expected HTTP response error');
        assert.strictEqual(err.response.status, 404);
        const data = err.response.data;
        assert(data.error.includes('Route not found'));
        assert.strictEqual(data.code, 'NOT_FOUND');
        assert.strictEqual(data.statusCode, 404);
      }
    });

    // TEST 4: Malformed JSON syntax in request body
    await runAsyncTest('Malformed JSON syntax in body returns status 400 with INVALID_JSON code', async () => {
      try {
        await axios.post(`${testHost.baseUrl}/api/feedback`, '{invalid-json', {
          headers: { 'Content-Type': 'application/json' }
        });
        assert.fail('Expected 400 for malformed JSON');
      } catch (err) {
        assert(err.response, 'Expected HTTP response error');
        assert.strictEqual(err.response.status, 400);
        const data = err.response.data;
        assert.strictEqual(data.code, 'INVALID_JSON');
        assert.strictEqual(data.statusCode, 400);
      }
    });

    // TEST 5: Existing successful endpoints are preserved
    await runAsyncTest('Existing normal endpoints return expected 200 success responses', async () => {
      const healthRes = await axios.get(`${testHost.baseUrl}/health`);
      assert.strictEqual(healthRes.status, 200);
      assert.strictEqual(healthRes.data.status, 'ok');

      const apiHealthRes = await axios.get(`${testHost.baseUrl}/api/health`);
      assert.strictEqual(apiHealthRes.status, 200);
      assert.strictEqual(apiHealthRes.data.status, 'ok');

      const groupsRes = await axios.get(`${testHost.baseUrl}/api/ride-groups`);
      assert.strictEqual(groupsRes.status, 200);
      assert.strictEqual(groupsRes.data.success, true);
    });
  } finally {
    await testHost.close();
  }

  // TEST 6: Unexpected 500 error in development (stack trace included for debugging)
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  const devApp = createApp({
    beforeNotFound: (appInstance) => {
      appInstance.get('/test-crash', (req, res, next) => {
        next(new Error('Internal simulated database failure: /var/db/secret-path.db'));
      });
    }
  });

  const devHost = await startTestServer(devApp, 5089);
  try {
    await runAsyncTest('Unexpected error in development returns 500 and includes stack trace', async () => {
      try {
        await axios.get(`${devHost.baseUrl}/test-crash`);
        assert.fail('Expected 500 error');
      } catch (err) {
        assert(err.response, 'Expected HTTP response error');
        assert.strictEqual(err.response.status, 500);
        const data = err.response.data;
        assert.strictEqual(data.statusCode, 500);
        assert.strictEqual(data.code, 'INTERNAL_SERVER_ERROR');
        assert.strictEqual(data.message, 'Internal simulated database failure: /var/db/secret-path.db');
        assert(typeof data.stack === 'string', 'Stack trace must be present in development');
      }
    });
  } finally {
    await devHost.close();
  }

  // TEST 7: Unexpected 500 error in PRODUCTION (no stack trace, generic safe message)
  process.env.NODE_ENV = 'production';
  const prodApp = createApp({
    beforeNotFound: (appInstance) => {
      appInstance.get('/test-crash-prod', (req, res, next) => {
        next(new Error('Sensitive secret key in query: key=sk_live_secret123'));
      });
    }
  });
  const prodHost = await startTestServer(prodApp, 5090);

  try {
    await runAsyncTest('Production responses do NOT expose internal stack traces or sensitive messages', async () => {
      try {
        await axios.get(`${prodHost.baseUrl}/test-crash-prod`);
        assert.fail('Expected 500 error');
      } catch (err) {
        assert(err.response, 'Expected HTTP response error');
        assert.strictEqual(err.response.status, 500);
        const data = err.response.data;
        assert.strictEqual(data.statusCode, 500);
        assert.strictEqual(data.error, 'Internal Server Error');
        assert.strictEqual(data.message, 'An unexpected error occurred. Please try again later.');
        assert.strictEqual(data.stack, undefined, 'Stack trace MUST NOT be exposed in production');
        assert.strictEqual(JSON.stringify(data).includes('sk_live_secret123'), false, 'Secrets must not appear in response body');
      }
    });
  } finally {
    await prodHost.close();
    process.env.NODE_ENV = prevEnv;
  }

  console.log('\n----------------------------------------------------');
  console.log(` ERROR HANDLING SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL CENTRALIZED ERROR HANDLING TESTS PASSED! 🎉\n');
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error in error test runner:', err);
  process.exit(1);
});
