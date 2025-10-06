import { MAZE_LAYOUT, Position } from '../shared/maze';
import CONSTANTS = require('../shared/constants');

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface CostWeights {
  dotValue: number;          // How much we want dots
  powerPelletValue: number;  // How much we want power pellets
  ghostDanger: number;       // How much we avoid ghosts (negative cost)
  ghostTarget: number;       // How much we chase ghosts when frightened
  explorationBonus: number;  // Bonus for exploring new areas
}

class AStar {
  private maze: number[][];

  constructor() {
    this.maze = MAZE_LAYOUT;
  }

  // Manhattan distance heuristic
  heuristic(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  getNeighbors(node: Position): Position[] {
    const neighbors: Position[] = [];
    const directions = [
      { x: 0, y: -1 }, // up
      { x: 0, y: 1 },  // down
      { x: -1, y: 0 }, // left
      { x: 1, y: 0 }   // right
    ];

    for (const dir of directions) {
      const newX = node.x + dir.x;
      const newY = node.y + dir.y;

      // Check bounds
      if (newX < 0 || newX >= CONSTANTS.GRID_WIDTH ||
          newY < 0 || newY >= CONSTANTS.GRID_HEIGHT) {
        continue;
      }

      // Check if walkable (not a wall)
      if (this.maze[newY][newX] === 0) {
        continue;
      }

      neighbors.push({ x: newX, y: newY });
    }

    return neighbors;
  }

  findPath(start: Position, goal: Position, ghostPositions: Position[] = [], avoidGhosts: boolean = false): Position[] {
    const openSet: Position[] = [start];
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, Position>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    const key = (node: Position): string => `${node.x},${node.y}`;

    gScore.set(key(start), 0);
    fScore.set(key(start), this.heuristic(start, goal));

    // Limit iterations to prevent infinite loops
    let iterations = 0;
    const maxIterations = 1000;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest fScore
      openSet.sort((a, b) => (fScore.get(key(a)) || Infinity) - (fScore.get(key(b)) || Infinity));
      const current = openSet.shift()!;

      // Reached goal
      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, current);
      }

      closedSet.add(key(current));

      for (const neighbor of this.getNeighbors(current)) {
        const neighborKey = key(neighbor);

        if (closedSet.has(neighborKey)) {
          continue;
        }

        let tentativeGScore = (gScore.get(key(current)) || 0) + 1;

        // Add cost for being near ghosts if in evasion mode
        if (avoidGhosts && ghostPositions.length > 0) {
          for (const ghost of ghostPositions) {
            const distance = this.heuristic(neighbor, ghost);
            // Only avoid if very close (reduced from 7 to 4)
            if (distance < 4) {
              tentativeGScore += (4 - distance) * 15; // Reduced penalty
            }
          }
        }

        if (!openSet.find(n => n.x === neighbor.x && n.y === neighbor.y)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= (gScore.get(neighborKey) || Infinity)) {
          continue;
        }

        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, goal));
      }
    }

    // No path found
    return [];
  }

  reconstructPath(cameFrom: Map<string, Position>, current: Position): Position[] {
    const path: Position[] = [current];
    const key = (node: Position): string => `${node.x},${node.y}`;

    while (cameFrom.has(key(current))) {
      current = cameFrom.get(key(current))!;
      path.unshift(current);
    }

    return path;
  }

  getNextDirection(start: Position, goal: Position, ghostPositions: Position[] = [], avoidGhosts: boolean = false): Direction | null {
    const path = this.findPath(start, goal, ghostPositions, avoidGhosts);

    if (path.length < 2) {
      return null; // No path or already at goal
    }

    const next = path[1];
    const dx = next.x - start.x;
    const dy = next.y - start.y;

    if (dy === -1) return 'UP';
    if (dy === 1) return 'DOWN';
    if (dx === -1) return 'LEFT';
    if (dx === 1) return 'RIGHT';

    return null;
  }

  // Calculate the cost of a position based on game state
  calculatePositionCost(
    pos: Position,
    dots: Position[],
    powerPellets: Position[],
    ghostPositions: Position[],
    weights: CostWeights,
    visited: Set<string>
  ): number {
    let cost = 0;

    // Base movement cost
    cost += 1;

    // Dot attraction - negative cost (we want to go towards dots)
    let minDotDist = Infinity;
    for (const dot of dots) {
      const dist = this.heuristic(pos, dot);
      minDotDist = Math.min(minDotDist, dist);
    }
    if (minDotDist < Infinity) {
      cost -= weights.dotValue / (minDotDist + 1);
    }

    // Power pellet attraction - strong negative cost
    let minPelletDist = Infinity;
    for (const pellet of powerPellets) {
      const dist = this.heuristic(pos, pellet);
      minPelletDist = Math.min(minPelletDist, dist);
    }
    if (minPelletDist < Infinity) {
      cost -= weights.powerPelletValue / (minPelletDist + 1);
    }

    // Ghost interaction
    for (const ghost of ghostPositions) {
      const dist = this.heuristic(pos, ghost);
      
      if (weights.ghostTarget > 0) {
        // Frightened mode - chase ghosts
        if (dist < 10) {
          cost -= weights.ghostTarget / (dist + 1);
        }
      } else {
        // Normal mode - avoid ghosts
        if (dist < 8) {
          cost += weights.ghostDanger / (dist + 1);
        }
      }
    }

    // Exploration bonus - prefer unvisited areas
    const key = `${pos.x},${pos.y}`;
    if (visited.has(key)) {
      cost += 5; // Penalty for revisiting
    }

    return cost;
  }

  // Find best direction using weighted A* that considers all game elements
  findBestDirection(
    start: Position,
    dots: Position[],
    powerPellets: Position[],
    ghostPositions: Position[],
    isFrightened: boolean,
    recentPositions: Position[]
  ): Direction | null {
    // Set weights based on game state
    const weights: CostWeights = isFrightened
      ? {
          dotValue: 3,           // Still care about dots
          powerPelletValue: 2,   // Power pellets less important now
          ghostDanger: 0,        // Don't avoid ghosts
          ghostTarget: 8,        // Chase ghosts!
          explorationBonus: 1
        }
      : {
          dotValue: 5,           // Primary goal: collect dots
          powerPelletValue: 8,   // Power pellets very valuable
          ghostDanger: 15,       // Avoid ghosts moderately
          ghostTarget: 0,        // Don't chase ghosts
          explorationBonus: 1
        };

    // Track visited positions to avoid loops
    const visited = new Set(recentPositions.map(p => `${p.x},${p.y}`));

    // Evaluate each possible direction
    const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    let bestDirection: Direction | null = null;
    let bestCost = Infinity;

    for (const dir of directions) {
      const dirVec = CONSTANTS.DIRECTIONS[dir];
      const newPos = {
        x: start.x + dirVec.x,
        y: start.y + dirVec.y
      };

      // Check if walkable
      if (newPos.x < 0 || newPos.x >= CONSTANTS.GRID_WIDTH ||
          newPos.y < 0 || newPos.y >= CONSTANTS.GRID_HEIGHT ||
          this.maze[newPos.y][newPos.x] === 0) {
        continue;
      }

      // Calculate cost for this move
      const cost = this.calculatePositionCost(
        newPos,
        dots,
        powerPellets,
        ghostPositions,
        weights,
        visited
      );

      if (cost < bestCost) {
        bestCost = cost;
        bestDirection = dir;
      }
    }

    return bestDirection;
  }
}

export = AStar;
