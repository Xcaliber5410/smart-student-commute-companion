/**
 * Test Suite: Contextual Personalization Layer
 *
 * Verifies:
 * 1. Anonymous request without student ID produces valid normalized context with sensible defaults.
 * 2. Missing academic data (student with no calendar events) does not fabricate classes.
 * 3. Student with scheduled lecture derives class start time, location, and punctuality buffer.
 * 4. Explicit arrival deadline overrides derived class start time (EXPLICIT_INPUT).
 * 5. Student with exam event flags isExamDay: true and elevates recommended buffer.
 * 6. Recurring commute schedule provides fallback arrival deadline (RECURRING_SCHEDULE).
 * 7. Saved preferences provide fallback origin, college destination, and preferred modes (SAVED_PREFERENCE).
 * 8. Heavy workload day triggers workload caution and flags load level.
 * 9. Access control strictly forbids a student accessing another student's private context (ForbiddenError).
 * 10. Strict privacy check rejects forbidden granular fields (GPS, door numbers, flat numbers).
 * 11. Safe failure handling when repositories or workload service throw errors.
 * 12. Serialization to JSON produces clean structure with transparent source attribution.
 * 13. Integration with HTTP API endpoint returns normalized studentContext in response.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const {
  ContextualCommutePersonalization,
  CONTEXT_SOURCES
} = require('../models/ContextualCommutePersonalization');
const {
  ContextualPersonalizationService,
  contextualPersonalizationService
} = require('../services/contextualPersonalizationService');
const { CalendarEvent } = require('../models/CalendarEvent');
const { StudentSchedule } = require('../models/StudentSchedule');
const { ForbiddenError, ValidationError } = require('../errors');
const { IST_OFFSET_MS } = require('../utils/timezone');
const { app } = require('../server');
const { signToken } = require('../utils/token');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Contextual Commute Personalization Tests');
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

  // 1. Anonymous Request
  await test('1. Anonymous request without student ID produces valid default normalized context', async () => {
    const service = new ContextualPersonalizationService();
    const result = await service.collectStudentContext({
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      desiredDepartureTime: '08:15',
      desiredArrivalTime: '08:50',
      routePreference: 'faster'
    });

    assert.ok(result instanceof ContextualCommutePersonalization);
    assert.strictEqual(result.studentId, null);
    assert.strictEqual(result.explicitInput.origin, 'Andheri West');
    assert.strictEqual(result.explicitInput.desiredArrivalTime, '08:50');
    assert.strictEqual(result.savedPreferences.hasSavedPreferences, false);
    assert.strictEqual(result.academicContext.hasAcademicContext, false);
    assert.strictEqual(result.academicContext.hasScheduledClass, false);
    assert.strictEqual(result.academicContext.nextClass, null);
    assert.strictEqual(result.workloadContext.hasWorkloadContext, false);
    assert.strictEqual(result.resolvedPersonalization.effectiveOrigin, 'Andheri West');
    assert.strictEqual(result.resolvedPersonalization.originSource, CONTEXT_SOURCES.EXPLICIT_INPUT);
    assert.strictEqual(result.resolvedPersonalization.effectiveArrivalDeadline, '08:50');
    assert.strictEqual(result.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.EXPLICIT_INPUT);
    assert.strictEqual(result.resolvedPersonalization.effectiveRoutePreference, 'faster');
    assert.strictEqual(result.resolvedPersonalization.routePreferenceSource, CONTEXT_SOURCES.EXPLICIT_INPUT);
  });

  // 2. Missing Academic Data: Never fabricate classes
  await test('2. Student with no calendar events does not fabricate classes or events', async () => {
    const mockCalendarRepo = {
      findInRange: () => []
    };
    const mockScheduleRepo = {
      findByUserId: () => []
    };
    const mockPreferenceRepo = {
      findByUserId: () => null
    };
    const mockProfileRepo = {
      findByUserId: () => null
    };

    const service = new ContextualPersonalizationService({
      calendarEventRepo: mockCalendarRepo,
      scheduleRepo: mockScheduleRepo,
      preferenceRepo: mockPreferenceRepo,
      profileRepo: mockProfileRepo
    });

    const result = await service.collectStudentContext({
      studentId: 'student-no-classes',
      origin: 'Vile Parle Station'
    });

    assert.strictEqual(result.academicContext.hasAcademicContext, false);
    assert.strictEqual(result.academicContext.hasScheduledClass, false);
    assert.strictEqual(result.academicContext.nextClass, null);
    assert.strictEqual(result.academicContext.scheduledEventsCount, 0);
    assert.strictEqual(result.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.NONE);
    assert.strictEqual(result.resolvedPersonalization.effectiveArrivalDeadline, null);
  });

  // 3. Student with Scheduled Lecture derives class start time & punctuality buffer
  await test('3. Student with scheduled lecture derives class start time, location, and punctuality buffer', async () => {
    // 09:30 AM IST today
    const now = Date.now();
    const d = new Date(now + IST_OFFSET_MS);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const date = d.getUTCDate();

    const lectureStart = Date.UTC(y, m, date, 9, 30, 0, 0) - IST_OFFSET_MS;
    const lectureEnd = Date.UTC(y, m, date, 10, 30, 0, 0) - IST_OFFSET_MS;

    const mockLecture = new CalendarEvent({
      id: 'evt-lecture-1',
      user_id: 'student-with-class',
      title: 'Data Structures Lecture',
      event_type: 'lecture',
      start_time: lectureStart,
      end_time: lectureEnd,
      location: 'Engineering Campus Block A',
      status: 'scheduled'
    });

    const mockCalendarRepo = {
      findInRange: () => [mockLecture]
    };

    const service = new ContextualPersonalizationService({
      calendarEventRepo: mockCalendarRepo
    });

    const result = await service.collectStudentContext({
      studentId: 'student-with-class',
      origin: 'Borivali West',
      desiredDepartureTime: '08:30'
    });

    assert.strictEqual(result.academicContext.hasAcademicContext, true);
    assert.strictEqual(result.academicContext.hasScheduledClass, true);
    assert.ok(result.academicContext.nextClass);
    assert.strictEqual(result.academicContext.nextClass.title, 'Data Structures Lecture');
    assert.strictEqual(result.academicContext.nextClass.startTimeHHMM, '09:30');

    // Deadline derived from class start time
    assert.strictEqual(result.resolvedPersonalization.effectiveArrivalDeadline, '09:30');
    assert.strictEqual(result.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.ACADEMIC_EVENT);
    assert.strictEqual(result.resolvedPersonalization.scheduleConstraints.mustArriveBefore, '09:30');
    assert.strictEqual(result.resolvedPersonalization.scheduleConstraints.recommendedBufferMinutes, 10);
    assert.strictEqual(result.resolvedPersonalization.scheduleConstraints.isExamDay, false);
  });

  // 4. Explicit Arrival Deadline overrides derived class start time
  await test('4. Explicit arrival deadline overrides derived class start time', async () => {
    const now = Date.now();
    const d = new Date(now + IST_OFFSET_MS);
    const lectureStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0, 0, 0) - IST_OFFSET_MS;
    const lectureEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 0, 0, 0) - IST_OFFSET_MS;

    const mockLecture = new CalendarEvent({
      id: 'evt-lecture-2',
      user_id: 'student-override',
      title: 'Operating Systems',
      event_type: 'lecture',
      start_time: lectureStart,
      end_time: lectureEnd,
      status: 'scheduled'
    });

    const service = new ContextualPersonalizationService({
      calendarEventRepo: { findInRange: () => [mockLecture] }
    });

    const result = await service.collectStudentContext({
      studentId: 'student-override',
      origin: 'Andheri',
      desiredArrivalTime: '09:15' // Explicit input earlier than 10:00 class
    });

    assert.strictEqual(result.explicitInput.desiredArrivalTime, '09:15');
    assert.strictEqual(result.academicContext.nextClass.startTimeHHMM, '10:00');
    // Invariant: Explicit input strictly overrides derived academic time!
    assert.strictEqual(result.resolvedPersonalization.effectiveArrivalDeadline, '09:15');
    assert.strictEqual(result.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.EXPLICIT_INPUT);
  });

  // 5. Exam Event flags isExamDay: true with elevated buffer
  await test('5. Student with scheduled exam flags isExamDay: true and elevates recommended buffer', async () => {
    const now = Date.now();
    const d = new Date(now + IST_OFFSET_MS);
    const examStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 0, 0, 0) - IST_OFFSET_MS;
    const examEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 14, 0, 0, 0) - IST_OFFSET_MS;

    const mockExam = new CalendarEvent({
      id: 'evt-exam-1',
      user_id: 'student-exam',
      title: 'Database Systems Midterm',
      event_type: 'exam',
      start_time: examStart,
      end_time: examEnd,
      status: 'scheduled'
    });

    const service = new ContextualPersonalizationService({
      calendarEventRepo: { findInRange: () => [mockExam] }
    });

    const result = await service.collectStudentContext({
      studentId: 'student-exam',
      origin: 'Kandivali'
    });

    assert.strictEqual(result.academicContext.hasScheduledClass, true);
    assert.strictEqual(result.resolvedPersonalization.scheduleConstraints.isExamDay, true);
    assert.strictEqual(result.resolvedPersonalization.scheduleConstraints.recommendedBufferMinutes, 20); // Elevated buffer for exams
  });

  // 6. Recurring Commute Schedule provides fallback arrival deadline
  await test('6. Recurring commute schedule provides fallback arrival deadline and origin', async () => {
    const mockSchedule = new StudentSchedule({
      id: 'sch-routine-1',
      user_id: 'student-sched',
      title: 'Morning Lab Routine',
      origin: 'Goregaon East',
      destination: 'D.J. Sanghvi College of Engineering',
      target_arrival_time: '08:45',
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      active: true
    });

    const service = new ContextualPersonalizationService({
      calendarEventRepo: { findInRange: () => [] }, // No individual calendar events
      scheduleRepo: { findByUserId: () => [mockSchedule] }
    });

    const result = await service.collectStudentContext({
      studentId: 'student-sched',
      dayOfWeek: 'Mon'
    });

    assert.strictEqual(result.academicContext.recurringSchedule?.title, 'Morning Lab Routine');
    assert.strictEqual(result.resolvedPersonalization.effectiveOrigin, 'Goregaon East');
    assert.strictEqual(result.resolvedPersonalization.originSource, CONTEXT_SOURCES.RECURRING_SCHEDULE);
    assert.strictEqual(result.resolvedPersonalization.effectiveArrivalDeadline, '08:45');
    assert.strictEqual(result.resolvedPersonalization.arrivalDeadlineSource, CONTEXT_SOURCES.RECURRING_SCHEDULE);
  });

  // 7. Saved Preferences provide fallback origin, college destination, and preferred modes
  await test('7. Saved preferences provide fallback origin, college destination, and preferred modes', async () => {
    const mockPref = {
      user_id: 'student-prefs',
      preference: 'cheaper',
      preferred_modes: ['train', 'walk'],
      avoid_modes: ['auto'],
      walking_tolerance_minutes: 15,
      max_budget_rupees: 30,
      max_transfers: 1,
      default_origin_area: 'Malad West',
      default_destination_college: 'D.J. Sanghvi College of Engineering'
    };

    const service = new ContextualPersonalizationService({
      calendarEventRepo: { findInRange: () => [] },
      scheduleRepo: { findByUserId: () => [] },
      preferenceRepo: { findByUserId: () => mockPref }
    });

    const result = await service.collectStudentContext({
      studentId: 'student-prefs'
      // Omit origin, destination, preference
    });

    assert.strictEqual(result.savedPreferences.hasSavedPreferences, true);
    assert.strictEqual(result.resolvedPersonalization.effectiveOrigin, 'Malad West');
    assert.strictEqual(result.resolvedPersonalization.originSource, CONTEXT_SOURCES.SAVED_PREFERENCE);
    assert.strictEqual(result.resolvedPersonalization.effectiveRoutePreference, 'cheaper');
    assert.strictEqual(result.resolvedPersonalization.routePreferenceSource, CONTEXT_SOURCES.SAVED_PREFERENCE);
    assert.deepStrictEqual(result.resolvedPersonalization.effectivePreferredModes, ['train', 'walk']);
    assert.deepStrictEqual(result.resolvedPersonalization.effectiveAvoidModes, ['auto']);
    assert.strictEqual(result.resolvedPersonalization.effectiveConstraints.maxBudgetRupees, 30);
    assert.strictEqual(result.resolvedPersonalization.effectiveConstraints.maxTransfers, 1);
  });

  // 8. Heavy Workload Day triggers workload caution
  await test('8. Heavy workload day triggers workload caution and flags load level', async () => {
    const mockWorkloadService = {
      getWorkloadSummary: async () => ({
        summary: { heavyDaysCount: 1 },
        dailyBreakdown: [{
          date: '2026-10-12',
          totalCommitmentMinutes: 320,
          assignmentsDueCount: 3,
          isHeavyDay: true,
          loadLevel: 'heavy'
        }],
        hasConflicts: true,
        conflicts: [{ id: 'c1' }]
      })
    };

    const service = new ContextualPersonalizationService({
      calendarEventRepo: { findInRange: () => [] },
      scheduleRepo: { findByUserId: () => [] },
      workloadService: mockWorkloadService
    });

    const result = await service.collectStudentContext({
      studentId: 'student-heavy-load',
      origin: 'Andheri'
    });

    assert.strictEqual(result.workloadContext.hasWorkloadContext, true);
    assert.strictEqual(result.workloadContext.isHeavyDay, true);
    assert.strictEqual(result.workloadContext.loadLevel, 'heavy');
    assert.strictEqual(result.workloadContext.totalCommitmentMinutes, 320);
    assert.strictEqual(result.workloadContext.assignmentsDueCount, 3);
    assert.strictEqual(result.workloadContext.hasConflicts, true);
    assert.strictEqual(result.resolvedPersonalization.scheduleConstraints.heavyWorkloadCaution, true);
  });

  // 9. Access Control: Forbids a student accessing another student's context
  await test('9. Access control strictly forbids a student accessing another student private context', async () => {
    const service = new ContextualPersonalizationService();

    const requestingUser = { id: 'student-attacker', role: 'student' };

    await assert.rejects(
      async () => {
        await service.collectStudentContext(
          { studentId: 'student-victim', origin: 'Bandra' },
          requestingUser
        );
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.ok(err.message.includes('Access forbidden'));
        return true;
      }
    );
  });

  // 10. Privacy Safeguards: Rejects forbidden precise location fields
  await test('10. Privacy safeguards strictly reject forbidden GPS and door number fields', async () => {
    const service = new ContextualPersonalizationService();

    await assert.rejects(
      async () => {
        await service.collectStudentContext({
          studentId: 'student-test',
          origin: 'Andheri West',
          latitude: 19.1234, // Forbidden precise coordinate!
          longitude: 72.8361
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('Forbidden field(s) detected'));
        return true;
      }
    );
  });

  // 11. Safe Failure Handling
  await test('11. Safe failure handling when repositories or workload services fail', async () => {
    const throwingRepo = {
      findInRange: () => { throw new Error('Database disk error'); },
      findByUserId: () => { throw new Error('Query error'); }
    };
    const throwingWorkload = {
      getWorkloadSummary: async () => { throw new Error('Workload calculation failed'); }
    };

    const service = new ContextualPersonalizationService({
      calendarEventRepo: throwingRepo,
      scheduleRepo: throwingRepo,
      preferenceRepo: throwingRepo,
      profileRepo: throwingRepo,
      workloadService: throwingWorkload
    });

    // Should not throw or crash! Gracefully fallback
    const result = await service.collectStudentContext({
      studentId: 'student-resilient',
      origin: 'Dadar'
    });

    assert.ok(result instanceof ContextualCommutePersonalization);
    assert.strictEqual(result.academicContext.hasAcademicContext, false);
    assert.strictEqual(result.workloadContext.hasWorkloadContext, false);
    assert.strictEqual(result.resolvedPersonalization.effectiveOrigin, 'Dadar');
  });

  // 12. Serialization to JSON
  await test('12. Serialization to JSON cleanly exposes all domain sections without circular refs', async () => {
    const service = new ContextualPersonalizationService();
    const result = await service.collectStudentContext({
      origin: 'Vile Parle',
      destination: 'D.J. Sanghvi College of Engineering',
      desiredArrivalTime: '09:00'
    });

    const json = result.toJSON();
    assert.strictEqual(typeof json, 'object');
    assert.ok('explicitInput' in json);
    assert.ok('savedPreferences' in json);
    assert.ok('academicContext' in json);
    assert.ok('workloadContext' in json);
    assert.ok('resolvedPersonalization' in json);
    assert.ok('privacyGuarantees' in json);
    assert.strictEqual(json.privacyGuarantees.noContinuousTracking, true);
    assert.strictEqual(json.privacyGuarantees.coarseLocationOnly, true);
  });

  // 13. Integration via HTTP API Endpoint
  await test('13. HTTP POST /api/commute/recommendations returns normalized studentContext', async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const testUser = {
      sub: 'test-student-ctx-1',
      id: 'test-student-ctx-1',
      email: 'ctx-student@djsanghvi.edu.in',
      role: 'student',
      college_name: 'D.J. Sanghvi College of Engineering'
    };
    const authToken = signToken(testUser);
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    };

    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/api/commute/recommendations',
          method: 'POST',
          headers: authHeaders
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
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          desiredArrivalTime: '08:45'
        }));
        req.end();
      });

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.hasFeasibleRoute !== undefined);
      assert.ok(response.body.studentContext, 'studentContext must be present in API response');
      assert.strictEqual(response.body.studentContext.studentId, 'test-student-ctx-1');
      assert.strictEqual(response.body.studentContext.resolvedPersonalization.effectiveOrigin, 'Andheri West');
      assert.strictEqual(response.body.studentContext.resolvedPersonalization.effectiveArrivalDeadline, '08:45');
      assert.strictEqual(response.body.studentContext.resolvedPersonalization.arrivalDeadlineSource, 'EXPLICIT_INPUT');
      assert.ok(response.body.studentContext.privacyGuarantees.noContinuousTracking);
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
