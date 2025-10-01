const { MAZE_LAYOUT } = require('../shared/maze');
const CONSTANTS = require('../shared/constants');

class AStar {
  constructor() {
    this.maze = MAZE_LAYOUT;
  }

  // Manhattan distance heuristic
  heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  getNeighbors(node) {
    const neighbors = [];
    const directions = [
      { x: 0, y: -1 }, // up
      { x: 0, y: 1 },  // down
      { x: -1, y: 0 }, // left
      { x: 1, y: 0 }   // right
    ];

    for (const dir of directions) {
      const newX = node.x + dir.x;
      const newY = node.y + dir.y;

      // Check bounds
      if (newX < 0 || newX >= CONSTANTS.GRID_WIDTH ||
          newY < 0 || newY >= CONSTANTS.GRID_HEIGHT) {
        continue;
      }

      // Check if walkable (not a wall)
      if (this.maze[newY][newX] === 0) {
        continue;
      }

      neighbors.push({ x: newX, y: newY });
    }

    return neighbors;
  }

  findPath(start, goal, ghostPositions = [], avoidGhosts = false) {
    const openSet = [start];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const key = (node) => `${node.x},${node.y}`;

    gScore.set(key(start), 0);
    fScore.set(key(start), this.heuristic(start, goal));

    while (openSet.length > 0) {
      // Find node with lowest fScore
      openSet.sort((a, b) => fScore.get(key(a)) - fScore.get(key(b)));
      const current = openSet.shift();

      // Reached goal
      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, current);
      }

      closedSet.add(key(current));

      for (const neighbor of this.getNeighbors(current)) {
        const neighborKey = key(neighbor);

        if (closedSet.has(neighborKey)) {
          continue;
        }

        let tentativeGScore = gScore.get(key(current)) + 1;

        // Add cost for being near ghosts if in evasion mode
        if (avoidGhosts && ghostPositions.length > 0) {
          for (const ghost of ghostPositions) {
            const distance = this.heuristic(neighbor, ghost);
            if (distance < 7) {
              tentativeGScore += (7 - distance) * 20; // Higher cost when closer to ghosts
            }
          }
        }

        if (!openSet.find(n => n.x === neighbor.x && n.y === neighbor.y)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= gScore.get(neighborKey)) {
          continue;
        }

        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, goal));
      }
    }

    // No path found
    return [];
  }

  reconstructPath(cameFrom, current) {
    const path = [current];
    const key = (node) => `${node.x},${node.y}`;

    while (cameFrom.has(key(current))) {
      current = cameFrom.get(key(current));
      path.unshift(current);
    }

    return path;
  }

  getNextDirection(start, goal, ghostPositions = [], avoidGhosts = false) {
    const path = this.findPath(start, goal, ghostPositions, avoidGhosts);

    if (path.length < 2) {
      return null; // No path or already at goal
    }

    const next = path[1];
    const dx = next.x - start.x;
    const dy = next.y - start.y;

    if (dy === -1) return 'UP';
    if (dy === 1) return 'DOWN';
    if (dx === -1) return 'LEFT';
    if (dx === 1) return 'RIGHT';

    return null;
  }
}

module.exports = AStar;
