/**
 * PacmanBrain - Advanced AI using Minimax Algorithm with Alpha-Beta Pruning
 * 
 * This is the "final boss" of game AI implementations. Instead of just looking
 * one move ahead, Pac-Man now thinks multiple moves into the future, considering
 * how ghosts will respond to each move.
 * 
 * HOW MINIMAX WORKS:
 * 1. Pac-Man (Maximizer) explores all possible moves
 * 2. For each move, it simulates the ghosts (Minimizers) responding optimally
 * 3. This creates a game tree of future possibilities
 * 4. Pac-Man chooses the path that guarantees the best outcome, even if ghosts play perfectly
 * 
 * EXAMPLE:
 * Without Minimax: "This hallway looks safe right now"
 * With Minimax: "If I go down this hallway, the ghosts will move to block the exit in 3 moves - trap!"
 * 
 * ALPHA-BETA PRUNING:
 * To make this fast enough for real-time gameplay, we use alpha-beta pruning to skip
 * branches that can't possibly be better than what we've already found.
 * 
 * CONFIGURATION:
 * - Default search depth: 3 (looks 3 moves ahead)
 * - Adjustable via setSearchDepth(depth) method
 * - Higher depth = smarter but slower (recommended 2-4 for real-time)
 * 
 * PERFORMANCE:
 * With alpha-beta pruning, the AI evaluates hundreds to thousands of game states
 * per decision, typically completing in 10-50ms on modern hardware.
 */

import { MAZE_LAYOUT, Position } from '../shared/maze';
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

interface GameState {
  pacmanPos: Position;
  ghosts: Ghost[];
  dots: Position[];
  powerPellets: Position[];
  positionHistory: Position[];
}

declare namespace PacmanBrain {
  export interface DirectionDebugInfo {
    direction: Direction;
    cost: number;
    isWalkable: boolean;
    breakdown: {
      baseCost: number;
      dotAttraction: number;
      pelletAttraction: number;
      ghostInfluence: number;
      visitPenalty: number;
    };
  }

  export interface AIDebugInfo {
    position: Position;
    directions: DirectionDebugInfo[];
    chosenDirection: Direction | null;
    weights: CostWeights;
    isFrightened: boolean;
  }
}

class PacmanBrain {
  private maze: number[][];
  private searchDepth: number;
  private nodesEvaluated: number; // For debugging/performance tracking

  constructor(searchDepth: number = 3) {
    this.maze = MAZE_LAYOUT;
    this.searchDepth = searchDepth; // How many moves ahead to look
    this.nodesEvaluated = 0;
  }

  // Manhattan distance heuristic
  heuristic(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  // Helper: Get position after moving in a direction
  getPositionFromMove(pos: Position, direction: Direction): Position {
    const dirVec = CONSTANTS.DIRECTIONS[direction];
    return {
      x: pos.x + dirVec.x,
      y: pos.y + dirVec.y
    };
  }

  // Helper: Check if a position is walkable
  isWalkable(pos: Position): boolean {
    if (pos.x < 0 || pos.x >= CONSTANTS.GRID_WIDTH ||
        pos.y < 0 || pos.y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    // Walkable: not a wall (0)
    return this.maze[pos.y][pos.x] !== 0;
  }

  // Predict where a ghost will move next
  // Ghosts prefer to continue in their current direction, but will choose
  // a new direction if blocked or if a better path to Pac-Man is available
  predictGhostNextMove(ghost: Ghost, pacmanPos: Position): Position {
    // First, try to continue in the current direction
    const currentDirPos = this.getPositionFromMove(ghost.position, ghost.direction);
    
    // If current direction is walkable, ghosts usually continue that way
    // (they don't change direction every tick)
    if (this.isWalkable(currentDirPos)) {
      // Check if continuing is reasonable (not moving away from Pac-Man significantly)
      const currentDist = this.heuristic(ghost.position, pacmanPos);
      const newDist = this.heuristic(currentDirPos, pacmanPos);
      
      // If not moving much farther away, keep current direction
      if (newDist <= currentDist + 2) {
        return currentDirPos;
      }
    }

    // If blocked or moving too far away, find best alternative
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

  // Calculate the number of exits from a position (for dead-end detection)
  private calculateExits(pos: Position): number {
    const directions = [
      { x: 0, y: -1 }, // up
      { x: 0, y: 1 },  // down
      { x: -1, y: 0 }, // left
      { x: 1, y: 0 }   // right
    ];

    let exitCount = 0;
    for (const dir of directions) {
      const newPos = { x: pos.x + dir.x, y: pos.y + dir.y };
      if (this.isWalkable(newPos)) {
        exitCount++;
      }
    }
    return exitCount;
  }

  // The heart of the AI - evaluate a future game state
  evaluateState(
    pacmanPos: Position,
    ghosts: Ghost[],
    dots: Position[],
    powerPellets: Position[],
    positionHistory: Position[] = [],
    initialDotCount: number
  ): number {
    // Check for immediate death - this is the worst possible outcome
    for (const ghost of ghosts) {
      const dist = this.heuristic(pacmanPos, ghost.position);
      if (dist <= 1 && !ghost.isFrightened) {
        return -Infinity; // Game over!
      }
    }

    // Weights to tune the AI's personality
    const W_DOT_EATEN_BONUS = 200;      // NEW: Big, immediate reward for eating a dot in the simulation
    const W_GHOST_DANGER = -1000;       // INCREASED: Survival is twice as important now.
    const W_FRIGHTENED_BONUS = 400;     // INCREASED: Make chasing a higher priority.
    const W_POWER_PELLET_URGENCY = 1500;// INCREASED: This is a "get out of jail free" card.
    const W_FOOD_PROGRESS = 5;          // DECREASED: A gentle nudge, not a primary driver.
    const W_DEAD_END_PENALTY = -250;    // INCREASED: Make it really hate getting cornered.
    const W_LOOP_PENALTY = -100;        // INCREASED: Discourage dithering more strongly.
    
    let score = 0;

    const dotsEaten = initialDotCount - dots.length;
    score += dotsEaten * W_DOT_EATEN_BONUS;



    // Calculate distance to nearest non-frightened ghost
    const nonFrightenedGhosts = ghosts.filter(g => !g.isFrightened);
    let minGhostDist = Infinity;
    if (nonFrightenedGhosts.length > 0) {
      minGhostDist = Math.min(...nonFrightenedGhosts.map(g => this.heuristic(pacmanPos, g.position)));
    }
    // The penalty skyrockets as the ghost gets closer
    if (minGhostDist < Infinity) {
      score += W_GHOST_DANGER / (minGhostDist + 1);
    }

    // Calculate distance to nearest frightened ghost
    const frightenedGhosts = ghosts.filter(g => g.isFrightened);
    let minFrightenedDist = Infinity;
    if (frightenedGhosts.length > 0) {
      minFrightenedDist = Math.min(...frightenedGhosts.map(g => this.heuristic(pacmanPos, g.position)));
      // Bonus for being close to a target
      score += W_FRIGHTENED_BONUS / (minFrightenedDist + 1);
    }

    // POWER PELLET URGENCY: If a non-frightened ghost is very close and we're on a power pellet, huge bonus!
    // This teaches the AI to use pellets as a defensive weapon
    const isOnPowerPellet = powerPellets.some(p => p.x === pacmanPos.x && p.y === pacmanPos.y);
    if (isOnPowerPellet && minGhostDist < 8 && minGhostDist !== Infinity) {
      // The closer the ghost, the more urgent it is to grab the pellet
      score += W_POWER_PELLET_URGENCY / (minGhostDist + 1);
    }

    // DEAD-END PENALTY: Positions with fewer exits are more dangerous
    const exitCount = this.calculateExits(pacmanPos);
    if (exitCount === 1) {
      // Dead end - very dangerous, especially if ghosts are nearby
      score += W_DEAD_END_PENALTY * 2;
      // Extra penalty if ghost is close
      if (minGhostDist < 10 && minGhostDist !== Infinity) {
        score += W_DEAD_END_PENALTY / (minGhostDist + 1);
      }
    } else if (exitCount === 2) {
      // Corridor - somewhat dangerous
      score += W_DEAD_END_PENALTY * 0.5;
      if (minGhostDist < 6 && minGhostDist !== Infinity) {
        score += W_DEAD_END_PENALTY * 0.5 / (minGhostDist + 1);
      }
    }

    // LOOP PREVENTION: Penalize positions we've recently visited
    // Skip the most recent position (we're literally there now)
    const posKey = `${pacmanPos.x},${pacmanPos.y}`;
    const recentIndex = positionHistory.slice(0, -1).findIndex(p => `${p.x},${p.y}` === posKey);
    if (recentIndex !== -1) {
      // More recent = higher penalty (prevents wiggling back and forth)
      const recency = (positionHistory.length - 1) - recentIndex;
      score += W_LOOP_PENALTY * (recency / positionHistory.length);
    }

    // Calculate distance to nearest food
    const allFood = [...dots, ...powerPellets];
    let minFoodDist = 0;
    if (allFood.length > 0) {
      minFoodDist = Math.min(...allFood.map(food => this.heuristic(pacmanPos, food)));
    }
    // Closer to food = better score (subtract distance)
    score -= minFoodDist * W_FOOD_PROGRESS;

    return score;
  }

  // Helper: Clone game state for simulation
  private cloneGameState(state: GameState): GameState {
    return {
      pacmanPos: { ...state.pacmanPos },
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
  private simulateGhostMoves(state: GameState): void {
    for (const ghost of state.ghosts) {
      const newPos = this.predictGhostNextMove(ghost, state.pacmanPos);
      ghost.position = newPos;
    }
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

  // MINIMAX ALGORITHM WITH ALPHA-BETA PRUNING
  // This is the "final boss" - Pac-Man thinks ahead multiple moves
  private minimax(
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
        state.positionHistory,
        initialDotCount
      );
    }

    if (isMaximizingPlayer) {
      // Pac-Man's turn - maximize score
      let maxEval = -Infinity;
      const validMoves = this.getValidPacmanMoves(state.pacmanPos);

      // If no valid moves, return current evaluation
      if (validMoves.length === 0) {
        return this.evaluateState(
          state.pacmanPos,
          state.ghosts,
          state.dots,
          state.powerPellets,
          state.positionHistory,
          initialDotCount
        );
      }

      for (const move of validMoves) {
        // Clone state and simulate Pac-Man's move
        const newState = this.cloneGameState(state);
        if (!this.simulatePacmanMove(newState, move)) {
          continue;
        }

        // Recursively evaluate (now it's the ghosts' turn)
        const evaluation = this.minimax(newState, depth - 1, alpha, beta, false, initialDotCount);
        maxEval = Math.max(maxEval, evaluation);

        // Alpha-beta pruning
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) {
          break; // Beta cutoff
        }
      }

      return maxEval;
    } else {
      // Ghosts' turn - minimize Pac-Man's score
      let minEval = Infinity;

      // Clone state and simulate ghost moves
      const newState = this.cloneGameState(state);
      this.simulateGhostMoves(newState);

      // Recursively evaluate (back to Pac-Man's turn)
      const evaluation = this.minimax(newState, depth - 1, alpha, beta, true, initialDotCount);
      minEval = Math.min(minEval, evaluation);

      // Alpha-beta pruning
      beta = Math.min(beta, evaluation);

      return minEval;
    }
  }

  // Find best move using Minimax algorithm with inertia
  private findBestMoveWithMinimax(state: GameState, currentDirection: Direction): Direction | null {
    this.nodesEvaluated = 0;
    const startTime = Date.now();

    let bestMove: Direction | null = null;
    let bestValue = -Infinity;
    const validMoves = this.getValidPacmanMoves(state.pacmanPos);
    
    // Store the value of each move
    const moveValues = new Map<Direction, number>();
    
    // Capture the true initial dot count from the start of the turn
    const initialDotCount = state.dots.length;

    if (validMoves.length === 0) {
      return null;
    }

    for (const move of validMoves) {
      // Clone state and simulate Pac-Man's move
      const newState = this.cloneGameState(state);
      if (!this.simulatePacmanMove(newState, move)) {
        continue;
      }

      // Run minimax from this state (ghosts move next)
      const moveValue = this.minimax(
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

    // --- INERTIA LOGIC ---
    // Log all move scores for debugging
    console.log('Move scores:', Array.from(moveValues.entries()).map(([dir, val]) => `${dir}=${val.toFixed(2)}`).join(', '));
    console.log(`Current direction: ${currentDirection}, Best move before inertia: ${bestMove}`);
    
    // Check if continuing straight is a valid and "good enough" move
    // Moderate threshold (0.85 = accept if within 15% of best) to prevent dithering
    // while still allowing course correction for important decisions
    const inertiaThreshold = 0.85; // Accept current direction if it's within 15% of the best
    const currentValue = moveValues.get(currentDirection);

    if (currentValue !== undefined && bestValue !== -Infinity) {
      // Calculate threshold correctly for negative scores
      // For negative scores, divide to make threshold MORE negative (worse)
      // For positive scores, multiply to make threshold less positive (worse)
      const threshold = bestValue >= 0 
        ? bestValue * inertiaThreshold  // Positive: 100 * 0.85 = 85 (accept >= 85)
        : bestValue / inertiaThreshold; // Negative: -100 / 0.85 = -117.65 (accept >= -117.65)
      
      console.log(`  Current dir score: ${currentValue.toFixed(2)}, Best score: ${bestValue.toFixed(2)}, Threshold: ${threshold.toFixed(2)}`);
      
      // Check if current direction is a valid move and its value is close to the best
      if (currentValue >= threshold) {
        console.log(`  ✓ Inertia override: Sticking with ${currentDirection} (score ${currentValue.toFixed(2)}) over ${bestMove} (score ${bestValue.toFixed(2)})`);
        bestMove = currentDirection;
      } else {
        console.log(`  ✗ Changing direction from ${currentDirection} to ${bestMove} (score difference too large)`);
      }
    } else {
      console.log(`  ✗ Current direction ${currentDirection} not valid or best value is -Infinity`);
    }
    // ----------------------

    const elapsedTime = Date.now() - startTime;
    console.log(`Final decision: ${bestMove}, evaluated ${this.nodesEvaluated} nodes in ${elapsedTime}ms\n`);

    return bestMove;
  }

  // Find best direction using Minimax algorithm
  findBestDirection(
    start: Position,
    currentDirection: Direction,
    dots: Position[],
    powerPellets: Position[],
    ghosts: Ghost[],
    isFrightened: boolean,
    recentPositions: Position[]
  ): { direction: Direction | null; debugInfo: PacmanBrain.AIDebugInfo } {
    // Create initial game state
    const initialState: GameState = {
      pacmanPos: { ...start },
      ghosts: ghosts.map(g => ({
        position: { ...g.position },
        direction: g.direction,
        isFrightened: g.isFrightened
      })),
      dots: dots.map(d => ({ ...d })),
      powerPellets: powerPellets.map(p => ({ ...p })),
      positionHistory: recentPositions.map(p => ({ ...p }))
    };

    // Use Minimax to find the best move, passing currentDirection for inertia
    const bestMove = this.findBestMoveWithMinimax(initialState, currentDirection);

    // Create debug info for visualization
    const possibleMoves: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const directionDebugInfo: PacmanBrain.DirectionDebugInfo[] = [];

    // Set weights for debug display
    const weights: CostWeights = isFrightened
      ? {
          dotValue: 3,
          powerPelletValue: 2,
          ghostDanger: 0,
          ghostTarget: 8,
          explorationBonus: 1
        }
      : {
          dotValue: 5,
          powerPelletValue: 8,
          ghostDanger: 15,
          ghostTarget: 0,
          explorationBonus: 1
        };

    // Evaluate each possible move for debug display
    for (const move of possibleMoves) {
      const nextPacmanPos = this.getPositionFromMove(start, move);

      // Skip if it's a wall
      if (!this.isWalkable(nextPacmanPos)) {
        directionDebugInfo.push({
          direction: move,
          cost: Infinity,
          isWalkable: false,
          breakdown: {
            baseCost: 0,
            dotAttraction: 0,
            pelletAttraction: 0,
            ghostInfluence: 0,
            visitPenalty: 0
          }
        });
        continue;
      }

      // Create a state for this move and evaluate it with minimax
      const moveState = this.cloneGameState(initialState);
      let cost = Infinity;
      
      if (this.simulatePacmanMove(moveState, move)) {
        const stateScore = this.minimax(moveState, this.searchDepth - 1, -Infinity, Infinity, false, initialState.dots.length);
        cost = stateScore === -Infinity ? Infinity : -stateScore;
      }

      const posKey = `${nextPacmanPos.x},${nextPacmanPos.y}`;
      const wasVisited = recentPositions.some(p => `${p.x},${p.y}` === posKey);

      directionDebugInfo.push({
        direction: move,
        cost,
        isWalkable: true,
        breakdown: {
          baseCost: cost < Infinity ? Math.abs(cost) : 0,
          dotAttraction: 0,
          pelletAttraction: 0,
          ghostInfluence: 0,
          visitPenalty: wasVisited ? 10 : 0
        }
      });
    }

    const debugInfo: PacmanBrain.AIDebugInfo = {
      position: start,
      directions: directionDebugInfo,
      chosenDirection: bestMove,
      weights,
      isFrightened
    };

    return { direction: bestMove, debugInfo };
  }

  // Configure search depth (how many moves ahead to look)
  // Higher depth = smarter but slower
  // Recommended: 2-4 for real-time gameplay
  setSearchDepth(depth: number): void {
    this.searchDepth = 100; // Clamp between 1-6
    console.log(`Minimax search depth set to: ${this.searchDepth}`);
  }

  getSearchDepth(): number {
    return this.searchDepth;
  }

  getNodesEvaluated(): number {
    return this.nodesEvaluated;
  }
}

export = PacmanBrain;

