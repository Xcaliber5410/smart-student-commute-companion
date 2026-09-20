const express = require('express');
const {
  getRideGroups,
  createRideGroup,
  joinRideGroup
} = require('../controllers/rideGroupController');

function createRideGroupRoutes() {
  const router = express.Router();

  router.get('/ride-groups', getRideGroups);
  router.post('/ride-groups', createRideGroup);
  router.post('/ride-groups/:id/join', joinRideGroup);

  return router;
}

module.exports = createRideGroupRoutes;
