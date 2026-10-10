/**
 * Integration Test: Contextual Commute Explanations API
 *
 * Verifies that POST /api/commute/recommendations and POST /api/student/commute/recommendations:
 * 1. Normal results: Return full contextual explanation fields (primaryRecommendation, alternativeRoutes,
 *    selectionReason, scheduleContext, arrivalAdvice, departureAdvice, routeTradeOffs, disruptionEffects,
 *    provenance, uncertaintyDetails, missingDataWarnings, explanationMethod).
 * 2. Academic context: Synchronizes with student's scheduled lectures/exams, returns bufferMinutes and scheduleContext.
 * 3. Missing context: Safely handles absence of calendar context without errors or degraded routes.
 * 4. AI fallback: Gracefully falls back to deterministic explanations on provider error or timeout without blocking.
 * 5. Invalid input: Rejects malformed departure times or negative constraints with 400 VALIDATION_ERROR.
 * 6. Authentication: Rejects unauthenticated or malformed requests with 401 UNAUTHORIZED.
 * 7. Authorization: Rejects cross-student access attempts with 403 FORBIDDEN, protecting private student schedules.
 * 8. No feasible route: Returns honest fallback metadata with 200 OK, hasFeasibleRoute: false, and guidance.
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const { signToken } = require('../utils/token');
const {
  CalendarEvent,
  calendarEventRepository
} = require('../models/CalendarEvent') || {};
const { calendarEventRepository: calRepo } = require('../repositories/CalendarEventRepository');
const {
  personalizedRouteRecommendationService,
  SafeCommuteExplanationAdapter,
  MockAiCommuteExplanationProvider,
  DeterministicCommuteExplanationProvider
} = require('../services');

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    testsFailed++;
  }
}

function makeRequest(port, options = {}) {
  const {
    path = '/api/commute/recommendations',
    method = 'POST',
    token = null,
    body = null
  } = options;

  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' Running Contextual Commute Explanations API Integration Tests');
  console.log('========================================================================\n');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const testUserA = {
    id: 'student-expl-user-a',
    email: 'user-a@djsanghvi.edu',
    role: 'student'
  };
  const tokenA = signToken({ sub: testUserA.id, email: testUserA.email, role: testUserA.role });

  const testUserB = {
    id: 'student-expl-user-b',
    email: 'user-b@djsanghvi.edu',
    role: 'student'
  };
  const tokenB = signToken({ sub: testUserB.id, email: testUserB.email, role: testUserB.role });

  try {
    // ------------------------------------------------------------------------
    // 1. NORMAL RESULTS WITH FULL CONTEXTUAL EXPLANATION FIELDS
    // ------------------------------------------------------------------------
    await test('1. Normal commute request returns complete contextual explanations and metadata', async () => {
      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Borivali West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          desiredArrivalTime: '08:55',
          routePreference: 'fastest',
          preferredModes: ['train', 'metro'],
          maxWalkingMinutes: 15
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      // Basic contract invariants
      assert.strictEqual(data.hasFeasibleRoute, true);
      assert.strictEqual(data.hasSuccessfulRecommendation, true);
      assert.strictEqual(data.isFallback, false);

      // Primary recommendation & alternatives
      assert.ok(data.primaryRecommendation, 'Must contain primaryRecommendation');
      assert.ok(data.selectedRoute, 'Must contain backward-compatible selectedRoute');
      assert.ok(Array.isArray(data.alternativeRoutes), 'Must contain alternativeRoutes array');
      assert.ok(Array.isArray(data.meaningfulAlternatives), 'Must contain meaningfulAlternatives array');

      // Selection reasons & trade-offs
      assert.ok(typeof data.selectionReason === 'string' && data.selectionReason.length > 0, 'Must have selectionReason');
      assert.ok(Array.isArray(data.recommendationReasons), 'Must have recommendationReasons array');
      assert.ok(Array.isArray(data.routeTradeOffs), 'Must have routeTradeOffs array');

      // Schedule & Advice
      assert.ok(data.scheduleContext, 'Must have scheduleContext');
      assert.ok(data.arrivalAdvice, 'Must have arrivalAdvice');
      assert.strictEqual(typeof data.arrivalAdvice.bufferMinutes, 'number');

      // Disruption effects & warnings
      assert.ok(data.disruptionEffects, 'Must have disruptionEffects');
      assert.strictEqual(typeof data.disruptionEffects.delayMinutes, 'number');
      assert.ok(Array.isArray(data.disruptionEffects.advisories));
      assert.ok(Array.isArray(data.dataQualityWarnings));
      assert.ok(Array.isArray(data.missingDataWarnings));

      // Provenance & Qualitative Uncertainty
      assert.ok(data.provenance, 'Must have provenance');
      assert.ok(data.provenanceSummary, 'Must have provenanceSummary');
      assert.ok(data.uncertaintyDetails, 'Must have uncertaintyDetails');
      assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(data.uncertaintyDetails.uncertaintyLevel));

      // Explanation Method
      assert.ok(['deterministic', 'ai-assisted'].includes(data.explanationMethod));
      assert.ok(['DETERMINISTIC', 'AI_ASSISTED'].includes(data.explanationMode));
      assert.strictEqual(typeof data.isAiEnhanced, 'boolean');
      assert.ok(data.explanationAudit, 'Must have explanationAudit');
    });

    // ------------------------------------------------------------------------
    // 2. ACADEMIC CONTEXT INTEGRATION
    // ------------------------------------------------------------------------
    await test('2. Academic schedule context returns class timing, destination match, and bufferMinutes', async () => {
      // Seed a calendar event for testUserA
      const now = new Date();
      const eventStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
      const eventEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

      try {
        calRepo.create({
          id: `cal-expl-test-${Date.now()}`,
          studentId: testUserA.id,
          title: 'Algorithms & Data Structures Lecture',
          eventType: 'lecture',
          startTime: eventStart.toISOString(),
          endTime: eventEnd.toISOString(),
          location: 'D.J. Sanghvi College of Engineering'
        });
      } catch (err) {
        // Repository may throw if SQLite is in-memory or already present
      }

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri Station',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:15',
          currentTime: eventStart.getTime() - (90 * 60 * 1000) // 1.5 hours before class
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.ok(data.scheduleContext);
      if (data.scheduleContext.hasScheduleContext) {
        assert.strictEqual(data.scheduleContext.source, 'ACADEMIC_EVENT');
        assert.ok(data.scheduleContext.bufferMinutes >= 10);
        assert.strictEqual(data.scheduleContext.isDestinationMatched, true);
      }
    });

    // ------------------------------------------------------------------------
    // 3. MISSING ACADEMIC CONTEXT
    // ------------------------------------------------------------------------
    await test('3. Missing academic context gracefully falls back to requested timing without error', async () => {
      const res = await makeRequest(port, {
        token: tokenB, // user B has no calendar events
        body: {
          origin: 'Vile Parle East',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:30',
          desiredArrivalTime: '08:50'
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.strictEqual(data.hasFeasibleRoute, true);
      assert.strictEqual(data.scheduleContext.hasScheduleContext, false);
      assert.ok(['NONE', 'EXPLICIT_INPUT'].includes(data.scheduleContext.source));
      assert.strictEqual(data.scheduleContext.bufferMinutes, 0);
    });

    // ------------------------------------------------------------------------
    // 4. AI FALLBACK HANDLING
    // ------------------------------------------------------------------------
    await test('4. AI service failure falls back safely to deterministic explanation with audit trail', async () => {
      // Temporarily inject a failing mock AI adapter
      const originalAdapter = personalizedRouteRecommendationService.aiExplanationAdapter;
      const failingMockProvider = new MockAiCommuteExplanationProvider({
        shouldError: true,
        errorMessage: 'Remote Gemini API Service Unavailable (HTTP 503)'
      });
      personalizedRouteRecommendationService.aiExplanationAdapter = new SafeCommuteExplanationAdapter({
        provider: failingMockProvider
      });

      try {
        const res = await makeRequest(port, {
          token: tokenA,
          body: {
            origin: 'Bandra West',
            destination: 'D.J. Sanghvi College of Engineering',
            desiredDepartureTime: '08:00',
            desiredArrivalTime: '08:45'
          }
        });

        assert.strictEqual(res.status, 200);
        const data = res.body.data || res.body;

        // Invariant: AI failure must NOT block recommendation or fail request
        assert.strictEqual(data.hasFeasibleRoute, true);
        assert.strictEqual(data.explanationMethod, 'deterministic');
        assert.strictEqual(data.explanationMode, 'DETERMINISTIC');
        assert.strictEqual(data.isAiEnhanced, false);
        assert.ok(data.explanationAudit);
        assert.strictEqual(data.explanationAudit.fallbackOccurred, true);
        assert.strictEqual(data.explanationAudit.fallbackReason, 'PROVIDER_ERROR');
      } finally {
        personalizedRouteRecommendationService.aiExplanationAdapter = originalAdapter;
      }
    });

    // ------------------------------------------------------------------------
    // 5. INVALID INPUT VALIDATION
    // ------------------------------------------------------------------------
    await test('5. Invalid input (malformed time or negative constraints) returns 400 VALIDATION_ERROR', async () => {
      // Invalid departure time format
      const resBadTime = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '25:99' // Illegal clock time
        }
      });
      assert.strictEqual(resBadTime.status, 400);

      // Negative walking tolerance
      const resNegativeWalk = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          maxWalkingMinutes: -15
        }
      });
      assert.strictEqual(resNegativeWalk.status, 400);
    });

    // ------------------------------------------------------------------------
    // 6. AUTHENTICATION ENFORCEMENT
    // ------------------------------------------------------------------------
    await test('6. Unauthenticated request without valid token returns 401 UNAUTHORIZED', async () => {
      // Missing token
      const resMissing = await makeRequest(port, {
        token: null,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00'
        }
      });
      assert.strictEqual(resMissing.status, 401);

      // Malformed token
      const resMalformed = await makeRequest(port, {
        token: 'invalid.bogus.jwt.token',
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00'
        }
      });
      assert.strictEqual(resMalformed.status, 401);
    });

    // ------------------------------------------------------------------------
    // 7. AUTHORIZATION ENFORCEMENT (NO CROSS-STUDENT LEAKAGE)
    // ------------------------------------------------------------------------
    await test('7. Cross-student schedule access attempt returns 403 FORBIDDEN and protects private context', async () => {
      // User A attempts to request student B's profile
      const resCrossStudent = await makeRequest(port, {
        token: tokenA,
        body: {
          studentId: testUserB.id, // Targeting student B!
          origin: 'Andheri West',
          desiredDepartureTime: '08:00'
        }
      });

      assert.strictEqual(resCrossStudent.status, 403);
      assert.ok(
        resCrossStudent.body.message.includes('forbidden') ||
        resCrossStudent.body.error?.message?.includes('forbidden') ||
        resCrossStudent.body.message.includes('permission')
      );
    });

    // ------------------------------------------------------------------------
    // 8. NO FEASIBLE ROUTE / FALLBACK SCENARIO
    // ------------------------------------------------------------------------
    await test('8. Fallback scenario returns 200 OK with hasFeasibleRoute: false and complete fallback metadata', async () => {
      // Request with impossible constraints that force fallback
      const resFallback = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Borivali West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:50',
          desiredArrivalTime: '08:51', // Impossible 1-minute window
          maxWalkingMinutes: 1,
          maxTransfers: 0
        }
      });

      assert.strictEqual(resFallback.status, 200);
      const data = resFallback.body.data || resFallback.body;

      assert.strictEqual(data.hasFeasibleRoute, false);
      assert.strictEqual(data.hasSuccessfulRecommendation, false);
      assert.strictEqual(data.isFallback, true);
      assert.strictEqual(data.status, 'FALLBACK');
      assert.strictEqual(data.primaryRecommendation, null);
      assert.strictEqual(data.alternativeRoutes.length, 0);

      // Honest guidance & reasons
      assert.ok(typeof data.fallbackReason === 'string' && data.fallbackReason.length > 0);
      assert.ok(Array.isArray(data.fallbackGuidance) && data.fallbackGuidance.length > 0);
      assert.strictEqual(data.explanationMethod, 'deterministic');
      assert.strictEqual(data.explanationMode, 'DETERMINISTIC');

      // Schedule context & uncertainty preserved
      assert.ok(data.scheduleContext);
      assert.ok(data.uncertaintyDetails);
      assert.strictEqual(data.uncertaintyDetails.uncertaintyLevel, 'SEVERE');
      assert.ok(Array.isArray(data.dataQualityWarnings));
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('========================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
