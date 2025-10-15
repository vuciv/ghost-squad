import Game = require('./Game');
import { Server } from 'socket.io';
import { RedisClientType } from 'redis';

type GhostType = 'blinky' | 'pinky' | 'inky' | 'clyde';

class GameManager {
  private io: Server;
  private games: Map<string, Game>;
  private playerRooms: Map<string, string>;
  private redisClient: any; // RedisClientType - using any to avoid complex type issues
  private instanceId: string;

  constructor(io: Server, redisClient?: any) {
    this.io = io;
    this.games = new Map();
    this.playerRooms = new Map();
    this.redisClient = redisClient || null;
    // Generate unique instance ID for this server
    this.instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.games.has(code));
    return code;
  }

  async createRoom(logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO'): Promise<string> {
    console.log('📝 createRoom called');
    const roomCode = this.generateRoomCode();
    console.log('🎲 Generated room code:', roomCode);

    const game = new Game(roomCode, this.io);
    console.log('🎮 Game instance created');

    this.games.set(roomCode, game);
    console.log('📍 Game stored in map, total games:', this.games.size);

    // Set cleanup callback for when game ends
    game.setOnGameEnd(async (code) => {
      console.log('🧹 Game ended, cleaning up:', code);
      await this.cleanupGame(code);
    });

    // Store room metadata in Redis so other instances can discover it (optional, non-blocking)
    if (this.redisClient) {
      setImmediate(() => {
        this.redisClient?.set?.(
          `room:${roomCode}`,
          JSON.stringify({
            instanceId: this.instanceId,
            createdAt: Date.now(),
            playerCount: 0
          }),
          {
            EX: 3600 // Expire after 1 hour
          }
        ).catch((err: any) => console.warn('Failed to store room in Redis:', err));
      });
    }

    // Fallback cleanup after 1 hour (in case game never ends or callback fails)
    setTimeout(() => {
      if (this.games.has(roomCode)) {
        this.cleanupGame(roomCode).catch(err =>
          console.warn('Failed to cleanup game:', err)
        );
      }
    }, 3600000); // Clean up after 1 hour

    console.log('✅ createRoom complete, returning:', roomCode);
    return roomCode;
  }

  createRoomWithCode(roomCode: string): Game {
    const game = new Game(roomCode, this.io);
    this.games.set(roomCode, game);

    // Set cleanup callback for when game ends
    game.setOnGameEnd(async (code) => {
      await this.cleanupGame(code);
    });

    return game;
  }

  private async cleanupGame(roomCode: string): Promise<void> {
    // Remove game from memory immediately
    this.games.delete(roomCode);

    // Remove all players in this room from playerRooms
    for (const [socketId, code] of this.playerRooms.entries()) {
      if (code === roomCode) {
        this.playerRooms.delete(socketId);
      }
    }

    // Clean up Redis room metadata (non-blocking, optional)
    if (this.redisClient) {
      setImmediate(() => {
        this.redisClient?.del?.(`room:${roomCode}`)
          .catch((err: any) => console.warn('Failed to delete room from Redis:', err));
      });
    }
  }

  deleteGame(roomCode: string): void {
    this.games.delete(roomCode);
  }

  async joinRoom(roomCode: string, socketId: string, username: string, ghostType: GhostType): Promise<{ success: boolean; error?: string; requiresRedirect?: boolean }> {
    const game = this.games.get(roomCode);

    // Check if room exists locally
    if (!game) {
      // For now, skip Redis checks on local dev - they'll fail anyway
      // In production with proper Redis, add async room discovery here
      return { success: false, error: 'Room not found' };
    }

    if (game.isStarted) {
      return { success: false, error: 'Game already started' };
    }

    if (game.isFull()) {
      return { success: false, error: 'Room is full' };
    }

    if (game.isGhostTaken(ghostType)) {
      return { success: false, error: 'Ghost already taken' };
    }

    game.addPlayer(socketId, username, ghostType);
    this.playerRooms.set(socketId, roomCode);

    // Update player count in Redis (non-blocking, optional)
    if (this.redisClient) {
      setImmediate(() => {
        this.redisClient?.get?.(`room:${roomCode}`)
          .then((roomData: any) => {
            if (roomData) {
              const room = JSON.parse(roomData);
              room.playerCount = game.getPlayerCount();
              return this.redisClient?.set(`room:${roomCode}`, JSON.stringify(room), { EX: 3600 });
            }
          })
          .catch((err: any) => console.warn('Failed to update room in Redis:', err));
      });
    }

    return { success: true };
  }

  getGame(roomCode: string): Game | undefined {
    return this.games.get(roomCode);
  }

  handleDisconnect(socketId: string): void {
    const roomCode = this.playerRooms.get(socketId);
    if (roomCode) {
      const game = this.games.get(roomCode);
      if (game) {
        game.removePlayer(socketId);
        this.io.to(roomCode).emit('playerLeft', { socketId });

        // If no players left, clean up game
        if (game.getPlayerCount() === 0) {
          this.games.delete(roomCode);
        }
      }
      this.playerRooms.delete(socketId);
    }
  }
}

export = GameManager;
