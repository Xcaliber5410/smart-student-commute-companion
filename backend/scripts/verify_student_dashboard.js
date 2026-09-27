/**
 * Verification Script: Student Dashboard Aggregation Service
 * Validates aggregation of student context, schedules, saved routes, ride groups, and alerts.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_student_dashboard.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { reportRepository } = require('../repositories/ReportRepository');
const { studentContextService } = require('../services/studentContextService');
const { studentScheduleService } = require('../services/studentScheduleService');
const { savedRouteService } = require('../services/savedRouteService');
const { rideGroupService } = require('../services/rideGroupService');
const { studentDashboardService } = require('../services/studentDashboardService');
const { ForbiddenError } = require('../errors');

async function run() {
  console.log('--- Starting Student Dashboard Aggregation Verification ---');
  await initDb();

  const runId = Date.now();
  // 1. Setup Student 1 (active commuter)
  const student1 = userRepository.create({
    full_name: 'Dashboard Student 1',
    college_name: 'DJ Sanghvi College of Engineering',
    email: `dash_student1_${runId}@djsce.edu`,
    password: 'password123',
    role: 'student'
  });

  // Setup Student 2 (fresh student with empty data)
  const freshStudent = userRepository.create({
    full_name: 'Fresh Student',
    college_name: 'DJ Sanghvi College of Engineering',
    email: `dash_fresh_${runId}@djsce.edu`,
    password: 'password123',
    role: 'student'
  });

  // Setup Student 3 (imposter)
  const imposter = userRepository.create({
    full_name: 'Imposter Student',
    college_name: 'DJ Sanghvi College of Engineering',
    email: `dash_imposter_${runId}@djsce.edu`,
    password: 'password123',
    role: 'student'
  });

  // Update Student 1 profile with preferences
  studentContextService.updateStudentProfile(student1.id, {
    home_area: 'Andheri West',
    default_college: 'DJ Sanghvi College of Engineering',
    preferred_modes: ['metro', 'train', 'walking'],
    walking_tolerance_minutes: 15,
    max_budget_rupees: 50
  }, student1);

  // Add schedules for Student 1
  studentScheduleService.createSchedule(student1.id, {
    title: 'Morning Data Structures',
    origin: 'Andheri West',
    destination: 'DJ Sanghvi College of Engineering',
    target_arrival_time: '08:45',
    days_of_week: ['Mon', 'Wed', 'Fri'],
    active: true
  }, student1);

  studentScheduleService.createSchedule(student1.id, {
    title: 'Afternoon Networks Lab',
    origin: 'Andheri West',
    destination: 'DJ Sanghvi College of Engineering',
    target_arrival_time: '14:00',
    days_of_week: ['Mon', 'Thu'],
    active: true
  }, student1);

  studentScheduleService.createSchedule(student1.id, {
    title: 'Tuesday Seminar',
    origin: 'Andheri West',
    destination: 'DJ Sanghvi College of Engineering',
    target_arrival_time: '10:00',
    days_of_week: ['Tue'],
    active: true
  }, student1);

  // Add Saved Routes for Student 1
  savedRouteService.createSavedRoute(student1.id, {
    name: 'Fast Metro Line 1',
    origin: 'Andheri West',
    destination: 'DJSCE',
    preferred_mode: 'metro',
    max_budget: 30,
    tags: ['fast', 'ac']
  }, student1);

  // Add Ride Group created by Student 1
  const createdGroup = rideGroupService.createRideGroup({
    creator_pseudonym: student1.full_name,
    origin_area: 'Andheri West',
    destination_college: 'DJ Sanghvi College of Engineering',
    departure_time: '08:15 AM',
    mode: 'auto',
    max_members: 3
  }, student1);

  // Student 1 joins a group created by freshStudent
  const freshGroup = rideGroupService.createRideGroup({
    creator_pseudonym: freshStudent.full_name,
    origin_area: 'Juhu',
    destination_college: 'DJ Sanghvi College of Engineering',
    departure_time: '08:30 AM',
    mode: 'cab',
    max_members: 4
  }, freshStudent);

  rideGroupService.joinRideGroup(freshGroup.id, student1);

  // Add Live Disruption Reports (one matching student1 home_area, one matching college, one unrelated)
  reportRepository.create({
    pseudonym: 'TrafficWatcher',
    area: 'Andheri West',
    route_name: 'SV Road',
    route_id: 'R101',
    mode: 'bus',
    message: 'Waterlogging near Andheri subway causing 20 min delay',
    impact: 'high',
    duration_minutes: 120
  });

  reportRepository.create({
    pseudonym: 'CommuterX',
    area: 'Vile Parle East',
    route_name: 'DJSCE Approach',
    route_id: 'R102',
    mode: 'auto',
    message: 'Heavy traffic heading towards DJ Sanghvi College gate',
    impact: 'medium',
    duration_minutes: 60
  });

  reportRepository.create({
    pseudonym: 'ThaneReporter',
    area: 'Thane West',
    route_name: 'Eastern Express Hwy',
    route_id: 'R103',
    mode: 'bus',
    message: 'Accident cleared on EE Highway',
    impact: 'low',
    duration_minutes: 30
  });

  // TEST 1: Normal Data Aggregation (Monday morning at 08:00)
  console.log('Testing Normal Dashboard Aggregation for Student 1...');
  const dash1 = studentDashboardService.getDashboardData(student1.id, student1, {
    day: 'Mon',
    currentTime: '08:00'
  });

  assert.strictEqual(dash1.student.id, student1.id);
  assert.strictEqual(dash1.student.home_area, 'Andheri West');
  assert.strictEqual(dash1.schedule_summary.total_active_schedules, 3);
  assert.strictEqual(dash1.schedule_summary.today_schedules_count, 2, 'Monday has 2 schedules');
  assert.ok(dash1.schedule_summary.next_commute !== null);
  assert.strictEqual(dash1.schedule_summary.next_commute.title, 'Morning Data Structures', 'At 08:00, 08:45 is next');

  assert.strictEqual(dash1.saved_routes.total_count, 1);
  assert.strictEqual(dash1.ride_groups.total_count, 2, 'Created 1, joined 1');
  assert.strictEqual(dash1.ride_groups.created_count, 1);
  assert.strictEqual(dash1.ride_groups.joined_count, 1);

  // Check alert filtering: should catch Andheri West and DJSCE reports
  assert.ok(dash1.alerts.relevant_count >= 2, 'Should match at least 2 relevant alerts (Andheri West & DJSCE)');
  assert.ok(dash1.alerts.total_active_citywide >= 3, 'Total active reports should include demo and test reports');

  // Quick stats
  assert.strictEqual(dash1.quick_stats.active_schedules, 3);
  assert.strictEqual(dash1.quick_stats.saved_routes, 1);
  assert.strictEqual(dash1.quick_stats.ride_groups, 2);
  assert.strictEqual(dash1.quick_stats.active_alerts, dash1.alerts.relevant_count);

  // TEST 2: Date-sensitive transition (Monday afternoon at 10:00)
  console.log('Testing Date/Time Sensitive Next Commute Calculation...');
  const dash1Afternoon = studentDashboardService.getDashboardData(student1.id, student1, {
    day: 'Mon',
    currentTime: '10:00'
  });
  assert.strictEqual(dash1Afternoon.schedule_summary.next_commute.title, 'Afternoon Networks Lab', 'At 10:00, 14:00 is next');

  // TEST 3: Fresh student with empty records
  console.log('Testing Fresh Student Dashboard (Empty States)...');
  const dashFresh = studentDashboardService.getDashboardData(freshStudent.id, freshStudent, {
    day: 'Sun',
    currentTime: '12:00'
  });

  assert.strictEqual(dashFresh.student.id, freshStudent.id);
  assert.strictEqual(dashFresh.schedule_summary.total_active_schedules, 0);
  assert.strictEqual(dashFresh.schedule_summary.today_schedules_count, 0);
  assert.strictEqual(dashFresh.schedule_summary.next_commute, null);
  assert.strictEqual(dashFresh.saved_routes.total_count, 0);
  assert.strictEqual(dashFresh.quick_stats.active_schedules, 0);
  assert.strictEqual(dashFresh.quick_stats.saved_routes, 0);

  // TEST 4: Ownership Isolation
  console.log('Testing Ownership Isolation...');
  let imposterBlocked = false;
  try {
    studentDashboardService.getDashboardData(student1.id, imposter);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      imposterBlocked = true;
    }
  }
  assert.strictEqual(imposterBlocked, true, 'Imposter student must be denied access to another student dashboard');

  // Cleanup
  closeConnection();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('✔ All Student Dashboard Aggregation tests passed successfully!');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
