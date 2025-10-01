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
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
// Serve shared folder for browser-compatible JS files
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Game manager instance
const gameManager = new GameManager(io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('createRoom', (callback) => {
    const roomCode = gameManager.createRoom();
    socket.join(roomCode);
    console.log(`Room created: ${roomCode} by ${socket.id}`);

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
      console.log(`Player ${username || socket.id} joined room ${roomCode} as ${ghostType}`);

      // Send game state to all players in room
      const game = gameManager.getGame(roomCode);
      if (game) {
        io.to(roomCode).emit('gameState', game.getState());
      }
    }
    callback(result);
  });

  socket.on('playerInput', ({ roomCode, direction }) => {
    console.log(`Player input: ${socket.id} - ${direction} in room ${roomCode}`);
    const game = gameManager.getGame(roomCode);
    if (game) {
      game.handlePlayerInput(socket.id, direction);
    } else {
      console.log(`Game not found for room ${roomCode}`);
    }
  });

  socket.on('requestGameState', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (game) {
      socket.emit('gameState', game.getState());
    }
  });

  socket.on('startGame', ({ roomCode }) => {
    console.log(`Start game requested for room ${roomCode} by ${socket.id}`);
    const game = gameManager.getGame(roomCode);
    if (game) {
      console.log(`Game found. Players: ${game.getPlayerCount()}, Can start: ${game.canStart()}`);
      if (game.canStart()) {
        game.start();
        io.to(roomCode).emit('gameStarted');
        console.log(`Game started for room ${roomCode}`);
      } else {
        console.log(`Cannot start game. Already started: ${game.isStarted}`);
      }
    } else {
      console.log(`Game not found for room ${roomCode}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    gameManager.handleDisconnect(socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🎮 Ghost Squad server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} to play`);
});
