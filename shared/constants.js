// Game constants shared between client and server
const GAME_CONSTANTS = {
  // Grid and movement
  TILE_SIZE: 20,
  GRID_WIDTH: 28,
  GRID_HEIGHT: 35,

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
  TICK_RATE: 150, // ~6.7 ticks per second (one move every 150ms)

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
