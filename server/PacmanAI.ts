import AStar = require('./AStar');
import { Position } from '../shared/maze';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

class PacmanAI {
  private position: Position;
  private direction: Direction;
  private pathfinder: AStar;
  private positionHistory: Position[];

  constructor(position: Position) {
    this.position = { ...position };
    this.direction = 'RIGHT';
    this.pathfinder = new AStar();
    this.positionHistory = [];
  }

  update(dots: Position[], powerPellets: Position[], ghostPositions: Position[], isFrightened: boolean): Direction {
    // Use integer positions for pathfinding
    const intPos: Position = { 
      x: Math.floor(this.position.x), 
      y: Math.floor(this.position.y) 
    };
    
    const intGhostPositions: Position[] = ghostPositions.map(g => ({
      x: Math.floor(g.x),
      y: Math.floor(g.y)
    }));

    // Track position history to avoid loops
    this.positionHistory.push({ ...intPos });
    if (this.positionHistory.length > 15) {
      this.positionHistory.shift();
    }

    // Use weighted A* to find the best direction considering all factors
    const bestDirection = this.pathfinder.findBestDirection(
      intPos,
      dots,
      powerPellets,
      intGhostPositions,
      isFrightened,
      this.positionHistory
    );

    if (bestDirection) {
      this.direction = bestDirection;
    }
    // If no valid direction found, keep current direction

    return this.direction;
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
