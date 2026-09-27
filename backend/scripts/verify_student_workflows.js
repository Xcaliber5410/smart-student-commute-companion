/**
 * Verification Script: Student Workflow Services
 *
 * Verifies core student workflow services:
 * - StudentScheduleService: schedule creation, retrieval, updates, toggle, ownership
 * - SavedRouteService: favorite routes bookmarking, updates, isolation
 * - RideGroupService: membership coordination, student group listing, leave tracking
 */

const assert = require('assert');
const {
  studentScheduleService,
  savedRouteService,
  rideGroupService,
  authService
} = require('../services');
const { ForbiddenError, NotFoundError } = require('../errors');

async function runStudentWorkflowTests() {
  console.log('\n====================================================');
  console.log(' Running Student Workflow Services Verification');
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

  // Setup test students
  const student = authService.register({
    email: `workflow-student-${Date.now()}@djsce.edu`,
    password: 'StrongPassword123!',
    full_name: 'Workflow Student',
    college_name: 'D.J. Sanghvi'
  });

  const imposter = authService.register({
    email: `imposter-wf-${Date.now()}@djsce.edu`,
    password: 'StrongPassword123!',
    full_name: 'Imposter Student',
    college_name: 'D.J. Sanghvi'
  });

  // 1. Student Schedule Workflows
  let createdSchedule = null;

  test('StudentScheduleService: creates a recurring schedule for authenticated student', () => {
    createdSchedule = studentScheduleService.createSchedule(
      student.id,
      {
        title: 'Operating Systems Morning Lecture',
        origin: 'Malad West',
        destination: 'D.J. Sanghvi College of Engineering',
        target_arrival_time: '08:45 AM',
        days_of_week: ['Mon', 'Tue', 'Thu']
      },
      student
    );

    assert.ok(createdSchedule.id.startsWith('sch-'));
    assert.strictEqual(createdSchedule.user_id, student.id);
    assert.strictEqual(createdSchedule.title, 'Operating Systems Morning Lecture');
    assert.strictEqual(createdSchedule.active, true);
  });

  test('StudentScheduleService: forbids imposter from creating schedule on behalf of student', () => {
    assert.throws(
      () => studentScheduleService.createSchedule(student.id, { title: 'Hijack' }, imposter),
      err => err instanceof ForbiddenError
    );
  });

  test('StudentScheduleService: retrieves student schedules scoped to owner', () => {
    const list = studentScheduleService.getStudentSchedules(student.id, student);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, createdSchedule.id);
  });

  test('StudentScheduleService: toggles schedule active/paused state', () => {
    const toggled = studentScheduleService.toggleScheduleActive(createdSchedule.id, student);
    assert.strictEqual(toggled.active, false);
    const reactivated = studentScheduleService.toggleScheduleActive(createdSchedule.id, student);
    assert.strictEqual(reactivated.active, true);
  });

  test('StudentScheduleService: updates schedule departure/arrival details', () => {
    const updated = studentScheduleService.updateSchedule(
      createdSchedule.id,
      { target_arrival_time: '09:00 AM', title: 'OS Lecture (Lab Day)' },
      student
    );
    assert.strictEqual(updated.target_arrival_time, '09:00 AM');
    assert.strictEqual(updated.title, 'OS Lecture (Lab Day)');
  });

  // 2. Saved Route Workflows
  let createdRoute = null;

  test('SavedRouteService: bookmarks a frequent route for student', () => {
    createdRoute = savedRouteService.createSavedRoute(
      student.id,
      {
        name: 'Daily Metro Rush',
        origin: 'Versova',
        destination: 'D.J. Sanghvi',
        preferred_mode: 'metro',
        max_budget: 40,
        tags: ['cheap', 'ac']
      },
      student
    );

    assert.ok(createdRoute.id.startsWith('route-'));
    assert.strictEqual(createdRoute.name, 'Daily Metro Rush');
    assert.deepStrictEqual(createdRoute.tags, ['cheap', 'ac']);
  });

  test('SavedRouteService: forbids imposter from accessing private saved route', () => {
    assert.throws(
      () => savedRouteService.getSavedRouteById(createdRoute.id, imposter),
      err => err instanceof ForbiddenError
    );
  });

  test('SavedRouteService: updates saved route tags and budget', () => {
    const updated = savedRouteService.updateSavedRoute(
      createdRoute.id,
      { max_budget: 50, tags: ['fast', 'ac'] },
      student
    );
    assert.strictEqual(updated.max_budget, 50);
    assert.deepStrictEqual(updated.tags, ['fast', 'ac']);
  });

  // 3. Ride Group Membership Workflows
  const group = rideGroupService.createRideGroup(
    {
      creator_pseudonym: student.full_name,
      origin_area: 'Borivali',
      destination_college: 'D.J. Sanghvi',
      departure_time: '08:30 AM',
      mode: 'auto',
      max_members: 3
    },
    student
  );

  test('RideGroupService: creator is automatically registered in ride_group_members', () => {
    const studentGroups = rideGroupService.getStudentRideGroups(student.id, student);
    assert.strictEqual(studentGroups.length, 1);
    assert.strictEqual(studentGroups[0].group.id, group.id);
    assert.strictEqual(studentGroups[0].membership.role, 'creator');
  });

  test('RideGroupService: second student joins and is recorded as member', () => {
    rideGroupService.joinRideGroup(group.id, imposter);
    const imposterGroups = rideGroupService.getStudentRideGroups(imposter.id, imposter);
    assert.strictEqual(imposterGroups.length, 1);
    assert.strictEqual(imposterGroups[0].membership.role, 'member');
  });

  test('RideGroupService: prevents duplicate join from registered member', () => {
    assert.throws(
      () => rideGroupService.joinRideGroup(group.id, imposter),
      err => err.code === 'ALREADY_MEMBER'
    );
  });

  test('RideGroupService: member leaves and is removed from membership table', () => {
    rideGroupService.leaveRideGroup(group.id, imposter);
    const imposterGroups = rideGroupService.getStudentRideGroups(imposter.id, imposter);
    assert.strictEqual(imposterGroups.length, 0);
  });

  // Clean up
  studentScheduleService.deleteSchedule(createdSchedule.id, student);
  savedRouteService.deleteSavedRoute(createdRoute.id, student);
  rideGroupService.deleteRideGroup(group.id, student);

  console.log('\n----------------------------------------------------');
  console.log(` STUDENT WORKFLOWS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStudentWorkflowTests().catch(err => {
  console.error('Fatal error running student workflow tests:', err);
  process.exit(1);
});
