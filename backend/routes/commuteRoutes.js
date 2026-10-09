/**
 * Commute Routes
 *
 * Exposes endpoints for commute candidate journeys generation.
 * Requires student authentication and enforces input validation and privacy constraints.
 */

const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const {
  commuteCandidateRequestSchema,
  commuteRecommendationRequestSchema
} = require('../validators/commuteValidators');
const commuteCandidateController = require('../controllers/commuteCandidateController');
const commuteRecommendationController = require('../controllers/commuteRecommendationController');

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

  // POST /commute/recommendations (P9 Personalized Recommendations)
  router.post(
    '/commute/recommendations',
    authenticate,
    validate(commuteRecommendationRequestSchema, 'body'),
    commuteRecommendationController.getPersonalizedRecommendation
  );

  // POST /student/commute/recommendations (convenience alias under student namespace)
  router.post(
    '/student/commute/recommendations',
    authenticate,
    validate(commuteRecommendationRequestSchema, 'body'),
    commuteRecommendationController.getPersonalizedRecommendation
  );

  return router;
}

module.exports = createCommuteRoutes;
