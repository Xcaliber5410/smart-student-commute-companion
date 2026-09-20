/**
 * Centralized Error Handling Middleware
 *
 * Provides consistent JSON error responses, handles operational and validation errors,
 * protects against leaking internal stack traces or secrets in production,
 * and maintains structured server-side diagnostic logging.
 */

const { NotFoundError } = require('../errors');

/**
 * Sanitizes HTTP headers for diagnostic logs to prevent leaking secrets/tokens.
 * @param {object} headers
 * @returns {object}
 */
function sanitizeHeaders(headers = {}) {
  const sanitized = { ...headers };
  const SENSITIVE_HEADERS = ['authorization', 'x-user-token', 'cookie', 'x-api-key'];
  for (const h of SENSITIVE_HEADERS) {
    if (sanitized[h]) sanitized[h] = '[REDACTED]';
  }
  return sanitized;
}

/**
 * 404 Catch-All Middleware for unmatched routes.
 */
function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl || req.url}`));
}

/**
 * Global Error Handler Middleware (4 parameters required by Express).
 */
function errorHandler(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let error = err.error || message;
  let details = err.details || null;
  const isOperational = Boolean(err.isOperational);

  // 1. Handle JSON syntax errors from body-parser (express.json)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    error = 'Malformed JSON';
    message = 'Request body contains invalid JSON syntax';
  }

  // 2. Handle Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    error = 'Validation failed';
    message = 'Validation failed';
    details = typeof err.format === 'function' ? err.format() : err.issues;
  }

  // 3. Server-side diagnostic logging (redacting sensitive data)
  const logPrefix = `[API Error] ${req.method} ${req.originalUrl || req.url} - ${statusCode} [${code}]`;
  if (statusCode >= 500) {
    console.error(`${logPrefix}:`, isProduction && !isOperational ? err.message : err.stack || err.message);
  } else {
    console.warn(`${logPrefix}: ${message}`);
  }

  // 4. Determine production response safety
  // If status is >= 500 and not explicitly operational, mask internal implementation details in production
  const isUnexpected = statusCode >= 500 && !isOperational;
  const safeError = isUnexpected && isProduction ? 'Internal Server Error' : error;
  const safeMessage = isUnexpected && isProduction
    ? 'An unexpected error occurred. Please try again later.'
    : message;

  const responsePayload = {
    error: safeError,
    message: safeMessage,
    code,
    statusCode,
    timestamp: new Date().toISOString()
  };

  if (details) {
    responsePayload.details = details;
  }

  // Include stack trace only in non-production for 500 errors
  if (!isProduction && statusCode >= 500 && err.stack) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
}

module.exports = {
  notFoundHandler,
  errorHandler,
  sanitizeHeaders
};
