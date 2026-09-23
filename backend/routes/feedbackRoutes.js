const express = require('express');
const { submitFeedback, getFeedback } = require('../controllers/feedbackController');
const { validate, submitFeedbackSchema } = require('../validators');

function createFeedbackRoutes() {
  const router = express.Router();
  router.get('/feedback', getFeedback);
  router.post('/feedback', validate({ body: submitFeedbackSchema }), submitFeedback);
  return router;
}

module.exports = createFeedbackRoutes;
