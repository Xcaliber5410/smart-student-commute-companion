/**
 * Centralized Request Validation Middleware
 *
 * Validates Express req.body, req.params, and req.query against Zod schemas,
 * normalizing parsed input and propagating structured ValidationErrors to the centralized error handler.
 */

const { ValidationError } = require('../errors');

/**
 * Creates an Express middleware function that validates incoming request segments.
 *
 * @param {object} schemas
 * @param {import('zod').ZodType} [schemas.body] - Schema for req.body
 * @param {import('zod').ZodType} [schemas.params] - Schema for req.params
 * @param {import('zod').ZodType} [schemas.query] - Schema for req.query
 * @returns {import('express').RequestHandler}
 */
function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          return next(new ValidationError('Invalid route parameters', result.error.format()));
        }
        req.params = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          return next(new ValidationError('Invalid query parameters', result.error.format()));
        }
        req.query = result.data;
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          return next(new ValidationError('Validation failed', result.error.format()));
        }
        req.body = result.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  validate
};
