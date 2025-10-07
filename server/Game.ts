import CONSTANTS = require('../shared/constants');
import { MAZE_LAYOUT, STARTING_POSITIONS, TELEPORT_POINTS, Position } from '../shared/maze';
import PacmanAI = require('./PacmanAI');
import { Server } from 'socket.io';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type GhostType = 'blinky' | 'pinky' | 'inky' | 'clyde';
type PlayerState = 'active' | 'frightened' | 'respawning';
type GameMode = 'chase' | 'frightened' | 'game_over';

interface Player {
  socketId: string;
  username: string;
  ghostType: GhostType;
  position: Position;
  direction: Direction;
  state: PlayerState;
  respawnTime: number | null;
}

class Game {
  private roomCode: string;
  private io: Server;
  private players: Map<string, Player>;
  isStarted: boolean;
  private gameLoop: NodeJS.Timeout | null;

  // Game state
  private mode: GameMode;
  private score: number;
  private captureCount: number;
  private dots: Position[];
  private powerPellets: Position[];

  // Pacman AI
  private pacman: PacmanAI;
  private pacmanPosition: Position;
  private pacmanDirection: Direction;
  private pacmanEmote: string;
  private emoteTimer: NodeJS.Timeout | null;
  private previousPacmanPosition: Position;

  // Personality tracking
  private lastDotsEaten: number;
  private dotsEatenStreak: number;
  private lastGhostEaten: number;
  private previousMinGhostDist: number;

  // Timing
  private frightenedTimer: NodeJS.Timeout | null;
  private respawnTimers: Map<string, NodeJS.Timeout>;

  // Collision tracking
  private previousPlayerPositions: Map<string, Position>;

  // Delta tracking for efficient network updates
  private lastBroadcastState: {
    score: number;
    captureCount: number;
    mode: GameMode;
    dotsCount: number;
    pelletsCount: number;
  };
  private dotsChanged: boolean;
  private pelletsChanged: boolean;

  constructor(roomCode: string, io: Server) {
    this.roomCode = roomCode;
    this.io = io;
    this.players = new Map();
    this.isStarted = false;
    this.gameLoop = null;

    // Game state
    this.mode = CONSTANTS.MODES.CHASE as GameMode;
    this.score = 0;
    this.captureCount = 0;
    this.dots = this.initializeDots();
    this.powerPellets = this.initializePowerPellets();

    // Pacman AI
    this.pacman = new PacmanAI(STARTING_POSITIONS.pacman);
    this.pacmanPosition = { ...STARTING_POSITIONS.pacman };
    this.previousPacmanPosition = { ...STARTING_POSITIONS.pacman };
    this.pacmanDirection = 'RIGHT';
    this.pacmanEmote = '';
    this.emoteTimer = null;

    // Personality tracking
    this.lastDotsEaten = 0;
    this.dotsEatenStreak = 0;
    this.lastGhostEaten = 0;
    this.previousMinGhostDist = Infinity;

    // Timing
    this.frightenedTimer = null;
    this.respawnTimers = new Map();

    // Collision tracking
    this.previousPlayerPositions = new Map();

    // Initialize delta tracking
    this.lastBroadcastState = {
      score: 0,
      captureCount: 0,
      mode: this.mode,
      dotsCount: this.dots.length,
      pelletsCount: this.powerPellets.length
    };
    this.dotsChanged = false;
    this.pelletsChanged = false;
  }


  private initializeDots(): Position[] {
    const dots: Position[] = [];
    const mazeHeight = MAZE_LAYOUT.length;
    const mazeWidth = MAZE_LAYOUT[0].length;
    for (let y = 0; y < mazeHeight; y++) {
      for (let x = 0; x < mazeWidth; x++) {
        if (MAZE_LAYOUT[y][x] === 1) {
          dots.push({ x, y });
        }
      }
    }
    return dots;
  }

  private initializePowerPellets(): Position[] {
    const pellets: Position[] = [];
    const mazeHeight = MAZE_LAYOUT.length;
    const mazeWidth = MAZE_LAYOUT[0].length;
    for (let y = 0; y < mazeHeight; y++) {
      for (let x = 0; x < mazeWidth; x++) {
        if (MAZE_LAYOUT[y][x] === 2) {
          pellets.push({ x, y });
        }
      }
    }
    return pellets;
  }

  addPlayer(socketId: string, username: string, ghostType: GhostType): void {
    const position = { ...STARTING_POSITIONS[ghostType] };
    this.players.set(socketId, {
      socketId,
      username,
      ghostType,
      position,
      direction: 'UP',
      state: 'active',
      respawnTime: null
    });
    // Initialize previous position
    this.previousPlayerPositions.set(socketId, { ...position });
  }

  removePlayer(socketId: string): void {
    this.players.delete(socketId);
    this.previousPlayerPositions.delete(socketId);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  isGhostTaken(ghostType: GhostType): boolean {
    for (const player of this.players.values()) {
      if (player.ghostType === ghostType) {
        return true;
      }
    }
    return false;
  }

  isFull(): boolean {
    return this.players.size >= 4;
  }

  canStart(): boolean {
    return this.players.size > 0 && !this.isStarted;
  }

  start(): void {
    this.isStarted = true;
    this.gameLoop = setInterval(() => this.update(), CONSTANTS.TICK_RATE);
  }

  stop(): void {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  private update(): void {
    // Store previous positions BEFORE movement
    this.previousPacmanPosition = { ...this.pacmanPosition };
    for (const player of this.players.values()) {
      this.previousPlayerPositions.set(player.socketId, { ...player.position });
    }

    // Check collisions before movement (in case they're already on same tile)
    this.checkCollisions();

    // Move Pacman (includes AI update inside)
    this.movePacman();

    // Move players
    for (const player of this.players.values()) {
      if (player.state === 'active' || player.state === 'frightened') {
        this.moveGhost(player);
      }
    }

    // Check collisions after movement (including position swaps)
    this.checkCollisions();

    // Check win/lose conditions
    this.checkGameOver();

    // Update Pacman emotes
    this.updatePacmanEmote();

    // Broadcast state
    this.broadcastState();
  }

  private movePacman(): void {

    // Update Pacman AI decision
    const ghosts = Array.from(this.players.values())
      .filter(p => p.state === 'active' || p.state === 'frightened')
      .map(p => ({
        position: p.position,
        direction: p.direction,
        isFrightened: p.state === 'frightened'
      }));


    const isFrightened = this.mode === CONSTANTS.MODES.FRIGHTENED;
    const previousDirection = this.pacmanDirection;
    this.pacmanDirection = this.pacman.update(
      this.dots,
      this.powerPellets,
      ghosts,
      isFrightened
    );


    const dir = CONSTANTS.DIRECTIONS[this.pacmanDirection];
    if (!dir) return;

    // Calculate target tile
    const targetX = this.pacmanPosition.x + dir.x;
    const targetY = this.pacmanPosition.y + dir.y;

    // Only move if target is walkable
    if (this.isWalkable(targetX, targetY)) {
      this.pacmanPosition.x = targetX;
      this.pacmanPosition.y = targetY;

      // Check for teleportation
      const teleportExit = this.checkTeleport(this.pacmanPosition);
      if (teleportExit) {
        this.pacmanPosition.x = teleportExit.x;
        this.pacmanPosition.y = teleportExit.y;
      }

      this.pacman.setPosition(this.pacmanPosition.x, this.pacmanPosition.y);

      // Check dot collision
      this.checkDotCollision(this.pacmanPosition.x, this.pacmanPosition.y);

      // Check power pellet collision
      this.checkPowerPelletCollision(this.pacmanPosition.x, this.pacmanPosition.y);
    }
  }

  private moveGhost(player: Player): void {
    const dir = CONSTANTS.DIRECTIONS[player.direction];
    if (!dir) return;

    // Calculate target tile
    const targetX = player.position.x + dir.x;
    const targetY = player.position.y + dir.y;

    // Only move if target is walkable
    if (this.isWalkable(targetX, targetY)) {
      player.position.x = targetX;
      player.position.y = targetY;

      // Check for teleportation
      const teleportExit = this.checkTeleport(player.position);
      if (teleportExit) {
        player.position.x = teleportExit.x;
        player.position.y = teleportExit.y;
      }
    }
  }

  private isWalkable(x: number, y: number): boolean {
    const mazeHeight = MAZE_LAYOUT.length;
    const mazeWidth = MAZE_LAYOUT[0].length;
    if (x < 0 || x >= mazeWidth || y < 0 || y >= mazeHeight) {
      return false;
    }
    const cell = MAZE_LAYOUT[y][x];
    // Walkable: dots (1), power pellets (2), or ghost house (3)
    return cell !== 0;
  }

  // Check if a position is a teleport entry point and return the exit position
  private checkTeleport(pos: Position): Position | null {
    for (const teleport of TELEPORT_POINTS) {
      if (pos.x === teleport.entry.x && pos.y === teleport.entry.y) {
        return teleport.exit;
      }
    }
    return null;
  }

  private checkDotCollision(x: number, y: number): void {
    const dotIndex = this.dots.findIndex(dot => dot.x === x && dot.y === y);
    if (dotIndex !== -1) {
      this.dots.splice(dotIndex, 1);
      this.score += CONSTANTS.DOT_VALUE;
      this.dotsChanged = true;
    }
  }

  private checkPowerPelletCollision(x: number, y: number): void {
    const pelletIndex = this.powerPellets.findIndex(p => p.x === x && p.y === y);
    if (pelletIndex !== -1) {
      this.powerPellets.splice(pelletIndex, 1);
      this.score += CONSTANTS.POWER_PELLET_VALUE;
      this.pelletsChanged = true;
      this.activateFrightenedMode();
    }
  }

  private activateFrightenedMode(): void {
    this.mode = CONSTANTS.MODES.FRIGHTENED as GameMode;

    // Pacman just ate power pellet - power up!
    const powerUpEmotes = ['😈', '💪', '🔥', '😤', '🎯'];
    this.setPacmanEmote(powerUpEmotes[Math.floor(Math.random() * powerUpEmotes.length)], 2500);

    // Update all player states
    for (const player of this.players.values()) {
      if (player.state === 'active') {
        player.state = 'frightened';
      }
    }

    // Clear existing timer
    if (this.frightenedTimer) {
      clearTimeout(this.frightenedTimer);
    }

    // Set timer to end frightened mode
    this.frightenedTimer = setTimeout(() => {
      this.mode = CONSTANTS.MODES.CHASE as GameMode;
      for (const player of this.players.values()) {
        if (player.state === 'frightened') {
          player.state = 'active';
        }
      }
    }, CONSTANTS.FRIGHTENED_DURATION);
  }

  private checkCollisions(): void {
    for (const player of this.players.values()) {
      if (player.state !== 'active' && player.state !== 'frightened') continue;

      let collisionDetected = false;

      // Check 1: Are they on the exact same tile now?
      if (player.position.x === this.pacmanPosition.x &&
          player.position.y === this.pacmanPosition.y) {
        collisionDetected = true;
      }

      // Check 2: Did they swap positions (pass through each other)?
      const playerPrevPos = this.previousPlayerPositions.get(player.socketId);
      if (playerPrevPos) {
        // Ghost moved FROM where Pac-Man is now, TO where Pac-Man was
        const swapped =
          playerPrevPos.x === this.pacmanPosition.x &&
          playerPrevPos.y === this.pacmanPosition.y &&
          player.position.x === this.previousPacmanPosition.x &&
          player.position.y === this.previousPacmanPosition.y;

        if (swapped) {
          collisionDetected = true;
        }
      }

      if (collisionDetected) {

        if (this.mode === CONSTANTS.MODES.FRIGHTENED) {
          this.respawnGhost(player);
        } else {
          this.ghostCapturedPacman(player);
        }
      }
    }
  }

  private respawnGhost(player: Player): void {
    player.state = 'respawning';
    player.position = { ...STARTING_POSITIONS.ghostHouse };

    // Pacman ate a ghost - celebration!
    const ateGhostEmotes = ['😋', '🤑', '😎', '🍔', '💪'];
    this.setPacmanEmote(ateGhostEmotes[Math.floor(Math.random() * ateGhostEmotes.length)], 2000);
    this.lastGhostEaten = Date.now();

    const timer = setTimeout(() => {
      player.state = this.mode === CONSTANTS.MODES.FRIGHTENED ? 'frightened' : 'active';
      player.position = { ...STARTING_POSITIONS[player.ghostType] };
      this.respawnTimers.delete(player.socketId);
    }, CONSTANTS.RESPAWN_DELAY);

    this.respawnTimers.set(player.socketId, timer);
  }

  private ghostCapturedPacman(capturer: Player): void {
    // Count nearby ghosts for multiplier
    let nearbyCount = 0;
    for (const player of this.players.values()) {
      const distance = Math.abs(player.position.x - this.pacmanPosition.x) +
                      Math.abs(player.position.y - this.pacmanPosition.y);
      if (distance < 3) nearbyCount++;
    }

    const points = CONSTANTS.GHOST_CAPTURE_BASE_SCORE *
                   Math.pow(CONSTANTS.MULTIPLAYER_BONUS_MULTIPLIER, nearbyCount - 1);
    this.score += Math.floor(points);
    this.captureCount++;

    // Reset Pacman position
    this.pacmanPosition = { ...STARTING_POSITIONS.pacman };
    this.pacman.setPosition(this.pacmanPosition.x, this.pacmanPosition.y);

    // Pacman got caught - sad emote
    this.setPacmanEmote('😵', 2000);
  }

  private updatePacmanEmote(): void {
    // Don't override existing emotes
    if (this.emoteTimer) return;

    // Calculate ghost distances and context
    let minGhostDist = Infinity;
    let activeGhostCount = 0;
    let frightenedGhostCount = 0;
    const ghostDistances: number[] = [];

    for (const player of this.players.values()) {
      if (player.state === 'active') {
        const dist = Math.abs(player.position.x - this.pacmanPosition.x) +
                    Math.abs(player.position.y - this.pacmanPosition.y);
        minGhostDist = Math.min(minGhostDist, dist);
        ghostDistances.push(dist);
        activeGhostCount++;
      } else if (player.state === 'frightened') {
        frightenedGhostCount++;
      }
    }

    // Track dots eaten for streak detection
    const currentDotsRemaining = this.dots.length;
    if (this.lastDotsEaten > currentDotsRemaining) {
      this.dotsEatenStreak++;
    } else {
      this.dotsEatenStreak = 0;
    }
    this.lastDotsEaten = currentDotsRemaining;

    // Calculate closest power pellet distance
    let minPelletDist = Infinity;
    for (const pellet of this.powerPellets) {
      const dist = Math.abs(pellet.x - this.pacmanPosition.x) +
                  Math.abs(pellet.y - this.pacmanPosition.y);
      minPelletDist = Math.min(minPelletDist, dist);
    }

    // Count ghosts in different directions (for surrounded detection)
    const ghostDirections = new Set<string>();
    for (const player of this.players.values()) {
      if (player.state === 'active') {
        const dx = player.position.x - this.pacmanPosition.x;
        const dy = player.position.y - this.pacmanPosition.y;
        if (Math.abs(dx) > Math.abs(dy)) {
          ghostDirections.add(dx > 0 ? 'right' : 'left');
        } else {
          ghostDirections.add(dy > 0 ? 'down' : 'up');
        }
      }
    }

    // PRIORITY 1: Victory dance (very few dots left)
    if (this.dots.length < 10 && Math.random() < 0.05) {
      const victory = ['🎉', '🥳', '🏆', '💃', '🎊'];
      this.setPacmanEmote(victory[Math.floor(Math.random() * victory.length)], 2000);
      return;
    }

    // PRIORITY 2: Surrounded/trapped (multiple ghosts close, different directions)
    if (ghostDirections.size >= 3 && minGhostDist < 8 && Math.random() < 0.08) {
      const trapped = ['😨', '😰', '🙏', '😭', '💀'];
      this.setPacmanEmote(trapped[Math.floor(Math.random() * trapped.length)], 1500);
      return;
    }

    // PRIORITY 3: Close call (ghost was close but moved away)
    if (this.previousMinGhostDist < 4 && minGhostDist > 7 && minGhostDist < 12 && Math.random() < 0.15) {
      const relief = ['😅', '😰', '🥵', '💦'];
      this.setPacmanEmote(relief[Math.floor(Math.random() * relief.length)], 1500);
      this.previousMinGhostDist = minGhostDist;
      return;
    }
    this.previousMinGhostDist = minGhostDist;

    // PRIORITY 4: Chasing frightened ghosts (in frightened mode)
    if (this.mode === CONSTANTS.MODES.FRIGHTENED && frightenedGhostCount > 0 && Math.random() < 0.01) {
      const hunting = ['🏃', '🤤', '😋', '🎯'];
      this.setPacmanEmote(hunting[Math.floor(Math.random() * hunting.length)], 1500);
      return;
    }

    // PRIORITY 5: Just ate ghost recently (within last 3 seconds)
    if (Date.now() - this.lastGhostEaten < 3000 && Math.random() < 0.02) {
      const proud = ['😎', '💪', '🤑'];
      this.setPacmanEmote(proud[Math.floor(Math.random() * proud.length)], 1500);
      return;
    }

    // PRIORITY 6: Near power pellet (wants it!)
    if (minPelletDist < 4 && minPelletDist > 0 && this.mode !== CONSTANTS.MODES.FRIGHTENED && Math.random() < 0.015) {
      const eyeing = ['👀', '👁️', '🤔'];
      this.setPacmanEmote(eyeing[Math.floor(Math.random() * eyeing.length)], 1200);
      return;
    }

    // PRIORITY 7: Eating streak (eating lots of dots quickly)
    if (this.dotsEatenStreak > 5 && Math.random() < 0.01) {
      const munching = ['🤤', '😋', '😊', '🍔'];
      this.setPacmanEmote(munching[Math.floor(Math.random() * munching.length)], 1500);
      return;
    }

    // PRIORITY 8: Low dots remaining (getting close to winning)
    if (this.dots.length < 30 && this.dots.length > 10 && Math.random() < 0.008) {
      const almostDone = ['🎉', '🏁', '💯'];
      this.setPacmanEmote(almostDone[Math.floor(Math.random() * almostDone.length)], 2000);
      return;
    }

    // PRIORITY 9: Very scared (ghost very close)
    if (minGhostDist < 3 && activeGhostCount > 0 && Math.random() < 0.03) {
      const terrified = ['😱', '💀', '🏃', '💨'];
      this.setPacmanEmote(terrified[Math.floor(Math.random() * terrified.length)], 1000);
      return;
    }

    // PRIORITY 10: Scared (ghost close)
    if (minGhostDist < 5 && minGhostDist >= 3 && activeGhostCount > 0 && Math.random() < 0.02) {
      const scared = ['😱', '😰', '🏃'];
      this.setPacmanEmote(scared[Math.floor(Math.random() * scared.length)], 1200);
      return;
    }

    // PRIORITY 11: Nervous (ghost nearby)
    if (minGhostDist < 10 && minGhostDist >= 5 && activeGhostCount > 0 && Math.random() < 0.01) {
      const nervous = ['😰', '😅', '👀', '😬'];
      this.setPacmanEmote(nervous[Math.floor(Math.random() * nervous.length)], 1500);
      return;
    }

    // PRIORITY 12: Confident (high score)
    if (this.score > 300 && Math.random() < 0.003) {
      const confident = ['💪', '😤', '🔥', '⚡', '👑'];
      this.setPacmanEmote(confident[Math.floor(Math.random() * confident.length)], 2000);
      return;
    }

    // PRIORITY 13: Taunting (far away from danger)
    if (minGhostDist > 12 && Math.random() < 0.005) {
      const taunts = ['😎', '🤪', '😏', '😝', '🥱', '💅'];
      this.setPacmanEmote(taunts[Math.floor(Math.random() * taunts.length)], 3000);
      return;
    }
  }

  private setPacmanEmote(emote: string, duration: number): void {
    this.pacmanEmote = emote;

    if (this.emoteTimer) {
      clearTimeout(this.emoteTimer);
    }

    this.emoteTimer = setTimeout(() => {
      this.pacmanEmote = '';
      this.emoteTimer = null;
    }, duration);
  }

  private checkGameOver(): void {
    if (this.captureCount >= CONSTANTS.CAPTURES_TO_WIN) {
      this.mode = CONSTANTS.MODES.GAME_OVER as GameMode;
      this.stop();
      this.io.to(this.roomCode).emit('gameOver', {
        winner: 'ghosts',
        score: this.score
      });
    } else if (this.dots.length === 0) {
      this.mode = CONSTANTS.MODES.GAME_OVER as GameMode;
      this.stop();
      this.io.to(this.roomCode).emit('gameOver', {
        winner: 'pacman',
        score: this.score
      });
    }
  }

  handlePlayerInput(socketId: string, direction: Direction): void {
    const player = this.players.get(socketId);
    if (player && (player.state === 'active' || player.state === 'frightened')) {
      player.direction = direction;
    }
  }

  getState() {
    return {
      mode: this.mode,
      score: this.score,
      captureCount: this.captureCount,
      dots: this.dots,
      powerPellets: this.powerPellets,
      pacman: {
        position: this.pacmanPosition,
        direction: this.pacmanDirection,
        emote: this.pacmanEmote,
        debugInfo: this.pacman.getDebugInfo()
      },
      players: Array.from(this.players.values()).map(p => ({
        socketId: p.socketId,
        username: p.username,
        ghostType: p.ghostType,
        position: p.position,
        direction: p.direction,
        state: p.state
      }))
    };
  }

  private getDeltaState() {
    const delta: any = {
      // Always send positions (critical for gameplay)
      pacman: {
        position: this.pacmanPosition,
        direction: this.pacmanDirection
      },
      players: Array.from(this.players.values()).map(p => ({
        socketId: p.socketId,
        position: p.position,
        direction: p.direction,
        state: p.state
      }))
    };

    // Only include changed data
    if (this.score !== this.lastBroadcastState.score) {
      delta.score = this.score;
      this.lastBroadcastState.score = this.score;
    }

    if (this.captureCount !== this.lastBroadcastState.captureCount) {
      delta.captureCount = this.captureCount;
      this.lastBroadcastState.captureCount = this.captureCount;
    }

    if (this.mode !== this.lastBroadcastState.mode) {
      delta.mode = this.mode;
      this.lastBroadcastState.mode = this.mode;
    }

    if (this.dotsChanged) {
      delta.dots = this.dots;
      this.lastBroadcastState.dotsCount = this.dots.length;
      this.dotsChanged = false;
    }

    if (this.pelletsChanged) {
      delta.powerPellets = this.powerPellets;
      this.lastBroadcastState.pelletsCount = this.powerPellets.length;
      this.pelletsChanged = false;
    }

    if (this.pacmanEmote) {
      delta.pacman.emote = this.pacmanEmote;
    }

    return delta;
  }

  private broadcastState(): void {
    this.io.to(this.roomCode).emit('gameUpdate', this.getDeltaState());
  }

}

export = Game;
