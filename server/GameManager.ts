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

  private setupGameEndCallback(game: Game): void {
    game.setOnGameEnd(async (code) => {
      await this.cleanupGame(code);
    });
  }

  async createRoom(): Promise<string> {
    const roomCode = this.generateRoomCode();
    const game = new Game(roomCode, this.io, this.redisClient);

    this.games.set(roomCode, game);
    this.setupGameEndCallback(game);

    if (this.redisClient) {
      setImmediate(() => {
        this.redisClient?.set?.(
          `room:${roomCode}`,
          JSON.stringify({
            instanceId: this.instanceId,
            createdAt: Date.now(),
            playerCount: 0
          }),
          { EX: 3600 }
        ).catch(() => {});
      });
    }

    setTimeout(() => {
      if (this.games.has(roomCode)) {
        this.cleanupGame(roomCode).catch(() => {});
      }
    }, 3600000);

    return roomCode;
  }

  createRoomWithCode(roomCode: string): Game {
    const game = new Game(roomCode, this.io, this.redisClient);
    this.games.set(roomCode, game);
    this.setupGameEndCallback(game);
    return game;
  }

  private async cleanupGame(roomCode: string): Promise<void> {
    this.games.delete(roomCode);

    for (const [socketId, code] of this.playerRooms.entries()) {
      if (code === roomCode) {
        this.playerRooms.delete(socketId);
      }
    }

    if (this.redisClient) {
      setImmediate(() => {
        this.redisClient?.del?.(`room:${roomCode}`).catch(() => {});
      });
    }
  }

  deleteGame(roomCode: string): void {
    this.games.delete(roomCode);
  }

  async joinRoom(roomCode: string, socketId: string, username: string, ghostType: GhostType, aiType?: string): Promise<{ success: boolean; error?: string }> {
    let game = this.games.get(roomCode);

    if (!game) {
      if (this.redisClient) {
        try {
          const savedState = await this.redisClient.get(`gameState:${roomCode}`);
          if (savedState) {
            game = new Game(roomCode, this.io, this.redisClient);
            await game.restoreGameState(JSON.parse(savedState));
            this.games.set(roomCode, game);
            this.setupGameEndCallback(game);
          }
        } catch (err) {
          // Redis load failed, proceed to error
        }
      }

      if (!game) {
        return { success: false, error: 'Room not found' };
      }
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

    if (aiType && !game.isStarted) {
      game.setAIType(aiType);
    }

    game.addPlayer(socketId, username, ghostType);
    this.playerRooms.set(socketId, roomCode);

    if (this.redisClient) {
      setImmediate(() => {
        this.redisClient?.get?.(`room:${roomCode}`)
          .then((roomData: any) => {
            if (roomData) {
              const room = JSON.parse(roomData);
              room.playerCount = game!.getPlayerCount();
              return this.redisClient?.set(`room:${roomCode}`, JSON.stringify(room), { EX: 3600 });
            }
          })
          .catch(() => {});
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
