/**
 * AggressiveAI - Relentless ghost-hunting AI for power pellet mode
 *
 * This AI activates when Pac-Man eats a power pellet and ghosts turn blue.
 * It AGGRESSIVELY hunts down frightened ghosts using pure pathfinding.
 * When all ghosts are dead, it spawn camps their respawn points.
 *
 * DESIGN:
 * - Decoupled from PacmanBrain (completely separate AI system)
 * - Single purpose: hunt and eliminate frightened ghosts
 * - Uses A* pathfinding for optimal ghost interception
 * - Spawn camping logic when no active targets remain
 */

import { MAZE_LAYOUT, STARTING_POSITIONS, TELEPORT_POINTS, Position } from '../shared/maze';
import CONSTANTS = require('../shared/constants');

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Ghost {
  position: Position;
  direction: Direction;
  isFrightened: boolean;
}

class AggressiveAI {
  private maze: number[][];

  constructor() {
    this.maze = MAZE_LAYOUT;
  }

  /**
   * Main decision function - determines best direction to hunt ghosts
   * @param pacmanPos Current Pac-Man position
   * @param currentDirection Current movement direction
   * @param ghosts Array of all ghosts
   * @returns The direction to move
   */
  getHuntingDirection(
    pacmanPos: Position,
    currentDirection: Direction,
    ghosts: Ghost[]
  ): Direction {
    // Filter for frightened ghosts (our targets)
    const frightenedGhosts = ghosts.filter(g => g.isFrightened);

    // If there are frightened ghosts, hunt them aggressively
    if (frightenedGhosts.length > 0) {
      return this.huntNearestGhost(pacmanPos, currentDirection, frightenedGhosts);
    }

    // If all ghosts are dead/respawning, spawn camp
    return this.spawnCamp(pacmanPos, currentDirection);
  }

  /**
   * Hunts the nearest frightened ghost using A* pathfinding
   */
  private huntNearestGhost(
    pacmanPos: Position,
    currentDirection: Direction,
    frightenedGhosts: Ghost[]
  ): Direction {
    // Find closest frightened ghost
    let closestGhost: Ghost | null = null;
    let minDistance = Infinity;

    for (const ghost of frightenedGhosts) {
      const distance = this.heuristic(pacmanPos, ghost.position);
      if (distance < minDistance) {
        minDistance = distance;
        closestGhost = ghost;
      }
    }

    if (!closestGhost) {
      return currentDirection;
    }

    // Use A* to find path to ghost
    const path = this.aStar(pacmanPos, closestGhost.position);

    if (path.length > 1) {
      // Get the first move in the path
      const nextPos = path[1];
      const bestDirection = this.getDirectionToPosition(pacmanPos, nextPos);

      // ANTI-DITHERING: If ghost is far away (>5 tiles), prefer to maintain current direction
      // if it's reasonably close to the best path (within 1 tile of optimal)
      if (minDistance > 5) {
        const validDirs = this.getValidDirections(pacmanPos);
        if (validDirs.includes(currentDirection)) {
          const currentNextPos = this.getPositionFromMove(pacmanPos, currentDirection);
          const currentDistToGoal = this.heuristic(currentNextPos, closestGhost.position);
          const bestDistToGoal = this.heuristic(nextPos, closestGhost.position);

          // If current direction is within 1 tile of optimal, keep it
          if (Math.abs(currentDistToGoal - bestDistToGoal) <= 1) {
            return currentDirection;
          }
        }
      }

      return bestDirection;
    }

    // Fallback: move toward ghost if pathfinding fails
    return this.getMoveTowardTarget(pacmanPos, closestGhost.position, currentDirection);
  }

  /**
   * Spawn camping logic - positions Pac-Man at spawn points
   */
  private spawnCamp(pacmanPos: Position, currentDirection: Direction): Direction {
    // Primary spawn camping target: ghost house
    const spawnPoint = STARTING_POSITIONS.ghostHouse;

    // If we're already at the spawn point, patrol around it
    if (pacmanPos.x === spawnPoint.x && pacmanPos.y === spawnPoint.y) {
      return this.patrolAroundSpawn(pacmanPos, currentDirection);
    }

    // Path to spawn point
    const path = this.aStar(pacmanPos, spawnPoint);

    if (path.length > 1) {
      const nextPos = path[1];
      return this.getDirectionToPosition(pacmanPos, nextPos);
    }

    // Fallback
    return this.getMoveTowardTarget(pacmanPos, spawnPoint, currentDirection);
  }

  /**
   * Patrol around spawn point to intercept respawning ghosts
   */
  private patrolAroundSpawn(pacmanPos: Position, currentDirection: Direction): Direction {
    // Try to continue in current direction if possible
    const nextPos = this.getPositionFromMove(pacmanPos, currentDirection);
    if (this.isWalkable(nextPos)) {
      return currentDirection;
    }

    // Otherwise, pick any valid direction
    const validDirections = this.getValidDirections(pacmanPos);
    return validDirections[0] || currentDirection;
  }

  /**
   * A* pathfinding algorithm
   * Returns array of positions from start to goal
   */
  private aStar(start: Position, goal: Position): Position[] {
    const openSet = new Set<string>([`${start.x},${start.y}`]);
    const cameFrom = new Map<string, Position>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    gScore.set(`${start.x},${start.y}`, 0);
    fScore.set(`${start.x},${start.y}`, this.heuristic(start, goal));

    while (openSet.size > 0) {
      // Find node with lowest fScore
      let current: Position | null = null;
      let lowestF = Infinity;

      for (const posKey of openSet) {
        const f = fScore.get(posKey) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          const [x, y] = posKey.split(',').map(Number);
          current = { x, y };
        }
      }

      if (!current) break;

      const currentKey = `${current.x},${current.y}`;

      // Goal reached
      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.delete(currentKey);

      // Check all neighbors
      const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      for (const dir of directions) {
        const neighbor = this.getPositionFromMove(current, dir);

        if (!this.isWalkable(neighbor)) continue;

        const neighborKey = `${neighbor.x},${neighbor.y}`;
        const tentativeGScore = (gScore.get(currentKey) ?? Infinity) + 1;

        if (tentativeGScore < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, goal));
          openSet.add(neighborKey);
        }
      }
    }

    // No path found - return just the start position
    return [start];
  }

  /**
   * Reconstruct path from A* search
   */
  private reconstructPath(cameFrom: Map<string, Position>, current: Position): Position[] {
    const path = [current];
    let currentKey = `${current.x},${current.y}`;

    while (cameFrom.has(currentKey)) {
      const prev = cameFrom.get(currentKey)!;
      path.unshift(prev);
      currentKey = `${prev.x},${prev.y}`;
    }

    return path;
  }

  /**
   * Manhattan distance heuristic with teleport awareness
   */
  private heuristic(a: Position, b: Position): number {
    const directDist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    // Check teleport shortcuts
    let minTeleportDist = Infinity;
    for (const teleport of TELEPORT_POINTS) {
      const distToEntry = Math.abs(a.x - teleport.entry.x) + Math.abs(a.y - teleport.entry.y);
      const distFromExit = Math.abs(teleport.exit.x - b.x) + Math.abs(teleport.exit.y - b.y);
      const teleportDist = distToEntry + 1 + distFromExit;
      minTeleportDist = Math.min(minTeleportDist, teleportDist);
    }

    return Math.min(directDist, minTeleportDist);
  }

  /**
   * Get position after moving in a direction (handles teleportation)
   */
  private getPositionFromMove(pos: Position, direction: Direction): Position {
    const dirVec = CONSTANTS.DIRECTIONS[direction];
    const newPos = {
      x: pos.x + dirVec.x,
      y: pos.y + dirVec.y
    };

    // Check for teleportation
    const teleportExit = this.checkTeleport(newPos);
    if (teleportExit) {
      return teleportExit;
    }

    return newPos;
  }

  /**
   * Check if position is a teleport entry
   */
  private checkTeleport(pos: Position): Position | null {
    for (const teleport of TELEPORT_POINTS) {
      if (pos.x === teleport.entry.x && pos.y === teleport.entry.y) {
        return teleport.exit;
      }
    }
    return null;
  }

  /**
   * Check if position is walkable
   */
  private isWalkable(pos: Position): boolean {
    if (pos.x < 0 || pos.x >= CONSTANTS.GRID_WIDTH ||
        pos.y < 0 || pos.y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    if (!this.maze[pos.y]) {
      return false;
    }
    return this.maze[pos.y][pos.x] !== 0;
  }

  /**
   * Get all valid directions from current position
   */
  private getValidDirections(pos: Position): Direction[] {
    const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    return directions.filter(dir => {
      const nextPos = this.getPositionFromMove(pos, dir);
      return this.isWalkable(nextPos);
    });
  }

  /**
   * Determine direction needed to move from current to target position
   */
  private getDirectionToPosition(from: Position, to: Position): Direction {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      return dy > 0 ? 'DOWN' : 'UP';
    }
  }

  /**
   * Simple greedy move toward target (fallback when pathfinding fails)
   */
  private getMoveTowardTarget(
    from: Position,
    target: Position,
    currentDirection: Direction
  ): Direction {
    const validDirections = this.getValidDirections(from);

    if (validDirections.length === 0) {
      return currentDirection;
    }

    // Find direction that gets us closest to target
    let bestDirection = validDirections[0];
    let bestDistance = Infinity;

    for (const dir of validDirections) {
      const nextPos = this.getPositionFromMove(from, dir);
      const distance = this.heuristic(nextPos, target);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestDirection = dir;
      }
    }

    return bestDirection;
  }
}

export = AggressiveAI;
