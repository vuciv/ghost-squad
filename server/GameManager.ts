import Game = require('./Game');
import { Server } from 'socket.io';

type GhostType = 'blinky' | 'pinky' | 'inky' | 'clyde';

class GameManager {
  private io: Server;
  private games: Map<string, Game>;
  private playerRooms: Map<string, string>;

  constructor(io: Server) {
    this.io = io;
    this.games = new Map();
    this.playerRooms = new Map();
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

  createRoom(): string {
    const roomCode = this.generateRoomCode();
    const game = new Game(roomCode, this.io);
    this.games.set(roomCode, game);

    // Clean up game after it ends
    setTimeout(() => {
      if (this.games.has(roomCode)) {
        this.games.delete(roomCode);
      }
    }, 3600000); // Clean up after 1 hour

    return roomCode;
  }

  joinRoom(roomCode: string, socketId: string, username: string, ghostType: GhostType): { success: boolean; error?: string } {
    const game = this.games.get(roomCode);

    if (!game) {
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
