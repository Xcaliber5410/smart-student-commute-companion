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

module.exports = {
  register,
  login
};
