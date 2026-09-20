const path = require('path');
const config = require('./config');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const createApiRouter = require('./routes/api');
const { db } = require('./db/database');

const app = express();
const server = http.createServer(app);

// CORS configuration using centralized allowed origins
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Socket.IO real-time channels
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

// Mount API routes
app.use('/api', createApiRouter(io));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

server.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(` Smart Student Commute Companion Server Running`);
  console.log(` Port: ${config.port}`);
  console.log(` City: Mumbai Public Transit Network (GTFS)`);
  console.log(` Socket.IO: Ready for Live Student Reports`);
  console.log(` Environment: ${config.nodeEnv}`);
  console.log(` Gemini AI: ${config.geminiApiKey ? 'Configured (Active)' : 'Not configured (Deterministic fallback active)'}`);
  console.log(` Database: SQLite (${config.database.path})`);
  console.log(`=======================================================`);
});
