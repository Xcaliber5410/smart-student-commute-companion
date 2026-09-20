const express = require('express');
const { planCommute } = require('../controllers/planController');

function createPlanRoutes() {
  const router = express.Router();
  router.post('/plan', planCommute);
  return router;
}

module.exports = createPlanRoutes;
