import CONSTANTS = require('../shared/constants');
import { MAZE_LAYOUT, STARTING_POSITIONS, TELEPORT_POINTS, Position } from '../shared/maze';
import PacmanAI = require('./PacmanAI');
import AggressiveAI = require('./AggressiveAI');
import { TabularHybridCoordinator } from './rl/TabularHybridCoordinator';
import { GameState } from './rl/types';
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
  ready: boolean;
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
  private aggressiveAI: AggressiveAI;
  private trainedAI: TabularHybridCoordinator | null;
  private useTrainedAI: boolean;
  private stepCount: number;
  private pacmanPosition: Position;
  private pacmanDirection: Direction;
  private pacmanEmote: string;
  private emoteTimer: NodeJS.Timeout | null;
  private previousPacmanPosition: Position;

  // Static pre-loaded AI shared across all game instances
  private static sharedTrainedAI: TabularHybridCoordinator | null = null;
  private static aiLoadingPromise: Promise<void> | null = null;

  // Personality tracking
  private lastDotsEaten: number;
  private dotsEatenStreak: number;
  private lastGhostEaten: number;
  private previousMinGhostDist: number;

  // Timing
  private frightenedTimer: NodeJS.Timeout | null;
  private frightenedStartTime: number | null;
  private respawnTimers: Map<string, NodeJS.Timeout>;
  private gameTimer: NodeJS.Timeout | null;
  private gameStartTime: number | null;
  private timerBroadcastInterval: NodeJS.Timeout | null;
  private readonly GAME_TIME_LIMIT = 180000; // 3 minutes in milliseconds

  // Cleanup callback when game ends
  private onGameEnd: ((roomCode: string) => Promise<void>) | null = null;

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

  // Performance optimization: cache for spatial lookups
  private dotSet: Set<string>;
  private pelletSet: Set<string>;
  private lastEmoteCalcFrame: number;
  private emoteCalcInterval: number = 3; // Calculate emotes every 3 frames

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

    // Initialize spatial caches for O(1) collision lookups
    this.dotSet = this.createPositionSet(this.dots);
    this.pelletSet = this.createPositionSet(this.powerPellets);
    this.lastEmoteCalcFrame = 0;

    // Pacman AI
    this.pacman = new PacmanAI(STARTING_POSITIONS.pacman);
    this.aggressiveAI = new AggressiveAI();
    this.trainedAI = Game.sharedTrainedAI; // Use pre-loaded AI
    this.useTrainedAI = !!Game.sharedTrainedAI;
    this.stepCount = 0;
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
    this.frightenedStartTime = null;
    this.respawnTimers = new Map();
    this.gameTimer = null;
    this.gameStartTime = null;
    this.timerBroadcastInterval = null;

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

  // Helper: Convert position array to Set for O(1) lookups
  private createPositionSet(positions: Position[]): Set<string> {
    const set = new Set<string>();
    for (const pos of positions) {
      set.add(`${pos.x},${pos.y}`);
    }
    return set;
  }

  // Static method: Pre-load AI model on server startup (call once at server init)
  static async preloadTrainedAI(): Promise<void> {
    if (Game.aiLoadingPromise) {
      return Game.aiLoadingPromise; // Return existing promise if already loading
    }

    Game.aiLoadingPromise = (async () => {
      try {
        const modelPath = './models/adversarial_tabular/pacman';
        Game.sharedTrainedAI = new TabularHybridCoordinator();
        await Game.sharedTrainedAI.load(modelPath);
        //console.log('✅ Pre-loaded trained Pacman AI on server startup');
      } catch (error) {
        //console.warn('⚠️ Could not pre-load AI, using default AI:', error);
        Game.sharedTrainedAI = null;
      }
    })();

    return Game.aiLoadingPromise;
  }

  setOnGameEnd(callback: (roomCode: string) => Promise<void>): void {
    this.onGameEnd = callback;
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
      respawnTime: null,
      ready: false
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
    if (this.players.size === 0 || this.isStarted) return false;

    // Check if all players are ready
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }
    return true;
  }

  togglePlayerReady(socketId: string): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;

    player.ready = !player.ready;
    return player.ready;
  }

  areAllPlayersReady(): boolean {
    if (this.players.size === 0) return false;
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }
    return true;
  }

  start(): void {
    this.isStarted = true;
    this.gameStartTime = Date.now();

    // Set game timer for 3 minutes
    this.gameTimer = setTimeout(() => {
      this.timeUp();
    }, this.GAME_TIME_LIMIT);

    // Send full state when game starts to ensure all clients are synchronized
    this.io.to(this.roomCode).emit('gameState', this.getState());
    this.gameLoop = setInterval(() => this.update(), CONSTANTS.TICK_RATE);

    // Send timer updates every second
    this.startTimerBroadcast();
  }

  private startTimerBroadcast(): void {
    this.timerBroadcastInterval = setInterval(() => {
      if (!this.isStarted || this.mode === CONSTANTS.MODES.GAME_OVER) {
        if (this.timerBroadcastInterval) {
          clearInterval(this.timerBroadcastInterval);
          this.timerBroadcastInterval = null;
        }
        return;
      }
      this.io.to(this.roomCode).emit('timerUpdate', {
        timeRemaining: this.getTimeRemaining()
      });
    }, 1000); // Update every second
  }

  stop(): void {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
      this.gameTimer = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    // Clear all timers
    if (this.frightenedTimer) {
      clearTimeout(this.frightenedTimer);
      this.frightenedTimer = null;
    }
    if (this.emoteTimer) {
      clearTimeout(this.emoteTimer);
      this.emoteTimer = null;
    }
    if (this.timerBroadcastInterval) {
      clearInterval(this.timerBroadcastInterval);
      this.timerBroadcastInterval = null;
    }
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();

    // Clear large data structures
    this.players.clear();
    this.previousPlayerPositions.clear();
    this.dots = [];
    this.powerPellets = [];
    this.dotSet.clear();
    this.pelletSet.clear();
  }

  private timeUp(): void {
    // Time's up - Pacman wins because ghosts didn't catch them 3 times
    this.mode = CONSTANTS.MODES.GAME_OVER as GameMode;
    this.stop();
    this.io.to(this.roomCode).emit('gameOver', {
      winner: 'pacman',
      reason: 'timeout',
      score: this.score
    });
    // Notify GameManager to clean up immediately
    if (this.onGameEnd) {
      this.onGameEnd(this.roomCode).catch(err =>
        console.warn('Error in onGameEnd callback:', err)
      );
    }
  }

  getTimeRemaining(): number {
    if (!this.gameStartTime) return this.GAME_TIME_LIMIT;
    const elapsed = Date.now() - this.gameStartTime;
    return Math.max(0, this.GAME_TIME_LIMIT - elapsed);
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

    // Update Pacman emotes every N frames to reduce CPU
    if (this.lastEmoteCalcFrame++ % this.emoteCalcInterval === 0) {
      this.updatePacmanEmote();
    }

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

    // Use trained AI if available, otherwise fallback to original AI
    if (this.useTrainedAI && this.trainedAI) {
      // Create GameState for the trained AI
      const gameState: GameState = {
        position: this.pacmanPosition,
        direction: this.pacmanDirection,
        dots: this.dots,
        powerPellets: this.powerPellets,
        ghosts: ghosts,
        isFrightened: isFrightened,
        score: this.score,
        tickCount: this.stepCount
      };

      // Use trained AI to select action
      this.pacmanDirection = this.trainedAI.selectAction(gameState, this.stepCount);
      this.stepCount++;
    } else {
      // FALLBACK: Original AI SWITCHING LOGIC
      // Use aggressive AI when in frightened mode
      // BUT switch back to defensive AI if less than 1 second remains
      const timeRemainingMs = this.getFrightenedTimeRemaining();
      const useAggressiveAI = isFrightened && timeRemainingMs > 1000;

      if (useAggressiveAI) {
        // AGGRO MODE: Hunt ghosts relentlessly
        this.pacmanDirection = this.aggressiveAI.getHuntingDirection(
          this.pacmanPosition,
          this.pacmanDirection,
          ghosts
        );
      } else {
        // DEFENSIVE MODE: Normal survival AI
        this.pacmanDirection = this.pacman.update(
          this.dots,
          this.powerPellets,
          ghosts,
          isFrightened
        );
      }
    }


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
    // Check if player has an intended direction buffered
    const intendedDirection = (player as any).intendedDirection as Direction | undefined;

    if (intendedDirection) {
      const intendedDir = CONSTANTS.DIRECTIONS[intendedDirection];
      if (intendedDir) {
        const intendedX = player.position.x + intendedDir.x;
        const intendedY = player.position.y + intendedDir.y;

        // If intended direction is now walkable, use it
        if (this.isWalkable(intendedX, intendedY)) {
          player.direction = intendedDirection;
          (player as any).intendedDirection = undefined; // Clear buffer
        }
      }
    }

    const dir = CONSTANTS.DIRECTIONS[player.direction];
    if (!dir) return;

    // Calculate target tile
    const targetX = player.position.x + dir.x;
    const targetY = player.position.y + dir.y;

    // If target is walkable, move
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
    // If blocked, don't stop - the player just continues in current direction
    // This prevents stopping when missing a turn in a corridor
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
    const key = `${x},${y}`;
    if (this.dotSet.has(key)) {
      // Remove from both set and array
      this.dotSet.delete(key);
      const dotIndex = this.dots.findIndex(dot => dot.x === x && dot.y === y);
      if (dotIndex !== -1) {
        this.dots.splice(dotIndex, 1);
      }
      this.score += CONSTANTS.DOT_VALUE;
      this.dotsChanged = true;
    }
  }

  private checkPowerPelletCollision(x: number, y: number): void {
    const key = `${x},${y}`;
    if (this.pelletSet.has(key)) {
      // Remove from both set and array
      this.pelletSet.delete(key);
      const pelletIndex = this.powerPellets.findIndex(p => p.x === x && p.y === y);
      if (pelletIndex !== -1) {
        this.powerPellets.splice(pelletIndex, 1);
      }
      this.score += CONSTANTS.POWER_PELLET_VALUE;
      this.pelletsChanged = true;
      this.activateFrightenedMode();
    }
  }

  private activateFrightenedMode(): void {
    this.mode = CONSTANTS.MODES.FRIGHTENED as GameMode;
    this.frightenedStartTime = Date.now();

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
      this.frightenedStartTime = null;
      for (const player of this.players.values()) {
        if (player.state === 'frightened') {
          player.state = 'active';
        }
      }
    }, CONSTANTS.FRIGHTENED_DURATION);
  }

  /**
   * Get remaining time in frightened mode (milliseconds)
   * Returns 0 if not in frightened mode
   */
  private getFrightenedTimeRemaining(): number {
    if (this.mode !== CONSTANTS.MODES.FRIGHTENED || !this.frightenedStartTime) {
      return 0;
    }

    const elapsed = Date.now() - this.frightenedStartTime;
    const remaining = CONSTANTS.FRIGHTENED_DURATION - elapsed;
    return Math.max(0, remaining);
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
        if (player.state === 'frightened') {
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

    // Single pass through players to collect all needed data efficiently
    let minGhostDist = Infinity;
    let activeGhostCount = 0;
    let frightenedGhostCount = 0;
    const ghostDirections = new Set<string>();

    for (const player of this.players.values()) {
      const dx = player.position.x - this.pacmanPosition.x;
      const dy = player.position.y - this.pacmanPosition.y;
      const dist = Math.abs(dx) + Math.abs(dy);

      if (player.state === 'active') {
        minGhostDist = Math.min(minGhostDist, dist);
        activeGhostCount++;
        // Calculate direction for surrounded detection (in same pass)
        if (Math.abs(dx) > Math.abs(dy)) {
          ghostDirections.add(dx > 0 ? 'right' : 'left');
        } else {
          ghostDirections.add(dy > 0 ? 'down' : 'up');
        }
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

    // Calculate closest power pellet distance (lazy evaluation)
    let minPelletDist = Infinity;
    for (const pellet of this.powerPellets) {
      const dist = Math.abs(pellet.x - this.pacmanPosition.x) +
                  Math.abs(pellet.y - this.pacmanPosition.y);
      minPelletDist = Math.min(minPelletDist, dist);
    }

    // PRIORITY 1: Victory dance (very few dots left)
    if (currentDotsRemaining < 10 && Math.random() < 0.05) {
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
    if (currentDotsRemaining < 30 && currentDotsRemaining > 10 && Math.random() < 0.008) {
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
      // Notify GameManager to clean up immediately
      if (this.onGameEnd) {
        this.onGameEnd(this.roomCode).catch(err =>
          console.warn('Error in onGameEnd callback:', err)
        );
      }
    } else if (this.dots.length === 0) {
      this.mode = CONSTANTS.MODES.GAME_OVER as GameMode;
      this.stop();
      this.io.to(this.roomCode).emit('gameOver', {
        winner: 'pacman',
        score: this.score
      });
      // Notify GameManager to clean up immediately
      if (this.onGameEnd) {
        this.onGameEnd(this.roomCode).catch(err =>
          console.warn('Error in onGameEnd callback:', err)
        );
      }
    }
  }

  handlePlayerInput(socketId: string, direction: Direction): void {
    const player = this.players.get(socketId);
    if (player && (player.state === 'active' || player.state === 'frightened')) {
      // Store the intended direction for buffered input
      (player as any).intendedDirection = direction;
    }
  }

  getState() {
    return {
      mode: this.mode,
      score: this.score,
      captureCount: this.captureCount,
      timeRemaining: this.getTimeRemaining(),
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
        state: p.state,
        ready: p.ready
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
