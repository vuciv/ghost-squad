/**
 * Tabular Hybrid Coordinator (HRA Paper Implementation)
 * 
 * Based on "Hybrid Reward Architecture for Reinforcement Learning" (van Seijen et al., NIPS 2017)
 * 
 * Key principles from the paper:
 * 1. Create one GVF per reachable position (discovered online during exploration)
 * 2. Each GVF learns Q-values for reaching that position
 * 3. Aggregation: Q_total(s,a) = Σ w_i * Q_i(s,a)
 *    - Dots: weight = +10 (pellet value)
 *    - Power pellets: weight = +50
 *    - Ghosts: weight = -1000 ("fair balance between points and survival")
 *    - Blue ghosts: weight = +1000
 * 4. No neural networks, no gradient descent, just tabular Q-learning!
 */

import { TabularGVF } from './TabularGVF';
import { Direction, GameState } from './types';
import { Position, MAZE_LAYOUT } from '../../shared/maze';
import CONSTANTS = require('../../shared/constants');
import * as fs from 'fs';

export class TabularHybridCoordinator {
  private gvfs: Map<string, TabularGVF>; // positionKey -> GVF for reaching that position
  private alpha: number;
  private gamma: number;
  
  // Weights from the paper (line 630) - EXACT VALUES
  // "A ghosts' multiplier of -1,000 has demonstrated to be a fair balance
  // between gaining points and not being killed"
  private readonly PELLET_WEIGHT = 10;
  private readonly POWER_PELLET_WEIGHT = 50;
  private readonly GHOST_WEIGHT = -1000;
  private readonly BLUE_GHOST_WEIGHT = 1000;

  // Loop detection
  private recentPositions: string[] = [];
  private readonly MAX_HISTORY = 10;
  
  // Paper's additional components
  private stateActionCounts: Map<string, number> = new Map(); // For UCB exploration
  private totalActions: number = 0;
  private explorationModeChanged: boolean = false; // Track when we switch to exploitation

  constructor(alpha: number = 1.0, gamma: number = 0.99) {
    this.gvfs = new Map();
    this.alpha = alpha;
    this.gamma = gamma;
  }

  /**
   * Get position key for GVF lookup
   */
  private getPositionKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }

  /**
   * Discover a new position and create a GVF for it (if not exists)
   * This mimics the paper's online discovery of positions
   */
  discoverPosition(pos: Position): void {
    const key = this.getPositionKey(pos);
    if (!this.gvfs.has(key)) {
      this.gvfs.set(key, new TabularGVF(pos, this.alpha, this.gamma));
    }
  }

  /**
   * Get GVF for a position (creates if doesn't exist)
   */
  private getOrCreateGVF(pos: Position): TabularGVF {
    this.discoverPosition(pos);
    return this.gvfs.get(this.getPositionKey(pos))!;
  }

  /**
   * Check if position is walkable (not a wall)
   */
  private isWalkable(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    if (ix < 0 || ix >= CONSTANTS.GRID_WIDTH ||
        iy < 0 || iy >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }

    const cell = MAZE_LAYOUT[iy][ix];
    return cell !== 0;
  }

  /**
   * Get position after taking an action
   */
  private getNextPosition(pos: Position, action: Direction): Position {
    const dir = CONSTANTS.DIRECTIONS[action];
    return {
      x: pos.x + dir.x,
      y: pos.y + dir.y
    };
  }

  /**
   * Select action using HRA aggregation with paper's full system
   * 
   * Paper's components (Appendix):
   * 1. Score heads (normalized 0-1)
   * 2. Ghost heads (multiplied by -10 after normalization)
   * 3. Diversification head (random [0,20] for first 50 steps)
   * 4. Targeted exploration head (UCB-inspired)
   */
  selectAction(state: GameState, stepCount: number = 0): Direction {
    const currentPos = state.position;
    const currentDir = state.direction;

    // Initialize aggregated Q-values for each action
    const aggregatedQ: { [key in Direction]: number } = {
      'UP': 0,
      'DOWN': 0,
      'LEFT': 0,
      'RIGHT': 0
    };

    // STEP 1: Aggregate score heads (dots + power pellets + blue ghosts)
    // Then normalize between 0 and 1 (line 646 in paper)
    const scoreQ: { [key in Direction]: number } = { 'UP': 0, 'DOWN': 0, 'LEFT': 0, 'RIGHT': 0 };
    
    // Dots
    for (const dot of state.dots) {
      const gvf = this.getOrCreateGVF(dot);
      const qValues = gvf.getQValues(currentPos, currentDir);
      const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      for (let i = 0; i < actions.length; i++) {
        scoreQ[actions[i]] += this.PELLET_WEIGHT * qValues[i];
      }
    }

    // Power pellets
    for (const pellet of state.powerPellets) {
      const gvf = this.getOrCreateGVF(pellet);
      const qValues = gvf.getQValues(currentPos, currentDir);
      const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      for (let i = 0; i < actions.length; i++) {
        scoreQ[actions[i]] += this.POWER_PELLET_WEIGHT * qValues[i];
      }
    }

    // Blue ghosts (when frightened)
    for (const ghost of state.ghosts) {
      if (ghost.isFrightened) {
        const gvf = this.getOrCreateGVF(ghost.position);
        const qValues = gvf.getQValues(currentPos, currentDir);
        const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        for (let i = 0; i < actions.length; i++) {
          scoreQ[actions[i]] += this.BLUE_GHOST_WEIGHT * qValues[i];
        }
      }
    }

    // Normalize score heads between 0 and 1
    const scoreValues = Object.values(scoreQ);
    const minScore = Math.min(...scoreValues);
    const maxScore = Math.max(...scoreValues);
    const scoreRange = maxScore - minScore;
    
    for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      if (scoreRange > 0) {
        aggregatedQ[action] = (scoreQ[action] - minScore) / scoreRange;
      }
    }

    // STEP 2: Ghost handling - Match HRA paper's -1000 multiplier
    // Paper (line 630): "A ghosts' multiplier of -1,000 has demonstrated to be
    // a fair balance between gaining points and not being killed"
    for (const ghost of state.ghosts) {
      for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
        const nextPos = this.getNextPosition(currentPos, action);
        const distToGhost = Math.abs(nextPos.x - ghost.position.x) + Math.abs(nextPos.y - ghost.position.y);

        if (!ghost.isFrightened) {
          // Regular ghosts: AVOID with -1000 multiplier
          if (distToGhost === 0) {
            aggregatedQ[action] += -1000; // Match paper's multiplier
          } else if (distToGhost === 1) {
            aggregatedQ[action] += -500; // Adjacent = very dangerous
          } else if (distToGhost === 2) {
            aggregatedQ[action] += -250; // Close = dangerous
          } else if (distToGhost <= 4) {
            aggregatedQ[action] += -100 / distToGhost; // Nearby = caution
          } else if (distToGhost <= 8) {
            aggregatedQ[action] += -50 / distToGhost; // Medium range = awareness
          }
        } else {
          // Blue ghosts: CHASE with +1000 multiplier (invert the avoidance logic!)
          // Paper uses +1000 for blue ghosts, we add distance-based bonuses too
          if (distToGhost === 0) {
            aggregatedQ[action] += 1000; // Eat them!
          } else if (distToGhost === 1) {
            aggregatedQ[action] += 500; // Almost there!
          } else if (distToGhost === 2) {
            aggregatedQ[action] += 250; // Close
          } else if (distToGhost <= 4) {
            aggregatedQ[action] += 100 / distToGhost; // Chase them
          } else if (distToGhost <= 8) {
            aggregatedQ[action] += 50 / distToGhost; // Hunt them down
          }
        }
      }
    }

    // ALWAYS KEEP HIGH EXPLORATION - We want to overfit and always win!
    // Never reduce exploration - keep finding better paths
    const exploredEnough = false; // Always explore!

    // STEP 3: Diversification head - KEEP HIGH for robustness
    // Always use high diversification to handle any starting position
    const diversificationStrength = 20; // Always max diversity
    if (stepCount < 100) {  // Extended from 50 to 100 steps
      for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
        aggregatedQ[action] += Math.random() * diversificationStrength;
      }
    }

    // STEP 4: Targeted exploration head - KEEP HIGH
    // High exploration ensures we keep finding optimal paths
    const kappa = 0.5; // Always explore!
    const stateKey = `${currentPos.x},${currentPos.y},${currentDir}`;

    for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      const saKey = `${stateKey},${action}`;
      const count = this.stateActionCounts.get(saKey) || 0.1; // Avoid division by zero
      // Paper's exact formula: κ √(N^0.25 / n(s,a))
      const explorationBonus = kappa * Math.sqrt(Math.pow(this.totalActions + 1, 0.25) / count);
      aggregatedQ[action] += explorationBonus;
    }

    // STEP 5: Progress incentive - bonus for moving toward nearest dot
    // This prevents infinite loops and timeouts by encouraging forward progress
    // Even when scared of ghosts, Pacman should prefer actions that make SOME progress
    if (state.dots.length > 0) {
      // Find nearest dot
      let nearestDot = state.dots[0];
      let minDist = Math.abs(currentPos.x - nearestDot.x) + Math.abs(currentPos.y - nearestDot.y);

      for (const dot of state.dots) {
        const dist = Math.abs(currentPos.x - dot.x) + Math.abs(currentPos.y - dot.y);
        if (dist < minDist) {
          minDist = dist;
          nearestDot = dot;
        }
      }

      // Give bonus to actions that reduce distance to nearest dot
      for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
        const nextPos = this.getNextPosition(currentPos, action);
        const currentDist = Math.abs(currentPos.x - nearestDot.x) + Math.abs(currentPos.y - nearestDot.y);
        const nextDist = Math.abs(nextPos.x - nearestDot.x) + Math.abs(nextPos.y - nearestDot.y);

        if (nextDist < currentDist) {
          // Moving closer to nearest dot - INCREASED bonus to break loops
          aggregatedQ[action] += 5.0;
        } else if (nextDist > currentDist) {
          // Moving away from nearest dot - penalty
          aggregatedQ[action] += -2.0;
        }
      }
    }

    // STEP 6: Anti-loop penalty - penalize revisiting recent positions
    const posKey = `${currentPos.x},${currentPos.y}`;
    for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      const nextPos = this.getNextPosition(currentPos, action);
      const nextPosKey = `${nextPos.x},${nextPos.y}`;

      // Check how recently we visited this position
      const recentIndex = this.recentPositions.indexOf(nextPosKey);
      if (recentIndex !== -1) {
        // Penalize based on how recent (more recent = bigger penalty)
        const recency = this.recentPositions.length - recentIndex;
        aggregatedQ[action] += -10.0 * (recency / this.MAX_HISTORY);
      }
    }

    // Filter out invalid moves (walls)
    const validActions: Direction[] = [];
    for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      const nextPos = this.getNextPosition(currentPos, action);
      if (this.isWalkable(nextPos.x, nextPos.y)) {
        validActions.push(action);
      }
    }

    // If no valid actions (shouldn't happen), default to current direction
    if (validActions.length === 0) {
      console.warn('No valid actions available!');
      validActions.push(currentDir);
    }

    // Select action with highest aggregated Q-value among valid actions only
    let bestAction: Direction = validActions[0];
    let maxQ = -Infinity;

    for (const action of validActions) {
      if (aggregatedQ[action] > maxQ) {
        maxQ = aggregatedQ[action];
        bestAction = action;
      }
    }

    // Update counts for targeted exploration
    const saKey = `${stateKey},${bestAction}`;
    this.stateActionCounts.set(saKey, (this.stateActionCounts.get(saKey) || 0) + 1);
    this.totalActions++;

    // Update position history for loop detection
    const selectedPosKey = `${currentPos.x},${currentPos.y}`;
    this.recentPositions.push(selectedPosKey);
    if (this.recentPositions.length > this.MAX_HISTORY) {
      this.recentPositions.shift();
    }

    return bestAction;
  }

  /**
   * Update all relevant GVFs after taking an action
   * 
   * This is the key learning step: each GVF updates its Q-values
   * using off-policy Q-learning (α=1.0, like the paper)
   */
  updateGVFs(
    prevState: GameState,
    action: Direction,
    newState: GameState
  ): void {
    // Discover new positions we've reached
    this.discoverPosition(newState.position);

    // Update all GVFs that exist (for all previously discovered positions)
    for (const gvf of this.gvfs.values()) {
      gvf.update(
        prevState.position,
        prevState.direction,
        action,
        newState.position,
        newState.direction
      );
    }
  }

  /**
   * Get statistics about the learned GVFs
   */
  getStats(): {
    numGVFs: number;
    avgTableSize: number;
    totalStates: number;
  } {
    let totalStates = 0;
    for (const gvf of this.gvfs.values()) {
      totalStates += gvf.getTableSize();
    }

    return {
      numGVFs: this.gvfs.size,
      avgTableSize: this.gvfs.size > 0 ? totalStates / this.gvfs.size : 0,
      totalStates
    };
  }

  /**
   * Get Q-values for debugging/visualization
   */
  getAggregatedQValues(state: GameState): { [key in Direction]: number } {
    const currentPos = state.position;
    const currentDir = state.direction;

    const aggregatedQ: { [key in Direction]: number } = {
      'UP': 0,
      'DOWN': 0,
      'LEFT': 0,
      'RIGHT': 0
    };

    // Same logic as selectAction but return all Q-values
    for (const dot of state.dots) {
      const gvf = this.getOrCreateGVF(dot);
      const qValues = gvf.getQValues(currentPos, currentDir);
      const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      
      for (let i = 0; i < actions.length; i++) {
        aggregatedQ[actions[i]] += this.PELLET_WEIGHT * qValues[i];
      }
    }

    for (const pellet of state.powerPellets) {
      const gvf = this.getOrCreateGVF(pellet);
      const qValues = gvf.getQValues(currentPos, currentDir);
      const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      
      for (let i = 0; i < actions.length; i++) {
        aggregatedQ[actions[i]] += this.POWER_PELLET_WEIGHT * qValues[i];
      }
    }

    for (const ghost of state.ghosts) {
      const gvf = this.getOrCreateGVF(ghost.position);
      const qValues = gvf.getQValues(currentPos, currentDir);
      const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      
      const weight = ghost.isFrightened ? this.BLUE_GHOST_WEIGHT : this.GHOST_WEIGHT;
      
      for (let i = 0; i < actions.length; i++) {
        aggregatedQ[actions[i]] += weight * qValues[i];
      }
    }

    return aggregatedQ;
  }

  /**
   * Save all GVFs to disk
   */
  async save(path: string): Promise<void> {
    const data = {
      alpha: this.alpha,
      gamma: this.gamma,
      totalActions: this.totalActions,
      explorationModeChanged: this.explorationModeChanged,
      gvfs: Array.from(this.gvfs.entries()).map(([key, gvf]) => ({
        positionKey: key,
        gvf: gvf.toJSON()
      }))
    };

    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }

    fs.writeFileSync(`${path}/tabular_gvfs.json`, JSON.stringify(data, null, 2));
    
    const stats = this.getStats();
    console.log(`Saved ${stats.numGVFs} GVFs (${stats.totalStates} total states)`);
  }

  /**
   * Load GVFs from disk
   */
  async load(path: string): Promise<void> {
    const data = JSON.parse(fs.readFileSync(`${path}/tabular_gvfs.json`, 'utf8'));
    
    this.alpha = data.alpha;
    this.gamma = data.gamma;
    this.totalActions = data.totalActions || 0;
    this.explorationModeChanged = data.explorationModeChanged || false;
    this.gvfs.clear();

    for (const entry of data.gvfs) {
      this.gvfs.set(entry.positionKey, TabularGVF.fromJSON(entry.gvf));
    }

    const stats = this.getStats();
    console.log(`Loaded ${stats.numGVFs} GVFs (${stats.totalStates} total states)`);
    console.log(`Total actions: ${this.totalActions}, Exploitation mode: ${this.explorationModeChanged}`);
  }
}

