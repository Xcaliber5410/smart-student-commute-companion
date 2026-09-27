/**
 * Verification Script: Student Data Querying, Search, and Filtering
 * Tests student schedule, saved route, and group membership filtering & pagination.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_student_filters.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { studentScheduleService } = require('../services/studentScheduleService');
const { savedRouteService } = require('../services/savedRouteService');
const { rideGroupService } = require('../services/rideGroupService');
const {
  scheduleFilterSchema,
  savedRouteFilterSchema,
  studentGroupFilterSchema
} = require('../validators');

async function run() {
  console.log('--- Starting Student Query & Filtering Verification ---');
  await initDb();

  const runId = Date.now();
  // Create users
  const student1 = userRepository.create({
    full_name: 'Filter Student 1',
    college_name: 'DJ Sanghvi College',
    email: `filter1_${runId}@example.com`,
    password: 'password123',
    role: 'student'
  });

  const student2 = userRepository.create({
    full_name: 'Filter Student 2',
    college_name: 'DJ Sanghvi College',
    email: `filter2_${runId}@example.com`,
    password: 'password123',
    role: 'student'
  });

  // 1. Populate Schedules for student1
  await studentScheduleService.createSchedule(student1.id, {
    title: 'Morning CS Lecture',
    origin: 'Andheri West',
    destination: 'DJ Sanghvi College',
    target_arrival_time: '08:45',
    days_of_week: ['Mon', 'Wed', 'Fri'],
    active: 1
  }, student1);

  await studentScheduleService.createSchedule(student1.id, {
    title: 'Afternoon Lab Session',
    origin: 'Vile Parle Station',
    destination: 'DJ Sanghvi College',
    target_arrival_time: '13:30',
    days_of_week: ['Tue', 'Thu'],
    active: 1
  }, student1);

  await studentScheduleService.createSchedule(student1.id, {
    title: 'Weekend Sports Club',
    origin: 'Andheri West',
    destination: 'Bandra Gymkhana',
    target_arrival_time: '09:00',
    days_of_week: ['Sat'],
    active: 0
  }, student1);

  // Populate Schedule for student2 (ownership check)
  await studentScheduleService.createSchedule(student2.id, {
    title: 'Morning Electronics Lab',
    origin: 'Borivali',
    destination: 'DJ Sanghvi College',
    target_arrival_time: '08:30',
    days_of_week: ['Mon'],
    active: 1
  }, student2);

  // Test Schedule Filtering:
  console.log('Testing Schedule Filtering...');
  // A. Filter by active=1
  const activeSchedules = studentScheduleService.listStudentSchedules(student1.id, student1, { active: 1 });
  assert.strictEqual(activeSchedules.schedules.length, 2, 'Should find 2 active schedules for student 1');
  assert.strictEqual(activeSchedules.pagination.total, 2);

  // B. Filter by active=0
  const inactiveSchedules = studentScheduleService.listStudentSchedules(student1.id, student1, { active: 0 });
  assert.strictEqual(inactiveSchedules.schedules.length, 1, 'Should find 1 inactive schedule for student 1');
  assert.strictEqual(inactiveSchedules.schedules[0].title, 'Weekend Sports Club');

  // C. Filter by search query
  const searchedSchedules = studentScheduleService.listStudentSchedules(student1.id, student1, { search: 'Lab' });
  assert.strictEqual(searchedSchedules.schedules.length, 1);
  assert.strictEqual(searchedSchedules.schedules[0].title, 'Afternoon Lab Session');

  // D. Filter by day_of_week
  const mondaySchedules = studentScheduleService.listStudentSchedules(student1.id, student1, { day_of_week: 'Mon' });
  assert.strictEqual(mondaySchedules.schedules.length, 1);
  assert.strictEqual(mondaySchedules.schedules[0].title, 'Morning CS Lecture');

  // E. Pagination
  const pagedSchedules = studentScheduleService.listStudentSchedules(student1.id, student1, { page: 1, limit: 1 });
  assert.strictEqual(pagedSchedules.schedules.length, 1);
  assert.strictEqual(pagedSchedules.pagination.totalPages, 3);

  // 2. Populate Saved Routes for student1
  console.log('Testing Saved Route Filtering...');
  studentRoute1 = savedRouteService.createSavedRoute(student1.id, {
    name: 'Metro Fast Track',
    origin: 'Andheri Metro',
    destination: 'Ghatkopar',
    preferred_mode: 'metro',
    max_budget: 30,
    tags: ['fast', 'ac']
  }, student1);

  savedRouteService.createSavedRoute(student1.id, {
    name: 'Local Train Budget',
    origin: 'Andheri Station',
    destination: 'Churchgate',
    preferred_mode: 'train',
    max_budget: 15,
    tags: ['budget', 'scenic']
  }, student1);

  savedRouteService.createSavedRoute(student1.id, {
    name: 'Direct Auto Rickshaw',
    origin: 'Home',
    destination: 'DJ Sanghvi College',
    preferred_mode: 'auto',
    max_budget: 80,
    tags: ['direct', 'rainy']
  }, student1);

  // A. Filter by preferred_mode
  const metroRoutes = savedRouteService.listStudentSavedRoutes(student1.id, student1, { preferred_mode: 'metro' });
  assert.strictEqual(metroRoutes.routes.length, 1);
  assert.strictEqual(metroRoutes.routes[0].name, 'Metro Fast Track');

  // B. Filter by max_budget
  const budgetRoutes = savedRouteService.listStudentSavedRoutes(student1.id, student1, { max_budget: 30 });
  assert.strictEqual(budgetRoutes.routes.length, 2, 'Should find routes costing <= 30');

  // C. Filter by search query
  const trainRoutes = savedRouteService.listStudentSavedRoutes(student1.id, student1, { search: 'Churchgate' });
  assert.strictEqual(trainRoutes.routes.length, 1);
  assert.strictEqual(trainRoutes.routes[0].name, 'Local Train Budget');

  // D. Filter by tag
  const rainyRoutes = savedRouteService.listStudentSavedRoutes(student1.id, student1, { tag: 'rainy' });
  assert.strictEqual(rainyRoutes.routes.length, 1);
  assert.strictEqual(rainyRoutes.routes[0].name, 'Direct Auto Rickshaw');

  // 3. Test Student Ride Groups Filtering
  console.log('Testing Student Ride Groups Filtering...');
  const group1 = rideGroupService.createRideGroup({
    creator_pseudonym: student1.full_name,
    origin_area: 'Andheri West',
    destination_college: 'DJ Sanghvi College',
    departure_time: '08:30 AM',
    mode: 'cab',
    max_members: 4
  }, student1);

  const group2 = rideGroupService.createRideGroup({
    creator_pseudonym: student2.full_name,
    origin_area: 'Borivali Station',
    destination_college: 'DJ Sanghvi College',
    departure_time: '08:00 AM',
    mode: 'auto',
    max_members: 3
  }, student2);

  // student1 joins group2
  rideGroupService.joinRideGroup(group2.id, student1);

  // A. List all groups student1 belongs to
  const allStudentGroups = rideGroupService.listStudentGroups(student1.id, student1);
  assert.strictEqual(allStudentGroups.groups.length, 2);

  // B. Filter by role: 'creator'
  const createdGroups = rideGroupService.listStudentGroups(student1.id, student1, { role: 'creator' });
  assert.strictEqual(createdGroups.groups.length, 1);
  assert.strictEqual(createdGroups.groups[0].group.id, group1.id);

  // C. Filter by role: 'member'
  const joinedGroups = rideGroupService.listStudentGroups(student1.id, student1, { role: 'member' });
  assert.strictEqual(joinedGroups.groups.length, 1);
  assert.strictEqual(joinedGroups.groups[0].group.id, group2.id);

  // D. Search filter
  const searchGroups = rideGroupService.listStudentGroups(student1.id, student1, { search: 'Borivali' });
  assert.strictEqual(searchGroups.groups.length, 1);
  assert.strictEqual(searchGroups.groups[0].group.id, group2.id);

  // 4. Test validation schemas for query filters
  console.log('Testing query validation schemas...');
  const validScheduleQuery = scheduleFilterSchema.parse({ active: 'true', page: '2', limit: '10', day_of_week: 'Mon' });
  assert.strictEqual(validScheduleQuery.active, true);
  assert.strictEqual(validScheduleQuery.page, 2);

  const validRouteQuery = savedRouteFilterSchema.parse({ preferred_mode: 'train', max_budget: '50' });
  assert.strictEqual(validRouteQuery.preferred_mode, 'train');
  assert.strictEqual(validRouteQuery.max_budget, 50);

  const validGroupQuery = studentGroupFilterSchema.parse({ role: 'creator', search: 'College' });
  assert.strictEqual(validGroupQuery.role, 'creator');

  // Invalid test
  let failed = false;
  try {
    savedRouteFilterSchema.parse({ preferred_mode: 'rocket' });
  } catch (err) {
    failed = true;
  }
  assert.strictEqual(failed, true, 'Should reject invalid preferred_mode');

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  console.log('✔ All Student Query & Filtering tests passed successfully!');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
