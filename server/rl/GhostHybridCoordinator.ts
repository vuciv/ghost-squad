/**
 * Ghost Tabular Hybrid Coordinator - EXACT OPPOSITE of Pacman's HRA
 * 
 * Uses the SAME HRA algorithm as Pac-Man, but with INVERTED objectives:
 * - Pac-Man TabularGVF: learns to reach pellets (+10), power pellets (+50), avoid ghosts (-1000)
 * - Ghost TabularGVF: learns to reach Pac-Man (+1000), considers other ghosts
 * 
 * Key principles:
 * 1. Each ghost has a single GVF that tracks Pacman's position
 * 2. GVF learns Q-values for reaching Pacman (catch him)
 * 3. Aggregation includes consideration for other ghost positions
 * 4. Same Expected SARSA algorithm (α=1.0, γ=0.99)
 */

import { GhostTabularGVF } from './GhostTabularGVF';
import { Direction, GameState, Ghost } from './types';
import { Position } from '../../shared/maze';
import * as fs from 'fs';

export class GhostTabularHybridCoordinator {
  private gvfs: Map<string, GhostTabularGVF>; // Map of GVFs - one per discovered position (LIKE PACMAN!)
  private alpha: number;
  private gamma: number;
  
  // Weights for aggregation - EXACT OPPOSITE of Pacman's weights!
  // 
  // Pacman's weights:
  //   - Pellets: +10 (want to collect)
  //   - Power pellets: +50 (want to collect)
  //   - Ghosts: -1000 (avoid being caught)
  //   - Blue ghosts: +1000 (want to catch)
  //
  // Ghost's weights (INVERTED):
  //   - Catching Pacman: +1000 (want to catch)
  //   - Pellets: -1 (want to GUARD from Pacman eating them)
  //   - Power pellets: -5 (really want to guard these)
  //   - Other ghosts: -10 (avoid clustering, spread out)
  //
  private readonly CATCH_PACMAN_WEIGHT = 1000;   // Primary objective
  private readonly PELLET_GUARD_WEIGHT = -1;     // Guard pellets (negative = avoid Pacman reaching them)
  private readonly POWER_PELLET_GUARD_WEIGHT = -5;  // Guard power pellets more
  private readonly OTHER_GHOST_WEIGHT = -10;     // Avoid clustering with teammates
  
  // Exploration
  private stateActionCounts: Map<string, number> = new Map();
  private totalActions: number = 0;
  private explorationModeChanged: boolean = false;

  constructor(alpha: number = 1.0, gamma: number = 0.99) {
    this.gvfs = new Map();
    this.alpha = alpha;
    this.gamma = gamma;
    
    console.log(`Ghost Tabular HRA initialized - learning to catch Pacman!`);
  }

  private getPositionKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }

  /**
   * Discover a position and create a GVF for it (EXACTLY like Pacman's coordinator)
   */
  discoverPosition(pos: Position): void {
    const key = this.getPositionKey(pos);
    if (!this.gvfs.has(key)) {
      this.gvfs.set(key, new GhostTabularGVF(pos, this.alpha, this.gamma));
    }
  }

  /**
   * Get or create GVF for a position
   */
  private getOrCreateGVF(pos: Position): GhostTabularGVF {
    this.discoverPosition(pos);
    return this.gvfs.get(this.getPositionKey(pos))!;
  }

  /**
   * Select action for a ghost using HRA aggregation
   * 
   * Aggregation formula: Q_total(s,a) = Σ w_i * Q_i(s,a)
   * - Catching Pacman: weight = +1000 (primary objective)
   * - Guarding pellets: weight = -1 (prevent Pacman from eating)
   * - Guarding power pellets: weight = -5 (prevent Pacman from eating)
   * - Other ghosts: weight = -10 (avoid clustering, spread out)
   * 
   * EXACT OPPOSITE of Pacman's coordinator!
   */
  selectAction(
    ghost: Ghost,
    pacmanPos: Position,
    dots: Position[],
    powerPellets: Position[],
    otherGhosts: Ghost[],
    stepCount: number = 0
  ): Direction {
    const currentPos = ghost.position;
    const currentDir = ghost.direction;

    // Initialize aggregated Q-values
    const aggregatedQ: { [key in Direction]: number } = {
      'UP': 0,
      'DOWN': 0,
      'LEFT': 0,
      'RIGHT': 0
    };

    const actions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

    // STEP 1: Chase Pac-Man (primary objective - OPPOSITE of Pacman avoiding ghosts)
    // EXACTLY like Pacman's coordinator:
    // - Pacman creates GVF for each ghost position, uses weight -1000 to AVOID
    // - Ghost creates GVF for Pacman position, uses weight +1000 to CHASE
    const pacmanGVF = this.getOrCreateGVF(pacmanPos);
    const pacmanQValues = pacmanGVF.getQValues(currentPos, currentDir);
    
    for (let i = 0; i < actions.length; i++) {
      aggregatedQ[actions[i]] += this.CATCH_PACMAN_WEIGHT * pacmanQValues[i];
    }

    // STEP 2: Guard pellets (OPPOSITE of Pacman collecting pellets)
    // Pacman: pellets have weight +10 (want to reach them)
    // Ghost: pellets have weight -1 (want to BLOCK Pacman from reaching them)
    // 
    // This teaches ghosts to position themselves between Pacman and pellets!
    for (const dot of dots) {
      const dotGVF = this.getOrCreateGVF(dot);
      const dotQValues = dotGVF.getQValues(currentPos, currentDir);
      
      for (let i = 0; i < actions.length; i++) {
        aggregatedQ[actions[i]] += this.PELLET_GUARD_WEIGHT * dotQValues[i];
      }
    }

    // STEP 3: Guard power pellets (OPPOSITE of Pacman collecting them)
    // Pacman: power pellets have weight +50 (really want to reach them)
    // Ghost: power pellets have weight -5 (really want to BLOCK Pacman from reaching them)
    for (const pellet of powerPellets) {
      const pelletGVF = this.getOrCreateGVF(pellet);
      const pelletQValues = pelletGVF.getQValues(currentPos, currentDir);
      
      for (let i = 0; i < actions.length; i++) {
        aggregatedQ[actions[i]] += this.POWER_PELLET_GUARD_WEIGHT * pelletQValues[i];
      }
    }

    // STEP 4: Avoid clustering with other ghosts (coordinate attack)
    // Use proper GVFs for other ghost positions (like Pacman uses GVFs for ghost positions)
    // Small negative weight helps ghosts spread out and surround Pacman
    for (const otherGhost of otherGhosts) {
      const dist = Math.abs(otherGhost.position.x - currentPos.x) + 
                   Math.abs(otherGhost.position.y - currentPos.y);
      
      // Only consider ghosts within reasonable distance
      if (dist > 0 && dist < 15) {
        const ghostGVF = this.getOrCreateGVF(otherGhost.position);
        const ghostQValues = ghostGVF.getQValues(currentPos, currentDir);
        
        for (let i = 0; i < actions.length; i++) {
          aggregatedQ[actions[i]] += this.OTHER_GHOST_WEIGHT * ghostQValues[i];
        }
      }
    }

    // STEP 5: Exploration (same as Pac-Man HRA)
    const exploredEnough = this.totalActions > 100000;
    
    if (exploredEnough && !this.explorationModeChanged) {
      console.log('\n👻 GHOST SWITCHING TO EXPLOITATION MODE (100k actions)');
      this.explorationModeChanged = true;
    }

    // Diversification head (first 50 steps only)
    const diversificationStrength = exploredEnough ? 5 : 20;
    if (stepCount < 50) {
      for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
        aggregatedQ[action] += Math.random() * diversificationStrength;
      }
    }

    // Targeted exploration (UCB)
    const kappa = exploredEnough ? 0.1 : 0.5;
    const stateKey = `${currentPos.x},${currentPos.y},${currentDir}`;
    
    for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      const saKey = `${stateKey},${action}`;
      const count = this.stateActionCounts.get(saKey) || 0.1;
      const explorationBonus = kappa * Math.sqrt(Math.pow(this.totalActions + 1, 0.25) / count);
      aggregatedQ[action] += explorationBonus;
    }

    // Select best action
    let bestAction: Direction = 'UP';
    let maxQ = -Infinity;

    for (const action of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
      if (aggregatedQ[action] > maxQ) {
        maxQ = aggregatedQ[action];
        bestAction = action;
      }
    }

    // Update counts
    const saKey = `${stateKey},${bestAction}`;
    this.stateActionCounts.set(saKey, (this.stateActionCounts.get(saKey) || 0) + 1);
    this.totalActions++;

    return bestAction;
  }

  /**
   * Update all GVFs after taking an action
   * 
   * EXACTLY like Pacman's coordinator:
   * - Update ALL discovered GVFs (not just one)
   * - Each GVF learns how to reach its target position from anywhere
   * - Over time, builds a complete model of maze navigation
   */
  updateGVFs(
    prevGhostPos: Position,
    prevGhostDir: Direction,
    action: Direction,
    newGhostPos: Position,
    newGhostDir: Direction,
    pacmanPos: Position,
    dots: Position[],
    powerPellets: Position[],
    otherGhostPositions: Position[]
  ): void {
    // Discover all positions we encounter (builds up GVF map over time)
    this.discoverPosition(newGhostPos);
    this.discoverPosition(pacmanPos);
    
    // Discover pellet positions (so we learn to guard them)
    for (const dot of dots) {
      this.discoverPosition(dot);
    }
    
    for (const pellet of powerPellets) {
      this.discoverPosition(pellet);
    }
    
    // Discover other ghost positions (so we learn to coordinate)
    for (const ghostPos of otherGhostPositions) {
      this.discoverPosition(ghostPos);
    }

    // Update ALL GVFs (just like Pacman's coordinator)
    // Each GVF learns: "from this state-action, how close did I get to MY target?"
    // This builds a complete navigation model for the entire maze
    for (const gvf of this.gvfs.values()) {
      gvf.update(
        prevGhostPos,
        prevGhostDir,
        action,
        newGhostPos,
        newGhostDir
      );
    }
  }

  /**
   * Get statistics about learned GVFs (LIKE PACMAN'S)
   */
  getStats(): {
    numGVFs: number;
    avgTableSize: number;
    totalStates: number;
    totalActions: number;
    exploitationMode: boolean;
  } {
    let totalStates = 0;
    for (const gvf of this.gvfs.values()) {
      totalStates += gvf.getTableSize();
    }

    return {
      numGVFs: this.gvfs.size,
      avgTableSize: this.gvfs.size > 0 ? totalStates / this.gvfs.size : 0,
      totalStates,
      totalActions: this.totalActions,
      exploitationMode: this.explorationModeChanged
    };
  }

  /**
   * Save all ghost GVFs to disk (LIKE PACMAN'S)
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

    fs.writeFileSync(`${path}/ghost_tabular_gvfs.json`, JSON.stringify(data, null, 2));
    
    const stats = this.getStats();
    console.log(`Saved ${stats.numGVFs} Ghost GVFs (${stats.totalStates} total states)`);
  }

  /**
   * Load ghost GVFs from disk (LIKE PACMAN'S)
   */
  async load(path: string): Promise<void> {
    const data = JSON.parse(fs.readFileSync(`${path}/ghost_tabular_gvfs.json`, 'utf8'));
    
    this.alpha = data.alpha;
    this.gamma = data.gamma;
    this.totalActions = data.totalActions || 0;
    this.explorationModeChanged = data.explorationModeChanged || false;
    this.gvfs.clear();

    for (const entry of data.gvfs) {
      this.gvfs.set(entry.positionKey, GhostTabularGVF.fromJSON(entry.gvf));
    }

    const stats = this.getStats();
    console.log(`Loaded ${stats.numGVFs} Ghost GVFs (${stats.totalStates} total states)`);
    console.log(`Total actions: ${stats.totalActions}, Exploitation mode: ${stats.exploitationMode}`);
  }
}

