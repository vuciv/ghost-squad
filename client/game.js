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
    // Load the raw sprite sheet image. We'll parse frames manually to allow
    // horizontal margins without affecting the vertical cuts.
    this.load.image('spritesheet', 'assets/spritesheet.png');

    // Set up error handling for missing sprites (fallback to colored circles)
    this.load.on('loaderror', (file) => {
      console.warn('Failed to load sprite:', file.key);
    });
  }

  create() {
    // Create maze
    this.createMaze();

    // Build texture frames so horizontal margins don't impact vertical slicing
    this.buildSpriteSheetTexture();

    // Create animations for sprites
    this.createAnimations();

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

  buildSpriteSheetTexture() {
    const sourceTexture = this.textures.get('spritesheet');
    if (!sourceTexture) {
      return;
    }

    const config = {
      frameWidth: 16,
      frameHeight: 16,
      marginX: 8,
      marginY: 0,
      spacingX: 0,
      spacingY: 0
    };

    const sourceImage = sourceTexture.getSourceImage();

    // Recreate the working texture so we can control frame cuts precisely
    if (this.textures.exists('sprites')) {
      this.textures.remove('sprites');
    }

    const canvasTexture = this.textures.createCanvas('sprites', sourceImage.width, sourceImage.height);
    canvasTexture.context.drawImage(sourceImage, 0, 0);
    canvasTexture.refresh();
    canvasTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    const cols = Math.floor((sourceImage.width - config.marginX * 2 + config.spacingX) /
      (config.frameWidth + config.spacingX));
    const rows = Math.floor((sourceImage.height - config.marginY * 2 + config.spacingY) /
      (config.frameHeight + config.spacingY));

    let frameIndex = 0;
    for (let row = 0; row < rows; row++) {
      const y = config.marginY + row * (config.frameHeight + config.spacingY);

      for (let col = 0; col < cols; col++) {
        const x = config.marginX + col * (config.frameWidth + config.spacingX);
        const frameName = frameIndex.toString();
        canvasTexture.add(frameName, 0, x, y, config.frameWidth, config.frameHeight);
        frameIndex++;
      }
    }

    // Release the raw sheet once we've copied it into our working texture
    this.textures.remove('spritesheet');
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

  createAnimations() {
    if (!this.textures.exists('sprites')) {
      console.warn('Sprite texture missing; animations will fallback to simple shapes.');
      return;
    }

    // Ghost animations - Blinky (red)
    this.anims.create({
      key: 'blinky_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [192, 193] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'blinky_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [194, 195] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'blinky_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [196, 197] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'blinky_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [198, 199] }),
      frameRate: 10,
      repeat: -1
    });

    // Pinky (pink)
    this.anims.create({
      key: 'pinky_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [233, 234] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'pinky_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [235, 236] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'pinky_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [237, 238] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'pinky_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [239, 240] }),
      frameRate: 10,
      repeat: -1
    });

    // Inky (cyan)
    this.anims.create({
      key: 'inky_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [274, 275] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'inky_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [276, 277] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'inky_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [278, 279] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'inky_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [280, 281] }),
      frameRate: 10,
      repeat: -1
    });

    // Clyde (orange)
    this.anims.create({
      key: 'clyde_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [315, 316] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'clyde_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [317, 318] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'clyde_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [319, 320] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'clyde_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [321, 322] }),
      frameRate: 10,
      repeat: -1
    });

    // Scared state (blue ghosts)
    const ghosts = ['blinky', 'pinky', 'inky', 'clyde'];
    ghosts.forEach(ghost => {
      this.anims.create({
        key: `${ghost}_scared`,
        frames: this.anims.generateFrameNumbers('sprites', { frames: [200, 201] }),
        frameRate: 5,
        repeat: -1
      });
    });

    // Dead state (eyes only)
    ghosts.forEach(ghost => {
      this.anims.create({
        key: `${ghost}_dead`,
        frames: this.anims.generateFrameNumbers('sprites', { frames: [202, 203] }),
        frameRate: 15,
        repeat: -1
      });
    });

    // Pacman animations
    this.anims.create({
      key: 'pacman_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [28, 29] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'pacman_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [69, 70] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'pacman_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [110, 111] }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'pacman_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [151, 152] }),
      frameRate: 10,
      repeat: -1
    });
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
      // Try to create sprite, fallback to circle if sprites not loaded
      try {
        this.pacmanSprite = this.add.sprite(targetX, targetY, 'sprites', 34);
        this.pacmanSprite.setScale(tileSize / 16); // Scale 16px sprite to tile size
      } catch (e) {
        // Fallback to circle if sprite doesn't exist
        this.pacmanSprite = this.add.circle(
          targetX,
          targetY,
          tileSize / 2 - 2,
          0xffff00
        );
      }
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

    // Update animation based on direction
    if (this.pacmanSprite.anims) {
      const direction = pacman.direction.toLowerCase();
      const animKey = `pacman_${direction}`;
      if (this.anims.exists(animKey) && this.pacmanSprite.anims.currentAnim?.key !== animKey) {
        this.pacmanSprite.play(animKey);
      }
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
        // Try to create sprite, fallback to circle if sprites not loaded
        try {
          ghost = this.add.sprite(targetX, targetY, 'sprites', 64);
          ghost.setScale(tileSize / 16); // Scale 16px sprite to tile size
          ghost.ghostType = player.ghostType;
        } catch (e) {
          // Fallback to circle if sprite doesn't exist
          const color = player.state === 'frightened' ? 0x0000ff : colors[player.ghostType];
          ghost = this.add.circle(
            targetX,
            targetY,
            tileSize / 2 - 2,
            color
          );
        }
        ghost.setDepth(1);

        // Add label showing username
        const labelText = player.ghostType === this.myGhostType ?
          `YOU (${player.username})` :
          player.username;
        const label = this.add.text(
          targetX,
          targetY - tileSize / 2 - 3,
          labelText,
          { fontSize: '8px', color: '#fff', backgroundColor: '#000', padding: { x: 2, y: 1 } }
        );
        label.setOrigin(0.5);
        label.setDepth(2);
        ghost.label = label;

        this.entities.set(player.socketId, ghost);
      }

      // Update animation/color based on state and direction
      if (ghost.anims) {
        // Sprite-based ghost
        let animKey;
        if (player.state === 'frightened') {
          animKey = `${player.ghostType}_scared`;
        } else if (player.state === 'respawning') {
          animKey = `${player.ghostType}_dead`;
        } else {
          const direction = player.direction.toLowerCase();
          animKey = `${player.ghostType}_${direction}`;
        }

        if (this.anims.exists(animKey) && ghost.anims.currentAnim?.key !== animKey) {
          ghost.play(animKey);
        }
      } else {
        // Fallback circle-based ghost
        if (player.state === 'frightened') {
          ghost.setFillStyle(0x0000ff);
        } else if (player.state === 'respawning') {
          ghost.setFillStyle(0x888888);
        } else {
          ghost.setFillStyle(colors[player.ghostType]);
        }
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

// Make gameConfig globally accessible
window.gameConfig = {
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
