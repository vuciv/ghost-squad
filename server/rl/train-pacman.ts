/**
 * Simple Tabular Pacman Training Script
 *
 * Trains the TabularHybridCoordinator (HRA paper implementation)
 * by playing against simple ghosts in self-play mode.
 */

import { TabularHybridCoordinator } from './TabularHybridCoordinator';
import { GameState, Direction } from './types';
import { Position, MAZE_LAYOUT } from '../../shared/maze';
import CONSTANTS = require('../../shared/constants');
import * as fs from 'fs';

// Simple ghost AI for training
class SimpleGhost {
  position: Position;
  direction: Direction;

  constructor(position: Position) {
    this.position = { ...position };
    this.direction = 'UP';
  }

  update(pacmanPos: Position): Direction {
    // Simple chase logic - move toward Pacman
    const dx = pacmanPos.x - this.position.x;
    const dy = pacmanPos.y - this.position.y;

    const validMoves: Direction[] = [];

    // Try all directions
    if (this.isWalkable(this.position.x, this.position.y - 1)) validMoves.push('UP');
    if (this.isWalkable(this.position.x, this.position.y + 1)) validMoves.push('DOWN');
    if (this.isWalkable(this.position.x - 1, this.position.y)) validMoves.push('LEFT');
    if (this.isWalkable(this.position.x + 1, this.position.y)) validMoves.push('RIGHT');

    if (validMoves.length === 0) return this.direction;

    // Prefer moving toward Pacman
    if (Math.abs(dx) > Math.abs(dy)) {
      const preferred = dx > 0 ? 'RIGHT' : 'LEFT';
      if (validMoves.includes(preferred)) return preferred;
    } else {
      const preferred = dy > 0 ? 'DOWN' : 'UP';
      if (validMoves.includes(preferred)) return preferred;
    }

    // Random valid move
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= CONSTANTS.GRID_WIDTH || y < 0 || y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    return MAZE_LAYOUT[y][x] !== 0;
  }

  move(direction: Direction) {
    const dir = CONSTANTS.DIRECTIONS[direction];
    const newX = this.position.x + dir.x;
    const newY = this.position.y + dir.y;

    if (this.isWalkable(newX, newY)) {
      this.position.x = newX;
      this.position.y = newY;
      this.direction = direction;
    }
  }
}

// Training environment
class TrainingEnv {
  private pacmanPos!: Position;
  private pacmanDir!: Direction;
  private ghosts!: SimpleGhost[];
  private dots!: Position[];
  private powerPellets!: Position[];
  private score!: number;
  private tickCount!: number;
  private maxTicks: number;

  constructor() {
    this.maxTicks = 3000;
    this.reset();
  }

  reset() {
    // Starting positions
    this.pacmanPos = { x: 14, y: 23 };
    this.pacmanDir = 'RIGHT';

    // Create 4 simple ghosts
    this.ghosts = [
      new SimpleGhost({ x: 12, y: 11 }),
      new SimpleGhost({ x: 15, y: 11 }),
      new SimpleGhost({ x: 13, y: 14 }),
      new SimpleGhost({ x: 16, y: 14 })
    ];

    // Initialize dots and pellets
    this.dots = [];
    this.powerPellets = [];
    for (let y = 0; y < MAZE_LAYOUT.length; y++) {
      for (let x = 0; x < MAZE_LAYOUT[0].length; x++) {
        if (MAZE_LAYOUT[y][x] === 1) this.dots.push({ x, y });
        if (MAZE_LAYOUT[y][x] === 2) this.powerPellets.push({ x, y });
      }
    }

    this.score = 0;
    this.tickCount = 0;
  }

  step(action: Direction): { done: boolean; won: boolean; reason: string } {
    this.tickCount++;

    // Save previous state
    const prevState = this.getState();

    // Move Pacman
    const dir = CONSTANTS.DIRECTIONS[action];
    const newX = this.pacmanPos.x + dir.x;
    const newY = this.pacmanPos.y + dir.y;

    if (this.isWalkable(newX, newY)) {
      this.pacmanPos.x = newX;
      this.pacmanPos.y = newY;
      this.pacmanDir = action;

      // Check dot collision
      const dotIdx = this.dots.findIndex(d => d.x === newX && d.y === newY);
      if (dotIdx !== -1) {
        this.dots.splice(dotIdx, 1);
        this.score += 10;
      }

      // Check power pellet collision
      const pelletIdx = this.powerPellets.findIndex(p => p.x === newX && p.y === newY);
      if (pelletIdx !== -1) {
        this.powerPellets.splice(pelletIdx, 1);
        this.score += 50;
      }
    }

    // Move ghosts
    for (const ghost of this.ghosts) {
      const ghostAction = ghost.update(this.pacmanPos);
      ghost.move(ghostAction);

      // Check collision with Pacman
      if (ghost.position.x === this.pacmanPos.x && ghost.position.y === this.pacmanPos.y) {
        return { done: true, won: false, reason: 'CAUGHT_BY_GHOST' };
      }
    }

    // Check win condition
    if (this.dots.length === 0) {
      return { done: true, won: true, reason: 'ALL_DOTS_EATEN' };
    }

    // Check timeout
    if (this.tickCount >= this.maxTicks) {
      return { done: true, won: false, reason: 'TIMEOUT' };
    }

    return { done: false, won: false, reason: '' };
  }

  getState(): GameState {
    return {
      position: { ...this.pacmanPos },
      direction: this.pacmanDir,
      dots: [...this.dots],
      powerPellets: [...this.powerPellets],
      ghosts: this.ghosts.map(g => ({
        position: { ...g.position },
        direction: g.direction,
        isFrightened: false
      })),
      isFrightened: false,
      score: this.score,
      tickCount: this.tickCount
    };
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= CONSTANTS.GRID_WIDTH || y < 0 || y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    return MAZE_LAYOUT[y][x] !== 0;
  }
}

// Recording types
interface RecordedFrame {
  tick: number;
  pacman: { position: Position; direction: Direction };
  ghosts: Array<{ position: Position; direction: Direction }>;
  dots: Position[];
  powerPellets: Position[];
  score: number;
}

interface EpisodeRecording {
  episode: number;
  frames: RecordedFrame[];
  finalScore: number;
  result: string;
  steps: number;
}

// Main training loop
async function train() {
  console.log('🎮 Starting Tabular Pacman Training...\n');

  const coordinator = new TabularHybridCoordinator();
  const env = new TrainingEnv();
  const numEpisodes = 5000;
  const saveInterval = 500;
  const recordInterval = 50; // Record every 50th episode
  const modelPath = './models/adversarial_tabular/pacman';
  const recordingsPath = './recordings_training';

  // Create recordings directory
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }

  let bestScore = 0;
  let wins = 0;

  for (let episode = 1; episode <= numEpisodes; episode++) {
    env.reset();
    let done = false;
    let stepCount = 0;

    // Recording setup
    const shouldRecord = episode % recordInterval === 0 || episode === 1;
    const recording: EpisodeRecording = {
      episode,
      frames: [],
      finalScore: 0,
      result: '',
      steps: 0
    };

    while (!done) {
      const state = env.getState();
      const prevState = { ...state };

      // Record frame if this episode is being recorded
      if (shouldRecord) {
        recording.frames.push({
          tick: stepCount,
          pacman: { position: { ...state.position }, direction: state.direction },
          ghosts: state.ghosts.map(g => ({
            position: { ...g.position },
            direction: g.direction
          })),
          dots: [...state.dots],
          powerPellets: [...state.powerPellets],
          score: state.score
        });
      }

      // Select action using coordinator
      const action = coordinator.selectAction(state, stepCount);

      // Take action in environment
      const result = env.step(action);
      done = result.done;

      // Get new state
      const newState = env.getState();

      // Update GVFs (learning step)
      coordinator.updateGVFs(prevState, action, newState);

      stepCount++;

      // Save final result info
      if (done && shouldRecord) {
        recording.finalScore = newState.score;
        recording.result = result.won ? 'WIN' : result.reason;
        recording.steps = stepCount;
      }
    }

    const finalScore = env.getState().score;
    const finalResult = env.step('UP'); // Just to get the result

    if (finalResult.won) wins++;
    if (finalScore > bestScore) bestScore = finalScore;

    // Save recording if this episode was recorded
    if (shouldRecord) {
      const filename = `${recordingsPath}/episode_${String(episode).padStart(6, '0')}_score_${String(finalScore).padStart(5, '0')}_${recording.result}.json`;
      fs.writeFileSync(filename, JSON.stringify(recording, null, 2));
    }

    // Logging
    if (episode % 10 === 0) {
      const winRate = ((wins / episode) * 100).toFixed(1);
      console.log(`Episode ${episode}/${numEpisodes} | Score: ${finalScore} | Best: ${bestScore} | Win Rate: ${winRate}%`);
    }

    // Save model periodically
    if (episode % saveInterval === 0) {
      await coordinator.save(modelPath);
      console.log(`\n💾 Model saved at episode ${episode}\n`);
    }
  }

  // Final save
  await coordinator.save(modelPath);
  console.log('\n✅ Training complete! Final model saved.');
  console.log(`📊 Best Score: ${bestScore}`);
  console.log(`🏆 Win Rate: ${((wins / numEpisodes) * 100).toFixed(1)}%`);
  console.log(`📹 Recordings saved to: ${recordingsPath}/`);
}

// Run training
train().catch(console.error);
