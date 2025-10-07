import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import GameManager = require('./GameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Performance optimizations for production
  perMessageDeflate: {
    threshold: 1024, // Only compress messages larger than 1KB
    zlibDeflateOptions: {
      chunkSize: 8 * 1024
    }
  },
  httpCompression: {
    threshold: 1024
  },
  transports: ['websocket', 'polling'],
  upgradeTimeout: 10000,
  pingTimeout: 30000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6
});

const PORT = process.env.PORT || 8080;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
// Serve shared folder for browser-compatible JS files
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Game manager instance
const gameManager = new GameManager(io);

// Socket.IO connection handling
io.on('connection', (socket) => {

  socket.on('createRoom', (callback) => {
    const roomCode = gameManager.createRoom();
    socket.join(roomCode);

    // Send initial game state to the creator
    const game = gameManager.getGame(roomCode);
    if (game) {
      socket.emit('gameState', game.getState());
    }

    callback({ success: true, roomCode });
  });

  socket.on('joinRoom', ({ roomCode, username, ghostType }, callback) => {
    const result = gameManager.joinRoom(roomCode, socket.id, username || 'Ghost', ghostType);
    if (result.success) {
      socket.join(roomCode);

      // Send game state to all players in room
      const game = gameManager.getGame(roomCode);
      if (game) {
        io.to(roomCode).emit('gameState', game.getState());
      }
    }
    callback(result);
  });

  socket.on('playerInput', ({ roomCode, direction }) => {
    const game = gameManager.getGame(roomCode);
    if (game) {
      game.handlePlayerInput(socket.id, direction);
    }
  });

  socket.on('requestGameState', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (game) {
      socket.emit('gameState', game.getState());
    }
  });

  socket.on('startGame', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (game) {
      if (game.canStart()) {
        game.start();
        io.to(roomCode).emit('gameStarted');
      }
    }
  });

  socket.on('disconnect', () => {
    gameManager.handleDisconnect(socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  // Server started
});
