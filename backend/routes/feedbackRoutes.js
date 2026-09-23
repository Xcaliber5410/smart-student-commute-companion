const express = require('express');
const {
  submitFeedback,
  getFeedback,
  updateFeedback,
  deleteFeedback
} = require('../controllers/feedbackController');
const {
  validate,
  submitFeedbackSchema,
  updateFeedbackSchema,
  feedbackFilterQuerySchema,
  idParamSchema
} = require('../validators');

function createFeedbackRoutes() {
  const router = express.Router();
  router.get('/feedback', validate({ query: feedbackFilterQuerySchema }), getFeedback);
  router.post('/feedback', validate({ body: submitFeedbackSchema }), submitFeedback);
  router.patch(
    '/feedback/:id',
    validate({ params: idParamSchema, body: updateFeedbackSchema }),
    updateFeedback
  );
  router.delete(
    '/feedback/:id',
    validate({ params: idParamSchema }),
    deleteFeedback
  );
  return router;
}

module.exports = createFeedbackRoutes;
