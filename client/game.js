// Phaser game configuration and scene
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.socket = null;
    this.roomCode = null;
    this.myGhostType = null;
    this.entities = new Map();
    this.lastUpdateTime = 0;
  }

  init(data) {
    this.socket = data.socket;
    this.roomCode = data.roomCode;
    this.myGhostType = data.myGhostType;
  }

  preload() {
    // Graphics will be created programmatically
  }

  create() {
    // Create maze
    this.createMaze();

    // Cache movement speed so it stays in sync with server pacing
    this.moveSpeed = this.computeMoveSpeed();

    // Setup input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };

    // Handle input
    this.input.keyboard.on('keydown', (event) => {
      let direction = null;

      if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        direction = 'UP';
      } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        direction = 'DOWN';
      } else if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        direction = 'LEFT';
      } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        direction = 'RIGHT';
      }

      if (direction) {
        this.socket.emit('playerInput', {
          roomCode: this.roomCode,
          direction
        });
      }
    });

    // Listen for game state updates
    this.socket.on('gameState', (state) => {
      this.updateGameState(state);
    });

    // Listen for game over
    this.socket.on('gameOver', (data) => {
      this.handleGameOver(data);
    });
  }

  createMaze() {
    this.mazeGraphics = this.add.graphics();
    this.dotsGroup = this.add.group();
    this.pelletsGroup = this.add.group();

    const tileSize = GAME_CONSTANTS.TILE_SIZE;

    // Hardcoded maze layout
    const MAZE = [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
      [0,2,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,2,0],
      [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,1,0],
      [0,1,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,1,0],
      [0,1,1,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,1,1,0],
      [0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,0,0,0,3,3,0,0,0,1,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,0,3,3,3,3,3,3,0,1,0,0,1,0,0,0,0,0,0],
      [1,1,1,1,1,1,1,1,1,1,0,3,3,3,3,3,3,0,1,1,1,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,1,0,0,1,0,3,3,3,3,3,3,0,1,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
      [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
      [0,2,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,2,0],
      [0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,1,0,0,0],
      [0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,1,0,0,0],
      [0,1,1,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0],
      [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ];

    // Draw walls with lines (classic Pacman style)
    this.mazeGraphics.lineStyle(3, 0x2121de, 1);

    for (let y = 0; y < MAZE.length; y++) {
      for (let x = 0; x < MAZE[y].length; x++) {
        const cell = MAZE[y][x];
        const px = x * tileSize;
        const py = y * tileSize;

        if (cell === 0) {
          // Wall - draw borders where adjacent to walkable space
          const top = y > 0 && MAZE[y - 1][x] !== 0;
          const bottom = y < MAZE.length - 1 && MAZE[y + 1][x] !== 0;
          const left = x > 0 && MAZE[y][x - 1] !== 0;
          const right = x < MAZE[y].length - 1 && MAZE[y][x + 1] !== 0;

          if (top) {
            this.mazeGraphics.strokeLineShape(new Phaser.Geom.Line(px, py, px + tileSize, py));
          }
          if (bottom) {
            this.mazeGraphics.strokeLineShape(new Phaser.Geom.Line(px, py + tileSize, px + tileSize, py + tileSize));
          }
          if (left) {
            this.mazeGraphics.strokeLineShape(new Phaser.Geom.Line(px, py, px, py + tileSize));
          }
          if (right) {
            this.mazeGraphics.strokeLineShape(new Phaser.Geom.Line(px + tileSize, py, px + tileSize, py + tileSize));
          }
        } else if (cell === 1) {
          // Dot
          const dot = this.add.circle(
            px + tileSize / 2,
            py + tileSize / 2,
            2,
            0xffb897
          );
          dot.setData('x', x);
          dot.setData('y', y);
          this.dotsGroup.add(dot);
        } else if (cell === 2) {
          // Power pellet
          const pellet = this.add.circle(
            px + tileSize / 2,
            py + tileSize / 2,
            6,
            0xffb897
          );
          pellet.setData('x', x);
          pellet.setData('y', y);
          this.pelletsGroup.add(pellet);

          // Pulse animation
          this.tweens.add({
            targets: pellet,
            scale: { from: 1, to: 1.5 },
            duration: 400,
            yoyo: true,
            repeat: -1
          });
        } else if (cell === 3) {
          // Ghost house
          this.mazeGraphics.fillStyle(0x444444, 0.3);
          this.mazeGraphics.fillRect(px, py, tileSize, tileSize);
        }
      }
    }
  }

  updateGameState(state) {
    // Update HUD
    this.updateHUD(state);

    // Update dots
    this.updateDots(state.dots);

    // Update power pellets
    this.updatePowerPellets(state.powerPellets);

    // Update Pacman
    this.updatePacman(state.pacman);

    // Update ghosts
    this.updateGhosts(state.players, state.mode);
  }

  updateHUD(state) {
    document.getElementById('score-display').textContent = state.score;
    document.getElementById('captures-display').textContent =
      `${state.captureCount} / ${GAME_CONSTANTS.CAPTURES_TO_WIN}`;
    document.getElementById('dots-display').textContent = state.dots.length;

    const modeIndicator = document.getElementById('mode-indicator');
    if (state.mode === GAME_CONSTANTS.MODES.FRIGHTENED) {
      modeIndicator.textContent = 'POWER MODE!';
      modeIndicator.className = 'mode-indicator frightened';
    } else {
      modeIndicator.textContent = '';
      modeIndicator.className = 'mode-indicator';
    }
  }

  updateDots(dots) {
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const existingDots = new Set(dots.map(d => `${d.x},${d.y}`));

    this.dotsGroup.children.entries.forEach(dot => {
      const key = `${dot.getData('x')},${dot.getData('y')}`;
      if (!existingDots.has(key)) {
        dot.destroy();
      }
    });
  }

  updatePowerPellets(pellets) {
    const existingPellets = new Set(pellets.map(p => `${p.x},${p.y}`));

    this.pelletsGroup.children.entries.forEach(pellet => {
      const key = `${pellet.getData('x')},${pellet.getData('y')}`;
      if (!existingPellets.has(key)) {
        pellet.destroy();
      }
    });
  }

  updatePacman(pacman) {
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const targetX = pacman.position.x * tileSize + tileSize / 2;
    const targetY = pacman.position.y * tileSize + tileSize / 2;

    if (!this.pacmanSprite) {
      this.pacmanSprite = this.add.circle(
        targetX,
        targetY,
        tileSize / 2 - 2,
        0xffff00
      );
      this.pacmanSprite.setDepth(1);
    }

    // Create emote text if it doesn't exist
    if (!this.pacmanEmoteText) {
      this.pacmanEmoteText = this.add.text(
        targetX,
        targetY - tileSize / 2 - 5,
        '',
        { fontSize: '20px', fontFamily: 'Arial' }
      );
      this.pacmanEmoteText.setOrigin(0.5);
      this.pacmanEmoteText.setDepth(3);
    }

    // Set target positions (interpolation happens in update())
    this.pacmanSprite.targetX = targetX;
    this.pacmanSprite.targetY = targetY;
    this.pacmanEmoteText.targetX = targetX;
    this.pacmanEmoteText.targetY = targetY - tileSize / 2 - 5;

    // Update emote text
    if (pacman.emote !== undefined) {
      this.pacmanEmoteText.setText(pacman.emote || '');
    }
  }

  updateGhosts(players, mode) {
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const colors = {
      blinky: 0xff0000,
      pinky: 0xffb8ff,
      inky: 0x00ffff,
      clyde: 0xffb852
    };

    players.forEach(player => {
      const targetX = player.position.x * tileSize + tileSize / 2;
      const targetY = player.position.y * tileSize + tileSize / 2;
      let ghost = this.entities.get(player.socketId);

      if (!ghost) {
        const color = player.state === 'frightened' ? 0x0000ff : colors[player.ghostType];
        ghost = this.add.circle(
          targetX,
          targetY,
          tileSize / 2 - 2,
          color
        );
        ghost.setDepth(1);

        // Add label for player's own ghost
        if (player.ghostType === this.myGhostType) {
          const label = this.add.text(
            targetX,
            targetY - tileSize / 2 - 3,
            'YOU',
            { fontSize: '8px', color: '#fff' }
          );
          label.setOrigin(0.5);
          label.setDepth(2);
          ghost.label = label;
        }

        this.entities.set(player.socketId, ghost);
      }

      // Update color based on state
      if (player.state === 'frightened') {
        ghost.setFillStyle(0x0000ff);
      } else if (player.state === 'respawning') {
        ghost.setFillStyle(0x888888);
      } else {
        ghost.setFillStyle(colors[player.ghostType]);
      }

      // Set target positions (interpolation happens in update())
      ghost.targetX = targetX;
      ghost.targetY = targetY;

      // Update label target position
      if (ghost.label) {
        ghost.label.targetX = targetX;
        ghost.label.targetY = targetY - tileSize / 2 - 3;
      }
    });
  }

  handleGameOver(data) {
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('active');
    document.getElementById('game-over-title').textContent =
      data.winner === 'ghosts' ? '🏆 GHOSTS WIN!' : '👾 PACMAN WINS!';
    document.getElementById('game-over-message').textContent =
      data.winner === 'ghosts' ?
      'You caught Pacman 3 times!' :
      'Pacman ate all the dots!';
    document.getElementById('final-score').textContent = data.score;
  }

  update(time, delta) {
    // Move at (slightly faster than) the server's tile rate so interpolation stays smooth
    const speed = this.moveSpeed || this.computeMoveSpeed();
    const moveDistance = speed * (delta / 1000); // Distance to move this frame

    // Combine all sprites that need moving into one array
    const allSprites = [this.pacmanSprite, ...this.entities.values()];

    allSprites.forEach(sprite => {
      // Guard against missing sprites or targets
      if (!sprite || typeof sprite.targetX === 'undefined') {
        return;
      }

      const distance = Phaser.Math.Distance.Between(sprite.x, sprite.y, sprite.targetX, sprite.targetY);

      // If we're close enough, just snap to the final position
      if (distance < 4) { // Using a small threshold to prevent jittering
        sprite.x = sprite.targetX;
        sprite.y = sprite.targetY;
      } else if (distance > 0) {
        // Move towards the target at a constant speed
        const vec = new Phaser.Math.Vector2(sprite.targetX - sprite.x, sprite.targetY - sprite.y).normalize();
        sprite.x += vec.x * moveDistance;
        sprite.y += vec.y * moveDistance;
      }

      // --- Update attached text labels ---
      // Find the correct label for the current sprite
      let label = null;
      if (sprite === this.pacmanSprite) {
        label = this.pacmanEmoteText;
      } else if (sprite.label) {
        label = sprite.label;
      }

      // Keep the label positioned relative to its parent sprite
      if (label) {
        let yOffset = (sprite === this.pacmanSprite) ? -18 : -11; // Different offsets
        label.x = sprite.x;
        label.y = sprite.y + yOffset;
      }
    });
  }

  computeMoveSpeed() {
    const ticksPerMove = ((GAME_CONSTANTS.MOVE_COOLDOWN_TICKS ?? 1) + 1);
    const msPerMove = ticksPerMove * GAME_CONSTANTS.TICK_RATE;

    if (!msPerMove) {
      return 220; // fallback if constants are missing
    }

    const basePixelsPerSecond = GAME_CONSTANTS.TILE_SIZE / (msPerMove / 1000);
    return basePixelsPerSecond * 1.05; // slight lead lets client catch up smoothly
  }
}

const gameConfig = {
  type: Phaser.AUTO,
  width: GAME_CONSTANTS.GRID_WIDTH * GAME_CONSTANTS.TILE_SIZE,
  height: GAME_CONSTANTS.GRID_HEIGHT * GAME_CONSTANTS.TILE_SIZE,
  parent: 'game-container',
  backgroundColor: '#000000',
  scene: GameScene,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  }
};
