/**
 * Authentication Routes
 *
 * Exposes registration and authentication endpoints.
 */

const express = require('express');
const {
  register,
  login,
  getMe,
  getUserById,
  updateUserProfile,
  listUsers
} = require('../controllers/authController');
const { validate, registerSchema, loginSchema } = require('../validators');
const { authenticate, requireRole, requireUserOwnership } = require('../middleware/authMiddleware');

function createAuthRoutes() {
  const router = express.Router();

  router.post('/auth/register', validate({ body: registerSchema }), register);
  router.post('/auth/login', validate({ body: loginSchema }), login);
  router.get('/auth/me', authenticate, getMe);
  router.get('/auth/users', authenticate, requireRole(['admin']), listUsers);
  router.get('/auth/users/:id', authenticate, requireUserOwnership, getUserById);
  router.patch('/auth/users/:id', authenticate, requireUserOwnership, updateUserProfile);

  return router;
}

module.exports = createAuthRoutes;
