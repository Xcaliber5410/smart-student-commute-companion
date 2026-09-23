const express = require('express');
const { planCommute } = require('../controllers/planController');
const { validate, planCommuteSchema } = require('../validators');

function createPlanRoutes() {
  const router = express.Router();
  router.post('/plan', validate({ body: planCommuteSchema }), planCommute);
  return router;
}

module.exports = createPlanRoutes;
