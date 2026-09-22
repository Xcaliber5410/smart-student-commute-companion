/**
 * Database Error Handler & Normalizer
 *
 * Intercepts low-level SQLite driver errors and maps them to appropriate,
 * safe AppError instances, preventing leakage of raw SQL statements, table structures,
 * file paths, or internal driver diagnostics to API consumers.
 */

const {
  ConflictError,
  BadRequestError,
  ValidationError,
  ServiceUnavailableError,
  DatabaseError
} = require('../errors');

/**
 * Inspects a database exception and converts it into a safe, structured AppError.
 *
 * @param {Error} err - Raw error thrown by SQLite or repository
 * @param {string} [contextMessage='Database operation failed'] - High-level operational context
 * @returns {AppError}
 */
function normalizeDatabaseError(err, contextMessage = 'Database operation failed') {
  if (!err) {
    return new DatabaseError(contextMessage);
  }

  // Already a safe operational AppError
  if (err.isOperational) {
    return err;
  }

  const message = String(err.message || '');
  const code = String(err.code || '');

  // 1. UNIQUE constraint violations
  if (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    message.includes('UNIQUE constraint failed') ||
    message.includes('PRIMARY KEY must be unique')
  ) {
    return new ConflictError(
      'A record with the specified unique attributes already exists.',
      'DUPLICATE_RECORD'
    );
  }

  // 2. FOREIGN KEY constraint violations
  if (
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    message.includes('FOREIGN KEY constraint failed')
  ) {
    return new BadRequestError(
      'Referenced resource does not exist.',
      'FOREIGN_KEY_VIOLATION'
    );
  }

  // 3. NOT NULL constraint violations
  if (
    code === 'SQLITE_CONSTRAINT_NOTNULL' ||
    message.includes('NOT NULL constraint failed')
  ) {
    return new ValidationError(
      'Required database field was not provided.',
      null,
      'NOT_NULL_VIOLATION'
    );
  }

  // 4. CHECK constraint violations
  if (
    code === 'SQLITE_CONSTRAINT_CHECK' ||
    message.includes('CHECK constraint failed')
  ) {
    return new ValidationError(
      'Provided data violates database validation constraints.',
      null,
      'CHECK_CONSTRAINT_VIOLATION'
    );
  }

  // 5. Database busy / locked concurrency errors
  if (
    code === 'SQLITE_BUSY' ||
    code === 'SQLITE_LOCKED' ||
    message.includes('database is locked') ||
    message.includes('resource busy')
  ) {
    return new ServiceUnavailableError(
      'Database is currently busy processing concurrent operations. Please retry shortly.',
      'DATABASE_BUSY'
    );
  }

  // 6. Database closed / read-only / corrupt
  if (
    code === 'SQLITE_READONLY' ||
    code === 'SQLITE_CORRUPT' ||
    code === 'SQLITE_CANTOPEN' ||
    message.includes('readonly') ||
    message.includes('disk I/O error')
  ) {
    return new ServiceUnavailableError(
      'Database storage is temporarily unavailable. Please contact system support.',
      'DATABASE_STORAGE_ERROR'
    );
  }

  // 7. Generic database error — scrub internal details, return safe operational error
  return new DatabaseError(contextMessage);
}

module.exports = {
  normalizeDatabaseError
};
