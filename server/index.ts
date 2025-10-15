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

// Connect Redis clients and attach adapter
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log('✅ Redis adapter connected for horizontal scaling');
}).catch(err => {
  console.warn('⚠️ Redis connection failed, using in-memory adapter:', err.message);
  // Set redisClient to null so GameManager skips Redis operations
  pubClient = null as any;
});

const PORT = process.env.PORT || 8080;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
// Serve shared folder for browser-compatible JS files
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Game manager instance with Redis client for horizontal scaling
const gameManager = new GameManager(io, pubClient);

// Pre-load AI model on server startup to avoid lag when first game starts
(async () => {
  try {
    await require('./Game').preloadTrainedAI();
  } catch (error) {
    // AI pre-load failed, games will use fallback AI
  }
})();

// Socket.IO connection handling
io.on('connection', (socket) => {

  socket.on('createRoom', async (callback) => {
    try {
      console.log('📥 createRoom event received from', socket.id);
      const roomCode = await gameManager.createRoom();
      console.log('✅ Room created:', roomCode);
      socket.join(roomCode);

      // Send initial game state to the creator
      const game = gameManager.getGame(roomCode);
      if (game) {
        socket.emit('gameState', game.getState());
      }

      console.log('📤 Sending createRoom response with code:', roomCode);
      callback({ success: true, roomCode });
    } catch (error) {
      console.error('❌ Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  socket.on('joinRoom', async ({ roomCode, username, ghostType }, callback) => {
    try {
      console.log('📥 joinRoom event received:', { roomCode, username, ghostType, socketId: socket.id });
      const result = await gameManager.joinRoom(roomCode, socket.id, username || 'Ghost', ghostType);
      console.log('📤 joinRoom result:', result);
      if (result.success) {
        socket.join(roomCode);

        // Send game state to all players in room
        const game = gameManager.getGame(roomCode);
        if (game) {
          io.to(roomCode).emit('gameState', game.getState());
        }
      }
      callback(result);
    } catch (error) {
      console.error('❌ Error joining room:', error);
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
      // Create a new game with the same players
      const oldPlayers = Array.from(game.getState().players);

      // Delete old game
      gameManager.deleteGame(roomCode);

      // Create new game with same room code
      const newGame = gameManager.createRoomWithCode(roomCode);

      // Re-add all players (keep them ready)
      oldPlayers.forEach(player => {
        newGame.addPlayer(player.socketId, player.username, player.ghostType);
        newGame.togglePlayerReady(player.socketId); // Set them as ready
      });

      // Immediately start the new game
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

// Start server
server.listen(PORT, () => {
  console.log('🚀 Server started on port', PORT);
});
