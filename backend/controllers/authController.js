/**
 * Authentication Controller
 *
 * Handles HTTP requests for user registration and authentication workflows.
 */

const { authService } = require('../services');
const { created, success } = require('../utils/apiResponse');

/**
 * Handles student registration.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function register(req, res, next) {
  try {
    const user = authService.register(req.body);
    return created(res, {
      message: 'Account registered successfully',
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles student authentication / login.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function login(req, res, next) {
  try {
    const { user, token } = authService.login(req.body);
    return success(res, {
      message: 'Login successful',
      token,
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the currently authenticated student profile.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function getMe(req, res, next) {
  try {
    const user = authService.getProfile(req.user.id);
    return success(res, { user });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a user by identifier (ownership or admin enforced by middleware).
 */
function getUserById(req, res, next) {
  try {
    const user = authService.getProfile(req.params.id);
    return success(res, { user });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a user's profile (ownership or admin enforced by middleware).
 */
function updateUserProfile(req, res, next) {
  try {
    const user = authService.updateProfile(req.params.id, req.body);
    return success(res, {
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all registered users (admin only).
 */
function listUsers(req, res, next) {
  try {
    const users = authService.listUsers();
    return success(res, { users });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
  getUserById,
  updateUserProfile,
  listUsers
};
