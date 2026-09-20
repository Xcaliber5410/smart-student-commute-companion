const express = require('express');
const { getHealth } = require('../controllers/healthController');

function createHealthRoutes() {
  const router = express.Router();
  router.get('/health', getHealth);
  return router;
}

module.exports = createHealthRoutes;
