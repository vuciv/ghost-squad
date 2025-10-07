import PacmanBrain = require('./PacmanBrain');
import { Position } from '../shared/maze';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Ghost {
  position: Position;
  direction: Direction;
  isFrightened: boolean;
}

class PacmanAI {
  private position: Position;
  private direction: Direction;
  private pathfinder: PacmanBrain;
  private positionHistory: Position[];
  private debugInfo: PacmanBrain.AIDebugInfo | null;
  private logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

  constructor(position: Position, logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO') {
    this.position = { ...position };
    this.direction = 'RIGHT';
    this.pathfinder = new PacmanBrain(12, {}, logLevel);
    this.positionHistory = [];
    this.debugInfo = null;
    this.logLevel = logLevel;
  }

  // Logging methods
  private log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, data?: any): void {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    if (levels[level] >= levels[this.logLevel]) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level}] [PacmanAI] ${message}`;
      if (data) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    }
  }

  update(dots: Position[], powerPellets: Position[], ghosts: Ghost[], isFrightened: boolean): Direction {
    this.log('DEBUG', 'PacmanAI update called', {
      currentPosition: this.position,
      currentDirection: this.direction,
      isFrightened,
      dotsRemaining: dots.length,
      powerPelletsRemaining: powerPellets.length,
      ghostCount: ghosts.length
    });

    // Use integer positions for pathfinding
    const intPos: Position = { 
      x: Math.floor(this.position.x), 
      y: Math.floor(this.position.y) 
    };
    
    const intGhosts: Ghost[] = ghosts.map(g => ({
      position: {
        x: Math.floor(g.position.x),
        y: Math.floor(g.position.y)
      },
      direction: g.direction,
      isFrightened: g.isFrightened
    }));

    this.log('DEBUG', 'Converted to integer positions', {
      intPos,
      intGhosts: intGhosts.map(g => ({
        position: g.position,
        direction: g.direction,
        isFrightened: g.isFrightened
      }))
    });

    // Track position history to avoid loops
    this.positionHistory.push({ ...intPos });
    if (this.positionHistory.length > 15) {
      this.positionHistory.shift();
    }

    this.log('DEBUG', 'Position history updated', {
      historyLength: this.positionHistory.length,
      recentPositions: this.positionHistory.slice(-5) // Last 5 positions
    });

    // Use look-ahead evaluation to find the best direction
    const result = this.pathfinder.findBestDirection(
      intPos,
      this.direction,
      dots,
      powerPellets,
      intGhosts,
      isFrightened,
      this.positionHistory
    );

    this.log('INFO', 'Decision made', {
      previousDirection: this.direction,
      newDirection: result.direction,
      directionChanged: result.direction !== this.direction
    });

    if (result.direction) {
      this.direction = result.direction;
    }
    // If no valid direction found, keep current direction

    // Store debug info for visualization
    this.debugInfo = result.debugInfo;

    return this.direction;
  }

  getDebugInfo(): PacmanBrain.AIDebugInfo | null {
    return this.debugInfo;
  }


  setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;
  }

  getPosition(): Position {
    return { ...this.position };
  }

  getDirection(): Direction {
    return this.direction;
  }

  setLogLevel(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'): void {
    this.logLevel = level;
    this.pathfinder.setLogLevel(level);
    this.log('INFO', `Log level changed to ${level}`);
  }

  getLogLevel(): string {
    return this.logLevel;
  }
}

export = PacmanAI;
