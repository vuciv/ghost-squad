/**
 * Tabular General Value Function (GVF)
 * 
 * Based on the HRA paper's approach (van Seijen et al., NIPS 2017)
 * Each GVF learns Q-values for reaching a specific target location.
 * 
 * Key properties from the paper:
 * - Uses exact tabular representation (no function approximation!)
 * - State: (x, y, direction) → discrete state ID
 * - Expected SARSA with α=1.0 and γ=0.99 (paper line 544, eq 8)
 * - Learns Q-values for UNIFORM RANDOM POLICY (not optimal policy!)
 * - Pseudo-reward: +1 when at target, 0 otherwise
 * - Q-values converge to [0,1] range (paper line 544)
 */

import { Direction } from './types';
import { Position } from '../../shared/maze';

export class TabularGVF {
  private qTable: Map<string, number[]>; // stateKey -> [Q(UP), Q(DOWN), Q(LEFT), Q(RIGHT)]
  private targetPosition: Position;
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
   * Update Q-value using Expected SARSA (paper equation 8, line 281-282)
   * 
   * CRITICAL: Paper uses Expected SARSA with UNIFORM RANDOM POLICY, NOT Q-learning!
   * 
   * Q(s,a) ← Q(s,a) + α[r + γ * MEAN(Q(s',a')) - Q(s,a)]
   * 
   * Paper quote (line 279-283): "An alternative training target is one that results 
   * from evaluating the uniformly random policy υ under each component reward function"
   * 
   * Paper quote (line 362): "Terminal states are states from which no further reward 
   * can be received; they have by definition a value of 0."
   * 
   * With α=1.0 (like the paper):
   * Q(s,a) ← r + γ * MEAN(Q(s',a'))  if s' not terminal
   * Q(s,a) ← r                        if s' terminal
   */
  update(
    state: Position,
    stateDirection: Direction,
    action: Direction,
    nextState: Position,
    nextStateDirection: Direction
  ): void {
    // Compute pseudo-reward: +1 if reached target, 0 otherwise
    const reward = this.computePseudoReward(nextState);
    
    // Check if next state is terminal (paper line 362)
    // Terminal = reached target position (where we got the reward)
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
      // Paper equation (8): y_{k,i} = R_k(s,a,s') + γ Σ_{a'∈A} (1/|A|) Q_k(s',a'; θ_{i-1})
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
   * Paper: +1 when at target position, 0 otherwise
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
  static fromJSON(data: any): TabularGVF {
    const gvf = new TabularGVF(data.targetPosition, data.alpha, data.gamma);
    gvf.qTable = new Map(data.qTable);
    return gvf;
  }
}

