/**
 * Adversarial Tabular Trainer
 * 
 * Trains Pacman and Ghosts against each other simultaneously!
 * - Pacman: TabularHybridCoordinator (collect pellets, avoid ghosts)
 * - Ghosts: GhostTabularHybridCoordinator (catch Pacman, guard pellets)
 * 
 * Both use the SAME algorithm (Expected SARSA), just opposite objectives!
 * This is true adversarial co-evolution.
 */

import { TabularHybridCoordinator } from './TabularHybridCoordinator';
import { GhostTabularHybridCoordinator } from './GhostHybridCoordinator';
import { AdversarialEnvironment } from './AdversarialEnvironment';
import { GameRecorder } from './GameRecorder';
import { Direction, Ghost } from './types';
import { Position } from '../../shared/maze';
import * as fs from 'fs';

interface AdversarialMetrics {
  episode: number;
  ghostsWon: boolean;
  pacmanWon: boolean;
  pacmanScore: number;
  dotsCollected: number;
  tickCount: number;
  ghostWinRate: number;
  avgPacmanScore: number;
  avgDotsCollected: number;
  pacmanGVFs: number;
  ghostGVFs: number;
}

export class AdversarialTabularTrainer {
  private pacmanCoordinator: TabularHybridCoordinator;
  private ghostCoordinators: GhostTabularHybridCoordinator[];
  private recorder: GameRecorder;
  private metrics: AdversarialMetrics[] = [];
  
  private ghostWins: number = 0;
  private pacmanWins: number = 0;
  
  constructor(
    private episodes: number = 5000,
    private maxTicksPerEpisode: number = 3000,
    private saveEvery: number = 250,
    private logEvery: number = 10,
    private recordEvery: number = 50,
    private modelSavePath: string = './models/adversarial_tabular'
  ) {
    // Initialize Pacman coordinator
    this.pacmanCoordinator = new TabularHybridCoordinator(1.0, 0.99);
    
    // Initialize 4 ghost coordinators (one per ghost)
    this.ghostCoordinators = [];
    for (let i = 0; i < 4; i++) {
      this.ghostCoordinators.push(new GhostTabularHybridCoordinator(1.0, 0.99));
    }
    
    this.recorder = new GameRecorder('./recordings_adversarial_tabular');
    
    // Create save directory
    if (!fs.existsSync(this.modelSavePath)) {
      fs.mkdirSync(this.modelSavePath, { recursive: true });
    }
  }

  /**
   * Load pre-trained Pacman model (optional)
   */
  async loadPacmanModel(path: string = './models/tabular_hybrid_paper'): Promise<void> {
    try {
      await this.pacmanCoordinator.load(path);
      const stats = this.pacmanCoordinator.getStats();
      console.log(`✅ Loaded trained Pacman from ${path}`);
      console.log(`   - ${stats.numGVFs} GVFs, ${stats.totalStates} states`);
    } catch (error) {
      console.log(`⚠️  Could not load Pacman from ${path}`);
      console.log(`   Starting with untrained Pacman`);
    }
  }

  /**
   * Main training loop - adversarial co-evolution!
   */
  async train(loadPacman: boolean = false, pacmanPath?: string): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   🎮 ADVERSARIAL TABULAR HRA TRAINING 🎮              ║');
    console.log('║   Pacman vs Ghosts - Co-Evolution!                   ║');
    console.log('║                                                       ║');
    console.log('║   Pacman (Offense):                                   ║');
    console.log('║   • Collect pellets (+10)                             ║');
    console.log('║   • Collect power (+50)                               ║');
    console.log('║   • Avoid ghosts (-1000)                              ║');
    console.log('║   • Eat blue ghosts (+1000)                           ║');
    console.log('║                                                       ║');
    console.log('║   Ghosts (Defense):                                   ║');
    console.log('║   • Catch Pacman (+1000)                              ║');
    console.log('║   • Guard pellets (-1)                                ║');
    console.log('║   • Guard power pellets (-5)                          ║');
    console.log('║   • Coordinate (-10)                                  ║');
    console.log('║                                                       ║');
    console.log('║   Same Expected SARSA, opposite goals!                ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');

    // Load pre-trained Pacman if requested
    if (loadPacman) {
      await this.loadPacmanModel(pacmanPath);
      console.log('');
    }

    console.log(`Starting adversarial training:`);
    console.log(`  Episodes: ${this.episodes}`);
    console.log(`  Max ticks per episode: ${this.maxTicksPerEpisode}`);
    console.log(`  Save every: ${this.saveEvery}`);
    console.log(`  Pacman: ${loadPacman ? 'PRE-TRAINED 🎯' : 'Untrained'}`);
    console.log(`  Ghosts: Untrained (learning from scratch)`);
    console.log('');

    // Training loop
    for (let episode = 1; episode <= this.episodes; episode++) {
      const shouldRecord = (episode % this.recordEvery === 0) || (episode <= 10);
      
      const metrics = await this.runEpisode(episode, shouldRecord);
      this.metrics.push(metrics);

      // Log progress
      if (episode % this.logEvery === 0) {
        this.logProgress(episode, metrics);
      }

      // Save models
      if (episode % this.saveEvery === 0) {
        await this.saveAll();
        console.log(`[Episode ${episode}] 💾 Saved all models`);
      }
    }

    // Final save
    await this.saveAll();
    this.saveMetrics();
    
    console.log('\n🎉 Adversarial training complete!');
    console.log(`Ghost win rate: ${(this.ghostWins / this.episodes * 100).toFixed(1)}%`);
    console.log(`Pacman win rate: ${(this.pacmanWins / this.episodes * 100).toFixed(1)}%`);
    
    const pacmanStats = this.pacmanCoordinator.getStats();
    console.log(`\nPacman: ${pacmanStats.numGVFs} GVFs, ${pacmanStats.totalStates} states`);
    
    for (let i = 0; i < this.ghostCoordinators.length; i++) {
      const ghostStats = this.ghostCoordinators[i].getStats();
      console.log(`Ghost ${i}: ${ghostStats.numGVFs} GVFs, ${ghostStats.totalStates} states`);
    }
  }

  /**
   * Run a single episode with both sides learning
   */
  private async runEpisode(episode: number, shouldRecord: boolean): Promise<AdversarialMetrics> {
    const env = new AdversarialEnvironment(this.maxTicksPerEpisode);
    
    if (shouldRecord) {
      this.recorder.startRecording(episode);
    }

    let state = env.reset();
    let stepCount = 0;

    while (true) {
      // Pacman's turn - select action using TabularHybridCoordinator
      const pacmanAction = this.pacmanCoordinator.selectAction(state, stepCount);
      
      // Each ghost selects action using their coordinator
      const ghostActions: Direction[] = [];
      for (let i = 0; i < state.ghosts.length; i++) {
        const ghost = state.ghosts[i];
        const otherGhosts = state.ghosts.filter((_, idx) => idx !== i);
        
        const ghostAction = this.ghostCoordinators[i].selectAction(
          ghost,
          state.position,
          state.dots,
          state.powerPellets,
          otherGhosts,
          stepCount
        );
        
        ghostActions.push(ghostAction);
      }

      stepCount++;

      // Take action in environment
      const result = env.step(pacmanAction, ghostActions);
      const newState = result.state;

      // Record frame
      if (shouldRecord) {
        let stepReward = 0;
        if (result.dotsCollected > 0) stepReward += 10 * result.dotsCollected;
        if (result.pacmanCaught) stepReward -= 1000;
        // Note: AdversarialEnvironment doesn't track ghost eating separately
        this.recorder.recordFrame(state, pacmanAction, stepReward);
      }

      // Update Pacman's coordinator
      this.pacmanCoordinator.updateGVFs(state, pacmanAction, newState);

      // Update each ghost's coordinator
      for (let i = 0; i < this.ghostCoordinators.length; i++) {
        const prevGhost = state.ghosts[i];
        const newGhost = newState.ghosts[i];
        const otherGhostPos = newState.ghosts
          .filter((_, idx) => idx !== i)
          .map(g => g.position);

        this.ghostCoordinators[i].updateGVFs(
          prevGhost.position,
          prevGhost.direction,
          ghostActions[i],
          newGhost.position,
          newGhost.direction,
          newState.position,
          newState.dots,
          newState.powerPellets,
          otherGhostPos
        );
      }

      state = newState;

      if (result.done) {
        break;
      }
    }

    const finalMetrics = env.getMetrics();
    
    // Determine winner
    const pacmanScore = finalMetrics.score;
    const ghostsWon = pacmanScore < 100 || finalMetrics.tickCount < this.maxTicksPerEpisode / 2;
    const pacmanWon = pacmanScore >= 2400 || finalMetrics.dotsCollected >= 240;
    
    if (ghostsWon) this.ghostWins++;
    if (pacmanWon) this.pacmanWins++;
    
    if (shouldRecord) {
      this.recorder.stopRecording({
        score: pacmanScore,
        dotsCollected: finalMetrics.dotsCollected,
        survivalTime: finalMetrics.tickCount,
        died: ghostsWon,
        won: pacmanWon
      });
    }

    // Get stats
    const pacmanStats = this.pacmanCoordinator.getStats();
    let totalGhostGVFs = 0;
    for (const coord of this.ghostCoordinators) {
      totalGhostGVFs += coord.getStats().numGVFs;
    }

    // Calculate running averages
    const recentMetrics = this.metrics.slice(-100);
    const avgPacmanScore = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.pacmanScore, 0) / recentMetrics.length
      : pacmanScore;
    const avgDotsCollected = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.dotsCollected, 0) / recentMetrics.length
      : finalMetrics.dotsCollected;
    const ghostWinRate = this.ghostWins / episode;

    return {
      episode,
      ghostsWon,
      pacmanWon,
      pacmanScore,
      dotsCollected: finalMetrics.dotsCollected,
      tickCount: finalMetrics.tickCount,
      ghostWinRate,
      avgPacmanScore,
      avgDotsCollected,
      pacmanGVFs: pacmanStats.numGVFs,
      ghostGVFs: totalGhostGVFs
    };
  }

  /**
   * Log training progress
   */
  private logProgress(episode: number, metrics: AdversarialMetrics): void {
    const ghostWinPct = (metrics.ghostWinRate * 100).toFixed(1);
    const pacmanWinPct = ((this.pacmanWins / episode) * 100).toFixed(1);
    
    const winner = metrics.ghostsWon ? '👻' : (metrics.pacmanWon ? '🟡' : '⚖️');
    
    console.log(
      `[Episode ${episode}] ${winner} | ` +
      `Pacman: ${metrics.pacmanScore} (avg: ${metrics.avgPacmanScore.toFixed(0)}) | ` +
      `Dots: ${metrics.dotsCollected} (avg: ${metrics.avgDotsCollected.toFixed(1)}) | ` +
      `Ticks: ${metrics.tickCount} | ` +
      `👻 Win: ${ghostWinPct}% | 🟡 Win: ${pacmanWinPct}% | ` +
      `GVFs: P=${metrics.pacmanGVFs} G=${metrics.ghostGVFs}`
    );
  }

  /**
   * Save all models
   */
  private async saveAll(): Promise<void> {
    // Save Pacman
    await this.pacmanCoordinator.save(`${this.modelSavePath}/pacman`);
    
    // Save each ghost
    for (let i = 0; i < this.ghostCoordinators.length; i++) {
      await this.ghostCoordinators[i].save(`${this.modelSavePath}/ghost_${i}`);
    }
  }

  /**
   * Save training metrics
   */
  private saveMetrics(): void {
    const metricsPath = `${this.modelSavePath}/metrics.json`;
    fs.writeFileSync(metricsPath, JSON.stringify(this.metrics, null, 2));
    console.log(`Metrics saved to ${metricsPath}`);
  }

  /**
   * Load saved models
   */
  async loadModels(): Promise<void> {
    try {
      await this.pacmanCoordinator.load(`${this.modelSavePath}/pacman`);
      console.log('✅ Loaded Pacman coordinator');
    } catch (error) {
      console.log('⚠️  No saved Pacman found');
    }

    for (let i = 0; i < this.ghostCoordinators.length; i++) {
      try {
        await this.ghostCoordinators[i].load(`${this.modelSavePath}/ghost_${i}`);
        console.log(`✅ Loaded Ghost ${i} coordinator`);
      } catch (error) {
        console.log(`⚠️  No saved Ghost ${i} found`);
      }
    }
  }
}
