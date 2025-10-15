/**
 * Adversarial Training Script
 *
 * Trains both Pacman and Ghosts simultaneously using Tabular Hybrid Reward Architecture
 * - Pacman learns to collect dots and avoid ghosts
 * - Ghosts learn to catch Pacman and coordinate their movements
 * - Both agents improve through competitive self-play
 */

import { TabularHybridCoordinator } from './TabularHybridCoordinator';
import { GhostQLearningAgent, GhostQLearningState } from './GhostQLearningAgent';
import { GameState, Direction } from './types';
import { Position, MAZE_LAYOUT, TELEPORT_POINTS } from '../../shared/maze';
import CONSTANTS = require('../../shared/constants');
import * as fs from 'fs';

// Training ghost with Q-learning agent
class TrainingGhost {
  agent: GhostQLearningAgent;
  position: Position;
  direction: Direction;
  isFrightened: boolean;
  frightenedTimer: number;

  constructor(startPos: Position, agent?: GhostQLearningAgent) {
    this.position = { ...startPos };
    this.direction = 'UP';
    this.isFrightened = false;
    this.frightenedTimer = 0;
    this.agent = agent || new GhostQLearningAgent();
  }

  reset(startPos: Position) {
    this.position = { ...startPos };
    this.direction = 'UP';
    this.isFrightened = false;
    this.frightenedTimer = 0;
  }

  update(pacmanPos: Position, otherGhosts: Position[], dotsRemaining: number, powerPelletsRemaining: number) {
    // Update frightened state
    if (this.frightenedTimer > 0) {
      this.frightenedTimer--;
      if (this.frightenedTimer === 0) {
        this.isFrightened = false;
      }
    }

    // Create ghost Q-learning state
    const ghostState: GhostQLearningState = {
      ghostPosition: { ...this.position },
      ghostDirection: this.direction,
      pacmanPosition: { ...pacmanPos },
      otherGhosts: otherGhosts.filter(g => g.x !== this.position.x || g.y !== this.position.y),
      isFrightened: this.isFrightened,
      dotsRemaining,
      powerPelletsRemaining
    };

    // Select action using Q-learning agent
    const action = this.agent.selectAction(ghostState);
    return action;
  }

  move(direction: Direction, checkTeleport: (pos: Position) => Position | null) {
    const dir = CONSTANTS.DIRECTIONS[direction];
    const newX = this.position.x + dir.x;
    const newY = this.position.y + dir.y;

    if (this.isWalkable(newX, newY)) {
      this.position.x = newX;
      this.position.y = newY;
      this.direction = direction;

      // Check for teleportation
      const teleportExit = checkTeleport(this.position);
      if (teleportExit) {
        this.position.x = teleportExit.x;
        this.position.y = teleportExit.y;
      }
    }
  }

  setFrightened(duration: number) {
    this.isFrightened = true;
    this.frightenedTimer = duration;
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= CONSTANTS.GRID_WIDTH || y < 0 || y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    return MAZE_LAYOUT[y][x] !== 0;
  }
}

// Training environment
class AdversarialTrainingEnv {
  private pacmanPos!: Position;
  private pacmanDir!: Direction;
  private ghosts!: TrainingGhost[];
  private dots!: Position[];
  private powerPellets!: Position[];
  private score!: number;
  private tickCount!: number;
  private maxTicks: number;
  private sharedAgent: GhostQLearningAgent; // Shared agent for all ghosts

  constructor(sharedAgent: GhostQLearningAgent) {
    this.maxTicks = 3000;
    this.sharedAgent = sharedAgent;

    // All 4 ghosts share the same agent (learn together!)
    this.ghosts = [0, 1, 2, 3].map((i) => {
      const startPos = [
        { x: 11, y: 11 },  // Left of ghost house
        { x: 16, y: 11 },  // Right of ghost house
        { x: 11, y: 17 },  // Left below ghost house
        { x: 16, y: 17 }   // Right below ghost house
      ][i];
      return new TrainingGhost(startPos, sharedAgent);
    });
    this.reset();
  }

  reset() {
    // Starting positions
    this.pacmanPos = { x: 14, y: 23 };
    this.pacmanDir = 'RIGHT';

    // Reset ghosts - start OUTSIDE ghost house
    const startPositions = [
      { x: 11, y: 11 },  // Left of ghost house
      { x: 16, y: 11 },  // Right of ghost house
      { x: 11, y: 17 },  // Left below ghost house
      { x: 16, y: 17 }   // Right below ghost house
    ];
    this.ghosts.forEach((ghost, i) => ghost.reset(startPositions[i]));

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

  step(pacmanAction: Direction): {
    done: boolean;
    won: boolean;
    reason: string;
    ghostsLearned: boolean[];
  } {
    this.tickCount++;

    // Save previous states for learning
    const prevPacmanPos = { ...this.pacmanPos };
    const prevGhostStates = this.ghosts.map(g => ({
      position: { ...g.position },
      direction: g.direction,
      isFrightened: g.isFrightened
    }));

    // Move Pacman
    const dir = CONSTANTS.DIRECTIONS[pacmanAction];
    let newX = this.pacmanPos.x + dir.x;
    let newY = this.pacmanPos.y + dir.y;

    if (this.isWalkable(newX, newY)) {
      this.pacmanPos.x = newX;
      this.pacmanPos.y = newY;
      this.pacmanDir = pacmanAction;

      // Check for teleportation
      const teleportExit = this.checkTeleport(this.pacmanPos);
      if (teleportExit) {
        this.pacmanPos.x = teleportExit.x;
        this.pacmanPos.y = teleportExit.y;
      }

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
        // Frighten all ghosts
        this.ghosts.forEach(g => g.setFrightened(100));
      }
    }

    // Move ghosts and update their learning
    const ghostsLearned: boolean[] = [];
    const otherGhostsPositions = this.ghosts.map(g => g.position);
    const prevDotsCount = this.dots.length;
    const prevPowerPelletsCount = this.powerPellets.length;

    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];

      // Create previous state for Q-learning
      const prevState: GhostQLearningState = {
        ghostPosition: prevGhostStates[i].position,
        ghostDirection: prevGhostStates[i].direction,
        pacmanPosition: prevPacmanPos,
        otherGhosts: otherGhostsPositions.filter((_, idx) => idx !== i),
        isFrightened: prevGhostStates[i].isFrightened,
        dotsRemaining: prevDotsCount,
        powerPelletsRemaining: prevPowerPelletsCount
      };

      // Ghost decides action based on current state
      const ghostAction = ghost.update(
        this.pacmanPos,
        otherGhostsPositions,
        this.dots.length,
        this.powerPellets.length
      );

      // Move ghost
      ghost.move(ghostAction, this.checkTeleport.bind(this));

      // Create new state for Q-learning
      const newState: GhostQLearningState = {
        ghostPosition: { ...ghost.position },
        ghostDirection: ghost.direction,
        pacmanPosition: { ...this.pacmanPos },
        otherGhosts: otherGhostsPositions.filter((_, idx) => idx !== i),
        isFrightened: ghost.isFrightened,
        dotsRemaining: this.dots.length,
        powerPelletsRemaining: this.powerPellets.length
      };

      // Calculate reward for ghost
      let reward = -1; // Time pressure: -1 per step

      // GHOST HOUSE PENALTY: Heavily penalize being stuck in spawn
      if (this.isInGhostHouse(ghost.position.x, ghost.position.y)) {
        reward += -50; // Big penalty for wasting time in spawn
      }

      let done = false;

      // Check collision with Pacman
      let collisionDetected = false;

      // Check 1: Are they on the exact same tile now?
      if (ghost.position.x === this.pacmanPos.x && ghost.position.y === this.pacmanPos.y) {
        collisionDetected = true;
      }

      // Check 2: Did they swap positions (pass through each other)?
      const swapped =
        prevGhostStates[i].position.x === this.pacmanPos.x &&
        prevGhostStates[i].position.y === this.pacmanPos.y &&
        ghost.position.x === prevPacmanPos.x &&
        ghost.position.y === prevPacmanPos.y;

      if (swapped) {
        collisionDetected = true;
      }

      if (collisionDetected) {
        if (ghost.isFrightened) {
          // Pacman eats ghost - send back to spawn!
          reward = -500;

          // Reset ghost to spawn position (outside ghost house)
          const spawnPositions = [
            { x: 11, y: 11 },  // Left of ghost house
            { x: 16, y: 11 },  // Right of ghost house
            { x: 11, y: 17 },  // Left below ghost house
            { x: 16, y: 17 }   // Right below ghost house
          ];
          ghost.reset(spawnPositions[i]);
          ghost.isFrightened = false; // No longer frightened after respawn
          ghost.frightenedTimer = 0;

          this.score += 200;
        } else {
          // Ghost catches Pacman - HUGE reward!
          reward = 1000;
          done = true;

          // Update Q-table with big win
          ghost.agent.update(prevState, ghostAction, reward, newState, done);
          ghostsLearned.push(true);

          return { done: true, won: false, reason: 'CAUGHT_BY_GHOST', ghostsLearned };
        }
      }

      // Update ghost's Q-values
      ghost.agent.update(prevState, ghostAction, reward, newState, done);
      ghostsLearned.push(true);
    }

    // Check win condition
    if (this.dots.length === 0) {
      return { done: true, won: true, reason: 'ALL_DOTS_EATEN', ghostsLearned };
    }

    // Check timeout
    if (this.tickCount >= this.maxTicks) {
      return { done: true, won: false, reason: 'TIMEOUT', ghostsLearned };
    }

    return { done: false, won: false, reason: '', ghostsLearned };
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
        isFrightened: g.isFrightened
      })),
      isFrightened: false, // Pacman is never frightened
      score: this.score,
      tickCount: this.tickCount
    };
  }

  private checkTeleport(pos: Position): Position | null {
    for (const teleport of TELEPORT_POINTS) {
      if (pos.x === teleport.entry.x && pos.y === teleport.entry.y) {
        return teleport.exit;
      }
    }
    return null;
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= CONSTANTS.GRID_WIDTH || y < 0 || y >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    return MAZE_LAYOUT[y][x] !== 0;
  }

  private isInGhostHouse(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    if (ix < 0 || ix >= CONSTANTS.GRID_WIDTH || iy < 0 || iy >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }
    return MAZE_LAYOUT[iy][ix] === 3;
  }
}

// Recording types
interface RecordedFrame {
  tick: number;
  pacman: { position: Position; direction: Direction };
  ghosts: Array<{ position: Position; direction: Direction; isFrightened: boolean }>;
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

// Main adversarial training loop
async function train() {
  console.log('🎮 Starting Adversarial Training (Pacman vs Ghosts)...\n');
  console.log('🤖 Pacman: Tabular HRA | Ghosts: Direct Q-Learning\n');

  // Create agents
  const pacmanCoordinator = new TabularHybridCoordinator();

  // SHARED Q-LEARNING: All ghosts use ONE agent to learn from each other!
  const sharedGhostAgent = new GhostQLearningAgent();

  // Try to load existing models
  const pacmanModelPath = './models/adversarial_tabular/pacman';
  const ghostModelPath = './models/adversarial_qlearning/ghosts';

  try {
    await pacmanCoordinator.load(pacmanModelPath);
    console.log('✅ Loaded existing Pacman model\n');
  } catch (e) {
    console.log('📝 Starting with fresh Pacman model\n');
  }

  try {
    await sharedGhostAgent.load(`${ghostModelPath}/shared`);
    console.log('✅ Loaded existing Shared Ghost Q-Learning model (all 4 ghosts learn together!)\n');
  } catch (e) {
    console.log('📝 Starting with fresh Shared Ghost Q-Learning model\n');
  }

  const env = new AdversarialTrainingEnv(sharedGhostAgent);
  const numEpisodes = 10000;
  const saveInterval = 500;
  const recordInterval = 100;
  const recordingsPath = './recordings_adversarial';

  // Create recordings directory
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }

  let bestPacmanScore = 0;
  let pacmanWins = 0;
  let ghostWins = 0;
  let recentScores: number[] = [];
  let recentSteps: number[] = [];
  const windowSize = 100; // Rolling average window

  // Create live stats and metrics files
  const liveStatsPath = './live_training_stats.json';
  const metricsPath = './training_metrics.json';
  const metricsArray: any[] = [];

  console.log('📊 Live stats: live_training_stats.json');
  console.log('📈 Dashboard metrics: training_metrics.json');
  console.log('🎯 Training started! Watch the stats below...\n');
  console.log('─'.repeat(80));

  for (let episode = 1; episode <= numEpisodes; episode++) {
    env.reset();
    let done = false;
    let stepCount = 0;
    let episodeResult: { done: boolean; won: boolean; reason: string; ghostsLearned: boolean[] } = {
      done: false,
      won: false,
      reason: '',
      ghostsLearned: []
    };

    // Always record frames - decide later if interesting
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

      // Record every frame (we'll decide if we save later)
      recording.frames.push({
        tick: stepCount,
        pacman: { position: { ...state.position }, direction: state.direction },
        ghosts: state.ghosts.map(g => ({
          position: { ...g.position },
          direction: g.direction,
          isFrightened: g.isFrightened
        })),
        dots: [...state.dots],
        powerPellets: [...state.powerPellets],
        score: state.score
      });

      // Pacman selects action
      const pacmanAction = pacmanCoordinator.selectAction(state, stepCount);

      // Environment step (ghosts move and learn here)
      episodeResult = env.step(pacmanAction);
      done = episodeResult.done;

      // Pacman learns
      const newState = env.getState();
      pacmanCoordinator.updateGVFs(prevState, pacmanAction, newState);

      stepCount++;

      // Save final result
      if (done) {
        recording.finalScore = newState.score;
        recording.result = episodeResult.won ? 'PACMAN_WIN' : episodeResult.reason;
        recording.steps = stepCount;
      }
    }

    const finalScore = env.getState().score;
    const finalState = env.getState();
    const won = finalState.dots.length === 0;

    if (won) {
      pacmanWins++;
    } else {
      ghostWins++;
    }

    if (finalScore > bestPacmanScore) {
      bestPacmanScore = finalScore;
    }

    // Track recent performance
    recentScores.push(finalScore);
    recentSteps.push(stepCount);
    if (recentScores.length > windowSize) {
      recentScores.shift();
      recentSteps.shift();
    }

    // 🎬 YOUTUBE-WORTHY DETECTION 🎬
    // Calculate excitement metrics
    const firstRecordingFrame = recording.frames[0];
    const lastRecordingFrame = recording.frames[recording.frames.length - 1];
    const dotsCollectedInEpisode = firstRecordingFrame.dots.length - lastRecordingFrame.dots.length;
    const collectionRate = dotsCollectedInEpisode / Math.max(stepCount, 1);

    // Detect close calls - count frames where Pacman was within 2 tiles of a ghost
    let closeCalls = 0;
    let powerPelletEaten = false;
    for (let i = 0; i < recording.frames.length; i++) {
      const frame = recording.frames[i];
      const prevFrame = i > 0 ? recording.frames[i - 1] : null;

      // Check if power pellet was eaten this frame
      if (prevFrame && prevFrame.powerPellets.length > frame.powerPellets.length) {
        powerPelletEaten = true;
      }

      // Count close encounters
      for (const ghost of frame.ghosts) {
        if (!ghost.isFrightened) {
          const dist = Math.abs(frame.pacman.position.x - ghost.position.x) +
                       Math.abs(frame.pacman.position.y - ghost.position.y);
          if (dist <= 2) {
            closeCalls++;
            break; // Only count once per frame
          }
        }
      }
    }

    const closeCallRate = closeCalls / Math.max(recording.frames.length, 1);

    // 🎬 ONLY THE MOST EPIC MOMENTS FOR YOUTUBE 🎬
    const isInteresting =
      // Pacman victories - ALL wins are rare and interesting
      won ||

      // New records - breaking personal bests
      (finalScore > bestPacmanScore && finalScore >= 2500) ||  // Only if score is actually good

      // Near-perfect games
      (finalScore >= 3500) ||                                   // Raised from 3400 - truly exceptional

      // Epic battles - long AND intense
      (stepCount > 1000 && closeCallRate > 0.7 && won) ||             // 1000+ steps AND 40%+ close calls

      // Lightning fast ghost domination
      (stepCount < 50 && episodeResult.reason === 'CAUGHT_BY_GHOST') || // Under 50 steps!

      // Heartbreaking near-wins
      (dotsCollectedInEpisode > 290 && !won) ||                // 220+ dots but still lost

      // Comeback victories
      (powerPelletEaten && won && closeCallRate > 0.6) ||      // Clutch + intense

      // Major milestones only
      (episode === 1 || episode === 100 || episode === 1000 || episode === 5000 || episode === 10000);

    // 🎬 Save ONLY the most epic episodes with cinematic tags
    if (isInteresting) {
      const tags = [];
      if (won) tags.push('WIN');
      if (finalScore > bestPacmanScore && finalScore >= 2500) tags.push('RECORD');
      if (finalScore >= 3500) tags.push('NEARPERFECT');
      if (stepCount > 1000) tags.push('EPIC');
      if (stepCount < 50 && !won) tags.push('ULTRAFAST');
      if (closeCallRate > 0.4) tags.push('INTENSE');
      if (dotsCollectedInEpisode > 220 && !won) tags.push('HEARTBREAK');
      if (powerPelletEaten && won && closeCallRate > 0.3) tags.push('CLUTCH');
      if (episode === 1 || episode === 100 || episode === 1000 || episode === 5000 || episode === 10000) tags.push('MILESTONE');

      const tagString = tags.length > 0 ? `_${tags.join('_')}` : '';
      const filename = `${recordingsPath}/ep${String(episode).padStart(6, '0')}_score${String(finalScore).padStart(5, '0')}_${recording.result}${tagString}.json`;
      fs.writeFileSync(filename, JSON.stringify(recording, null, 2));
    }

    // Calculate rolling averages
    const avgScore = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const avgSteps = recentSteps.reduce((a, b) => a + b, 0) / recentSteps.length;
    const pacmanWinRate = ((pacmanWins / episode) * 100).toFixed(1);
    const ghostWinRate = ((ghostWins / episode) * 100).toFixed(1);
    const recentWins = recentScores.filter((_, i) => i >= Math.max(0, recentScores.length - windowSize)).length;
    const recentWinRate = recentScores.length > 0
      ? ((recentScores.filter((s, i) => {
          const idx = episode - recentScores.length + i;
          return idx >= 1 && idx <= episode && (idx <= pacmanWins);
        }).length / Math.min(recentScores.length, episode)) * 100).toFixed(1)
      : '0.0';

    // Enhanced logging - every episode
    const resultEmoji = won ? '🏆' : '💀';
    const trendEmoji = finalScore > avgScore ? '📈' : finalScore < avgScore ? '📉' : '➡️';

    console.log(
      `${resultEmoji} Ep ${String(episode).padStart(5)} | ` +
      `Score: ${String(finalScore).padStart(4)} ${trendEmoji} | ` +
      `Best: ${String(bestPacmanScore).padStart(4)} | ` +
      `Avg: ${avgScore.toFixed(0).padStart(4)} | ` +
      `Steps: ${String(stepCount).padStart(4)} | ` +
      `P: ${pacmanWinRate}% | G: ${ghostWinRate}%`
    );

    // Extra detailed stats every 50 episodes
    if (episode % 50 === 0) {
      console.log('─'.repeat(80));
      console.log(`📊 Episode ${episode}/${numEpisodes} Summary:`);
      console.log(`   💯 Best Score: ${bestPacmanScore}`);
      console.log(`   📈 Avg Score (last ${recentScores.length}): ${avgScore.toFixed(1)}`);
      console.log(`   ⏱️  Avg Steps (last ${recentSteps.length}): ${avgSteps.toFixed(0)}`);
      console.log(`   🎮 Pacman Wins: ${pacmanWins} (${pacmanWinRate}%)`);
      console.log(`   👻 Ghost Wins: ${ghostWins} (${ghostWinRate}%)`);

      // Show learning progress
      const pacmanStats = pacmanCoordinator.getStats();
      console.log(`   🧠 Pacman GVFs: ${pacmanStats.numGVFs} (${pacmanStats.totalStates} states)`);

      const ghostStats = sharedGhostAgent.getStats();
      console.log(`   👻 Shared Ghost Q-Table: ${ghostStats.numStates} states (ε=${ghostStats.epsilon.toFixed(3)}, learned by all 4!)`);
      console.log('─'.repeat(80));
    }

    // Write live stats to file (every episode)
    const liveStats = {
      episode,
      totalEpisodes: numEpisodes,
      progress: ((episode / numEpisodes) * 100).toFixed(1) + '%',
      currentScore: finalScore,
      bestScore: bestPacmanScore,
      avgScore: avgScore.toFixed(1),
      avgSteps: avgSteps.toFixed(0),
      pacmanWins,
      ghostWins,
      pacmanWinRate: pacmanWinRate + '%',
      ghostWinRate: ghostWinRate + '%',
      lastResult: won ? 'PACMAN_WIN' : 'GHOST_WIN',
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(liveStatsPath, JSON.stringify(liveStats, null, 2));

    // Add to metrics array for dashboard (format compatible with dashboard)
    const firstFrame = recording.frames.length > 0 ? recording.frames[0] : null;
    const dotsCollected = firstFrame ? firstFrame.dots.length - (recording.frames[recording.frames.length - 1]?.dots.length || 0) : 0;

    metricsArray.push({
      episode,
      totalReward: finalScore,
      averageReward: finalScore / Math.max(stepCount, 1),
      score: finalScore,
      survivalTime: stepCount * (1000 / 60), // Convert steps to ms (assuming 60 ticks/sec)
      dotsCollected: dotsCollected,
      ghostsEaten: 0, // Could track this if needed
      deaths: won ? 0 : 1,
      epsilon: 0, // Tabular doesn't use epsilon, but dashboard expects it
      loss: 0 // No loss in tabular Q-learning
    });

    // Write metrics file every 10 episodes to avoid too much I/O
    if (episode % 10 === 0) {
      fs.writeFileSync(metricsPath, JSON.stringify(metricsArray, null, 2));
    }

    // Save models periodically
    if (episode % saveInterval === 0) {
      await pacmanCoordinator.save(pacmanModelPath);
      await sharedGhostAgent.save(`${ghostModelPath}/shared`);
      console.log(`\n💾 Models saved at episode ${episode}\n`);

      // Print stats
      const pacmanStats = pacmanCoordinator.getStats();
      console.log(`📊 Pacman: ${pacmanStats.numGVFs} GVFs, ${pacmanStats.totalStates} states`);

      const ghostStats = sharedGhostAgent.getStats();
      console.log(`👻 Shared Ghost Q-Learning: ${ghostStats.numStates} states, ε=${ghostStats.epsilon.toFixed(3)} (all 4 ghosts learn together!)`);
      console.log('');
    }
  }

  // Final save
  await pacmanCoordinator.save(pacmanModelPath);
  await sharedGhostAgent.save(`${ghostModelPath}/shared`);

  // Final metrics write
  fs.writeFileSync(metricsPath, JSON.stringify(metricsArray, null, 2));

  console.log('\n✅ Adversarial Training Complete!\n');
  console.log(`📊 Final Results:`);
  console.log(`   Pacman Best Score: ${bestPacmanScore}`);
  console.log(`   Pacman Win Rate: ${((pacmanWins / numEpisodes) * 100).toFixed(1)}%`);
  console.log(`   Ghost Win Rate: ${((ghostWins / numEpisodes) * 100).toFixed(1)}%`);
  console.log(`📹 Recordings: ${recordingsPath}/`);
  console.log(`💾 Models: ${pacmanModelPath} & ${ghostModelPath}/`);
  console.log(`📈 Dashboard metrics: ${metricsPath}`);
}

// Run training
train().catch(console.error);
