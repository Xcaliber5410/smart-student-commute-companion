/**
 * Authentication Routes
 *
 * Exposes registration and authentication endpoints.
 */

const express = require('express');
const { register } = require('../controllers/authController');
const { validate, registerSchema } = require('../validators');

function createAuthRoutes() {
  const router = express.Router();

  router.post('/auth/register', validate({ body: registerSchema }), register);

  return router;
}

module.exports = createAuthRoutes;
