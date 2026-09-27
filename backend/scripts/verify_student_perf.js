/**
 * Verification Script: Student Data Performance & Consistency
 * Verifies index usage via EXPLAIN QUERY PLAN, transaction boundaries, and bounded pagination.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_student_perf.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection, getConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { savedRouteRepository } = require('../repositories/SavedRouteRepository');
const { rideGroupRepository } = require('../repositories/RideGroupRepository');
const { rideGroupMemberRepository } = require('../repositories/RideGroupMemberRepository');
const { rideGroupService } = require('../services/rideGroupService');

async function run() {
  console.log('--- Starting Student Data Access Performance & Consistency Verification ---');
  await initDb();
  const db = getConnection();

  const runId = Date.now();
  const student = userRepository.create({
    full_name: 'Perf Student',
    college_name: 'DJ Sanghvi College',
    email: `perf_${runId}@djsce.edu`,
    password: 'password123',
    role: 'student'
  });

  // 1. Verify Index Utilization via EXPLAIN QUERY PLAN
  console.log('Verifying Index Utilization via EXPLAIN QUERY PLAN...');

  // A. student_schedules index
  const schedulePlan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT * FROM student_schedules
    WHERE user_id = ? AND active = 1
    ORDER BY target_arrival_time ASC
  `).all(student.id);

  const schedulePlanStr = JSON.stringify(schedulePlan);
  assert.ok(
    schedulePlanStr.includes('USING INDEX') || schedulePlanStr.includes('idx_student_schedules'),
    `Schedule query plan should utilize an index: ${schedulePlanStr}`
  );

  // B. saved_routes compound index
  const routePlan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT * FROM saved_routes
    WHERE user_id = ? AND preferred_mode = 'metro'
  `).all(student.id);

  const routePlanStr = JSON.stringify(routePlan);
  assert.ok(
    routePlanStr.includes('USING INDEX') || routePlanStr.includes('idx_saved_routes'),
    `Saved routes query plan should utilize index: ${routePlanStr}`
  );

  // C. ride_group_members compound index
  const memberPlan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT g.*, m.role FROM ride_groups g
    JOIN ride_group_members m ON g.id = m.group_id
    WHERE m.user_id = ? AND m.role = 'creator'
  `).all(student.id);

  const memberPlanStr = JSON.stringify(memberPlan);
  assert.ok(
    memberPlanStr.includes('USING INDEX') || memberPlanStr.includes('idx_rg_members'),
    `Ride group members query plan should utilize index: ${memberPlanStr}`
  );

  // 2. Verify Transactional Atomicity for Ride Group Join
  console.log('Verifying Transactional Atomicity in Join Workflow...');
  const group = rideGroupService.createRideGroup({
    creator_pseudonym: student.full_name,
    origin_area: 'Bandra',
    destination_college: 'DJ Sanghvi College',
    departure_time: '09:00 AM',
    mode: 'cab',
    max_members: 2
  }, student);

  const joiner = userRepository.create({
    full_name: 'Joiner Student',
    college_name: 'DJ Sanghvi College',
    email: `joiner_${runId}@djsce.edu`,
    password: 'password123',
    role: 'student'
  });

  // Join atomically
  const joined = rideGroupService.joinRideGroup(group.id, joiner);
  assert.strictEqual(joined.current_members, 2);

  // Membership confirmed in ride_group_members
  assert.strictEqual(rideGroupMemberRepository.isMember(group.id, joiner.id), true);

  // Attempt to join when full -> fails atomically without modifying database
  let fullFailed = false;
  const extraStudent = userRepository.create({
    full_name: 'Extra Student',
    college_name: 'DJ Sanghvi College',
    email: `extra_${runId}@djsce.edu`,
    password: 'password123',
    role: 'student'
  });

  try {
    rideGroupService.joinRideGroup(group.id, extraStudent);
  } catch (err) {
    fullFailed = true;
  }
  assert.strictEqual(fullFailed, true, 'Joining full group must be rejected');
  const freshGroup = rideGroupRepository.findById(group.id);
  assert.strictEqual(freshGroup.current_members, 2, 'Member count must remain 2');
  assert.strictEqual(rideGroupMemberRepository.isMember(group.id, extraStudent.id), false);

  // 3. Verify Bounded Pagination (Protection against runaway memory/unbounded queries)
  console.log('Verifying Bounded Pagination Clamping...');
  const pagedResult = savedRouteRepository.findWithPaginationAndFilters(student.id, {
    page: -5,     // Should clamp to 1
    limit: 1000   // Should clamp to 50
  });

  assert.strictEqual(pagedResult.page, 1, 'Negative page must be clamped to 1');
  assert.strictEqual(pagedResult.limit, 50, 'Excessive limit must be clamped to 50 max');

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('✔ All Student Data Access Performance & Consistency tests passed successfully!');
}

run().catch(err => {
  console.error('Performance verification failed:', err);
  process.exit(1);
});
