/**
 * Verification Script: Student Domain Models & Relationships
 *
 * Verifies domain models, relationship invariants, and database schema:
 * - StudentProfile: personalized preferences and commute defaults
 * - StudentSchedule: recurring lecture/commute routine with days of week
 * - SavedRoute: student bookmarked routes
 * - RideGroupMember: relational link between student and Travel Together groups
 * - Schema tables & foreign key indexes
 */

const assert = require('assert');
const {
  StudentProfile,
  StudentSchedule,
  SavedRoute,
  RideGroupMember,
  User
} = require('../models');
const { getConnection } = require('../db/connection');

async function runStudentDomainModelTests() {
  console.log('\n====================================================');
  console.log(' Running Student Domain Models & Schema Verification');
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

  // 1. StudentProfile Model
  test('StudentProfile: instantiates and validates commute defaults', () => {
    const profile = new StudentProfile({
      user_id: 'usr-test-1',
      home_area: 'Andheri West',
      default_college: 'D.J. Sanghvi',
      preferred_modes: ['metro', 'auto'],
      walking_tolerance_minutes: 15,
      max_budget_rupees: 80,
      default_arrival_time: '08:45'
    });

    assert.strictEqual(profile.user_id, 'usr-test-1');
    assert.strictEqual(profile.walking_tolerance_minutes, 15);
    assert.strictEqual(profile.max_budget_rupees, 80);
    assert.deepStrictEqual(profile.preferred_modes, ['metro', 'auto']);

    const row = profile.toRow();
    assert.strictEqual(typeof row.preferred_modes, 'string');

    const fromRow = StudentProfile.fromRow(row);
    assert.deepStrictEqual(fromRow.preferred_modes, ['metro', 'auto']);
    assert.strictEqual(fromRow.home_area, 'Andheri West');
  });

  // 2. StudentSchedule Model
  test('StudentSchedule: creates and manages recurring routine', () => {
    const schedule = StudentSchedule.create({
      user_id: 'usr-test-1',
      title: 'Morning CS Lecture',
      origin: 'Borivali Station',
      destination: 'D.J. Sanghvi College',
      target_arrival_time: '09:00 AM',
      days_of_week: ['Mon', 'Wed', 'Fri']
    });

    assert.ok(schedule.id.startsWith('sch-'));
    assert.strictEqual(schedule.active, true);
    assert.strictEqual(schedule.reminder_enabled, true);
    assert.deepStrictEqual(schedule.days_of_week, ['Mon', 'Wed', 'Fri']);

    const row = schedule.toRow();
    assert.strictEqual(typeof row.days_of_week, 'string');

    const fromRow = StudentSchedule.fromRow(row);
    assert.deepStrictEqual(fromRow.days_of_week, ['Mon', 'Wed', 'Fri']);
    assert.strictEqual(fromRow.title, 'Morning CS Lecture');
  });

  // 3. SavedRoute Model
  test('SavedRoute: creates shortcut bookmark with tags', () => {
    const route = SavedRoute.create({
      user_id: 'usr-test-1',
      name: 'Rain-Safe Metro Path',
      origin: 'Ghatkopar',
      destination: 'D.J. Sanghvi',
      preferred_mode: 'metro',
      max_budget: 60,
      tags: ['metro-line-1', 'indoor']
    });

    assert.ok(route.id.startsWith('route-'));
    assert.strictEqual(route.name, 'Rain-Safe Metro Path');
    assert.deepStrictEqual(route.tags, ['metro-line-1', 'indoor']);

    const row = route.toRow();
    const fromRow = SavedRoute.fromRow(row);
    assert.deepStrictEqual(fromRow.tags, ['metro-line-1', 'indoor']);
  });

  // 4. RideGroupMember Model
  test('RideGroupMember: tracks student membership role', () => {
    const member = RideGroupMember.create({
      group_id: 'grp-test-1',
      user_id: 'usr-test-1',
      role: 'creator'
    });

    assert.strictEqual(member.group_id, 'grp-test-1');
    assert.strictEqual(member.role, 'creator');
    assert.ok(member.joined_at > 0);
  });

  // 5. Database Schema & Tables Check
  const db = getConnection();

  test('Database: student relational tables exist in SQLite catalog', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(tables.includes('student_profiles'), 'student_profiles table must exist');
    assert.ok(tables.includes('student_schedules'), 'student_schedules table must exist');
    assert.ok(tables.includes('saved_routes'), 'saved_routes table must exist');
    assert.ok(tables.includes('ride_group_members'), 'ride_group_members table must exist');
  });

  test('Database: indexes on student foreign keys exist', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    assert.ok(indexes.includes('idx_student_profiles_user_id'), 'idx_student_profiles_user_id must exist');
    assert.ok(indexes.includes('idx_student_schedules_user_id'), 'idx_student_schedules_user_id must exist');
    assert.ok(indexes.includes('idx_saved_routes_user_id'), 'idx_saved_routes_user_id must exist');
    assert.ok(indexes.includes('idx_rg_members_group_id'), 'idx_rg_members_group_id must exist');
    assert.ok(indexes.includes('idx_rg_members_user_id'), 'idx_rg_members_user_id must exist');
  });

  console.log('\n----------------------------------------------------');
  console.log(` STUDENT DOMAIN MODELS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStudentDomainModelTests().catch(err => {
  console.error('Fatal error running student domain model tests:', err);
  process.exit(1);
});
