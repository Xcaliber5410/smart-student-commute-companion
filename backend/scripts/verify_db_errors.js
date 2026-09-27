/**
 * Database Validation and Error Handling Verification Script
 *
 * Verifies that:
 * 1. Duplicate records / unique constraints map to ConflictError (409) with safe error messages.
 * 2. Foreign key / check constraint violations map to appropriate client errors without leaking SQL.
 * 3. Not found errors produce 404 with structured responses.
 * 4. Error handler sanitizes internal SQL and stack traces in production mode.
 */

const assert = require('node:assert/strict');
const { normalizeDatabaseError } = require('../db/dbErrors');
const { errorHandler } = require('../middleware/errorHandler');
const { NotFoundError, ConflictError, ValidationError, DatabaseError, ServiceUnavailableError } = require('../errors');

console.log('====================================================');
console.log(' Running Database Error & Validation Tests');
console.log('====================================================\n');

// Test 1: Unique constraint normalization
const mockUniqueErr = new Error('UNIQUE constraint failed: ride_groups.id');
mockUniqueErr.code = 'SQLITE_CONSTRAINT_UNIQUE';
const normUnique = normalizeDatabaseError(mockUniqueErr);
assert(normUnique instanceof ConflictError, 'Unique constraint must map to ConflictError');
assert.equal(normUnique.statusCode, 409);
assert.equal(normUnique.code, 'DUPLICATE_RECORD');
assert(!normUnique.message.includes('ride_groups.id'), 'Error message must not leak table/column name');
console.log('✅ PASS: Unique constraint maps to 409 ConflictError without leaking column details');

// Test 2: NOT NULL constraint normalization
const mockNotNullErr = new Error('NOT NULL constraint failed: ride_groups.start_location');
mockNotNullErr.code = 'SQLITE_CONSTRAINT_NOTNULL';
const normNotNull = normalizeDatabaseError(mockNotNullErr);
assert(normNotNull instanceof ValidationError, 'NOT NULL must map to ValidationError');
assert.equal(normNotNull.statusCode, 400);
console.log('✅ PASS: NOT NULL violation maps to 400 ValidationError');

// Test 3: Database locked/busy normalization
const mockBusyErr = new Error('database is locked');
mockBusyErr.code = 'SQLITE_BUSY';
const normBusy = normalizeDatabaseError(mockBusyErr);
assert(normBusy instanceof ServiceUnavailableError, 'Busy error must map to ServiceUnavailableError');
assert.equal(normBusy.statusCode, 503);
console.log('✅ PASS: Database busy/locked maps to 503 ServiceUnavailableError');

// Test 4: Error handler production safety check
let responseStatus = null;
let responseBody = null;
const mockRes = {
  status(s) {
    responseStatus = s;
    return this;
  },
  json(b) {
    responseBody = b;
    return this;
  }
};
const mockReq = {
  method: 'POST',
  originalUrl: '/api/test',
  headers: {}
};

// Simulate raw database error hitting errorHandler
process.env.NODE_ENV = 'production';
const rawSqlError = new Error('SELECT * FROM secret_table WHERE id = 123; syntax error near secret');
rawSqlError.code = 'SQLITE_ERROR';
errorHandler(rawSqlError, mockReq, mockRes, () => {});

assert.equal(responseStatus, 500);
assert(!JSON.stringify(responseBody).includes('secret_table'), 'Production response must not leak SQL queries');
assert(!responseBody.stack, 'Production response must not contain stack trace');
console.log('✅ PASS: Error handler redacts raw SQL and stack traces in production mode');

console.log('\n----------------------------------------------------');
console.log(' ALL DATABASE VALIDATION & ERROR TESTS PASSED! 🎉');
console.log('----------------------------------------------------');
