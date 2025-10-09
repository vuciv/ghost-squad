/**
 * Ghost Tabular General Value Function (GVF)
 * 
 * EXACT OPPOSITE of Pacman's TabularGVF!
 * Same Expected SARSA algorithm, but inverted reward structure.
 * 
 * Pacman TabularGVF learns: "How to reach targets (pellets, power pellets)"
 * Ghost TabularGVF learns: "How to reach Pacman position"
 * 
 * Based on the HRA paper's approach (van Seijen et al., NIPS 2017)
 * - Uses exact tabular representation
 * - Expected SARSA with α=1.0 and γ=0.99
 * - Learns Q-values for reaching Pacman's position
 * - Pseudo-reward: +1 when at Pacman's position, 0 otherwise
 */

import { Direction } from './types';
import { Position } from '../../shared/maze';

export class GhostTabularGVF {
  private qTable: Map<string, number[]>; // stateKey -> [Q(UP), Q(DOWN), Q(LEFT), Q(RIGHT)]
  private targetPosition: Position; // Current Pacman position this GVF targets
  private alpha: number; // Learning rate
  private gamma: number; // Discount factor
  private actionMap: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  constructor(targetPosition: Position, alpha: number = 1.0, gamma: number = 0.99) {
    this.qTable = new Map();
    this.targetPosition = targetPosition;
    this.alpha = alpha;
    this.gamma = gamma;
  }

  /**
   * Get state key for Q-table lookup
   * Exactly like Pacman's TabularGVF
   */
  private getStateKey(position: Position, direction: Direction): string {
    return `${position.x},${position.y},${direction}`;
  }

  /**
   * Get Q-values for a state (returns [0,0,0,0] if unseen)
   */
  getQValues(position: Position, direction: Direction): number[] {
    const key = this.getStateKey(position, direction);
    return this.qTable.get(key) || [0, 0, 0, 0];
  }

  /**
   * Get Q-value for a specific state-action pair
   */
  getQValue(position: Position, direction: Direction, action: Direction): number {
    const qValues = this.getQValues(position, direction);
    const actionIndex = this.actionMap.indexOf(action);
    return qValues[actionIndex];
  }

  /**
   * Update Q-value using Expected SARSA
   * EXACTLY the same algorithm as Pacman's TabularGVF
   * 
   * Q(s,a) ← Q(s,a) + α[r + γ * MEAN(Q(s',a')) - Q(s,a)]
   */
  update(
    state: Position,
    stateDirection: Direction,
    action: Direction,
    nextState: Position,
    nextStateDirection: Direction
  ): void {
    // Compute pseudo-reward: +1 if reached Pacman position, 0 otherwise
    const reward = this.computePseudoReward(nextState);
    
    // Check if next state is terminal (reached Pacman = caught)
    const isTerminal = (nextState.x === this.targetPosition.x && 
                       nextState.y === this.targetPosition.y);

    // Get current Q-value
    const stateKey = this.getStateKey(state, stateDirection);
    const qValues = this.qTable.get(stateKey) || [0, 0, 0, 0];
    const actionIndex = this.actionMap.indexOf(action);
    const currentQ = qValues[actionIndex];

    // Expected SARSA update
    let target: number;
    if (isTerminal) {
      // Terminal state: Q(terminal) = 0, so target = reward only
      target = reward;
    } else {
      // Non-terminal: Use mean of next Q-values (uniform random policy)
      const nextQValues = this.getQValues(nextState, nextStateDirection);
      const meanNextQ = nextQValues.reduce((sum, q) => sum + q, 0) / nextQValues.length;
      target = reward + this.gamma * meanNextQ;
    }

    const newQ = currentQ + this.alpha * (target - currentQ);

    // Update Q-table
    const newQValues = [...qValues];
    newQValues[actionIndex] = newQ;
    this.qTable.set(stateKey, newQValues);
  }

  /**
   * Compute pseudo-reward for this GVF
   * +1 when at target position, 0 otherwise
   * 
   * Target is STATIC (like Pacman's pellet positions)
   * We create many GVFs (one per position) rather than updating one GVF's target
   */
  private computePseudoReward(position: Position): number {
    return (position.x === this.targetPosition.x && 
            position.y === this.targetPosition.y) ? 1.0 : 0.0;
  }

  /**
   * Get the target position this GVF is learning to reach
   */
  getTargetPosition(): Position {
    return { ...this.targetPosition };
  }

  /**
   * Get the best action according to this GVF
   */
  getBestAction(position: Position, direction: Direction): { action: Direction; qValue: number } {
    const qValues = this.getQValues(position, direction);
    let maxQ = -Infinity;
    let bestAction = 'UP' as Direction;

    for (let i = 0; i < this.actionMap.length; i++) {
      if (qValues[i] > maxQ) {
        maxQ = qValues[i];
        bestAction = this.actionMap[i];
      }
    }

    return { action: bestAction, qValue: maxQ };
  }

  /**
   * Get number of states visited
   */
  getTableSize(): number {
    return this.qTable.size;
  }

  /**
   * Save Q-table to JSON
   */
  toJSON(): any {
    return {
      targetPosition: this.targetPosition,
      alpha: this.alpha,
      gamma: this.gamma,
      qTable: Array.from(this.qTable.entries())
    };
  }

  /**
   * Load Q-table from JSON
   */
  static fromJSON(data: any): GhostTabularGVF {
    const gvf = new GhostTabularGVF(data.targetPosition, data.alpha, data.gamma);
    gvf.qTable = new Map(data.qTable);
    return gvf;
  }
}

