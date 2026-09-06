const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const createApiRouter = require('./routes/api');
const { db } = require('./db/database');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// CORS configuration
app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use(express.json());

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
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

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Smart Student Commute Companion Server Running`);
  console.log(` Port: ${PORT}`);
  console.log(` City: Mumbai Public Transit Network (GTFS)`);
  console.log(` Socket.IO: Ready for Live Student Reports`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=======================================================`);
});
