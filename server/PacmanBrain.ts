/**
 * PacmanBrain - Advanced AI using Predictive Lookahead with Heuristic Ghost Prediction
 * 
 * This AI uses a "projection-based" approach rather than true minimax. It looks ahead
 * multiple moves into the future by predicting the most likely ghost moves, then
 * evaluates which path leads to the best outcome.
 * 
 * HOW IT WORKS:
 * 1. Pac-Man explores all possible moves at each decision point (branching)
 * 2. For ghost moves, it predicts their most likely action (single path, no branching)
 * 3. This creates a tree that branches only for Pac-Man's moves, not ghost moves
 * 4. Pac-Man chooses the path with the best projected outcome
 * 
 * WHY NOT TRUE MINIMAX?
 * True minimax would explore ALL possible ghost move combinations (4 ghosts × 4 moves = 256
 * branches per ghost turn). This is computationally infeasible for real-time gameplay.
 * By predicting a single "most likely" ghost move, we trade perfect adversarial reasoning
 * for practical real-time performance.
 * 
 * EXAMPLE:
 * Without lookahead: "This hallway looks safe right now"
 * With lookahead: "If I go down this hallway, the ghosts will likely block the exit in 3 moves - trap!"
 * 
 * CONFIGURATION:
 * - Default search depth: 12 (looks 12 moves ahead - excellent long-range planning)
 * - Adjustable via setSearchDepth(depth) method
 * - Range: 1-20 (depth 15-20 allows seeing pellets across entire maze)
 * - Strong directional stability to prevent dithering
 *
 * PERFORMANCE:
 * With predictive lookahead (not true minimax), even depth 12-15 evaluates only thousands
 * of nodes per decision, completing in 10-50ms on modern hardware. The single-path ghost
 * prediction keeps the search tree manageable even at high depths.
 */

import { MAZE_LAYOUT, TELEPORT_POINTS, Position } from '../shared/maze';
import CONSTANTS = require('../shared/constants');

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Ghost {
  position: Position;
  direction: Direction;
  isFrightened: boolean;
}

interface CostWeights {
  dotValue: number;          // How much we want dots
  powerPelletValue: number;  // How much we want power pellets
  ghostDanger: number;       // How much we avoid ghosts (negative cost)
  ghostTarget: number;       // How much we chase ghosts when frightened
  explorationBonus: number;  // Bonus for exploring new areas
}

interface HeuristicWeights {
  GHOST_DANGER: number;
  CHOKE_POINT_DANGER: number;
  OPEN_SPACE_BONUS: number;
  FRIGHTENED_BONUS: number;
  POWER_PELLET_URGENCY: number;
  PROGRESS_BONUS: number;
  DISTANCE_PENALTY: number;
  EXPLORATION_BONUS: number;
}

interface GameState {
  pacmanPos: Position;
  previousPacmanPos: Position;  // Track previous position for swap detection
  ghosts: Ghost[];
  dots: Position[];
  powerPellets: Position[];
  positionHistory: Position[];
}

declare namespace PacmanBrain {
  export interface DirectionDebugInfo {
    direction: Direction;
    isWalkable: boolean;
    finalScore: number;
    breakdown: {
      ghostDanger: number;
      chokePointDanger: number;
      positionalAdvantage: number;
      frightenedGhostBonus: number;
      powerPelletUrgency: number;
      progressScore: number;
      distanceToFood: number;
      explorationBonus: number;
    };
  }

  export interface AIDebugInfo {
    position: Position;
    directions: DirectionDebugInfo[];
    chosenDirection: Direction | null;
    weights: HeuristicWeights;
    isFrightened: boolean;
  }
}

class PacmanBrain {
  private maze: number[][];
  private searchDepth: number;
  private nodesEvaluated: number; // For debugging/performance tracking
  private weights: HeuristicWeights;

  constructor(searchDepth: number = 12, weights: Partial<HeuristicWeights> = {}) {
    this.maze = MAZE_LAYOUT;
    this.searchDepth = Math.max(1, Math.min(searchDepth, 20)); // Clamp to 1-20 for deep planning
    this.nodesEvaluated = 0;

    // ULTRA-DEFENSIVE weights - survival is everything
    // These weights prioritize staying alive above all else
    this.weights = {
      GHOST_DANGER: -2500,          // EXTREME danger avoidance - never get close
      CHOKE_POINT_DANGER: -800,     // Heavily avoid getting trapped
      OPEN_SPACE_BONUS: 80,         // CRITICAL: always maintain escape routes
      FRIGHTENED_BONUS: 1200,       // Aggressively hunt during power pellet mode
      POWER_PELLET_URGENCY: 6000,   // Life-saving priority
      PROGRESS_BONUS: 200,          // Collect pellets, but survival is paramount
      DISTANCE_PENALTY: -3,         // Gentle pull toward food
      EXPLORATION_BONUS: 150,       // Incentivize exploring when no nearby pellets
      ...weights
    };
  }





  // Manhattan distance heuristic (considers teleportation as a shortcut)
  heuristic(a: Position, b: Position): number {
    const directDist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    
    // Check if using a teleport would be faster
    // For each teleport pair, calculate: distance to entry + 1 (teleport cost) + distance from exit to target
    let minTeleportDist = Infinity;
    for (const teleport of TELEPORT_POINTS) {
      const distToEntry = Math.abs(a.x - teleport.entry.x) + Math.abs(a.y - teleport.entry.y);
      const distFromExit = Math.abs(teleport.exit.x - b.x) + Math.abs(teleport.exit.y - b.y);
      const teleportDist = distToEntry + 1 + distFromExit; // +1 for the teleport move
      minTeleportDist = Math.min(minTeleportDist, teleportDist);
    }
    
    // Return the shorter of direct distance or teleport distance
    return Math.min(directDist, minTeleportDist);
  }

  // Helper: Get position after moving in a direction (includes teleportation)
  getPositionFromMove(pos: Position, direction: Direction): Position {
    const dirVec = CONSTANTS.DIRECTIONS[direction];
    const newPos = {
      x: pos.x + dirVec.x,
      y: pos.y + dirVec.y
    };

    // Check if this move would take us to a teleport entry point
    const teleportExit = this.checkTeleport(newPos);
    if (teleportExit) {
      return teleportExit;
    }

    return newPos;
  }

  // Check if a position is a teleport entry point and return the exit position
  private checkTeleport(pos: Position): Position | null {
    for (const teleport of TELEPORT_POINTS) {
      if (pos.x === teleport.entry.x && pos.y === teleport.entry.y) {
        return teleport.exit;
      }
    }
    return null;
  }

  // Helper: Check if a position is walkable
  isWalkable(pos: Position): boolean {
    if (pos.x < 0 || pos.x >= CONSTANTS.GRID_WIDTH ||
        pos.y < 0 || pos.y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    // Ensure the row exists before accessing the column
    if (!this.maze[pos.y]) {
      return false;
    }
    // Walkable: not a wall (0)
    return this.maze[pos.y][pos.x] !== 0;
  }

  // ===============================================
  // A* PATHFINDING FOR SAFE EXPLORATION
  // ===============================================

  /**
   * A* pathfinding algorithm - finds optimal path to target
   * Used when far from danger to efficiently navigate to pellets
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
   * Get direction to move toward target position
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

  // ===============================================
  // HEURISTIC HELPER FUNCTIONS
  // ===============================================
  // These functions encapsulate the various scoring heuristics used by the AI.
  // Each heuristic evaluates a specific aspect of the game state.

  /**
   * Check if the current state is a terminal state (win or loss).
   * @returns Infinity for win, -Infinity for loss, or 0 if not terminal
   */
  private checkTerminalState(
    pacmanPos: Position,
    ghosts: Ghost[],
    dots: Position[],
    powerPellets: Position[]
  ): number | null {
    // WIN CONDITION: If there are no dots left, this is the best possible outcome.
    if (dots.length === 0 && powerPellets.length === 0) {
      return Infinity;
    }

    // LOSE CONDITION: If Pac-Man is on the same tile as a non-frightened ghost, it's game over.
    for (const ghost of ghosts) {
      if (!ghost.isFrightened && this.heuristic(pacmanPos, ghost.position) <= 1) {
        return -Infinity;
      }
    }

    return null; // Not a terminal state
  }

  /**
   * Calculate ghost danger heuristic.
   * Creates a "force field" around ghosts - the penalty grows as they get closer.
   * @returns Negative score representing danger level from ghosts
   */
  private calculateGhostDanger(pacmanPos: Position, ghosts: Ghost[]): number {
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);
    if (nonFrightenedGhosts.length === 0) {
      return 0; // No danger if all ghosts are frightened
    }

    const minGhostDist = Math.min(
      ...nonFrightenedGhosts.map(g => this.heuristic(pacmanPos, g.position))
    );

    // Inverse distance creates exponential danger as ghosts approach
    const danger = this.weights.GHOST_DANGER / (minGhostDist + 1);
    

    return danger;
  }

  /**
   * Calculate progress score heuristic.
   * Rewards Pac-Man for eating dots during the lookahead simulation.
   * @returns Positive score for each dot/pellet eaten
   */
  private calculateProgressScore(
    dots: Position[],
    powerPellets: Position[],
    initialDotCount: number
  ): number {
    const currentFoodCount = dots.length + powerPellets.length;
    const foodEaten = initialDotCount - currentFoodCount;

    return foodEaten * this.weights.PROGRESS_BONUS;
  }

  /**
   * Calculate frightened ghost bonus heuristic.
   * Rewards Pac-Man for being close to vulnerable, frightened ghosts.
   * @returns Positive score for proximity to frightened ghosts
   */
  private calculateFrightenedGhostBonus(pacmanPos: Position, ghosts: Ghost[]): number {
    const frightenedGhosts = ghosts.filter(g => g.isFrightened);
    if (frightenedGhosts.length === 0) {
      return 0;
    }

    // We want the bonus to be higher the closer we are
    const minFrightenedDist = Math.min(
      ...frightenedGhosts.map(g => this.heuristic(pacmanPos, g.position))
    );

    // Similar to ghost danger, but provides a bonus instead of a penalty
    return this.weights.FRIGHTENED_BONUS / (minFrightenedDist + 1);
  }

  /**
   * Calculate distance-to-food heuristic.
   * Encourages Pac-Man to move towards the closest food item.
   * @returns Negative score proportional to distance to nearest food
   */
  private calculateDistanceToFoodScore(
    pacmanPos: Position,
    dots: Position[],
    powerPellets: Position[]
  ): number {
    const allFood = [...dots, ...powerPellets];
    if (allFood.length === 0) {
      return 0; // No penalty if no food left
    }

    const minFoodDist = Math.min(
      ...allFood.map(food => this.heuristic(pacmanPos, food))
    );

    return minFoodDist * this.weights.DISTANCE_PENALTY;
  }

  /**
   * Calculate exploration bonus when no nearby pellets.
   * Encourages Pac-Man to keep moving and explore when in "food deserts".
   * @returns Positive bonus if no pellets nearby (safe exploration)
   */
  private calculateExplorationBonus(
    pacmanPos: Position,
    dots: Position[],
    powerPellets: Position[],
    ghosts: Ghost[]
  ): number {
    const NEARBY_RADIUS = 6; // Check for pellets within 6 tiles

    const allFood = [...dots, ...powerPellets];

    // Count pellets within nearby radius
    const nearbyPellets = allFood.filter(
      food => this.heuristic(pacmanPos, food) <= NEARBY_RADIUS
    );

    // If there are nearby pellets, no exploration bonus (normal behavior)
    if (nearbyPellets.length > 0) {
      return 0;
    }

    // No nearby pellets - we're in a food desert
    // Check if it's safe to explore (no nearby ghosts)
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);
    if (nonFrightenedGhosts.length > 0) {
      const minGhostDist = Math.min(
        ...nonFrightenedGhosts.map(g => this.heuristic(pacmanPos, g.position))
      );

      // Only give exploration bonus if reasonably safe (>8 tiles from ghosts)
      if (minGhostDist > 8) {
        return this.weights.EXPLORATION_BONUS;
      }
    } else {
      // No dangerous ghosts - always incentivize exploration
      return this.weights.EXPLORATION_BONUS;
    }

    return 0;
  }

  // ===============================================
  // GHOST PREDICTION
  // ===============================================

  /**
   * Predict where a ghost will move next.
   * Ghosts prefer to continue in their current direction, but will choose
   * a new direction if blocked or if a better path to Pac-Man is available.
   */
  predictGhostNextMove(ghost: Ghost, pacmanPos: Position): Position {
    // Ghosts have STRONG directional inertia - they don't turn instantly
    // This prevents the AI from thinking ghosts can perfectly intercept every escape route
    const currentDirPos = this.getPositionFromMove(ghost.position, ghost.direction);

    // If current direction is walkable, ghosts strongly prefer to continue
    if (this.isWalkable(currentDirPos)) {
      const currentDist = this.heuristic(ghost.position, pacmanPos);
      const newDist = this.heuristic(currentDirPos, pacmanPos);

      // Ghosts keep their direction unless moving MUCH farther away (tolerance: 5 tiles)
      // This creates realistic "you can escape if you turn around" scenarios
      if (newDist <= currentDist + 5) {
        return currentDirPos;
      }
    }

    // Only change direction if really necessary (blocked or way off course)
    const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    let bestMove = ghost.position;
    let minDistance = this.heuristic(ghost.position, pacmanPos);

    for (const dir of directions) {
      const newPos = this.getPositionFromMove(ghost.position, dir);
      if (this.isWalkable(newPos)) {
        const distance = this.heuristic(newPos, pacmanPos);
        if (distance < minDistance) {
          minDistance = distance;
          bestMove = newPos;
        }
      }
    }

    return bestMove;
  }

  /**
   * Calculates a bonus for being on a power pellet when a ghost is dangerously close.
   * This teaches the AI to use power pellets as a defensive, life-saving tool.
   * @returns A large positive score if the situation is urgent, otherwise 0.
   */
  private calculatePowerPelletUrgency(
    pacmanPos: Position,
    ghosts: Ghost[],
    powerPellets: Position[]
  ): number {
    const URGENCY_RADIUS = 8; // How close a ghost must be to trigger the bonus.

    // Check if Pac-Man is currently on a power pellet's location.
    const isOnPellet = powerPellets.some(p => p.x === pacmanPos.x && p.y === pacmanPos.y);

    if (!isOnPellet) {
      return 0; // Not on a pellet, so no urgency bonus.
    }

    // Find the closest non-frightened ghost.
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);
    if (nonFrightenedGhosts.length === 0) {
      return 0; // No danger, no urgency.
    }

    const minGhostDist = Math.min(
      ...nonFrightenedGhosts.map(g => this.heuristic(pacmanPos, g.position))
    );

    // If a ghost is within the urgency radius, apply the bonus.
    if (minGhostDist < URGENCY_RADIUS) {
      // The closer the ghost, the larger the bonus.
      const urgency = this.weights.POWER_PELLET_URGENCY / (minGhostDist + 1);
      return urgency;
    }

    return 0; // Ghost is too far away to be an urgent threat.
  }

   /**
   * Performs a Breadth-First Search from a start position to find the number of
   * reachable, unique, and safe tiles within a given depth.
   * This measures how "open" or "cramped" a position is.
   * @returns The number of safe tiles reachable, representing the escape route value.
   */
   private calculateEscapeRouteValue(startPos: Position, ghosts: Ghost[]): number {
    const searchDepth = 6; // How far ahead to check for open space.
    const ghostDangerRadius = 3; // Avoid counting tiles too close to a ghost.
    
    const queue: { pos: Position; depth: number }[] = [{ pos: startPos, depth: 0 }];
    const visited = new Set<string>([`${startPos.x},${startPos.y}`]);
    let reachableTiles = 0;

    // Pre-calculate ghost positions for efficiency
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);

    while (queue.length > 0) {
      const { pos, depth } = queue.shift()!;

      if (depth >= searchDepth) continue;

      reachableTiles++;

      const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      for (const dir of directions) {
        const nextPos = this.getPositionFromMove(pos, dir);
        const posKey = `${nextPos.x},${nextPos.y}`;

        if (this.isWalkable(nextPos) && !visited.has(posKey)) {
          // Check if the next position is too close to a ghost
          const isSafe = nonFrightenedGhosts.every(
            g => this.heuristic(nextPos, g.position) > ghostDangerRadius
          );

          if (isSafe) {
            visited.add(posKey);
            queue.push({ pos: nextPos, depth: depth + 1 });
          }
        }
      }
    }
    return reachableTiles;
  }

  /**
   * Calculates a bonus for being in a strategically advantageous position
   * with plenty of room to maneuver.
   * @returns A positive score proportional to the number of safe escape routes.
   */
  private calculatePositionalAdvantage(pacmanPos: Position, ghosts: Ghost[]): number {
    const escapeRouteValue = this.calculateEscapeRouteValue(pacmanPos, ghosts);
    return escapeRouteValue * this.weights.OPEN_SPACE_BONUS;
  }

  /**
   * Calculates a penalty based on how well ghosts are controlling
   * the intersections (choke points) near Pac-Man.
   * @returns A negative score representing the strategic threat from ghosts.
   */
  private calculateChokePointDanger(pacmanPos: Position, ghosts: Ghost[]): number {
    const CHECK_RADIUS = 7; // How far from Pac-Man to check for intersections.

    let totalDanger = 0;
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);
    if (nonFrightenedGhosts.length === 0) return 0;

    // Find all intersections near Pac-Man
    for (let x = pacmanPos.x - CHECK_RADIUS; x < pacmanPos.x + CHECK_RADIUS; x++) {
      for (let y = pacmanPos.y - CHECK_RADIUS; y < pacmanPos.y + CHECK_RADIUS; y++) {
        const pos = { x, y };
        if (this.isWalkable(pos) && this.calculateExits(pos) > 2) {
          // This is an intersection. How close is the nearest ghost to it?
          const distToGhost = Math.min(
            ...nonFrightenedGhosts.map(g => this.heuristic(pos, g.position))
          );
          // The closer a ghost is to this intersection, the more danger it represents.
          totalDanger += this.weights.CHOKE_POINT_DANGER / (distToGhost + 1);
        }
      }
    }
    return totalDanger;
  }

  // We need this helper function from before
  private calculateExits(pos: Position): number {
    const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    let exitCount = 0;
    for (const dir of directions) {
      if (this.isWalkable(this.getPositionFromMove(pos, dir as Direction))) {
        exitCount++;
      }
    }
    return exitCount;
  }

  // ===============================================
  // STATE EVALUATION
  // ===============================================

  /**
   * The heart of the AI - evaluate a future game state.
   * Combines multiple heuristics to produce a single score.
   *
   * TIERED EVALUATION SYSTEM:
   * - includeExpensiveHeuristics = false: Only fast heuristics (for deep nodes)
   * - includeExpensiveHeuristics = true: All heuristics (for root-level moves)
   */
  evaluateState(
    pacmanPos: Position,
    ghosts: Ghost[],
    dots: Position[],
    powerPellets: Position[],
    initialDotCount: number,
    includeExpensiveHeuristics: boolean = true
  ): number {
    // Priority 1: Check for terminal states (win/loss)
    const terminalValue = this.checkTerminalState(pacmanPos, ghosts, dots, powerPellets);
    if (terminalValue !== null) {
      return terminalValue;
    }

    // Priority 2: Calculate score for non-terminal states
    let score = 0;

    // TIER 1: Fast heuristics (always calculated, even at deep nodes)
    score += this.calculateGhostDanger(pacmanPos, ghosts);
    score += this.calculateProgressScore(dots, powerPellets, initialDotCount);
    score += this.calculateDistanceToFoodScore(pacmanPos, dots, powerPellets);
    score += this.calculateFrightenedGhostBonus(pacmanPos, ghosts);
    score += this.calculatePowerPelletUrgency(pacmanPos, ghosts, powerPellets);
    score += this.calculateExplorationBonus(pacmanPos, dots, powerPellets, ghosts);

    // TIER 2: Expensive heuristics (only for root-level evaluation)
    if (includeExpensiveHeuristics) {
      score += this.calculatePositionalAdvantage(pacmanPos, ghosts);  // BFS - expensive!
      score += this.calculateChokePointDanger(pacmanPos, ghosts);     // Nested loops - expensive!
    }

    return score;
  }

  // Helper: Clone game state for simulation
  private cloneGameState(state: GameState): GameState {
    return {
      pacmanPos: { ...state.pacmanPos },
      previousPacmanPos: { ...state.previousPacmanPos },
      ghosts: state.ghosts.map(g => ({
        position: { ...g.position },
        direction: g.direction,
        isFrightened: g.isFrightened
      })),
      dots: state.dots.map(d => ({ ...d })),
      powerPellets: state.powerPellets.map(p => ({ ...p })),
      positionHistory: state.positionHistory.map(p => ({ ...p }))
    };
  }

  // Helper: Simulate Pac-Man moving in a direction (modifies state)
  private simulatePacmanMove(state: GameState, direction: Direction): boolean {
    const newPos = this.getPositionFromMove(state.pacmanPos, direction);

    // Check if move is valid
    if (!this.isWalkable(newPos)) {
      return false;
    }

    // Store previous position BEFORE moving (critical for swap detection!)
    state.previousPacmanPos = { ...state.pacmanPos };

    // Update position
    state.pacmanPos = newPos;

    // Add to history
    state.positionHistory.push({ ...newPos });
    if (state.positionHistory.length > 15) {
      state.positionHistory.shift();
    }

    // Check if Pac-Man eats a dot
    const dotIndex = state.dots.findIndex(d => d.x === newPos.x && d.y === newPos.y);
    if (dotIndex !== -1) {
      state.dots.splice(dotIndex, 1);
    }

    // Check if Pac-Man eats a power pellet
    const pelletIndex = state.powerPellets.findIndex(p => p.x === newPos.x && p.y === newPos.y);
    if (pelletIndex !== -1) {
      state.powerPellets.splice(pelletIndex, 1);
      // Make all ghosts frightened
      for (const ghost of state.ghosts) {
        ghost.isFrightened = true;
      }
    }

    return true;
  }

  // Helper: Simulate all ghosts moving (they move to minimize Pac-Man's score)
  // Returns true if Pac-Man survives, false if collision/swap occurred
  private simulateGhostMoves(state: GameState): boolean {
    const currentPacmanPos = state.pacmanPos;
    const previousPacmanPos = state.previousPacmanPos;

    for (const ghost of state.ghosts) {
      // Skip frightened ghosts for collision check
      if (ghost.isFrightened) {
        const newPos = this.predictGhostNextMove(ghost, currentPacmanPos);
        ghost.position = newPos;
        continue;
      }

      const ghostPreviousPos = ghost.position;
      const newPos = this.predictGhostNextMove(ghost, currentPacmanPos);
      ghost.position = newPos;

      // Check for collision: same tile after moves
      if (newPos.x === currentPacmanPos.x && newPos.y === currentPacmanPos.y) {
        return false; // COLLISION!
      }

      // Check for swap: they swapped positions
      if (ghostPreviousPos.x === currentPacmanPos.x && ghostPreviousPos.y === currentPacmanPos.y &&
          newPos.x === previousPacmanPos.x && newPos.y === previousPacmanPos.y) {
        return false; // SWAP COLLISION!
      }
    }

    return true; // Survived
  }

  // Get all valid Pac-Man moves from a position
  private getValidPacmanMoves(pos: Position): Direction[] {
    const allMoves: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const validMoves: Direction[] = [];

    for (const move of allMoves) {
      const newPos = this.getPositionFromMove(pos, move);
      if (this.isWalkable(newPos)) {
        validMoves.push(move);
      }
    }

    return validMoves;
  }

  // PREDICTIVE LOOKAHEAD ALGORITHM
  // Pac-Man explores all his possible moves, but predicts single "most likely" ghost responses
  // This is NOT true minimax - it's a single-path projection for each Pac-Man move
  private predictiveLookahead(
    state: GameState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizingPlayer: boolean,
    initialDotCount: number
  ): number {
    this.nodesEvaluated++;

    // Base case: reached depth limit or game over
    if (depth === 0 || state.dots.length === 0) {
      return this.evaluateState(
        state.pacmanPos,
        state.ghosts,
        state.dots,
        state.powerPellets,
        initialDotCount,
        false  // Skip expensive heuristics at deep nodes for performance
      );
    }

    if (isMaximizingPlayer) {
      // Pac-Man's turn - maximize score by exploring ALL possible moves
      let maxEval = -Infinity;
      const validMoves = this.getValidPacmanMoves(state.pacmanPos);

      // If no valid moves, return current evaluation
      if (validMoves.length === 0) {
        return this.evaluateState(
          state.pacmanPos,
          state.ghosts,
          state.dots,
          state.powerPellets,
          initialDotCount,
          false  // Skip expensive heuristics for performance
        );
      }

      for (const move of validMoves) {
        // Clone state and simulate Pac-Man's move
        const newState = this.cloneGameState(state);
        if (!this.simulatePacmanMove(newState, move)) {
          continue;
        }

        // Recursively evaluate (now predict ghost responses)
        const evaluation = this.predictiveLookahead(newState, depth - 1, alpha, beta, false, initialDotCount);
        maxEval = Math.max(maxEval, evaluation);

        // Alpha-beta pruning (still useful even with single ghost path)
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) {
          break; // Beta cutoff
        }
      }

      return maxEval;
    } else {
      // Ghost prediction phase - predict SINGLE most likely ghost response (no branching)
      // This is the key difference from true minimax!
      const newState = this.cloneGameState(state);
      const survived = this.simulateGhostMoves(newState); // Predicts one outcome and checks for collision/swap

      // If collision/swap detected, return instant death penalty
      if (!survived) {
        return -100000; // Catastrophic score - Pac-Man dies
      }

      // Continue lookahead (back to Pac-Man's turn)
      const evaluation = this.predictiveLookahead(newState, depth - 1, alpha, beta, true, initialDotCount);

      return evaluation;
    }
  }

  // Find best move using Predictive Lookahead algorithm with anti-dithering
  private findBestMoveWithLookahead(
    state: GameState,
    currentDirection: Direction
  ): { bestMove: Direction | null; moveValues: Map<Direction, number> } {
    this.nodesEvaluated = 0;
    const startTime = Date.now();


    let bestMove: Direction | null = null;
    let bestValue = -Infinity;
    const validMoves = this.getValidPacmanMoves(state.pacmanPos);


    // Store the value of each move
    const moveValues = new Map<Direction, number>();

    // Capture the true initial dot count from the start of the turn
    const initialDotCount = state.dots.length + state.powerPellets.length;

    if (validMoves.length === 0) {
      return { bestMove: null, moveValues };
    }

    for (const move of validMoves) {
      // Clone state and simulate Pac-Man's move
      const newState = this.cloneGameState(state);
      if (!this.simulatePacmanMove(newState, move)) {
        continue;
      }


      // Run predictive lookahead from this state (ghosts predicted next)
      const moveValue = this.predictiveLookahead(
        newState,
        this.searchDepth - 1,
        -Infinity,
        Infinity,
        false,
        initialDotCount
      );

      moveValues.set(move, moveValue);

      if (moveValue > bestValue) {
        bestValue = moveValue;
        bestMove = move;
      }
    }

    // --- TIER 2: Add expensive heuristics for root-level moves only ---
    // These were skipped during deep search for performance, but are important for final decision
    for (const [move, deepScore] of moveValues.entries()) {
      // Simulate the move to get the resulting position
      const moveState = this.cloneGameState(state);
      if (!this.simulatePacmanMove(moveState, move)) {
        continue;
      }

      // Calculate only the expensive heuristics for this immediate position
      const expensiveScore =
        this.calculatePositionalAdvantage(moveState.pacmanPos, moveState.ghosts) +
        this.calculateChokePointDanger(moveState.pacmanPos, moveState.ghosts);

      // Add expensive heuristics to the deep search score
      const totalScore = deepScore + expensiveScore;
      moveValues.set(move, totalScore);


      // Update best move if needed
      if (totalScore > bestValue) {
        bestValue = totalScore;
        bestMove = move;
      }
    }

    // --- ANTI-DITHERING LOGIC ---
    // When far from danger or food, add inertia to maintain direction
    const minGhostDist = Math.min(
      ...state.ghosts.filter(g => !g.isFrightened).map(g => this.heuristic(state.pacmanPos, g.position)),
      Infinity
    );

    const allFood = [...state.dots, ...state.powerPellets];
    const minFoodDist = allFood.length > 0 ? Math.min(
      ...allFood.map(f => this.heuristic(state.pacmanPos, f))
    ) : Infinity;

    // Apply inertia when:
    // 1. Far from danger (>10 tiles) AND far from food (>8 tiles) - exploring empty areas
    // 2. OR scores are very close (within 5% of best) - avoid micro-optimizations causing dithering
    const isFarFromDanger = minGhostDist > 10;
    const isFarFromFood = minFoodDist > 8;
    const isExploring = isFarFromDanger && isFarFromFood;

    if (bestMove !== null && validMoves.includes(currentDirection)) {
      const currentScore = moveValues.get(currentDirection) ?? -Infinity;
      const scoreDiff = Math.abs(bestValue - currentScore);
      const closeScores = scoreDiff < Math.abs(bestValue) * 0.05;

      // Strong inertia when exploring (empty areas, far from action)
      // Moderate inertia when scores are close (avoid oscillation)
      if (isExploring) {
        // When exploring: give current direction a +15% bonus
        const explorationBonus = Math.abs(bestValue) * 0.15;
        if (currentScore + explorationBonus >= bestValue) {
          bestMove = currentDirection;
        }
      } else if (closeScores && !isExploring) {
        // When scores close but near food/danger: give current direction +5% bonus
        const inertiaBonus = Math.abs(bestValue) * 0.05;
        if (currentScore + inertiaBonus >= bestValue) {
          bestMove = currentDirection;
        }
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;


    return { bestMove, moveValues };
  }



  // Find best direction using Predictive Lookahead algorithm
  findBestDirection(
    start: Position,
    currentDirection: Direction,
    dots: Position[],
    powerPellets: Position[],
    ghosts: Ghost[],
    isFrightened: boolean,
    recentPositions: Position[]
  ): { direction: Direction | null; debugInfo: PacmanBrain.AIDebugInfo } {

    // ===============================================
    // SAFE EXPLORATION MODE: Use A* when far from danger
    // ===============================================
    const allFood = [...dots, ...powerPellets];
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);

    if (nonFrightenedGhosts.length > 0 && allFood.length > 0) {
      const minGhostDist = Math.min(
        ...nonFrightenedGhosts.map(g => this.heuristic(start, g.position))
      );

      // If far from all ghosts (>12 tiles), use simple A* to nearest pellet
      if (minGhostDist > 12) {
        // Find nearest pellet
        let nearestPellet: Position | null = null;
        let minPelletDist = Infinity;

        for (const pellet of allFood) {
          const dist = this.heuristic(start, pellet);
          if (dist < minPelletDist) {
            minPelletDist = dist;
            nearestPellet = pellet;
          }
        }

        if (nearestPellet) {
          // Use A* to path to nearest pellet
          const path = this.aStar(start, nearestPellet);

          if (path.length > 1) {
            const nextPos = path[1];
            const aStarDirection = this.getDirectionToPosition(start, nextPos);

            // Return with minimal debug info (A* mode)
            const debugInfo: PacmanBrain.AIDebugInfo = {
              position: start,
              directions: [],
              chosenDirection: aStarDirection,
              weights: this.weights,
              isFrightened
            };

            return { direction: aStarDirection, debugInfo };
          }
        }
      }
    }

    // ===============================================
    // NORMAL DEFENSIVE MODE: Use predictive lookahead
    // ===============================================

    // Create initial game state
    const initialState: GameState = {
      pacmanPos: { ...start },
      previousPacmanPos: { ...start },  // Initially same as current position
      ghosts: ghosts.map(g => ({
        position: { ...g.position },
        direction: g.direction,
        isFrightened: g.isFrightened
      })),
      dots: dots.map(d => ({ ...d })),
      powerPellets: powerPellets.map(p => ({ ...p })),
      positionHistory: recentPositions.map(p => ({ ...p }))
    };

    // Use predictive lookahead to find the best move, passing currentDirection for inertia
    const { bestMove, moveValues } = this.findBestMoveWithLookahead(initialState, currentDirection);

    // --- OPTIMIZED DEBUGGING LOGIC (no redundant calculations!) ---
    const directionDebugInfo: PacmanBrain.DirectionDebugInfo[] = [];
    const initialFoodCount = initialState.dots.length + initialState.powerPellets.length;

    for (const move of (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])) {
      const moveState = this.cloneGameState(initialState);
      const isWalkable = this.simulatePacmanMove(moveState, move);

      if (!isWalkable) {
        // Still add info for walls for visualization purposes
        directionDebugInfo.push({
          direction: move,
          isWalkable: false,
          finalScore: -Infinity,
          breakdown: {
            ghostDanger: 0,
            chokePointDanger: 0,
            positionalAdvantage: 0,
            frightenedGhostBonus: 0,
            powerPelletUrgency: 0,
            progressScore: 0,
            distanceToFood: 0,
            explorationBonus: 0
          }
        });
        continue;
      }

      // Use the pre-calculated score from lookahead (no redundant calculation!)
      const finalScore = moveValues.get(move) ?? -Infinity;

      // Calculate the immediate heuristic values for the breakdown (cheap operation)
      const breakdown = {
        ghostDanger: this.calculateGhostDanger(moveState.pacmanPos, moveState.ghosts),
        chokePointDanger: this.calculateChokePointDanger(moveState.pacmanPos, moveState.ghosts),
        positionalAdvantage: this.calculatePositionalAdvantage(moveState.pacmanPos, moveState.ghosts),
        frightenedGhostBonus: this.calculateFrightenedGhostBonus(moveState.pacmanPos, moveState.ghosts),
        powerPelletUrgency: this.calculatePowerPelletUrgency(moveState.pacmanPos, moveState.ghosts, moveState.powerPellets),
        progressScore: this.calculateProgressScore(moveState.dots, moveState.powerPellets, initialFoodCount),
        distanceToFood: this.calculateDistanceToFoodScore(moveState.pacmanPos, moveState.dots, moveState.powerPellets),
        explorationBonus: this.calculateExplorationBonus(moveState.pacmanPos, moveState.dots, moveState.powerPellets, moveState.ghosts)
      };

      directionDebugInfo.push({ direction: move, isWalkable: true, finalScore, breakdown });
    }

    const debugInfo: PacmanBrain.AIDebugInfo = {
      position: start,
      directions: directionDebugInfo,
      chosenDirection: bestMove,
      weights: this.weights,
      isFrightened
    };

    // Log final decision with reasoning
    let reasoning = '';
    if (bestMove === null) {
      reasoning = 'No valid moves available';
    } else if (bestMove === currentDirection) {
      reasoning = 'Maintained current direction due to stability or it being optimal';
    } else {
      reasoning = `Changed direction from ${currentDirection} to ${bestMove} due to better evaluation`;
    }

    // Log predicted ghost positions after chosen move (CRITICAL for debugging)
    if (bestMove !== null) {
      const nextPacmanPos = this.getPositionFromMove(start, bestMove);
      const predictions = ghosts.map((g, i) => {
        const predictedPos = this.predictGhostNextMove(g, nextPacmanPos);
        // Check for both same-tile collision AND position swap collision
        const sameTile = predictedPos.x === nextPacmanPos.x && predictedPos.y === nextPacmanPos.y;
        const swap = g.position.x === nextPacmanPos.x && g.position.y === nextPacmanPos.y &&
                     predictedPos.x === start.x && predictedPos.y === start.y;
        const willCollide = sameTile || swap;
        const collisionFlag = willCollide ? (swap ? '⚠️SWAP!' : '⚠️COLLISION!') : 'safe';
        return `Ghost${i}: (${g.position.x},${g.position.y})→(${predictedPos.x},${predictedPos.y}) ${collisionFlag}`;
      }).join(' | ');

    }


    return { direction: bestMove, debugInfo };
  }

  // Configure search depth (how many moves ahead to look)
  // Higher depth = smarter, can see distant pellets, but slower computation
  // Default: 12 (excellent long-range planning)
  // Range: 1-20 (higher values allow seeing pellets across the entire maze)
  setSearchDepth(depth: number): void {
    this.searchDepth = Math.max(1, Math.min(depth, 20)); // Clamp between 1-20
  }

  getSearchDepth(): number {
    return this.searchDepth;
  }

  getNodesEvaluated(): number {
    return this.nodesEvaluated;
  }

}

export = PacmanBrain;

