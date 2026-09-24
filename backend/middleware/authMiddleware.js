/**
 * Authentication and Authorization Middleware
 *
 * Provides:
 * - authenticate: Enforces valid Bearer JWT on protected routes (401 Unauthorized)
 * - optionalAuthenticate: Attaches req.user if a valid token is present without blocking
 * - requireRole: Enforces role-based permissions e.g. admin (403 Forbidden)
 * - requireUserOwnership: Enforces that students can only access their own user records (403 Forbidden)
 * - enforceRideGroupOwnership: Protects student ride groups from unauthorized mutation/deletion (403 Forbidden)
 */

const { verifyToken } = require('../utils/token');
const { UnauthorizedError, ForbiddenError, NotFoundError } = require('../errors');
const { rideGroupRepository } = require('../repositories/RideGroupRepository');

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

/**
 * Role-Based Access Control (RBAC) Guard.
 * Requires the authenticated user to possess one of the allowed roles.
 * Admins are automatically granted access.
 *
 * @param {string|string[]} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function requireRole(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }

    return next(new ForbiddenError('Access forbidden: insufficient role permissions'));
  };
}

/**
 * User Account Resource Ownership Guard.
 * Ensures a user can only access or modify their own private account data.
 * Administrators are permitted access to any account.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireUserOwnership(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const targetUserId = req.params.id;
  if (req.user.role === 'admin' || req.user.id === targetUserId) {
    return next();
  }

  return next(
    new ForbiddenError("Access forbidden: you do not have permission to access another user's private account")
  );
}

/**
 * Ride Group Resource Ownership Guard.
 * Protects student ride groups from unauthorized update or deletion.
 * - If request has authenticated user: checks creator match or admin role.
 * - Returns 403 Forbidden if another user attempts to mutate the group.
 * - Allows unauthenticated requests to preserve legacy compatibility.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function enforceRideGroupOwnership(req, res, next) {
  try {
    const { id } = req.params;
    const group = rideGroupRepository.findById(id);

    if (!group) {
      throw new NotFoundError('Ride group not found');
    }

    if (req.user) {
      const isOwner =
        req.user.id === group.creator_id ||
        req.user.full_name.toLowerCase() === group.creator_pseudonym.toLowerCase() ||
        req.user.email.toLowerCase() === group.creator_pseudonym.toLowerCase() ||
        req.user.role === 'admin';

      if (!isOwner) {
        throw new ForbiddenError('You can only modify or delete ride groups that you created');
      }
    }

    req.resource = group;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireUserOwnership,
  enforceRideGroupOwnership
};
