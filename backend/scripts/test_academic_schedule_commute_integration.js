/**
 * Test Suite: Academic Schedule Context Integration with Commute Recommendations
 *
 * Verifies:
 * 1. Upcoming classes: class starts at 09:00 AM, feasible journey requires 50 mins ->
 *    calculates on-time departure advice using actual journey estimate and IST timezone conventions.
 * 2. Missing schedules: student has no academic context -> retains 100% normal commute functionality.
 * 3. Conflicting times: student requested arrival at 09:30 AM for a 09:00 AM class ->
 *    preserves explicit input without silent replacement, flags schedule conflict in advice and explanation.
 * 4. Missing event locations: class location is null / unspecified ->
 *    does not invent connection to commute destination, does not set class start as commute arrival deadline.
 * 5. Mismatched event locations: commute to Bandra while class is at VJTI / DJ Sanghvi ->
 *    does not connect class to commute destination; flags destination mismatch.
 * 6. Disrupted journeys: 50-min baseline + 15-min disruption -> calculates earlier departure advice
 *    (07:50 AM) to meet 09:00 AM class arrival with safety buffer.
 * 7. Exam day punctuality: exam event at 09:00 AM enforces elevated 20-min buffer.
 * 8. Explanation transparency: explains which schedule context influenced the result.
 * 9. API integration: HTTP POST /api/commute/recommendations returns academic schedule context and departure advice.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const {
  ContextualCommutePersonalization,
  CONTEXT_SOURCES
} = require('../models/ContextualCommutePersonalization');
const {
  ContextualPersonalizationService
} = require('../services/contextualPersonalizationService');
const {
  DepartureAdviceService
} = require('../services/departureAdviceService');
const {
  RecommendationExplanationService
} = require('../services/recommendationExplanationService');
const {
  PersonalizedRouteRecommendationService
} = require('../services/personalizedRouteRecommendationService');
const { CalendarEvent } = require('../models/CalendarEvent');
const { DEPARTURE_ADVICE_TYPES } = require('../models/DepartureAdvice');
const { IST_OFFSET_MS } = require('../utils/timezone');
const { app } = require('../server');
const { signToken } = require('../utils/token');

// Helper to build UTC milliseconds corresponding to Mumbai IST date and time
function createMumbaiTimestamp(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MS;
}

// Helper to create a realistic candidate route for testing
function createTestCandidateRoute(overrides = {}) {
  const baseDuration = overrides.totalDurationMinutes ?? overrides.totalTravelTime ?? 50;
  const disruptionDelay = overrides.disruptionDelayMinutes ?? 0;
  const depTime = overrides.departureTime || '08:00';

  const [depH, depM] = depTime.split(':').map(Number);
  const totalMin = depH * 60 + depM + baseDuration + disruptionDelay;
  const arrH = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const arrM = String(totalMin % 60).padStart(2, '0');
  const arrivalTime = `${arrH}:${arrM}`;

  return {
    journeyId: overrides.journeyId || 'journey-train-metro-1',
    primaryMode: overrides.primaryMode || 'transit',
    modesIncluded: overrides.modesIncluded || ['train', 'metro', 'walk'],
    totalTravelTime: baseDuration + disruptionDelay,
    totalTravelTimeMinutes: baseDuration + disruptionDelay,
    totalDurationMinutes: baseDuration,
    baselineDurationMinutes: baseDuration,
    expectedDisruptionDelayMinutes: disruptionDelay,
    departureTime: depTime,
    estimatedArrivalTime: arrivalTime,
    updatedArrivalTime: arrivalTime,
    isFeasible: true,
    feasibilityTier: 1,
    transfers: overrides.transfers ?? 1,
    walkingTimeMinutes: overrides.walkingMinutes ?? 8,
    estimatedCostRupees: overrides.cost ?? 25,
    provenance: { sourceTier: 'VERIFIED' },
    breakdown: {
      travelTime: { durationMinutes: baseDuration },
      disruption: { delayMinutes: disruptionDelay },
      transfers: { count: overrides.transfers ?? 1 },
      walking: { minutes: overrides.walkingMinutes ?? 8 },
      cost: { fareRupees: overrides.cost ?? 25 },
      personalization: { profile: 'balanced', bonuses: [] }
    }
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Academic Schedule Context Commute Integration Tests');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const testDate = '2026-10-12'; // Monday

  // 1. Upcoming Classes: 09:00 AM class, 50-minute journey -> on-time departure advice
  await test('1. Upcoming class at 09:00 AM with 50-minute feasible journey calculates on-time departure advice', async () => {
    const classStart = createMumbaiTimestamp(testDate, '09:00');
    const classEnd = createMumbaiTimestamp(testDate, '10:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-algo-1',
          user_id: 'student-cs-1',
          title: 'Design & Analysis of Algorithms',
          event_type: 'lecture',
          start_time: classStart,
          end_time: classEnd,
          location: 'D.J. Sanghvi College of Engineering',
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-cs-1',
      date: testDate,
      origin: 'Borivali West'
    });

    assert.strictEqual(context.academicContext.hasAcademicContext, true);
    assert.strictEqual(context.academicContext.isDestinationMatched, true);
    assert.strictEqual(context.resolvedPersonalization.effectiveArrivalDeadline, '09:00');
    assert.strictEqual(context.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.ACADEMIC_EVENT);

    // Primary route: 50 minutes duration, departs at 08:00, arrives at 08:50 (10 min safety buffer ahead of 09:00)
    const primaryRoute = createTestCandidateRoute({
      totalDurationMinutes: 50,
      departureTime: '08:00'
    });

    const departureService = new DepartureAdviceService();
    const advice = departureService.evaluateDepartureAdvice({
      primaryRoute,
      departureTime: '08:00',
      targetArrivalTime: context.resolvedPersonalization.effectiveArrivalDeadline,
      academicContext: context.academicContext
    });

    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.ON_TIME);
    assert.strictEqual(advice.canMeetDeadline, true);
    assert.strictEqual(advice.currentPlan.departureTime, '08:00');
    assert.strictEqual(advice.currentPlan.contextualArrivalTime, '08:50');
    assert.strictEqual(advice.currentPlan.marginMinutes, 10);
    assert.ok(advice.explanation.includes('Design & Analysis of Algorithms'));
    assert.ok(advice.explanation.includes('09:00'));
    assert.strictEqual(advice.academicScheduleInfluence.eventTitle, 'Design & Analysis of Algorithms');
    assert.strictEqual(advice.academicScheduleInfluence.eventStartTime, '09:00');
  });

  // 2. Missing Schedules: retains 100% normal commute functionality
  await test('2. Missing academic schedule retains normal commute functionality without errors', async () => {
    const calendarRepo = {
      findInRange: () => []
    };
    const scheduleRepo = {
      findByUserId: () => []
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo,
      scheduleRepo: scheduleRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-no-classes',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      desiredDepartureTime: '08:15',
      desiredArrivalTime: '09:00'
    });

    assert.strictEqual(context.academicContext.hasAcademicContext, false);
    assert.strictEqual(context.academicContext.hasScheduledClass, false);
    assert.strictEqual(context.resolvedPersonalization.effectiveArrivalDeadline, '09:00');
    assert.strictEqual(context.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.EXPLICIT_INPUT);

    const primaryRoute = createTestCandidateRoute({
      totalDurationMinutes: 35,
      departureTime: '08:15'
    });

    const departureService = new DepartureAdviceService();
    const advice = departureService.evaluateDepartureAdvice({
      primaryRoute,
      departureTime: '08:15',
      targetArrivalTime: '09:00',
      academicContext: context.academicContext
    });

    assert.strictEqual(advice.canMeetDeadline, true);
    assert.strictEqual(advice.currentPlan.departureTime, '08:15');
    assert.strictEqual(advice.currentPlan.contextualArrivalTime, '08:50');
    assert.strictEqual(advice.currentPlan.marginMinutes, 10);
    assert.strictEqual(advice.academicScheduleInfluence.hasAcademicContext, false);
  });

  // 3. Conflicting Times: class starts at 09:00 AM, student requests arrival at 09:30 AM
  await test('3. Explicit arrival deadline (09:30 AM) is preserved and flags schedule conflict against 09:00 AM class', async () => {
    const classStart = createMumbaiTimestamp(testDate, '09:00');
    const classEnd = createMumbaiTimestamp(testDate, '10:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-db-1',
          user_id: 'student-conflict-1',
          title: 'Database Management Systems',
          event_type: 'lecture',
          start_time: classStart,
          end_time: classEnd,
          location: 'D.J. Sanghvi College of Engineering',
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-conflict-1',
      date: testDate,
      origin: 'Malad West',
      desiredArrivalTime: '09:30' // Explicitly requested 30 mins after class starts!
    });

    // Invariant: explicit input must NOT be silently replaced
    assert.strictEqual(context.resolvedPersonalization.effectiveArrivalDeadline, '09:30');
    assert.strictEqual(context.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.EXPLICIT_INPUT);

    // Schedule conflict must be detected
    assert.strictEqual(context.academicContext.scheduleConflicts.length, 1);
    const conflict = context.academicContext.scheduleConflicts[0];
    assert.strictEqual(conflict.type, 'ARRIVAL_AFTER_CLASS_START');
    assert.ok(conflict.detail.includes('09:30 is after'));
    assert.ok(conflict.detail.includes('09:00'));

    // Departure advice surfaces the schedule alert in actionable guidance
    const primaryRoute = createTestCandidateRoute({
      totalDurationMinutes: 45,
      departureTime: '08:30'
    });

    const departureService = new DepartureAdviceService();
    const advice = departureService.evaluateDepartureAdvice({
      primaryRoute,
      departureTime: '08:30',
      targetArrivalTime: '09:30',
      academicContext: context.academicContext
    });

    assert.ok(advice.actionableGuidance.some(g => g.includes('Schedule alert: Requested arrival at 09:30 is after')));
  });

  // 4. Missing Event Locations: class location is null -> does NOT invent connection
  await test('4. Missing class location does not invent connection to commute destination', async () => {
    const classStart = createMumbaiTimestamp(testDate, '09:00');
    const classEnd = createMumbaiTimestamp(testDate, '10:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-noloc-1',
          user_id: 'student-noloc-1',
          title: 'Independent Study Elective',
          event_type: 'study',
          start_time: classStart,
          end_time: classEnd,
          location: null, // Location missing!
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-noloc-1',
      date: testDate,
      origin: 'Goregaon East'
    });

    assert.strictEqual(context.academicContext.isDestinationMatched, false);
    // Arrival deadline must NOT be set from the missing-location event!
    assert.strictEqual(context.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.NONE);
    assert.strictEqual(context.resolvedPersonalization.effectiveArrivalDeadline, null);
    assert.ok(context.academicContext.influencingFactors.some(f => f.includes('location is missing; no commute destination connection inferred')));
  });

  // 5. Mismatched Event Locations: class at VJTI Matunga while commute is to D.J. Sanghvi
  await test('5. Class at different location (VJTI Matunga) does not connect to commute destination (D.J. Sanghvi)', async () => {
    const classStart = createMumbaiTimestamp(testDate, '09:00');
    const classEnd = createMumbaiTimestamp(testDate, '10:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-vjti-1',
          user_id: 'student-mismatch-1',
          title: 'Guest Lecture at VJTI',
          event_type: 'lecture',
          start_time: classStart,
          end_time: classEnd,
          location: 'VJTI Matunga Campus',
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-mismatch-1',
      date: testDate,
      origin: 'Kandivali',
      destination: 'D.J. Sanghvi College of Engineering'
    });

    assert.strictEqual(context.academicContext.isDestinationMatched, false);
    assert.strictEqual(context.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.NONE);
    assert.ok(context.academicContext.influencingFactors.some(f => f.includes('does not match commute destination')));
    assert.ok(context.academicContext.scheduleConflicts.some(c => c.type === 'COMMUTE_DESTINATION_MISMATCH'));
  });

  // 6. Disrupted Journeys: 50-min journey + 15-min delay -> earlier departure recommended for 09:00 AM class
  await test('6. Disrupted journey (50 min base + 15 min delay) recommends departing earlier (07:50 AM) for 09:00 class', async () => {
    const classStart = createMumbaiTimestamp(testDate, '09:00');
    const classEnd = createMumbaiTimestamp(testDate, '10:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-os-1',
          user_id: 'student-disrupted-1',
          title: 'Operating Systems Lab',
          event_type: 'lab',
          start_time: classStart,
          end_time: classEnd,
          location: 'D.J. Sanghvi College of Engineering',
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-disrupted-1',
      date: testDate,
      origin: 'Bhayander'
    });

    assert.strictEqual(context.resolvedPersonalization.effectiveArrivalDeadline, '09:00');

    // Feasible candidate route requiring 50 min baseline + 15 min disruption delay = 65 min total
    const disruptedRoute = createTestCandidateRoute({
      totalDurationMinutes: 50,
      disruptionDelayMinutes: 15,
      departureTime: '08:00' // If student departs at 08:00, arrives at 09:05 (late!)
    });

    const departureService = new DepartureAdviceService();
    const advice = departureService.evaluateDepartureAdvice({
      primaryRoute: disruptedRoute,
      departureTime: '08:00',
      targetArrivalTime: '09:00',
      academicContext: context.academicContext
    });

    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.EARLIER_DEPARTURE_RECOMMENDED);
    assert.strictEqual(advice.canMeetDeadline, true);
    // Safe departure calculation: 09:00 (540m) - 65m total - 10m required buffer = 465m = 07:45 AM
    assert.strictEqual(advice.suggestedDeparture.recommendedDepartureTime, '07:45');
    assert.strictEqual(advice.suggestedDeparture.recommendedArrivalTime, '08:50');
    assert.strictEqual(advice.suggestedDeparture.earlierByMinutes, 15);
    assert.ok(advice.headline.includes('Operating Systems Lab'));
    assert.ok(advice.explanation.includes('+15 min'));
    assert.ok(advice.explanation.includes('Operating Systems Lab'));
  });

  // 7. Exam Day Punctuality: exam event enforces elevated 20-minute buffer
  await test('7. Exam event at 09:00 AM enforces elevated 20-minute safety buffer in departure advice', async () => {
    const examStart = createMumbaiTimestamp(testDate, '09:00');
    const examEnd = createMumbaiTimestamp(testDate, '12:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-midterm-1',
          user_id: 'student-exam-1',
          title: 'Computer Networks Endsem Exam',
          event_type: 'exam',
          start_time: examStart,
          end_time: examEnd,
          location: 'D.J. Sanghvi College of Engineering',
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-exam-1',
      date: testDate,
      origin: 'Dahisar East'
    });

    assert.strictEqual(context.resolvedPersonalization.scheduleConstraints.isExamDay, true);
    assert.strictEqual(context.resolvedPersonalization.scheduleConstraints.recommendedBufferMinutes, 20);

    // 50-minute journey departing at 08:00 -> arrives at 08:50 (margin 10 min, which is < 20 min exam buffer!)
    const candidateRoute = createTestCandidateRoute({
      totalDurationMinutes: 50,
      departureTime: '08:00'
    });

    const departureService = new DepartureAdviceService();
    const advice = departureService.evaluateDepartureAdvice({
      primaryRoute: candidateRoute,
      departureTime: '08:00',
      targetArrivalTime: '09:00',
      academicContext: context.academicContext
    });

    // Since 10 min margin < 20 min exam buffer, earlier departure is recommended
    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.EARLIER_DEPARTURE_RECOMMENDED);
    assert.strictEqual(advice.suggestedDeparture.safetyBufferMinutes, 20);
    // 09:00 (540m) - 50m - 20m buffer = 470m = 07:50 AM
    assert.strictEqual(advice.suggestedDeparture.recommendedDepartureTime, '07:50');
    assert.strictEqual(advice.suggestedDeparture.recommendedArrivalTime, '08:40');
    assert.strictEqual(advice.suggestedDeparture.earlierByMinutes, 10);
  });

  // 8. Explanation Transparency: explains which schedule context influenced result
  await test('8. Explanation layer articulates academic schedule alignment and satisfied preferences', async () => {
    const classStart = createMumbaiTimestamp(testDate, '09:00');
    const classEnd = createMumbaiTimestamp(testDate, '10:00');

    const calendarRepo = {
      findInRange: () => [
        new CalendarEvent({
          id: 'event-ai-1',
          user_id: 'student-ai-1',
          title: 'Artificial Intelligence Lecture',
          event_type: 'lecture',
          start_time: classStart,
          end_time: classEnd,
          location: 'D.J. Sanghvi College of Engineering',
          status: 'scheduled'
        })
      ]
    };

    const personalizationService = new ContextualPersonalizationService({
      calendarEventRepo: calendarRepo
    });

    const context = await personalizationService.collectStudentContext({
      studentId: 'student-ai-1',
      date: testDate,
      origin: 'Vile Parle East'
    });

    const primaryRoute = createTestCandidateRoute({
      totalDurationMinutes: 30,
      departureTime: '08:15',
      estimatedArrivalTime: '08:45'
    });

    const explanationService = new RecommendationExplanationService();
    const explanation = explanationService.explainRecommendation({
      primaryRoute,
      targetArrivalTime: '09:00',
      academicContext: context.academicContext
    });

    assert.ok(explanation.academicScheduleExplanation);
    assert.strictEqual(explanation.academicScheduleExplanation.hasAcademicContext, true);
    assert.strictEqual(explanation.academicScheduleExplanation.eventTitle, 'Artificial Intelligence Lecture');
    assert.strictEqual(explanation.academicScheduleExplanation.eventStartTime, '09:00');
    assert.strictEqual(explanation.academicScheduleExplanation.isDestinationMatched, true);

    const schedPref = explanation.satisfiedPreferences.find(p => p.preference === 'academic_schedule');
    assert.ok(schedPref, 'academic_schedule must be in satisfiedPreferences');
    assert.strictEqual(schedPref.isSatisfied, true);
    assert.ok(schedPref.detail.includes('Artificial Intelligence Lecture'));
    assert.ok(explanation.timingExplanation.narrative.includes('Artificial Intelligence Lecture'));
    assert.ok(explanation.summary.includes('Artificial Intelligence Lecture'));
  });

  // 9. API Integration: HTTP POST /api/commute/recommendations returns academic schedule context and departure advice
  await test('9. HTTP POST /api/commute/recommendations returns academic context and departure advice', async () => {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const testUser = {
      sub: 'student-api-sched-1',
      id: 'student-api-sched-1',
      email: 'sched-student@djsanghvi.edu.in',
      role: 'student',
      college_name: 'D.J. Sanghvi College of Engineering'
    };
    const authToken = signToken(testUser);

    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/api/commute/recommendations',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch (err) {
              resolve({ status: res.statusCode, raw: data });
            }
          });
        });
        req.on('error', reject);
        req.write(JSON.stringify({
          origin: 'Borivali West',
          desiredDepartureTime: '08:00',
          desiredArrivalTime: '09:00'
        }));
        req.end();
      });

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.hasFeasibleRoute !== undefined);
      assert.ok(response.body.departureAdvice, 'departureAdvice must be present in API response');
      assert.ok(response.body.studentContext, 'studentContext must be present in API response');
      assert.strictEqual(response.body.studentContext.studentId, 'student-api-sched-1');
      assert.strictEqual(response.body.studentContext.resolvedPersonalization.effectiveOrigin, 'Borivali West');
      assert.strictEqual(response.body.studentContext.resolvedPersonalization.effectiveArrivalDeadline, '09:00');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
