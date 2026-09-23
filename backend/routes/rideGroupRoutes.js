const express = require('express');
const {
  getRideGroups,
  getRideGroup,
  createRideGroup,
  updateRideGroup,
  deleteRideGroup,
  joinRideGroup
} = require('../controllers/rideGroupController');
const {
  validate,
  createRideGroupSchema,
  updateRideGroupSchema,
  rideGroupFilterQuerySchema,
  idParamSchema
} = require('../validators');

function createRideGroupRoutes() {
  const router = express.Router();

  router.get('/ride-groups', validate({ query: rideGroupFilterQuerySchema }), getRideGroups);
  router.get('/ride-groups/:id', validate({ params: idParamSchema }), getRideGroup);
  router.post('/ride-groups', validate({ body: createRideGroupSchema }), createRideGroup);
  router.patch(
    '/ride-groups/:id',
    validate({ params: idParamSchema, body: updateRideGroupSchema }),
    updateRideGroup
  );
  router.delete(
    '/ride-groups/:id',
    validate({ params: idParamSchema }),
    deleteRideGroup
  );
  router.post('/ride-groups/:id/join', validate({ params: idParamSchema }), joinRideGroup);

  return router;
}

module.exports = createRideGroupRoutes;
