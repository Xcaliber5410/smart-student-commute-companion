/**
 * Verification Script: StudentContextService
 *
 * Verifies student context retrieval, profile update, ownership security,
 * and default preference generation.
 */

const assert = require('assert');
const { studentContextService, authService } = require('../services');
const { ForbiddenError, NotFoundError } = require('../errors');

async function runStudentContextTests() {
  console.log('\n====================================================');
  console.log(' Running StudentContextService Verification Suite');
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

  // Setup test student and imposter
  const studentEmail = `context-student-${Date.now()}@djsce.edu`;
  const studentUser = authService.register({
    email: studentEmail,
    password: 'StrongPassword123!',
    full_name: 'Ananya Sharma',
    college_name: 'D.J. Sanghvi College of Engineering'
  });

  const imposterEmail = `imposter-${Date.now()}@mumbai.edu`;
  const imposterUser = authService.register({
    email: imposterEmail,
    password: 'StrongPassword123!',
    full_name: 'Imposter Student',
    college_name: 'Other College'
  });

  const adminEmail = `admin-ctx-${Date.now()}@admin.djsce.edu`;
  const adminUser = authService.register({
    email: adminEmail,
    password: 'StrongPassword123!',
    full_name: 'Admin User',
    college_name: 'D.J. Sanghvi',
    role: 'admin'
  });

  // 1. Initial retrieval seeds default profile
  test('StudentContextService: retrieves context and seeds default college', () => {
    const ctx = studentContextService.getStudentContext(studentUser.id, studentUser);
    assert.strictEqual(ctx.user.id, studentUser.id);
    assert.strictEqual(ctx.user.password_hash, undefined);
    assert.strictEqual(ctx.commuteDefaults.default_college, 'D.J. Sanghvi College of Engineering');
    assert.strictEqual(ctx.commuteDefaults.walking_tolerance_minutes, 20);
    assert.strictEqual(ctx.commuteDefaults.max_budget_rupees, 100);
  });

  // 2. Profile update
  test('StudentContextService: updates commute preferences successfully', () => {
    const updated = studentContextService.updateStudentProfile(
      studentUser.id,
      {
        home_area: 'Juhu Scheme, Vile Parle',
        preferred_modes: ['metro', 'auto'],
        walking_tolerance_minutes: 10,
        max_budget_rupees: 150,
        default_arrival_time: '08:30'
      },
      studentUser
    );

    assert.strictEqual(updated.commuteDefaults.home_area, 'Juhu Scheme, Vile Parle');
    assert.strictEqual(updated.commuteDefaults.walking_tolerance_minutes, 10);
    assert.strictEqual(updated.commuteDefaults.max_budget_rupees, 150);
    assert.deepStrictEqual(updated.commuteDefaults.preferred_modes, ['metro', 'auto']);
    assert.strictEqual(updated.commuteDefaults.default_arrival_time, '08:30');
  });

  // 3. Ownership security
  test('StudentContextService: forbids imposter student from viewing private context', () => {
    assert.throws(
      () => studentContextService.getStudentContext(studentUser.id, imposterUser),
      err => err instanceof ForbiddenError
    );
  });

  test('StudentContextService: forbids imposter student from updating context', () => {
    assert.throws(
      () => studentContextService.updateStudentProfile(studentUser.id, { max_budget_rupees: 500 }, imposterUser),
      err => err instanceof ForbiddenError
    );
  });

  // 4. Missing student lookup
  test('StudentContextService: throws NotFoundError on non-existent student ID', () => {
    assert.throws(
      () => studentContextService.getStudentContext('usr-non-existent-999', adminUser),
      err => err instanceof NotFoundError
    );
  });

  // 5. Admin override
  test('StudentContextService: permits admin to view student context', () => {
    const ctx = studentContextService.getStudentContext(studentUser.id, adminUser);
    assert.strictEqual(ctx.user.id, studentUser.id);
  });

  console.log('\n----------------------------------------------------');
  console.log(` STUDENT CONTEXT SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStudentContextTests().catch(err => {
  console.error('Fatal error running student context tests:', err);
  process.exit(1);
});
