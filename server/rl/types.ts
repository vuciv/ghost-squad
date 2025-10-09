/**
 * Types for Multi-Agent Reinforcement Learning System
 * Based on Microsoft's hierarchical RL with modular reward models
 */

import { Position } from '../../shared/maze';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Ghost {
  position: Position;
  direction: Direction;
  isFrightened: boolean;
}

export interface GameState {
  position: Position;
  direction: Direction;
  dots: Position[];
  powerPellets: Position[];
  ghosts: Ghost[];
  isFrightened: boolean;
  score: number;
  tickCount: number;
}

export interface AgentAction {
  direction: Direction;
  confidence: number; // How confident this agent is in its decision
}

export interface StateFeatures {
  // Spatial features (normalized 0-1)
  normalizedPosition: [number, number];
  
  // Directional features (one-hot encoded)
  currentDirection: [number, number, number, number]; // UP, DOWN, LEFT, RIGHT
  
  // Danger features
  dangerMap: number[]; // 4 values for each direction
  minGhostDistance: number;
  ghostDirections: number[]; // Relative direction vectors to each ghost
  
  // Resource features
  nearestDotDistance: number;
  nearestDotDirection: [number, number];
  dotsInVicinity: number; // Count within radius
  nearestPowerPelletDistance: number;
  nearestPowerPelletDirection: [number, number];
  
  // Mode features
  isFrightened: number; // 0 or 1
  frightenedTimeRemaining: number; // normalized
  
  // Context features
  totalDotsRemaining: number; // normalized
  currentScore: number; // normalized
}

export interface AgentReward {
  dotCollection: number;
  survival: number;
  ghostAvoidance: number;
  powerPelletAcquisition: number;
  aggressiveHunting: number;
  exploration: number;
  efficiency: number;
}

export interface Experience {
  state: StateFeatures;
  action: number; // 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT
  reward: AgentReward;
  nextState: StateFeatures;
  done: boolean;
  agentId: string;
}

export interface TrainingMetrics {
  episode: number;
  totalReward: number;
  averageReward: number;
  score: number;
  survivalTime: number;
  dotsCollected: number;
  ghostsEaten: number;
  deaths: number;
  epsilon: number;
  loss: number;
}

export interface AgentConfig {
  name: string;
  learningRate: number;
  discountFactor: number;
  explorationRate: number;
  explorationDecay: number;
  minExploration: number;
  rewardWeights: Partial<AgentReward>;
}



