/**
 * Authentication Middleware
 *
 * Intercepts incoming HTTP requests, validates JWT Bearer tokens,
 * and attaches verified user identity claims to req.user.
 */

const { verifyToken } = require('../utils/token');
const { UnauthorizedError } = require('../errors');

/**
 * Mandatory authentication guard middleware.
 * Rejects requests lacking a valid, unexpired Bearer token with 401 Unauthorized.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedError('Authentication token is required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Malformed authorization header. Expected "Bearer <token>"');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError('Authentication token is required');
    }

    const payload = verifyToken(token);

    // Attach verified user identity context
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'student',
      full_name: payload.full_name || '',
      college_name: payload.college_name || ''
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication middleware.
 * Attaches req.user if a valid token is present; leaves req.user = null otherwise.
 * Does not block unauthenticated requests.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'student',
      full_name: payload.full_name || '',
      college_name: payload.college_name || ''
    };
  } catch {
    req.user = null;
  }

  next();
}

module.exports = {
  authenticate,
  optionalAuthenticate
};
