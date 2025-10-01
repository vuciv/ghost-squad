// Game constants shared between client and server
const GAME_CONSTANTS = {
  // Grid and movement
  TILE_SIZE: 20,
  GRID_WIDTH: 28,
  GRID_HEIGHT: 35,
  MOVE_COOLDOWN_TICKS: 2,

  // Game modes
  MODES: {
    CHASE: 'chase',
    FRIGHTENED: 'frightened',
    GAME_OVER: 'game_over'
  },

  // Ghost types
  GHOSTS: {
    BLINKY: 'blinky',
    PINKY: 'pinky',
    INKY: 'inky',
    CLYDE: 'clyde'
  },

  // Timing (in milliseconds)
  FRIGHTENED_DURATION: 10000,
  RESPAWN_DELAY: 5000,
  TICK_RATE: 50, // 20 ticks per second

  // Speeds (tiles per second)
  GHOST_SPEED: 4,
  PACMAN_SPEED: 4,
  FRIGHTENED_GHOST_SPEED: 2,
  FRIGHTENED_PACMAN_SPEED: 5,

  // Scoring
  GHOST_CAPTURE_BASE_SCORE: 200,
  MULTIPLAYER_BONUS_MULTIPLIER: 1.5,
  DOT_VALUE: 10,
  POWER_PELLET_VALUE: 50,

  // Win conditions
  CAPTURES_TO_WIN: 3,

  // Directions
  DIRECTIONS: {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GAME_CONSTANTS;
}
