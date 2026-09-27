/**
 * Centralized Application Error Classes
 *
 * Defines standard operational error types with HTTP status codes and machine-readable error codes.
 */

class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code='INTERNAL_ERROR'] - Machine-readable error code
   * @param {object|null} [details=null] - Additional validation or diagnostic details
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST', details = null) {
    super(message, 400, code, details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null, code = 'VALIDATION_ERROR') {
    super(message, 400, code, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', code = 'DATABASE_ERROR', details = null) {
    super(message, 500, code, details);
  }
}

class BusinessRuleError extends BadRequestError {
  constructor(message = 'Business rule violation', code = 'BUSINESS_RULE_VIOLATION', details = null) {
    super(message, code, details);
  }
}

class OwnershipError extends ForbiddenError {
  constructor(message = 'Access forbidden: resource ownership required', code = 'FORBIDDEN_OWNERSHIP', details = null) {
    super(message, code);
    this.details = details;
  }
}

class InvalidStateTransitionError extends BadRequestError {
  constructor(message = 'Invalid state transition', code = 'INVALID_STATE_TRANSITION', details = null) {
    super(message, code, details);
  }
}

class ResourceNotFoundError extends NotFoundError {
  constructor(resource = 'Resource', identifier = '', code = 'NOT_FOUND') {
    const msg = identifier ? `${resource} with identifier '${identifier}' not found` : `${resource} not found`;
    super(msg, code);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  ValidationError,
  NotFoundError,
  ResourceNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  OwnershipError,
  ConflictError,
  BusinessRuleError,
  InvalidStateTransitionError,
  ServiceUnavailableError,
  DatabaseError
};
