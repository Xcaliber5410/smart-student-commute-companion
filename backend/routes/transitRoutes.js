const express = require('express');
const { searchTransit } = require('../controllers/transitController');

function createTransitRoutes() {
  const router = express.Router();
  router.get('/transit/search', searchTransit);
  return router;
}

module.exports = createTransitRoutes;
