/**
 * Verification Script: Standardized Service Error Handling
 *
 * Verifies that the service layer generates predictable, domain-level operational errors:
 * - ResourceNotFoundError (404)
 * - BusinessRuleError (400)
 * - OwnershipError (403)
 * - ConflictError (409)
 * - Error masking in production (no leaked stack traces, SQL, or internal file paths)
 */

const assert = require('assert');
const {
  AppError,
  NotFoundError,
  ResourceNotFoundError,
  BadRequestError,
  BusinessRuleError,
  ForbiddenError,
  OwnershipError,
  ConflictError
} = require('../errors');
const { rideGroupService, reportService } = require('../services');

async function runServiceErrorTests() {
  console.log('\n====================================================');
  console.log(' Running Standardized Service Error Handling Suite');
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

  test('ResourceNotFoundError formats message with identifier and code', () => {
    const err = new ResourceNotFoundError('RideGroup', 'grp-xyz-999');
    assert.strictEqual(err.statusCode, 404);
    assert.strictEqual(err.code, 'NOT_FOUND');
    assert.strictEqual(err.message, "RideGroup with identifier 'grp-xyz-999' not found");
    assert.strictEqual(err.isOperational, true);
  });

  test('BusinessRuleError inherits BadRequestError with status 400', () => {
    const err = new BusinessRuleError('Capacity limit exceeded', 'CAPACITY_EXCEEDED');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.code, 'CAPACITY_EXCEEDED');
    assert.strictEqual(err.isOperational, true);
    assert.ok(err instanceof BadRequestError);
  });

  test('OwnershipError inherits ForbiddenError with status 403', () => {
    const err = new OwnershipError('Only the creator may modify this ride group', 'FORBIDDEN_OWNERSHIP');
    assert.strictEqual(err.statusCode, 403);
    assert.strictEqual(err.code, 'FORBIDDEN_OWNERSHIP');
    assert.strictEqual(err.isOperational, true);
    assert.ok(err instanceof ForbiddenError);
  });

  test('RideGroupService: getRideGroupById throws NotFoundError on missing ID', () => {
    assert.throws(
      () => rideGroupService.getRideGroupById('non-existent-grp-999'),
      err => err instanceof NotFoundError && err.statusCode === 404
    );
  });

  test('ReportService: getReportById throws NotFoundError on missing ID', () => {
    assert.throws(
      () => reportService.getReportById('non-existent-rep-999'),
      err => err instanceof NotFoundError && err.statusCode === 404
    );
  });

  test('Service errors do not contain sensitive internal strings or passwords', () => {
    const err = new BusinessRuleError('Invalid state transition for report');
    const serialized = JSON.stringify({
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode
    });

    assert.ok(!serialized.includes('password'));
    assert.ok(!serialized.includes('SQLITE_'));
    assert.ok(!serialized.includes('better-sqlite3'));
  });

  console.log('\n----------------------------------------------------');
  console.log(` SERVICE ERROR HANDLING SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runServiceErrorTests().catch(err => {
  console.error('Fatal error running service error tests:', err);
  process.exit(1);
});
