const express = require('express');
const { searchTransit } = require('../controllers/transitController');
const { validate, transitSearchQuerySchema } = require('../validators');

function createTransitRoutes() {
  const router = express.Router();
  router.get('/transit/search', validate({ query: transitSearchQuerySchema }), searchTransit);
  return router;
}

module.exports = createTransitRoutes;
