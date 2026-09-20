const express = require('express');
const cors = require('cors');
const config = require('./config');
const createApiRouter = require('./routes');
const { getHealth } = require('./controllers/healthController');

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

  // 5. Centralized Error Handler
  app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message
    });
  });

  return app;
}

module.exports = { createApp };
