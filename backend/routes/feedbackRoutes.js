const express = require('express');
const { submitFeedback } = require('../controllers/feedbackController');

function createFeedbackRoutes() {
  const router = express.Router();
  router.post('/feedback', submitFeedback);
  return router;
}

module.exports = createFeedbackRoutes;
