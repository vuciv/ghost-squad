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

  constructor(position: Position) {
    this.position = { ...position };
    this.direction = 'RIGHT';
    this.pathfinder = new PacmanBrain(12, {});
    this.positionHistory = [];
    this.debugInfo = null;
  }


  update(dots: Position[], powerPellets: Position[], ghosts: Ghost[], isFrightened: boolean): Direction {

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


    // Track position history to avoid loops
    this.positionHistory.push({ ...intPos });
    if (this.positionHistory.length > 15) {
      this.positionHistory.shift();
    }


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

}

export = PacmanAI;
