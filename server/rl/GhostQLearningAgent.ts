/**
 * Simple Direct Q-Learning for Ghost Agents
 *
 * Much simpler than HRA - learns Q(state, action) directly
 * State = discretized features (relative position to Pacman, direction, etc.)
 * Reward = +1000 for catching Pacman, -1 per step
 */

import { Direction } from './types';
import { Position, MAZE_LAYOUT } from '../../shared/maze';
import CONSTANTS = require('../../shared/constants');
import * as fs from 'fs';

export interface GhostQLearningState {
  ghostPosition: Position;
  ghostDirection: Direction;
  pacmanPosition: Position;
  otherGhosts: Position[];
  isFrightened: boolean;
  dotsRemaining: number;
  powerPelletsRemaining: number;
}

export class GhostQLearningAgent {
  private qTable: Map<string, number[]>; // stateKey -> [Q(UP), Q(DOWN), Q(LEFT), Q(RIGHT)]
  private alpha: number; // Learning rate
  private gamma: number; // Discount factor
  private epsilon: number; // Exploration rate
  private epsilonMin: number = 0.01;
  private epsilonDecay: number = 0.9995;

  private actionMap: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  private totalSteps: number = 0;

  constructor(alpha: number = 0.3, gamma: number = 0.95, epsilon: number = 0.3) {
    this.qTable = new Map();
    this.alpha = alpha;
    this.gamma = gamma;
    this.epsilon = epsilon;
  }

  /**
   * Discretize state into a string key
   * Uses relative position to Pacman + direction + coordination info
   */
  private getStateKey(state: GhostQLearningState): string {
    // 1. Relative position to Pacman (discretized into 8 directions + distance)
    const dx = state.pacmanPosition.x - state.ghostPosition.x;
    const dy = state.pacmanPosition.y - state.ghostPosition.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    // Discretize distance into buckets: 0-2, 3-5, 6-10, 11-20, 21+
    let distBucket: number;
    if (dist <= 2) distBucket = 0;
    else if (dist <= 5) distBucket = 1;
    else if (dist <= 10) distBucket = 2;
    else if (dist <= 20) distBucket = 3;
    else distBucket = 4;

    // Direction to Pacman (8 directions)
    let dirToPacman: string;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) dirToPacman = dy > 0 ? 'NE' : dy < 0 ? 'SE' : 'E';
      else dirToPacman = dy > 0 ? 'NW' : dy < 0 ? 'SW' : 'W';
    } else {
      if (dy > 0) dirToPacman = dx > 0 ? 'NE' : dx < 0 ? 'NW' : 'N';
      else dirToPacman = dx > 0 ? 'SE' : dx < 0 ? 'SW' : 'S';
    }

    // 2. Current ghost direction
    const ghostDir = state.ghostDirection;

    // 3. Nearby ghost count (for coordination)
    let nearbyCount = 0;
    for (const other of state.otherGhosts) {
      const odist = Math.abs(other.x - state.ghostPosition.x) +
                    Math.abs(other.y - state.ghostPosition.y);
      if (odist <= 4) nearbyCount++;
    }
    const nearbyBucket = Math.min(nearbyCount, 3); // 0, 1, 2, 3+

    // 4. Frightened status
    const frightened = state.isFrightened ? 1 : 0;

    // 5. Game progress (early/mid/late)
    let progressBucket: number;
    if (state.dotsRemaining > 200) progressBucket = 0; // Early
    else if (state.dotsRemaining > 100) progressBucket = 1; // Mid
    else if (state.dotsRemaining > 20) progressBucket = 2; // Late
    else progressBucket = 3; // End-game

    // 6. In ghost house? (critical for escaping spawn!)
    const inGhostHouse = this.isInGhostHouse(state.ghostPosition.x, state.ghostPosition.y) ? 1 : 0;

    return `${dirToPacman}_${distBucket}_${ghostDir}_${nearbyBucket}_${frightened}_${progressBucket}_${inGhostHouse}`;
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

    return MAZE_LAYOUT[iy][ix] !== 0;
  }

  /**
   * Check if position is in ghost house (cell type 3)
   */
  private isInGhostHouse(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    if (ix < 0 || ix >= CONSTANTS.GRID_WIDTH ||
        iy < 0 || iy >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }

    return MAZE_LAYOUT[iy][ix] === 3;
  }

  /**
   * Get next position after taking an action
   */
  private getNextPosition(pos: Position, action: Direction): Position {
    const dir = CONSTANTS.DIRECTIONS[action];
    return {
      x: pos.x + dir.x,
      y: pos.y + dir.y
    };
  }

  /**
   * Get valid actions from current position
   */
  private getValidActions(pos: Position): Direction[] {
    const valid: Direction[] = [];
    for (const action of this.actionMap) {
      const nextPos = this.getNextPosition(pos, action);
      if (this.isWalkable(nextPos.x, nextPos.y)) {
        valid.push(action);
      }
    }
    return valid.length > 0 ? valid : [this.actionMap[0]];
  }

  /**
   * Get Q-values for a state
   */
  private getQValues(stateKey: string): number[] {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, [0, 0, 0, 0]);
    }
    return this.qTable.get(stateKey)!;
  }

  /**
   * Select action using epsilon-greedy with ghost house escape
   */
  selectAction(state: GhostQLearningState): Direction {
    const stateKey = this.getStateKey(state);
    const validActions = this.getValidActions(state.ghostPosition);
    const inGhostHouse = this.isInGhostHouse(state.ghostPosition.x, state.ghostPosition.y);

    // GHOST HOUSE ESCAPE: Strong bias to leave ghost house
    if (inGhostHouse) {
      const escapeBias: number[] = [0, 0, 0, 0];
      for (let i = 0; i < validActions.length; i++) {
        const action = validActions[i];
        const nextPos = this.getNextPosition(state.ghostPosition, action);
        const actionIdx = this.actionMap.indexOf(action);

        // Huge bonus for leaving ghost house
        if (!this.isInGhostHouse(nextPos.x, nextPos.y)) {
          escapeBias[actionIdx] = 1000; // Massive bonus to escape
        } else {
          escapeBias[actionIdx] = -500; // Penalty for staying
        }
      }

      // Find best escape action
      let bestEscapeAction = validActions[0];
      let maxBias = -Infinity;
      for (const action of validActions) {
        const actionIdx = this.actionMap.indexOf(action);
        if (escapeBias[actionIdx] > maxBias) {
          maxBias = escapeBias[actionIdx];
          bestEscapeAction = action;
        }
      }
      return bestEscapeAction; // Always escape, ignore epsilon
    }

    // Normal epsilon-greedy exploration (outside ghost house)
    if (Math.random() < this.epsilon) {
      // Explore: random valid action
      return validActions[Math.floor(Math.random() * validActions.length)];
    }

    // Exploit: best Q-value among valid actions
    const qValues = this.getQValues(stateKey);
    let bestAction = validActions[0];
    let maxQ = -Infinity;

    for (const action of validActions) {
      const actionIdx = this.actionMap.indexOf(action);
      if (qValues[actionIdx] > maxQ) {
        maxQ = qValues[actionIdx];
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Update Q-values after taking an action
   */
  update(
    prevState: GhostQLearningState,
    action: Direction,
    reward: number,
    newState: GhostQLearningState,
    done: boolean
  ): void {
    const prevStateKey = this.getStateKey(prevState);
    const newStateKey = this.getStateKey(newState);

    const prevQValues = this.getQValues(prevStateKey);
    const newQValues = this.getQValues(newStateKey);

    const actionIdx = this.actionMap.indexOf(action);
    const currentQ = prevQValues[actionIdx];

    // Q-learning update: Q(s,a) = Q(s,a) + α * (r + γ * max_a' Q(s',a') - Q(s,a))
    let target: number;
    if (done) {
      target = reward; // Terminal state
    } else {
      const maxNextQ = Math.max(...newQValues);
      target = reward + this.gamma * maxNextQ;
    }

    const newQ = currentQ + this.alpha * (target - currentQ);
    prevQValues[actionIdx] = newQ;
    this.qTable.set(prevStateKey, prevQValues);

    // Decay epsilon
    this.totalSteps++;
    if (this.totalSteps % 100 === 0) { // Decay every 100 steps
      this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    numStates: number;
    epsilon: number;
    totalSteps: number;
  } {
    return {
      numStates: this.qTable.size,
      epsilon: this.epsilon,
      totalSteps: this.totalSteps
    };
  }

  /**
   * Save Q-table to disk
   */
  async save(path: string): Promise<void> {
    const data = {
      alpha: this.alpha,
      gamma: this.gamma,
      epsilon: this.epsilon,
      totalSteps: this.totalSteps,
      qTable: Array.from(this.qTable.entries())
    };

    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }

    fs.writeFileSync(`${path}/ghost_qlearning.json`, JSON.stringify(data, null, 2));
  }

  /**
   * Load Q-table from disk
   */
  async load(path: string): Promise<void> {
    const data = JSON.parse(fs.readFileSync(`${path}/ghost_qlearning.json`, 'utf8'));

    this.alpha = data.alpha;
    this.gamma = data.gamma;
    this.epsilon = data.epsilon;
    this.totalSteps = data.totalSteps || 0;
    this.qTable = new Map(data.qTable);
  }
}
