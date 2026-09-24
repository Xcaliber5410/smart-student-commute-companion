/**
 * Authentication Routes
 *
 * Exposes registration and authentication endpoints.
 */

const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { validate, registerSchema, loginSchema } = require('../validators');
const { authenticate } = require('../middleware/authMiddleware');

function createAuthRoutes() {
  const router = express.Router();

  router.post('/auth/register', validate({ body: registerSchema }), register);
  router.post('/auth/login', validate({ body: loginSchema }), login);
  router.get('/auth/me', authenticate, getMe);

  return router;
}

module.exports = createAuthRoutes;
