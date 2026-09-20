const express = require('express');
const { resetDemoData } = require('../controllers/demoController');

function createDemoRoutes(io) {
  const router = express.Router();
  router.post('/demo/reset', resetDemoData(io));
  return router;
}

module.exports = createDemoRoutes;
