const express = require('express');
const cors = require('cors');
const config = require('./config');
const createApiRouter = require('./routes');
const { getHealth } = require('./controllers/healthController');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/**
 * Creates and configures the Express application instance.
 * Separates application setup from network listener lifecycle.
 *
 * @param {object} [options]
 * @param {import('socket.io').Server} [options.io] - Socket.IO server instance for real-time broadcasts
 * @returns {express.Application} Configured Express application
 */
function createApp(options = {}) {
  const app = express();
  const io = options.io || null;

  // 1. CORS configuration using centralized allowed origins
  app.use(cors({
    origin: config.allowedOrigins,
    credentials: true
  }));

  // 2. Request body parsing
  app.use(express.json());

  // 3. Health check endpoints (root & API)
  app.get('/health', getHealth);

  // 4. Mount API routes
  app.use('/api', createApiRouter(io));

  // 5. Hook for injecting testing routes or pre-404 middleware
  if (typeof options.beforeNotFound === 'function') {
    options.beforeNotFound(app);
  }

  // 6. 404 Catch-all for unmatched routes
  app.use(notFoundHandler);

  // 7. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
