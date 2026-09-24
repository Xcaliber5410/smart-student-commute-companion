/**
 * Authentication Routes
 *
 * Exposes registration and authentication endpoints.
 */

const express = require('express');
const { register, login } = require('../controllers/authController');
const { validate, registerSchema, loginSchema } = require('../validators');

function createAuthRoutes() {
  const router = express.Router();

  router.post('/auth/register', validate({ body: registerSchema }), register);
  router.post('/auth/login', validate({ body: loginSchema }), login);

  return router;
}

module.exports = createAuthRoutes;
