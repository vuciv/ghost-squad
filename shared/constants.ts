// Game constants shared between client and server
interface Directions {
  UP: { x: number; y: number };
  DOWN: { x: number; y: number };
  LEFT: { x: number; y: number };
  RIGHT: { x: number; y: number };
}

interface Modes {
  CHASE: string;
  FRIGHTENED: string;
  GAME_OVER: string;
}

interface Ghosts {
  BLINKY: string;
  PINKY: string;
  INKY: string;
  CLYDE: string;
}

interface GameConstants {
  // Grid and movement
  TILE_SIZE: number;
  GRID_WIDTH: number;
  GRID_HEIGHT: number;
  MOVE_COOLDOWN_TICKS: number;

  // Game modes
  MODES: Modes;

  // Ghost types
  GHOSTS: Ghosts;

  // Timing (in milliseconds)
  FRIGHTENED_DURATION: number;
  RESPAWN_DELAY: number;
  TICK_RATE: number;

  // Speeds (tiles per second)
  GHOST_SPEED: number;
  PACMAN_SPEED: number;
  FRIGHTENED_GHOST_SPEED: number;
  FRIGHTENED_PACMAN_SPEED: number;

  // Scoring
  GHOST_CAPTURE_BASE_SCORE: number;
  MULTIPLAYER_BONUS_MULTIPLIER: number;
  DOT_VALUE: number;
  POWER_PELLET_VALUE: number;

  // Win conditions
  CAPTURES_TO_WIN: number;

  // Directions
  DIRECTIONS: Directions;
}

const GAME_CONSTANTS: GameConstants = {
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

export = GAME_CONSTANTS;
