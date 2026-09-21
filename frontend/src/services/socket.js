import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/index.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });
  }
  return socket;
}
