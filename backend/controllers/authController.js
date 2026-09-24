/**
 * Authentication Controller
 *
 * Handles HTTP requests for user registration and authentication workflows.
 */

const { authService } = require('../services');
const { created } = require('../utils/apiResponse');

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

module.exports = {
  register
};
