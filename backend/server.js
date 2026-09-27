const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const { db, closeConnection } = require('./db/database');
const { createApp } = require('./app');

// 1. Initialize HTTP Server
const server = http.createServer();

// 2. Initialize Socket.IO attached to HTTP server
const io = new Server(server, {
  cors: {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// 3. Attach Socket.IO real-time channels
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Student client connected: ${socket.id}`);

  socket.on('join_commute_channel', (data) => {
    const channel = data?.area || 'mumbai_general';
    socket.join(channel);
    console.log(`[Socket.IO] Socket ${socket.id} joined channel: ${channel}`);
    socket.emit('channel_joined', { channel, status: 'connected' });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Student client disconnected: ${socket.id}`);
  });
});

// 4. Create Express app with Socket.IO instance and attach to HTTP server
const app = createApp({ io });
server.on('request', app);

// 5. Graceful shutdown handler
let isShuttingDown = false;

function setupGracefulShutdown() {
  const handleSignal = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Shutdown] Received ${signal}. Initiating graceful shutdown...`);

    // Safety timeout in case open connections stall
    const forceExitTimer = setTimeout(() => {
      console.error('[Shutdown] Shutdown timed out (5000ms). Forcefully exiting process.');
      process.exit(1);
    }, 5000);
    forceExitTimer.unref();

    closeServer()
      .then(() => {
        console.log('[Shutdown] Graceful shutdown completed cleanly. Exiting.');
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Shutdown] Error during graceful shutdown:', err.message);
        process.exit(1);
      });
  };

  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
}

/**
 * Starts the HTTP and Socket.IO server.
 * Idempotent: avoids starting multiple listeners if already listening.
 *
 * @param {number} [port=config.port]
 * @param {string} [host=config.host]
 * @returns {Promise<http.Server>}
 */
async function startServer(port = config.port, host = config.host) {
  if (server.listening) {
    console.warn(`[Server] Server is already listening on ${host}:${port}`);
    return server;
  }

  return new Promise((resolve, reject) => {
    const errorHandler = (err) => {
      console.error('\n' + '='.repeat(60));
      console.error(' FATAL SERVER BOOTSTRAP ERROR');
      console.error('='.repeat(60));
      console.error(` Failed to bind to ${host}:${port}: ${err.message}`);
      console.error('='.repeat(60) + '\n');
      reject(err);
    };

    server.once('error', errorHandler);

    server.listen(port, host, () => {
      server.removeListener('error', errorHandler);

      console.log(`=======================================================`);
      console.log(` Smart Student Commute Companion Server Running`);
      console.log(` Host: ${host}`);
      console.log(` Port: ${port}`);
      console.log(` City: Mumbai Public Transit Network (GTFS)`);
      console.log(` Socket.IO: Ready for Live Student Reports`);
      console.log(` Environment: ${config.nodeEnv}`);
      console.log(` Gemini AI: ${config.geminiApiKey ? 'Configured (Active)' : 'Not configured (Deterministic fallback active)'}`);
      console.log(` Database: SQLite (${config.database.path})`);
      console.log(`=======================================================`);
      resolve(server);
    });
  });
}

/**
 * Cleanly closes the HTTP server, Socket.IO server, and database connection.
 *
 * @returns {Promise<void>}
 */
async function closeServer() {
  return new Promise((resolve) => {
    const finalize = () => {
      try {
        if (io) io.close();
      } catch (e) {}

      try {
        closeConnection();
      } catch (e) {}

      resolve();
    };

    if (server.listening) {
      server.close((err) => {
        if (err) {
          console.error('[Server] Error while closing HTTP server:', err.message);
        }
        finalize();
      });
    } else {
      finalize();
    }
  });
}

// Setup termination signal listeners
setupGracefulShutdown();

// 6. Only auto-start listener if executed directly as script (e.g. node server.js)
if (require.main === module) {
  startServer().catch(() => {
    process.exit(1);
  });
}

module.exports = {
  app,
  server,
  io,
  startServer,
  closeServer
};
