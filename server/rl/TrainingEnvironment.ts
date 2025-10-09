/**
 * Training Environment
 * Simulates Pacman game for training without needing real players
 */

import { Position, TELEPORT_POINTS } from '../../shared/maze';
import { MAZE_LAYOUT, STARTING_POSITIONS } from '../../shared/maze';
import CONSTANTS = require('../../shared/constants');
import { GameState, Direction, Ghost } from './types';
import { SimpleGhostTeam } from './SimpleGhostQ';
import { SimpleGhostTeamAI } from './SimpleGhostAI';
import { SimpleGhostTeamQLearning } from './SimpleGhostQLearning';

// A* pathfinding node
interface PathNode {
  pos: Position;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

export class TrainingEnvironment {
  private pacmanPosition!: Position;
  private pacmanDirection!: Direction;
  private dots!: Position[];
  private powerPellets!: Position[];
  private ghosts!: Ghost[];
  private isFrightened!: boolean;
  private score!: number;
  private tickCount!: number;
  private isDone!: boolean;
  private frightenedTimer!: number;

  // Training-specific
  private startTime!: number;
  private maxTicks: number;
  private ghostTeam?: SimpleGhostTeam; // Optional old Q-learning team
  private ghostQLearning?: SimpleGhostTeamQLearning; // NEW Q-learning team
  private ghostAI: SimpleGhostTeamAI; // Simple A* AI (always available)
  private useAI: boolean; // Use simple AI instead of Q-learning

  constructor(
    maxTicks: number = 3000,
    ghostTeam?: SimpleGhostTeam | SimpleGhostTeamQLearning,
    useAI: boolean = true
  ) {
    this.maxTicks = maxTicks;

    // Detect which type of ghost team
    if (ghostTeam) {
      if ((ghostTeam as any).selectActions && (ghostTeam as any).updateAll) {
        this.ghostQLearning = ghostTeam as SimpleGhostTeamQLearning;
      } else {
        this.ghostTeam = ghostTeam as SimpleGhostTeam;
      }
    }

    this.ghostAI = new SimpleGhostTeamAI();
    this.useAI = useAI;
    this.reset();
  }

  /**
   * Reset environment to initial state
   */
  reset(): GameState {
    this.pacmanPosition = { ...STARTING_POSITIONS.pacman };
    this.pacmanDirection = 'RIGHT';
    this.dots = this.initializeDots();
    this.powerPellets = this.initializePowerPellets();
    this.ghosts = this.initializeGhosts();
    this.isFrightened = false;
    this.score = 0;
    this.tickCount = 0;
    this.isDone = false;
    this.frightenedTimer = 0;
    this.startTime = Date.now();

    return this.getState();
  }

  /**
   * Take a step in the environment
   */
  step(direction: Direction): {
    state: GameState;
    reward: {
      dotCollected: boolean;
      powerPelletCollected: boolean;
      ghostEaten: boolean;
      died: boolean;
      won: boolean;
    };
    done: boolean;
  } {
    this.tickCount++;
    this.pacmanDirection = direction;

    let dotCollected = false;
    let powerPelletCollected = false;
    let ghostEaten = false;
    let died = false;
    let won = false;

    // Move Pacman
    const dir = CONSTANTS.DIRECTIONS[direction];
    const targetX = this.pacmanPosition.x + dir.x;
    const targetY = this.pacmanPosition.y + dir.y;

    if (this.isWalkable(targetX, targetY)) {
      this.pacmanPosition.x = targetX;
      this.pacmanPosition.y = targetY;
      
      // Check for teleport
      for (const teleport of TELEPORT_POINTS) {
        if (this.pacmanPosition.x === teleport.entry.x && this.pacmanPosition.y === teleport.entry.y) {
          this.pacmanPosition = { ...teleport.exit };
          break;
        }
      }

      // Check dot collision
      const dotIndex = this.dots.findIndex(
        d => d.x === this.pacmanPosition.x && d.y === this.pacmanPosition.y
      );
      if (dotIndex !== -1) {
        this.dots.splice(dotIndex, 1);
        this.score += CONSTANTS.DOT_VALUE;
        dotCollected = true;
      }

      // Check power pellet collision
      const pelletIndex = this.powerPellets.findIndex(
        p => p.x === this.pacmanPosition.x && p.y === this.pacmanPosition.y
      );
      if (pelletIndex !== -1) {
        this.powerPellets.splice(pelletIndex, 1);
        this.score += CONSTANTS.POWER_PELLET_VALUE;
        powerPelletCollected = true;
        this.activateFrightened();
      }
    }

    // Move ghosts (simple AI for training)
    this.moveGhosts();

    // Update frightened mode
    if (this.isFrightened) {
      this.frightenedTimer--;
      if (this.frightenedTimer <= 0) {
        this.isFrightened = false;
        // CRITICAL FIX: Reset all ghost frightened flags!
        for (const ghost of this.ghosts) {
          ghost.isFrightened = false;
        }
      }
    }

    // Check collisions
    for (const ghost of this.ghosts) {
      if (ghost.position.x === this.pacmanPosition.x &&
          ghost.position.y === this.pacmanPosition.y) {
        
        if (this.isFrightened && ghost.isFrightened) {
          // Eat ghost
          ghostEaten = true;
          this.score += CONSTANTS.GHOST_CAPTURE_BASE_SCORE;
          // Respawn ghost
          ghost.position = { ...STARTING_POSITIONS.ghostHouse };
          ghost.isFrightened = false;
        } else if (!ghost.isFrightened) {
          // Pacman dies
          died = true;
          this.isDone = true;
        }
      }
    }

    // Check win condition (all dots collected)
    if (this.dots.length === 0) {
      won = true;
      this.isDone = true;
    }

    // Check timeout - NOBODY wins, both failed!
    // Pac-Man: Didn't finish
    // Ghosts: Didn't catch him
    if (this.tickCount >= this.maxTicks) {
      this.isDone = true;
      // won stays false, died stays as is
    }

    return {
      state: this.getState(),
      reward: {
        dotCollected,
        powerPelletCollected,
        ghostEaten,
        died,
        won
      },
      done: this.isDone
    };
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return {
      position: { ...this.pacmanPosition },
      direction: this.pacmanDirection,
      dots: this.dots.map(d => ({ ...d })),
      powerPellets: this.powerPellets.map(p => ({ ...p })),
      ghosts: this.ghosts.map(g => ({
        position: { ...g.position },
        direction: g.direction,
        isFrightened: g.isFrightened
      })),
      isFrightened: this.isFrightened,
      score: this.score,
      tickCount: this.tickCount
    };
  }

  /**
   * Initialize dots
   */
  private initializeDots(): Position[] {
    const dots: Position[] = [];
    for (let y = 0; y < MAZE_LAYOUT.length; y++) {
      for (let x = 0; x < MAZE_LAYOUT[0].length; x++) {
        if (MAZE_LAYOUT[y][x] === 1) {
          dots.push({ x, y });
        }
      }
    }
    return dots;
  }

  /**
   * Initialize power pellets
   */
  private initializePowerPellets(): Position[] {
    const pellets: Position[] = [];
    for (let y = 0; y < MAZE_LAYOUT.length; y++) {
      for (let x = 0; x < MAZE_LAYOUT[0].length; x++) {
        if (MAZE_LAYOUT[y][x] === 2) {
          pellets.push({ x, y });
        }
      }
    }
    return pellets;
  }

  /**
   * Initialize ghosts - start them OUTSIDE the ghost house
   */
  private initializeGhosts(): Ghost[] {
    return [
      {
        position: { x: 14, y: 11 }, // Blinky - above ghost house
        direction: 'DOWN' as Direction,
        isFrightened: false
      },
      {
        position: { x: 12, y: 11 }, // Pinky - left of ghost house entrance
        direction: 'DOWN' as Direction,
        isFrightened: false
      },
      {
        position: { x: 16, y: 11 }, // Inky - right of ghost house entrance
        direction: 'DOWN' as Direction,
        isFrightened: false
      },
      {
        position: { x: 14, y: 8 }, // Clyde - further above
        direction: 'DOWN' as Direction,
        isFrightened: false
      }
    ];
  }

  /**
   * Ghost movement - uses Q-learning or A* AI
   */
  private moveGhosts(): void {
    if (this.ghostQLearning) {
      // Use NEW Q-learning team (curriculum trained!)
      const actions = this.ghostQLearning.selectActions(this.pacmanPosition, this.ghosts);

      for (let i = 0; i < this.ghosts.length; i++) {
        const ghost = this.ghosts[i];
        const action = actions[i];
        const delta = CONSTANTS.DIRECTIONS[action];
        const newPos = { x: ghost.position.x + delta.x, y: ghost.position.y + delta.y };

        if (this.isWalkable(newPos.x, newPos.y)) {
          ghost.position = newPos;
          ghost.direction = action;
        }
      }
    } else if (this.useAI) {
      // Use simple A* AI
      const actions = this.ghostAI.selectActions(this.pacmanPosition, this.ghosts);

      for (let i = 0; i < this.ghosts.length; i++) {
        const ghost = this.ghosts[i];
        const action = actions[i];
        const delta = CONSTANTS.DIRECTIONS[action];
        const newPos = { x: ghost.position.x + delta.x, y: ghost.position.y + delta.y };

        if (this.isWalkable(newPos.x, newPos.y)) {
          ghost.position = newPos;
          ghost.direction = action;
        }
      }
    } else if (this.ghostTeam) {
      // Use Q-learning ghost team (complex, experimental)
      const validActionsList = this.ghosts.map(g => this.getValidDirections(g.position));
      const actions = this.ghostTeam.selectActions(
        this.pacmanPosition,
        this.ghosts,
        validActionsList,
        this.dots,
        this.powerPellets
      );

      for (let i = 0; i < this.ghosts.length; i++) {
        const ghost = this.ghosts[i];
        const action = actions[i];
        const delta = CONSTANTS.DIRECTIONS[action];
        const newPos = { x: ghost.position.x + delta.x, y: ghost.position.y + delta.y };

        if (this.isWalkable(newPos.x, newPos.y)) {
          ghost.position = newPos;
          ghost.direction = action;
        }
      }
    } else {
      // Random fallback
      for (const ghost of this.ghosts) {
        const validDirs = this.getValidDirections(ghost.position);
        if (validDirs.length > 0) {
          const randomDir = validDirs[Math.floor(Math.random() * validDirs.length)];
          const delta = CONSTANTS.DIRECTIONS[randomDir];
          ghost.position = { x: ghost.position.x + delta.x, y: ghost.position.y + delta.y };
          ghost.direction = randomDir;
        }
      }
    }
  }

  /**
   * Predict ghost movement using A* pathfinding
   * Ghosts now properly navigate around walls and use teleports!
   */
  private predictGhostNextMove(ghost: Ghost, pacmanPos: Position): Position {
    const path = this.findPath(ghost.position, pacmanPos);
    
    // If we found a path with at least 2 nodes (current + next), take the next step
    if (path && path.length >= 2) {
      return path[1]; // path[0] is current position, path[1] is next step
    }
    
    // Fallback to staying in place (shouldn't happen)
    return ghost.position;
  }

  /**
   * A* pathfinding with teleport support
   * Returns array of positions from start to goal (including start)
   */
  private findPath(start: Position, goal: Position): Position[] | null {
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    
    const startNode: PathNode = {
      pos: start,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);
    
    while (openSet.length > 0) {
      // Get node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      
      // Check if we reached the goal (or very close)
      if (this.manhattanDistance(current.pos, goal) <= 1) {
        return this.reconstructPath(current);
      }
      
      const posKey = `${current.pos.x},${current.pos.y}`;
      closedSet.add(posKey);
      
      // Get neighbors (including teleports!)
      const neighbors = this.getNeighbors(current.pos);
      
      for (const neighborPos of neighbors) {
        const neighborKey = `${neighborPos.x},${neighborPos.y}`;
        if (closedSet.has(neighborKey)) continue;
        
        const g = current.g + 1;
        const h = this.heuristic(neighborPos, goal);
        const f = g + h;
        
        // Check if neighbor is already in open set
        const existing = openSet.find(n => n.pos.x === neighborPos.x && n.pos.y === neighborPos.y);
        
        if (!existing) {
          openSet.push({
            pos: neighborPos,
            g,
            h,
            f,
            parent: current
          });
        } else if (g < existing.g) {
          // Found a better path to this neighbor
          existing.g = g;
          existing.f = g + existing.h;
          existing.parent = current;
        }
      }
    }
    
    // No path found
    return null;
  }

  /**
   * Get valid neighbor positions (including teleports)
   */
  private getNeighbors(pos: Position): Position[] {
    const neighbors: Position[] = [];
    const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    
    // Regular moves
    for (const dir of directions) {
      const delta = CONSTANTS.DIRECTIONS[dir];
      const newPos = { x: pos.x + delta.x, y: pos.y + delta.y };
      
      if (this.isWalkable(newPos.x, newPos.y)) {
        neighbors.push(newPos);
      }
    }
    
    // Check for teleport
    for (const teleport of TELEPORT_POINTS) {
      if (pos.x === teleport.entry.x && pos.y === teleport.entry.y) {
        neighbors.push(teleport.exit);
      }
    }
    
    return neighbors;
  }

  /**
   * Reconstruct path from A* node chain
   */
  private reconstructPath(node: PathNode): Position[] {
    const path: Position[] = [];
    let current: PathNode | null = node;
    
    while (current !== null) {
      path.unshift(current.pos);
      current = current.parent;
    }
    
    return path;
  }

  /**
   * A* heuristic (Manhattan distance with teleport consideration)
   */
  private heuristic(from: Position, to: Position): number {
    // Regular Manhattan distance
    const regularDist = this.manhattanDistance(from, to);
    
    // Check if teleport would be faster
    let teleportDist = Infinity;
    for (const teleport of TELEPORT_POINTS) {
      const distToEntry = this.manhattanDistance(from, teleport.entry);
      const distFromExit = this.manhattanDistance(teleport.exit, to);
      teleportDist = Math.min(teleportDist, distToEntry + 1 + distFromExit);
    }
    
    return Math.min(regularDist, teleportDist);
  }


  /**
   * Get direction to flee from Pacman
   */
  private getFleeDirection(from: Position, pacmanPos: Position): Direction {
    const validDirs = this.getValidDirections(from);
    
    if (validDirs.length === 0) return 'UP';
    
    // Pick direction that maximizes distance from Pacman
    let bestDir = validDirs[0];
    let maxDist = -1;
    
    for (const dir of validDirs) {
      const delta = CONSTANTS.DIRECTIONS[dir];
      const newPos = { x: from.x + delta.x, y: from.y + delta.y };
      const dist = this.manhattanDistance(newPos, pacmanPos);
      
      if (dist > maxDist) {
        maxDist = dist;
        bestDir = dir;
      }
    }
    
    return bestDir;
  }

  /**
   * Get valid movement directions from position
   */
  private getValidDirections(pos: Position): Direction[] {
    const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    return dirs.filter(dir => {
      const delta = CONSTANTS.DIRECTIONS[dir];
      return this.isWalkable(pos.x + delta.x, pos.y + delta.y);
    });
  }

  /**
   * Manhattan distance between two positions
   */
  private manhattanDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * Activate frightened mode
   */
  private activateFrightened(): void {
    this.isFrightened = true;
    this.frightenedTimer = Math.floor(CONSTANTS.FRIGHTENED_DURATION / CONSTANTS.TICK_RATE);
    
    for (const ghost of this.ghosts) {
      ghost.isFrightened = true;
    }
  }

  /**
   * Check if position is walkable
   */
  private isWalkable(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    
    if (ix < 0 || ix >= CONSTANTS.GRID_WIDTH || 
        iy < 0 || iy >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    
    const cell = MAZE_LAYOUT[iy][ix];
    // Walkable: dots (1), power pellets (2), ghost house (3) - NOT walls (0)
    return cell !== 0;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    score: number;
    dotsCollected: number;
    survivalTime: number;
    tickCount: number;
  } {
    const totalDots = this.initializeDots().length;
    const dotsCollected = totalDots - this.dots.length;

    return {
      score: this.score,
      dotsCollected,
      survivalTime: this.tickCount, // Use ticks, not wall clock time!
      tickCount: this.tickCount
    };
  }
}

