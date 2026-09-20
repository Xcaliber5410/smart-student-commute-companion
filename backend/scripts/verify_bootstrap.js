const assert = require('assert');
const http = require('http');
const axios = require('axios');
const { createApp } = require('../app');
const { server, startServer, closeServer, app } = require('../server');
const config = require('../config');

console.log('====================================================');
console.log(' Running Backend Bootstrap & Lifecycle Test Suite');
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

async function runAllTests() {
  // TEST 1: Requiring server and app does NOT start listening automatically
  await runAsyncTest('Importing app and server modules does not start HTTP listener', async () => {
    assert(typeof createApp === 'function', 'createApp must be an exported function');
    assert(server instanceof http.Server, 'server must be an http.Server instance');
    assert.strictEqual(server.listening, false, 'Server must NOT be listening upon module import');
  });

  // TEST 2: createApp() produces a functioning Express application
  await runAsyncTest('createApp() initializes Express instance with expected route handlers', async () => {
    const standaloneApp = createApp();
    assert(typeof standaloneApp.handle === 'function', 'App instance must have handle function');
  });

  // TEST 3: startServer() starts the HTTP listener and serves traffic
  const testPort = 5099;
  const testHost = '127.0.0.1';

  await runAsyncTest('startServer() binds listener to configured host/port and serves /health and /api/health', async () => {
    await startServer(testPort, testHost);
    assert.strictEqual(server.listening, true, 'Server must be listening after startServer()');

    // Test /api/health
    const apiRes = await axios.get(`http://${testHost}:${testPort}/api/health`);
    assert.strictEqual(apiRes.status, 200, 'API health endpoint should return 200');
    assert.strictEqual(apiRes.data.status, 'ok', 'API health status should be "ok"');
    assert.strictEqual(apiRes.data.city, 'Mumbai', 'City should be "Mumbai"');

    // Test root /health
    const rootRes = await axios.get(`http://${testHost}:${testPort}/health`);
    assert.strictEqual(rootRes.status, 200, 'Root health endpoint should return 200');
    assert.strictEqual(rootRes.data.status, 'ok', 'Root health status should be "ok"');
    assert.strictEqual(rootRes.data.service, 'Smart Student Commute Companion API');
    assert.strictEqual(typeof rootRes.data.uptime, 'number', 'Uptime should be a number');
    assert.strictEqual(typeof rootRes.data.timestamp, 'string', 'Timestamp should be an ISO string');

    // Ensure no sensitive fields leaked
    const sensitiveKeys = ['GEMINI_API_KEY', 'apiKey', 'env', 'config', 'secrets', 'password', 'token'];
    for (const key of sensitiveKeys) {
      assert.strictEqual(rootRes.data[key], undefined, `Health endpoint must not expose sensitive key: ${key}`);
    }
  });

  // TEST 4: Duplicate startServer() calls do not spawn multiple listeners
  await runAsyncTest('Calling startServer() when already running is safely idempotent', async () => {
    const returnedServer = await startServer(testPort, testHost);
    assert.strictEqual(returnedServer, server, 'Should return the same server instance');
    assert.strictEqual(server.listening, true, 'Server remains listening without throwing errors');
  });

  // TEST 5: closeServer() cleanly shuts down the server
  await runAsyncTest('closeServer() cleanly terminates listener and releases port', async () => {
    await closeServer();
    assert.strictEqual(server.listening, false, 'Server must not be listening after closeServer()');
  });

  // TEST 6: Port re-binding after closeServer()
  await runAsyncTest('Port can be cleanly re-bound after closeServer()', async () => {
    await startServer(testPort, testHost);
    assert.strictEqual(server.listening, true, 'Server successfully re-opened on same port');
    await closeServer();
    assert.strictEqual(server.listening, false, 'Server successfully closed again');
  });

  console.log('\n----------------------------------------------------');
  console.log(` BOOTSTRAP VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL BOOTSTRAP AND LIFECYCLE TESTS PASSED! 🎉\n');
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
