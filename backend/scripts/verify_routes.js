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
  { method: 'GET', path: '/auth/users' },
  { method: 'GET', path: '/auth/users/:id' },
  { method: 'PATCH', path: '/auth/users/:id' },
  { method: 'GET', path: '/student/context' },
  { method: 'PUT', path: '/student/profile' },
  { method: 'GET', path: '/student/commute-preferences' },
  { method: 'PUT', path: '/student/commute-preferences' },
  { method: 'POST', path: '/student/commute-preferences/reset' },
  { method: 'GET', path: '/student/schedules' },
  { method: 'POST', path: '/student/schedules' },
  { method: 'GET', path: '/student/schedules/:id' },
  { method: 'PUT', path: '/student/schedules/:id' },
  { method: 'DELETE', path: '/student/schedules/:id' },
  { method: 'GET', path: '/student/saved-routes' },
  { method: 'POST', path: '/student/saved-routes' },
  { method: 'GET', path: '/student/saved-routes/:id' },
  { method: 'PUT', path: '/student/saved-routes/:id' },
  { method: 'DELETE', path: '/student/saved-routes/:id' },
  { method: 'GET', path: '/student/ride-groups' },
  { method: 'GET', path: '/student/dashboard' },
  { method: 'GET', path: '/student/insights' },
  { method: 'GET', path: '/student/overview' },
  { method: 'GET', path: '/student/search' },
  { method: 'GET', path: '/notifications' },
  { method: 'GET', path: '/notifications/unread' },
  { method: 'GET', path: '/notifications/count' },
  { method: 'GET', path: '/notifications/:id' },
  { method: 'PATCH', path: '/notifications/:id/read' },
  { method: 'POST', path: '/notifications/read-all' },
  { method: 'POST', path: '/notifications/read-multiple' },
  { method: 'DELETE', path: '/notifications/:id' },
  { method: 'GET', path: '/reminders' },
  { method: 'POST', path: '/reminders' },
  { method: 'GET', path: '/reminders/:id' },
  { method: 'PATCH', path: '/reminders/:id' },
  { method: 'POST', path: '/reminders/:id/trigger' },
  { method: 'POST', path: '/reminders/:id/complete' },
  { method: 'POST', path: '/reminders/:id/cancel' },
  { method: 'DELETE', path: '/reminders/:id' },
  // Day 8 Academic Endpoints
  { method: 'GET', path: '/academic/courses' },
  { method: 'POST', path: '/academic/courses' },
  { method: 'GET', path: '/academic/courses/:id' },
  { method: 'PATCH', path: '/academic/courses/:id' },
  { method: 'PUT', path: '/academic/courses/:id' },
  { method: 'POST', path: '/academic/courses/:id/archive' },
  { method: 'DELETE', path: '/academic/courses/:id' },
  { method: 'GET', path: '/academic/courses/:id/resources' },
  { method: 'POST', path: '/academic/courses/:id/resources' },
  { method: 'DELETE', path: '/academic/courses/:id/resources/:resourceId' },
  { method: 'GET', path: '/academic/assignments' },
  { method: 'POST', path: '/academic/assignments' },
  { method: 'GET', path: '/academic/assignments/:id' },
  { method: 'PATCH', path: '/academic/assignments/:id' },
  { method: 'PUT', path: '/academic/assignments/:id' },
  { method: 'PATCH', path: '/academic/assignments/:id/status' },
  { method: 'DELETE', path: '/academic/assignments/:id' },
  { method: 'GET', path: '/academic/assignments/:id/resources' },
  { method: 'POST', path: '/academic/assignments/:id/resources' },
  { method: 'DELETE', path: '/academic/assignments/:id/resources/:resourceId' },
  { method: 'GET', path: '/academic/progress' },
  { method: 'GET', path: '/academic/summary' },
  { method: 'GET', path: '/academic/productivity' },
  { method: 'GET', path: '/academic/statistics' },
  { method: 'GET', path: '/academic/insights' },
  { method: 'GET', path: '/academic/overview' },
  { method: 'GET', path: '/academic/search' },
  // Student Goal Endpoints
  { method: 'GET', path: '/academic/goals' },
  { method: 'POST', path: '/academic/goals' },
  { method: 'GET', path: '/academic/goals/:id' },
  { method: 'PATCH', path: '/academic/goals/:id' },
  { method: 'PUT', path: '/academic/goals/:id' },
  { method: 'PATCH', path: '/academic/goals/:id/progress' },
  { method: 'POST', path: '/academic/goals/:id/complete' },
  { method: 'POST', path: '/academic/goals/:id/cancel' },
  { method: 'DELETE', path: '/academic/goals/:id' },
  { method: 'GET', path: '/academic/goals/:id/work' },
  { method: 'POST', path: '/academic/goals/:id/sync-progress' },
  { method: 'POST', path: '/academic/goals/:id/assignments' },
  { method: 'DELETE', path: '/academic/goals/:id/assignments/:assignmentId' },
  { method: 'POST', path: '/academic/goals/:id/study-sessions' },
  { method: 'DELETE', path: '/academic/goals/:id/study-sessions/:sessionId' },
  { method: 'GET', path: '/academic/goals/:id/resources' },
  { method: 'POST', path: '/academic/goals/:id/resources' },
  { method: 'DELETE', path: '/academic/goals/:id/resources/:resourceId' },
  // Day 9 Calendar & Planning Endpoints
  { method: 'GET', path: '/calendar/range' },
  { method: 'GET', path: '/calendar/today' },
  { method: 'GET', path: '/calendar/upcoming' },
  { method: 'GET', path: '/calendar/conflicts' },
  { method: 'GET', path: '/calendar/workload' },
  { method: 'GET', path: '/calendar/events' },
  { method: 'POST', path: '/calendar/events' },
  { method: 'GET', path: '/calendar/events/:id' },
  { method: 'PATCH', path: '/calendar/events/:id' },
  { method: 'PUT', path: '/calendar/events/:id' },
  { method: 'DELETE', path: '/calendar/events/:id' },
  { method: 'GET', path: '/calendar/study-sessions' },
  { method: 'POST', path: '/calendar/study-sessions' },
  { method: 'GET', path: '/calendar/study-sessions/:id' },
  { method: 'PATCH', path: '/calendar/study-sessions/:id' },
  { method: 'PUT', path: '/calendar/study-sessions/:id' },
  { method: 'PATCH', path: '/calendar/study-sessions/:id/status' },
  { method: 'DELETE', path: '/calendar/study-sessions/:id' },
  { method: 'GET', path: '/calendar/study-sessions/:id/resources' },
  { method: 'POST', path: '/calendar/study-sessions/:id/resources' },
  { method: 'DELETE', path: '/calendar/study-sessions/:id/resources/:resourceId' },
  // Day 12 Study Resources Endpoints
  { method: 'GET', path: '/student/resources' },
  { method: 'POST', path: '/student/resources' },
  { method: 'GET', path: '/student/resources/context' },
  { method: 'GET', path: '/student/resources/:id' },
  { method: 'PATCH', path: '/student/resources/:id' },
  { method: 'PUT', path: '/student/resources/:id' },
  { method: 'DELETE', path: '/student/resources/:id' },
  { method: 'POST', path: '/student/resources/:id/archive' },
  { method: 'POST', path: '/student/resources/:id/favorite' },
  { method: 'GET', path: '/academic/resources' },
  { method: 'POST', path: '/academic/resources' },
  { method: 'GET', path: '/academic/resources/context' },
  { method: 'GET', path: '/academic/resources/:id' },
  { method: 'PATCH', path: '/academic/resources/:id' },
  { method: 'PUT', path: '/academic/resources/:id' },
  { method: 'DELETE', path: '/academic/resources/:id' },
  { method: 'POST', path: '/academic/resources/:id/archive' },
  { method: 'POST', path: '/academic/resources/:id/favorite' },
  // Day 13 Student Study Plans & Work Scheduling Endpoints
  { method: 'POST', path: '/student/study-plans/generate' },
  { method: 'POST', path: '/student/study-plans/recalculate' },
  { method: 'GET', path: '/student/study-plans/current' },
  { method: 'GET', path: '/student/study-plans/insights' },
  { method: 'POST', path: '/student/study-plans/reminders/process' },
  { method: 'GET', path: '/student/study-plans/items' },
  { method: 'GET', path: '/student/study-plans/items/:id' },
  { method: 'PATCH', path: '/student/study-plans/items/:id/status' },
  { method: 'PATCH', path: '/student/study-plans/items/:id' },
  { method: 'DELETE', path: '/student/study-plans/items/:id' },
  { method: 'GET', path: '/student/study-plans' },
  { method: 'POST', path: '/student/study-plans' },
  { method: 'GET', path: '/student/study-plans/:id' },
  { method: 'PATCH', path: '/student/study-plans/:id' },
  { method: 'DELETE', path: '/student/study-plans/:id' },
  { method: 'POST', path: '/student/study-plans/:id/recalculate' },
  { method: 'POST', path: '/plan' },
  { method: 'POST', path: '/commute/candidates' },
  { method: 'POST', path: '/student/commute/candidates' },
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
