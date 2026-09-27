/**
 * Request Validation Verification Suite
 *
 * Verifies that:
 * 1. Valid request payloads pass validation and apply defaults.
 * 2. Invalid bodies, params, and queries trigger structured ValidationErrors.
 * 3. Length, enum, and range constraints are strictly enforced.
 * 4. Validation middleware seamlessly passes sanitized data to route handlers.
 * 5. Validation failures integrate with centralized error handling without leaking internals.
 */

const assert = require('node:assert/strict');
const {
  validate,
  createRideGroupSchema,
  updateRideGroupSchema,
  createReportSchema,
  submitFeedbackSchema,
  planCommuteSchema,
  transitSearchQuerySchema,
  idParamSchema,
  paginationQuerySchema
} = require('../validators');
const { ValidationError } = require('../errors');

console.log('====================================================');
console.log(' Running Request Validation Foundation Tests');
console.log('====================================================\n');

let passed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.stack || err.message}`);
    process.exit(1);
  }
}

// 1. RideGroup validation tests
runTest('createRideGroupSchema accepts valid student group data and applies defaults', () => {
  const input = {
    creator_pseudonym: 'Aditi Verma',
    origin_area: 'Bandra West',
    destination_college: 'HR College',
    departure_time: '08:45 AM',
    mode: 'train'
  };
  const parsed = createRideGroupSchema.parse(input);
  assert.equal(parsed.creator_pseudonym, 'Aditi Verma');
  assert.equal(parsed.max_members, 3, 'Default max_members should be 3');
  assert.equal(parsed.notes, '', 'Default notes should be empty string');
});

runTest('createRideGroupSchema rejects invalid capacity bounds and missing fields', () => {
  assert.throws(() => {
    createRideGroupSchema.parse({
      creator_pseudonym: 'A', // too short (< 2)
      origin_area: 'Bandra',
      destination_college: 'HR College',
      departure_time: '08:45 AM',
      mode: 'train',
      max_members: 10 // exceeds max 6
    });
  }, (err) => err.name === 'ZodError');
});

// 2. Report validation tests
runTest('createReportSchema validates modes and message lengths', () => {
  const valid = createReportSchema.parse({
    area: 'Dadar Station',
    mode: 'train',
    message: 'Heavy crowding on platform 4 due to signal delay'
  });
  assert.equal(valid.pseudonym, 'Student_Rider');
  assert.equal(valid.impact, 'medium');
  assert.equal(valid.durationObservedMinutes, 60);

  // Invalid mode
  assert.throws(() => {
    createReportSchema.parse({
      area: 'Dadar',
      mode: 'airplane',
      message: 'Delayed train'
    });
  }, (err) => err.name === 'ZodError');
});

// 3. Feedback validation tests
runTest('submitFeedbackSchema requires boolean is_useful and validates tags', () => {
  const valid = submitFeedbackSchema.parse({
    recommendation_id: 'rec-123',
    is_useful: true,
    tags: ['Fast', 'Low Crowding'],
    comment: 'Great itinerary'
  });
  assert.equal(valid.is_useful, true);
  assert.equal(valid.tags.length, 2);

  // Missing is_useful boolean
  assert.throws(() => {
    submitFeedbackSchema.parse({
      comment: 'Missing boolean'
    });
  }, (err) => err.name === 'ZodError');
});

// 4. Common Params & Query tests
runTest('idParamSchema and paginationQuerySchema coerce and validate constraints', () => {
  const parsedId = idParamSchema.parse({ id: '  grp-999  ' });
  assert.equal(parsedId.id, 'grp-999', 'Should trim whitespace');

  const pagination = paginationQuerySchema.parse({ page: '3', limit: '25' });
  assert.equal(pagination.page, 3, 'Should coerce string to integer');
  assert.equal(pagination.limit, 25);

  assert.throws(() => {
    paginationQuerySchema.parse({ limit: '500' }); // Exceeds 100
  }, (err) => err.name === 'ZodError');
});

// 5. Middleware integration test
runTest('validate middleware validates req segments and calls next', () => {
  const middleware = validate({
    params: idParamSchema,
    body: submitFeedbackSchema
  });

  let nextCalledWith = null;
  const mockReq = {
    params: { id: 'test-rec-id' },
    body: { is_useful: true }
  };
  const mockRes = {};

  middleware(mockReq, mockRes, (err) => {
    nextCalledWith = err;
  });

  assert.equal(nextCalledWith, undefined, 'Next should be called with no error for valid data');
  assert.equal(mockReq.body.comment, '', 'Defaults should be applied to req.body');

  // Test failure branch
  let failedErr = null;
  const invalidReq = {
    params: { id: '' }, // empty id
    body: {} // missing is_useful
  };

  middleware(invalidReq, mockRes, (err) => {
    failedErr = err;
  });

  assert(failedErr instanceof ValidationError, 'Failed validation must yield a ValidationError');
  assert.equal(failedErr.statusCode, 400);
});

console.log('\n----------------------------------------------------');
console.log(` REQUEST VALIDATION TEST SUMMARY: ${passed} passed, 0 failed`);
console.log('----------------------------------------------------');
console.log('ALL REQUEST VALIDATION CHECKS PASSED! 🎉\n');
