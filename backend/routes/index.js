const express = require('express');

const createHealthRoutes = require('./healthRoutes');
const createPlanRoutes = require('./planRoutes');
const createReportRoutes = require('./reportRoutes');
const createTransitRoutes = require('./transitRoutes');
const createRideGroupRoutes = require('./rideGroupRoutes');
const createFeedbackRoutes = require('./feedbackRoutes');
const createDemoRoutes = require('./demoRoutes');
const createAuthRoutes = require('./authRoutes');
const createStudentRoutes = require('./studentRoutes');

/**
 * Centralized API Router Aggregator.
 * Registers all domain routers cleanly and ensures routes are mounted exactly once.
 *
 * @param {import('socket.io').Server} [io] - Socket.IO instance for real-time broadcasts
 * @returns {express.Router}
 */
function createApiRouter(io) {
  const router = express.Router();

  // 1. Health check routes
  router.use(createHealthRoutes());

  // 2. Authentication routes
  router.use(createAuthRoutes());

  // 3. Student Context, Routines & Workflows
  router.use(createStudentRoutes());

  // 4. Multimodal Transit Planning routes
  router.use(createPlanRoutes());

  // 5. Disruption & Community Reports routes
  router.use(createReportRoutes(io));

  // 6. Transit Search routes
  router.use(createTransitRoutes());

  // 7. Travel Together / Carpooling routes
  router.use(createRideGroupRoutes());

  // 8. Student Feedback routes
  router.use(createFeedbackRoutes());

  // 9. Demo Reset routes
  router.use(createDemoRoutes(io));

  return router;
}

/**
 * Utility helper to introspect registered endpoints from an Express router.
 * Used for automated verification and route auditing.
 *
 * @param {express.Router} router
 * @returns {Array<{ method: string, path: string }>}
 */
function getRegisteredEndpoints(router) {
  const endpoints = [];

  function traverse(stack, basePath = '') {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
        for (const method of methods) {
          endpoints.push({
            method,
            path: basePath + layer.route.path
          });
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        traverse(layer.handle.stack, basePath);
      }
    }
  }

  if (router && router.stack) {
    traverse(router.stack);
  }

  return endpoints;
}

module.exports = createApiRouter;
module.exports.createApiRouter = createApiRouter;
module.exports.getRegisteredEndpoints = getRegisteredEndpoints;
