/**
 * Commute Routes
 *
 * Exposes endpoints for commute candidate journeys generation.
 * Requires student authentication and enforces input validation and privacy constraints.
 */

const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { commuteCandidateRequestSchema } = require('../validators/commuteValidators');
const commuteCandidateController = require('../controllers/commuteCandidateController');

function createCommuteRoutes() {
  const router = express.Router();

  // POST /commute/candidates
  router.post(
    '/commute/candidates',
    authenticate,
    validate(commuteCandidateRequestSchema, 'body'),
    commuteCandidateController.generateCandidateJourneys
  );

  // POST /student/commute/candidates (convenience alias under student namespace)
  router.post(
    '/student/commute/candidates',
    authenticate,
    validate(commuteCandidateRequestSchema, 'body'),
    commuteCandidateController.generateCandidateJourneys
  );

  return router;
}

module.exports = createCommuteRoutes;
