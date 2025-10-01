const AStar = require('./AStar');
const { MAZE_LAYOUT } = require('../shared/maze');
const CONSTANTS = require('../shared/constants');

class PacmanAI {
  constructor(position) {
    this.position = { ...position };
    this.direction = 'RIGHT';
    this.pathfinder = new AStar();
    this.state = 'DOT_SEEKING'; // DOT_SEEKING, EVASION, AGGRESSIVE
    this.target = null;
    this.updateInterval = 200; // Update path every 200ms
    this.lastUpdate = Date.now();
  }

  update(dots, powerPellets, ghostPositions, isFrightened) {
    const now = Date.now();

    // Use integer positions for pathfinding
    const intPos = { x: Math.floor(this.position.x), y: Math.floor(this.position.y) };
    const intGhostPositions = ghostPositions.map(g => ({
      x: Math.floor(g.x),
      y: Math.floor(g.y)
    }));

    // Determine state
    if (isFrightened) {
      this.state = 'AGGRESSIVE';
    } else {
      // Check if any ghost is nearby
      const nearbyGhost = intGhostPositions.some(ghost => {
        const distance = Math.abs(ghost.x - intPos.x) + Math.abs(ghost.y - intPos.y);
        return distance < 8; // Within 8 tiles - increased from 6
      });
      this.state = nearbyGhost ? 'EVASION' : 'DOT_SEEKING';
    }

    // Update path periodically
    if (now - this.lastUpdate > this.updateInterval) {
      this.updateTarget(dots, powerPellets, intGhostPositions);
      this.lastUpdate = now;
    }

    // Get next direction
    if (this.target) {
      const avoidGhosts = this.state === 'EVASION';
      const nextDir = this.pathfinder.getNextDirection(
        intPos,
        this.target,
        avoidGhosts ? intGhostPositions : [],
        avoidGhosts
      );

      if (nextDir) {
        this.direction = nextDir;
      } else {
        // If no path found, try to move in any valid direction
        this.direction = this.findAnyValidDirection(intPos);
      }
    } else {
      // No target, try to move in current direction or find any valid direction
      if (!this.canMoveInDirection(intPos, this.direction)) {
        this.direction = this.findAnyValidDirection(intPos);
      }
    }

    return this.direction;
  }

  updateTarget(dots, powerPellets, ghostPositions) {
    if (this.state === 'AGGRESSIVE' && ghostPositions.length > 0) {
      // Target nearest ghost
      this.target = this.findClosest(this.position, ghostPositions);
    } else if (this.state === 'EVASION') {
      // Try to get power pellet if available
      if (powerPellets.length > 0) {
        this.target = this.findClosest(this.position, powerPellets);
      } else {
        // Otherwise, target dots far from ghosts
        this.target = this.findSafestDotCluster(dots, ghostPositions);
      }
    } else {
      // DOT_SEEKING: Target nearest dot cluster
      this.target = this.findNearestDotCluster(dots);
    }
  }

  findClosest(from, positions) {
    if (positions.length === 0) return null;

    let closest = positions[0];
    let minDist = this.manhattanDistance(from, closest);

    for (const pos of positions) {
      const dist = this.manhattanDistance(from, pos);
      if (dist < minDist) {
        minDist = dist;
        closest = pos;
      }
    }

    return closest;
  }

  findNearestDotCluster(dots) {
    if (dots.length === 0) return null;

    // Find the densest area of dots
    const clusters = this.clusterDots(dots);
    if (clusters.length === 0) return dots[0];

    return this.findClosest(this.position, clusters);
  }

  findSafestDotCluster(dots, ghostPositions) {
    if (dots.length === 0) return null;

    const clusters = this.clusterDots(dots);
    if (clusters.length === 0) return dots[0];

    // Find cluster furthest from ghosts
    let safest = clusters[0];
    let maxSafety = 0;

    for (const cluster of clusters) {
      let minGhostDist = Infinity;
      for (const ghost of ghostPositions) {
        const dist = this.manhattanDistance(cluster, ghost);
        minGhostDist = Math.min(minGhostDist, dist);
      }
      if (minGhostDist > maxSafety) {
        maxSafety = minGhostDist;
        safest = cluster;
      }
    }

    return safest;
  }

  clusterDots(dots) {
    // Simple clustering: find areas with high dot density
    const clusters = [];
    const radius = 5;

    for (let y = 0; y < CONSTANTS.GRID_HEIGHT; y += radius) {
      for (let x = 0; x < CONSTANTS.GRID_WIDTH; x += radius) {
        const dotsInArea = dots.filter(dot =>
          dot.x >= x && dot.x < x + radius &&
          dot.y >= y && dot.y < y + radius
        );

        if (dotsInArea.length > 3) {
          // Calculate center of cluster
          const centerX = Math.floor(dotsInArea.reduce((sum, d) => sum + d.x, 0) / dotsInArea.length);
          const centerY = Math.floor(dotsInArea.reduce((sum, d) => sum + d.y, 0) / dotsInArea.length);
          clusters.push({ x: centerX, y: centerY });
        }
      }
    }

    return clusters;
  }

  manhattanDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
  }

  getPosition() {
    return { ...this.position };
  }

  getDirection() {
    return this.direction;
  }

  getState() {
    return this.state;
  }

  canMoveInDirection(pos, direction) {
    const dir = CONSTANTS.DIRECTIONS[direction];
    if (!dir) return false;

    const newX = pos.x + dir.x;
    const newY = pos.y + dir.y;

    if (newX < 0 || newX >= CONSTANTS.GRID_WIDTH ||
        newY < 0 || newY >= CONSTANTS.GRID_HEIGHT) {
      return false;
    }

    return MAZE_LAYOUT[newY][newX] !== 0;
  }

  findAnyValidDirection(pos) {
    const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

    // Try to continue in current direction first
    if (this.canMoveInDirection(pos, this.direction)) {
      return this.direction;
    }

    // Try other directions
    for (const dir of directions) {
      if (this.canMoveInDirection(pos, dir)) {
        return dir;
      }
    }

    // Fallback
    return this.direction;
  }
}

module.exports = PacmanAI;
