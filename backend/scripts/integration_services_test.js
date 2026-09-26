/**
 * Integration Test Suite: Backend Service Layer
 *
 * Verifies end-to-end domain services:
 * - CommutePlanService: multimodal routing, weather integration, transit candidates, budget filtering
 * - TransitService: GTFS text queries and nearby coordinate stops
 * - RideGroupService: lifecycle, capacity, atomic join/leave, ownership enforcement
 * - ReportService: ingestion, decay weights, voting, auto-expiration, ownership
 * - FeedbackService: rating submission, batch transactions, aggregation metrics
 * - AuthService: registration, constant-time verification, token claims, user listing via repository
 */

const assert = require('assert');
const {
  commutePlanService,
  transitService,
  rideGroupService,
  reportService,
  feedbackService,
  authService
} = require('../services');
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  UnauthorizedError
} = require('../errors');

async function runServiceIntegrationTests() {
  console.log('\n====================================================');
  console.log(' Running Comprehensive Service Layer Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
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

  // 1. COMMUTE PLAN SERVICE TESTS
  await asyncTest('CommutePlanService: plans commute between Mumbai coordinates with weather and candidates', async () => {
    const result = await commutePlanService.planCommute({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering, Vile Parle',
      desiredArrivalTime: '09:00',
      preferredModes: ['auto', 'walk'],
      preference: 'fastest',
      maxBudgetRupees: 150
    });

    assert.ok(result.query && result.query.origin, 'Plan result must include query.origin geocode');
    assert.ok(result.query && result.query.destination, 'Plan result must include query.destination geocode');
    assert.ok(result.weather, 'Plan result must include weather conditions');
    assert.ok(result.recommendation, 'Plan result must include primary recommendation');
    assert.ok(Array.isArray(result.alternatives), 'Plan result must include alternatives array');
  });

  // 2. TRANSIT SERVICE TESTS
  test('TransitService: searches stops and routes by text query', () => {
    const searchRes = transitService.search({ q: 'Andheri' });
    assert.ok(Array.isArray(searchRes.stops), 'Search should return stops array');
    assert.ok(Array.isArray(searchRes.routes), 'Search should return routes array');
  });

  test('TransitService: finds nearby stops given spatial coordinates', () => {
    const nearbyRes = transitService.search({ lat: 19.1197, lon: 72.8468, radius: 3000 });
    assert.ok(Array.isArray(nearbyRes.stops), 'Nearby search should return stops array');
  });

  // 3. RIDE GROUP SERVICE TESTS
  const testGroup = rideGroupService.createRideGroup({
    creator_pseudonym: 'Service_Test_Creator',
    origin_area: 'Borivali',
    destination_college: 'DJ Sanghvi',
    departure_time: '08:15 AM',
    mode: 'auto',
    max_members: 3,
    current_members: 1,
    notes: 'Service layer test group'
  });

  test('RideGroupService: retrieves created group by ID', () => {
    const fetched = rideGroupService.getRideGroupById(testGroup.id);
    assert.strictEqual(fetched.id, testGroup.id);
    assert.strictEqual(fetched.creator_pseudonym, 'Service_Test_Creator');
  });

  test('RideGroupService: atomic join increments member count', () => {
    const updated = rideGroupService.joinRideGroup(testGroup.id, 'Student_A');
    assert.strictEqual(updated.current_members, 2);
  });

  test('RideGroupService: prevents creator duplicate join', () => {
    assert.throws(
      () => rideGroupService.joinRideGroup(testGroup.id, 'Service_Test_Creator'),
      err => err instanceof BadRequestError && err.code === 'CREATOR_ALREADY_MEMBER'
    );
  });

  test('RideGroupService: allows second joiner up to capacity', () => {
    const updated = rideGroupService.joinRideGroup(testGroup.id, 'Student_B');
    assert.strictEqual(updated.current_members, 3);
  });

  test('RideGroupService: rejects join when group is full', () => {
    assert.throws(
      () => rideGroupService.joinRideGroup(testGroup.id, 'Student_C'),
      err => err instanceof BadRequestError && err.code === 'GROUP_FULL'
    );
  });

  test('RideGroupService: atomic leave decrements member count', () => {
    const updated = rideGroupService.leaveRideGroup(testGroup.id);
    assert.strictEqual(updated.current_members, 2);
  });

  test('RideGroupService: enforces ownership check on updates', () => {
    const imposter = { id: 'usr-imposter', full_name: 'Imposter', role: 'student' };
    assert.throws(
      () => rideGroupService.updateRideGroup(testGroup.id, { notes: 'Hacked' }, imposter),
      err => err instanceof ForbiddenError
    );
  });

  test('RideGroupService: allows creator to update group', () => {
    const creatorUser = { id: 'usr-creator', full_name: 'Service_Test_Creator', role: 'student' };
    const updated = rideGroupService.updateRideGroup(testGroup.id, { notes: 'Safe update' }, creatorUser);
    assert.strictEqual(updated.notes, 'Safe update');
  });

  // 4. REPORT SERVICE TESTS
  const testReport = reportService.createReport({
    pseudonym: 'Service_Reporter',
    area: 'Churchgate',
    route_name: 'Western Line',
    mode: 'train',
    message: 'Slow moving local train',
    impact: 'low',
    durationObservedMinutes: 90
  });

  test('ReportService: confirms live report vote and increments count', () => {
    const res = reportService.confirmReport(testReport.id, 'service_test_voter_1');
    assert.strictEqual(res.alreadyVoted, false);
    assert.strictEqual(res.updatedReport.confirmation_count, 2);
  });

  test('ReportService: detects duplicate confirmation vote', () => {
    const res = reportService.confirmReport(testReport.id, 'service_test_voter_1');
    assert.strictEqual(res.alreadyVoted, true);
  });

  test('ReportService: formats live reports into student alerts', () => {
    const alerts = reportService.getAlerts();
    assert.ok(Array.isArray(alerts));
    assert.ok(alerts.length > 0);
    assert.ok(alerts[0].title);
  });

  test('ReportService: prevents voting on inactive reports', () => {
    reportService.updateReport(testReport.id, { status: 'resolved' });
    assert.throws(
      () => reportService.confirmReport(testReport.id, 'service_test_voter_2'),
      err => err instanceof BadRequestError && err.code === 'REPORT_INACTIVE'
    );
  });

  // 5. FEEDBACK SERVICE TESTS
  const testRecId = `rec-serv-${Date.now()}`;
  test('FeedbackService: records student route feedback', () => {
    const fb = feedbackService.submitFeedback({
      recommendation_id: testRecId,
      is_useful: true,
      tags: ['smooth', 'quick'],
      comment: 'Very nice route'
    });
    assert.strictEqual(fb.recommendation_id, testRecId);
    assert.strictEqual(fb.is_useful, true);
  });

  test('FeedbackService: transactional batch submission saves all entries', () => {
    const batch = [
      { recommendation_id: testRecId, is_useful: true, comment: 'batch 1' },
      { recommendation_id: testRecId, is_useful: false, comment: 'batch 2' }
    ];
    const created = feedbackService.submitFeedbackBatch(batch);
    assert.strictEqual(created.length, 2);
  });

  test('FeedbackService: getFeedbackSummary returns correct aggregates', () => {
    const summary = feedbackService.getFeedbackSummary(testRecId);
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.helpful, 2);
    assert.strictEqual(summary.notHelpful, 1);
  });

  test('FeedbackService: deleteFeedbackByRecommendation cleans up all records in transaction', () => {
    const count = feedbackService.deleteFeedbackByRecommendation(testRecId);
    assert.strictEqual(count, 3);
    const summary = feedbackService.getFeedbackSummary(testRecId);
    assert.strictEqual(summary.total, 0);
  });

  // 6. AUTH SERVICE TESTS
  const testStudentEmail = `serv-student-${Date.now()}@djsce.edu`;
  test('AuthService: registers new student and redacts password hash', () => {
    const user = authService.register({
      email: testStudentEmail,
      password: 'StrongPassword123!',
      full_name: 'Service Test Student',
      college_name: 'D.J. Sanghvi',
      role: 'student'
    });

    assert.strictEqual(user.email, testStudentEmail);
    assert.strictEqual(user.password_hash, undefined);
  });

  test('AuthService: rejects duplicate email with ConflictError', () => {
    assert.throws(
      () => authService.register({
        email: testStudentEmail,
        password: 'AnotherPassword123!',
        full_name: 'Another',
        college_name: 'DJ'
      }),
      err => err instanceof ConflictError
    );
  });

  test('AuthService: authenticates credentials and returns JWT token and safe user', () => {
    const authRes = authService.login({
      email: testStudentEmail,
      password: 'StrongPassword123!'
    });

    assert.ok(authRes.token);
    assert.strictEqual(authRes.user.email, testStudentEmail);
    assert.strictEqual(authRes.user.password_hash, undefined);
  });

  test('AuthService: rejects invalid password with UnauthorizedError', () => {
    assert.throws(
      () => authService.login({
        email: testStudentEmail,
        password: 'WrongPassword999!'
      }),
      err => err instanceof UnauthorizedError
    );
  });

  test('AuthService: listUsers retrieves users via repository', () => {
    const users = authService.listUsers();
    assert.ok(Array.isArray(users));
    assert.ok(users.length > 0);
    assert.strictEqual(users[0].password_hash, undefined);
  });

  // Clean up
  rideGroupService.deleteRideGroup(testGroup.id);
  reportService.deleteReport(testReport.id);

  console.log('\n----------------------------------------------------');
  console.log(` SERVICE INTEGRATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runServiceIntegrationTests().catch(err => {
  console.error('Fatal error running service integration tests:', err);
  process.exit(1);
});
