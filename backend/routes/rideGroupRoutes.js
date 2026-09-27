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
const { optionalAuthenticate, enforceRideGroupOwnership } = require('../middleware/authMiddleware');

function createRideGroupRoutes() {
  const router = express.Router();

  router.get('/ride-groups', validate({ query: rideGroupFilterQuerySchema }), getRideGroups);
  router.get('/ride-groups/:id', validate({ params: idParamSchema }), getRideGroup);
  router.post('/ride-groups', optionalAuthenticate, validate({ body: createRideGroupSchema }), createRideGroup);
  router.patch(
    '/ride-groups/:id',
    optionalAuthenticate,
    validate({ params: idParamSchema, body: updateRideGroupSchema }),
    enforceRideGroupOwnership,
    updateRideGroup
  );
  router.delete(
    '/ride-groups/:id',
    optionalAuthenticate,
    validate({ params: idParamSchema }),
    enforceRideGroupOwnership,
    deleteRideGroup
  );
  router.post('/ride-groups/:id/join', optionalAuthenticate, validate({ params: idParamSchema }), joinRideGroup);

  return router;
}

module.exports = createRideGroupRoutes;
