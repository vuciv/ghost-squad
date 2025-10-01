const CONSTANTS = require('../shared/constants');
const { MAZE_LAYOUT, STARTING_POSITIONS } = require('../shared/maze');
const PacmanAI = require('./PacmanAI');

const MOVE_COOLDOWN_TICKS = CONSTANTS.MOVE_COOLDOWN_TICKS;

class Game {
  constructor(roomCode, io) {
    this.roomCode = roomCode;
    this.io = io;
    this.players = new Map(); // socketId -> {ghostType, position, direction, state}
    this.isStarted = false;
    this.gameLoop = null;

    // Game state
    this.mode = CONSTANTS.MODES.CHASE;
    this.score = 0;
    this.captureCount = 0;
    this.dots = this.initializeDots();
    this.powerPellets = this.initializePowerPellets();

    // Pacman AI
    this.pacman = new PacmanAI(STARTING_POSITIONS.pacman);
    this.pacmanPosition = { ...STARTING_POSITIONS.pacman };
    this.pacmanDirection = 'RIGHT';
    this.pacmanEmote = '';
    this.emoteTimer = null;

    // Timing
    this.frightenedTimer = null;
    this.respawnTimers = new Map();

    // Movement timing (ticks since last move)
    this.pacmanMoveCooldown = 0;
    this.ghostMoveCooldowns = new Map();
  }

  initializeDots() {
    const dots = [];
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

  initializePowerPellets() {
    const pellets = [];
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

  addPlayer(socketId, ghostType) {
    const position = { ...STARTING_POSITIONS[ghostType] };
    this.players.set(socketId, {
      socketId,
      ghostType,
      position,
      direction: 'UP',
      state: 'active', // active, frightened, respawning
      respawnTime: null
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  getPlayerCount() {
    return this.players.size;
  }

  isGhostTaken(ghostType) {
    for (const player of this.players.values()) {
      if (player.ghostType === ghostType) {
        return true;
      }
    }
    return false;
  }

  isFull() {
    return this.players.size >= 4;
  }

  canStart() {
    return this.players.size > 0 && !this.isStarted;
  }

  start() {
    this.isStarted = true;
    this.gameLoop = setInterval(() => this.update(), CONSTANTS.TICK_RATE);
  }

  stop() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  update() {
    // Update Pacman AI
    const ghostPositions = Array.from(this.players.values())
      .filter(p => p.state === 'active' || p.state === 'frightened')
      .map(p => p.position);

    const isFrightened = this.mode === CONSTANTS.MODES.FRIGHTENED;
    this.pacmanDirection = this.pacman.update(
      this.dots,
      this.powerPellets,
      ghostPositions,
      isFrightened
    );

    // Move Pacman
    this.movePacman();

    // Move players
    for (const player of this.players.values()) {
      if (player.state === 'active' || player.state === 'frightened') {
        this.moveGhost(player);
      }
    }

    // Check collisions
    this.checkCollisions();

    // Check win/lose conditions
    this.checkGameOver();

    // Update Pacman emotes
    this.updatePacmanEmote();

    // Broadcast state
    this.broadcastState();
  }

  movePacman() {
    // Check cooldown (move every 2 ticks = 100ms)
    if (this.pacmanMoveCooldown > 0) {
      this.pacmanMoveCooldown--;
      return;
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
      this.pacman.setPosition(targetX, targetY);

      // Reset cooldown
      this.pacmanMoveCooldown = MOVE_COOLDOWN_TICKS;

      // Check dot collision
      this.checkDotCollision(targetX, targetY);

      // Check power pellet collision
      this.checkPowerPelletCollision(targetX, targetY);
    }
  }

  moveGhost(player) {
    // Check cooldown
    if (!this.ghostMoveCooldowns.has(player.socketId)) {
      this.ghostMoveCooldowns.set(player.socketId, 0);
    }

    const cooldown = this.ghostMoveCooldowns.get(player.socketId);
    if (cooldown > 0) {
      this.ghostMoveCooldowns.set(player.socketId, cooldown - 1);
      return;
    }

    const dir = CONSTANTS.DIRECTIONS[player.direction];
    if (!dir) return;

    // Calculate target tile
    const targetX = player.position.x + dir.x;
    const targetY = player.position.y + dir.y;

    // Only move if target is walkable
    if (this.isWalkable(targetX, targetY)) {
      player.position.x = targetX;
      player.position.y = targetY;

      // Reset cooldown
      this.ghostMoveCooldowns.set(player.socketId, MOVE_COOLDOWN_TICKS);
    }
  }

  isWalkable(x, y) {
    const mazeHeight = MAZE_LAYOUT.length;
    const mazeWidth = MAZE_LAYOUT[0].length;
    if (x < 0 || x >= mazeWidth || y < 0 || y >= mazeHeight) {
      return false;
    }
    const cell = MAZE_LAYOUT[y][x];
    // Walkable: dots (1), power pellets (2), or ghost house (3)
    return cell !== 0;
  }

  checkDotCollision(x, y) {
    const dotIndex = this.dots.findIndex(dot => dot.x === x && dot.y === y);
    if (dotIndex !== -1) {
      this.dots.splice(dotIndex, 1);
      this.score += CONSTANTS.DOT_VALUE;
    }
  }

  checkPowerPelletCollision(x, y) {
    const pelletIndex = this.powerPellets.findIndex(p => p.x === x && p.y === y);
    if (pelletIndex !== -1) {
      this.powerPellets.splice(pelletIndex, 1);
      this.score += CONSTANTS.POWER_PELLET_VALUE;
      this.activateFrightenedMode();
    }
  }

  activateFrightenedMode() {
    this.mode = CONSTANTS.MODES.FRIGHTENED;

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
      this.mode = CONSTANTS.MODES.CHASE;
      for (const player of this.players.values()) {
        if (player.state === 'frightened') {
          player.state = 'active';
        }
      }
    }, CONSTANTS.FRIGHTENED_DURATION);
  }

  checkCollisions() {
    for (const player of this.players.values()) {
      if (player.state !== 'active' && player.state !== 'frightened') continue;

      const distance = Math.abs(player.position.x - this.pacmanPosition.x) +
                      Math.abs(player.position.y - this.pacmanPosition.y);

      if (distance < 1) { // Collision threshold
        if (this.mode === CONSTANTS.MODES.FRIGHTENED) {
          // Pacman eats ghost
          this.respawnGhost(player);
        } else {
          // Ghost catches Pacman
          this.ghostCapturedPacman(player);
        }
      }
    }
  }

  respawnGhost(player) {
    player.state = 'respawning';
    player.position = { ...STARTING_POSITIONS.ghostHouse };

    const timer = setTimeout(() => {
      player.state = this.mode === CONSTANTS.MODES.FRIGHTENED ? 'frightened' : 'active';
      player.position = { ...STARTING_POSITIONS[player.ghostType] };
      this.respawnTimers.delete(player.socketId);
    }, CONSTANTS.RESPAWN_DELAY);

    this.respawnTimers.set(player.socketId, timer);
  }

  ghostCapturedPacman(capturer) {
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

  updatePacmanEmote() {
    // Calculate closest ghost distance
    let minGhostDist = Infinity;
    for (const player of this.players.values()) {
      if (player.state === 'active' || player.state === 'frightened') {
        const dist = Math.abs(player.position.x - this.pacmanPosition.x) +
                    Math.abs(player.position.y - this.pacmanPosition.y);
        minGhostDist = Math.min(minGhostDist, dist);
      }
    }

    // Don't override existing emotes
    if (this.emoteTimer) return;

    // Taunt if far away (>12 tiles) - increased frequency
    if (minGhostDist > 12 && Math.random() < 0.005) {
      const taunts = ['😎', '🤪', '😏', '😝', '🥱', '💅', '🤑'];
      this.setPacmanEmote(taunts[Math.floor(Math.random() * taunts.length)], 3000);
    }
    // Confident if doing well (high score, many dots eaten)
    else if (this.score > 300 && Math.random() < 0.003) {
      const confident = ['💪', '😤', '🔥', '⚡', '👑'];
      this.setPacmanEmote(confident[Math.floor(Math.random() * confident.length)], 2000);
    }
    // Nervous if ghost is close (5-10 tiles)
    else if (minGhostDist < 10 && minGhostDist > 5 && Math.random() < 0.01) {
      const nervous = ['😰', '😅', '👀', '😬'];
      this.setPacmanEmote(nervous[Math.floor(Math.random() * nervous.length)], 1500);
    }
    // Scared if very close (<5 tiles)
    else if (minGhostDist < 5 && Math.random() < 0.02) {
      const scared = ['😱', '🏃', '💨'];
      this.setPacmanEmote(scared[Math.floor(Math.random() * scared.length)], 1000);
    }
  }

  setPacmanEmote(emote, duration) {
    this.pacmanEmote = emote;

    if (this.emoteTimer) {
      clearTimeout(this.emoteTimer);
    }

    this.emoteTimer = setTimeout(() => {
      this.pacmanEmote = '';
      this.emoteTimer = null;
    }, duration);
  }

  checkGameOver() {
    if (this.captureCount >= CONSTANTS.CAPTURES_TO_WIN) {
      this.mode = CONSTANTS.MODES.GAME_OVER;
      this.stop();
      this.io.to(this.roomCode).emit('gameOver', {
        winner: 'ghosts',
        score: this.score
      });
    } else if (this.dots.length === 0) {
      this.mode = CONSTANTS.MODES.GAME_OVER;
      this.stop();
      this.io.to(this.roomCode).emit('gameOver', {
        winner: 'pacman',
        score: this.score
      });
    }
  }

  handlePlayerInput(socketId, direction) {
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
        emote: this.pacmanEmote
      },
      players: Array.from(this.players.values()).map(p => ({
        socketId: p.socketId,
        ghostType: p.ghostType,
        position: p.position,
        direction: p.direction,
        state: p.state
      }))
    };
  }

  broadcastState() {
    this.io.to(this.roomCode).emit('gameState', this.getState());
  }
}

module.exports = Game;
