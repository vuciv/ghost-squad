import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import path from 'path';
import GameManager = require('./GameManager');

const app = express();
const server = http.createServer(app);

// Redis setup for horizontal scaling
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  perMessageDeflate: false,
  transports: ['websocket'],
  pingTimeout: 60000,
  pingInterval: 20000,
  maxHttpBufferSize: 1e4
});

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
}).catch(err => {
  pubClient = null as any;
});

const PORT = process.env.PORT || 8080;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
// Serve shared folder for browser-compatible JS files
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Game manager instance with Redis client for horizontal scaling
const gameManager = new GameManager(io, pubClient);

require('./Game').preloadTrainedAI().catch(() => {});

// Socket.IO connection handling
io.on('connection', (socket) => {

  socket.on('createRoom', async ({ username }, callback) => {
    try {
      const result = await gameManager.createRoom(socket.id, username || 'Ghost');
      socket.join(result.roomCode);

      const game = gameManager.getGame(result.roomCode);
      if (game) {
        socket.emit('gameState', game.getState());
      }

      callback({ success: true, roomCode: result.roomCode, assignedGhost: result.assignedGhost });
    } catch (error) {
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  socket.on('joinRoom', async ({ roomCode, username, ghostType, aiType }, callback) => {
    try {
      const result = await gameManager.joinRoom(roomCode, socket.id, username || 'Ghost', ghostType, aiType);
      if (result.success) {
        socket.join(roomCode);

        const game = gameManager.getGame(roomCode);
        if (game) {
          io.to(roomCode).emit('gameState', game.getState());
        }
      }
      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to join room' });
    }
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
        // Emit gameStarted first so clients can prepare
        io.to(roomCode).emit('gameStarted');
        // Small delay to allow clients to initialize Phaser
        setTimeout(() => {
          game.start();
        }, 100);
      }
    }
  });

  socket.on('toggleReady', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (game) {
      game.togglePlayerReady(socket.id);
      // Send updated game state to all players
      io.to(roomCode).emit('gameState', game.getState());
    }
  });

  socket.on('restartGame', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (game) {
      const oldPlayers = Array.from(game.getState().players);
      const aiType = game.getAIType();

      gameManager.deleteGame(roomCode);
      const newGame = gameManager.createRoomWithCode(roomCode);

      newGame.setAIType(aiType);

      oldPlayers.forEach(player => {
        newGame.addPlayer(player.socketId, player.username, player.ghostType);
        newGame.togglePlayerReady(player.socketId);
      });

      io.to(roomCode).emit('gameRestarted');
      setTimeout(() => {
        newGame.start();
      }, 100);
    }
  });

  socket.on('disconnect', () => {
    gameManager.handleDisconnect(socket.id);
  });
});

server.listen(PORT);
