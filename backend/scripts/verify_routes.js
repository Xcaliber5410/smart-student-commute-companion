const assert = require('assert');
const createApiRouter = require('../routes');
const legacyApiRouter = require('../routes/api');
const { getRegisteredEndpoints } = require('../routes');

console.log('====================================================');
console.log(' Running Centralized Route Registration Test Suite');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

// 1. Router factory exports
runTest('Router modules export valid router factory functions', () => {
  assert(typeof createApiRouter === 'function', 'routes/index.js must export createApiRouter function');
  assert(typeof legacyApiRouter === 'function', 'routes/api.js must export backward-compatible function');
  assert.strictEqual(createApiRouter, legacyApiRouter, 'Legacy routes/api.js must delegate to routes/index.js');
});

// 2. Instantiate router and introspect endpoints
const router = createApiRouter();
const endpoints = getRegisteredEndpoints(router);

// 3. Expected endpoints list
const expectedEndpoints = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/auth/register' },
  { method: 'POST', path: '/auth/login' },
  { method: 'GET', path: '/auth/me' },
  { method: 'POST', path: '/plan' },
  { method: 'GET', path: '/live-reports' },
  { method: 'GET', path: '/live-reports/:id' },
  { method: 'PATCH', path: '/live-reports/:id' },
  { method: 'DELETE', path: '/live-reports/:id' },
  { method: 'GET', path: '/alerts' },
  { method: 'POST', path: '/live-reports' },
  { method: 'POST', path: '/reports' },
  { method: 'POST', path: '/live-reports/:id/confirm' },
  { method: 'POST', path: '/live-reports/:id/contradict' },
  { method: 'GET', path: '/transit/search' },
  { method: 'GET', path: '/ride-groups' },
  { method: 'GET', path: '/ride-groups/:id' },
  { method: 'POST', path: '/ride-groups' },
  { method: 'PATCH', path: '/ride-groups/:id' },
  { method: 'DELETE', path: '/ride-groups/:id' },
  { method: 'POST', path: '/ride-groups/:id/join' },
  { method: 'GET', path: '/feedback' },
  { method: 'POST', path: '/feedback' },
  { method: 'PATCH', path: '/feedback/:id' },
  { method: 'DELETE', path: '/feedback/:id' },
  { method: 'POST', path: '/demo/reset' }
];

runTest('All required endpoints are registered on the centralized router', () => {
  for (const expected of expectedEndpoints) {
    const found = endpoints.find(e => e.method === expected.method && e.path === expected.path);
    assert(found, `Expected endpoint not found: ${expected.method} ${expected.path}`);
  }
});

// 4. Ensure no duplicate routes
runTest('No duplicate routes or handlers are registered', () => {
  const keys = endpoints.map(e => `${e.method} ${e.path}`);
  const uniqueKeys = new Set(keys);
  assert.strictEqual(keys.length, uniqueKeys.size, `Duplicate routes detected: found ${keys.length} routes, ${uniqueKeys.size} unique`);
});

// 5. Total endpoint count check
runTest('Registered endpoint count matches exact specification', () => {
  assert.strictEqual(endpoints.length, expectedEndpoints.length, `Expected exactly ${expectedEndpoints.length} endpoints, found ${endpoints.length}`);
});

console.log('\nRegistered Endpoints:');
endpoints.forEach(e => {
  console.log(`  ${e.method.padEnd(6)} ${e.path}`);
});

console.log('\n----------------------------------------------------');
console.log(` ROUTE VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL ROUTE REGISTRATION CHECKS PASSED! 🎉\n');
}
