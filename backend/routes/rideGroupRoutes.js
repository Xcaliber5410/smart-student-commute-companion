const express = require('express');
const {
  getRideGroups,
  getRideGroup,
  createRideGroup,
  joinRideGroup
} = require('../controllers/rideGroupController');
const { validate, createRideGroupSchema, idParamSchema } = require('../validators');

function createRideGroupRoutes() {
  const router = express.Router();

  router.get('/ride-groups', getRideGroups);
  router.get('/ride-groups/:id', validate({ params: idParamSchema }), getRideGroup);
  router.post('/ride-groups', validate({ body: createRideGroupSchema }), createRideGroup);
  router.post('/ride-groups/:id/join', validate({ params: idParamSchema }), joinRideGroup);

  return router;
}

module.exports = createRideGroupRoutes;
