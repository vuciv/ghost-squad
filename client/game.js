// Maze layout for client-side collision detection
const CLIENT_MAZE = [
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

// Phaser game configuration and scene
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.socket = null;
    this.roomCode = null;
    this.myGhostType = null;
    this.entities = new Map();
  }

  init(data) {
    this.socket = data.socket;
    this.roomCode = data.roomCode;
    this.myGhostType = data.myGhostType;
    // Socket ID is available after connection
    this.mySocketId = this.socket.id || null;
  }

  preload() {
    // Load the raw sprite sheet image. We'll parse frames manually to allow
    // horizontal margins without affecting the vertical cuts.
    this.load.image('spritesheet', 'assets/spritesheet.png');

    // Set up error handling for missing sprites (fallback to colored circles)
    this.load.on('loaderror', (file) => {
      // Failed to load sprite
    });
  }

  create() {
    // Create maze
    this.createMaze();

    // Build texture frames so horizontal margins don't impact vertical slicing
    this.buildSpriteSheetTexture();

    // Create animations for sprites
    this.createAnimations();

    // Setup input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };

    // Store full game state
    this.gameState = null;

    // Request initial game state now that scene is ready
    this.socket.emit('requestGameState', { roomCode: this.roomCode });

    // Handle input with client-side prediction
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
        // Client-side prediction: immediately update local player direction
        if (this.gameState && this.mySocketId) {
          const myPlayer = this.gameState.players.find(p => p.socketId === this.mySocketId);
          if (myPlayer) {
            myPlayer.direction = direction;
          }
        }

        // Send to server
        this.socket.emit('playerInput', {
          roomCode: this.roomCode,
          direction: direction
        });
      }
    });

    // Listen for full game state (initial load)
    this.socket.on('gameState', (state) => {
      console.log('[DEBUG] Received full gameState:', state);
      this.gameState = state;
      this.updateGameState(state);
    });

    // Listen for delta updates (optimized)
    this.socket.on('gameUpdate', (delta) => {
      if (!this.gameState) {
        console.log('[DEBUG] Received delta but no gameState yet');
        return;
      }

      // Merge delta into full state
      if (delta.score !== undefined) this.gameState.score = delta.score;
      if (delta.captureCount !== undefined) this.gameState.captureCount = delta.captureCount;
      if (delta.mode !== undefined) this.gameState.mode = delta.mode;
      if (delta.dots !== undefined) this.gameState.dots = delta.dots;
      if (delta.powerPellets !== undefined) this.gameState.powerPellets = delta.powerPellets;

      // Always update positions
      if (delta.pacman) {
        this.gameState.pacman.position = delta.pacman.position;
        this.gameState.pacman.direction = delta.pacman.direction;
        if (delta.pacman.emote !== undefined) this.gameState.pacman.emote = delta.pacman.emote;
      }

      if (delta.players) {
        delta.players.forEach(updatedPlayer => {
          const existingPlayer = this.gameState.players.find(p => p.socketId === updatedPlayer.socketId);
          if (existingPlayer) {
            existingPlayer.position = updatedPlayer.position;
            existingPlayer.direction = updatedPlayer.direction;
            existingPlayer.state = updatedPlayer.state;
          }
        });
      }

      this.updateGameState(this.gameState);
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

    // Draw teleport tunnel indicators
    if (window.TELEPORT_POINTS) {
      window.TELEPORT_POINTS.forEach(teleport => {
        const entryX = teleport.entry.x * tileSize + tileSize / 2;
        const entryY = teleport.entry.y * tileSize + tileSize / 2;
        
        // Draw a glowing circle at teleport entry points
        const teleportCircle = this.add.circle(entryX, entryY, tileSize / 3, 0x00ffff, 0.3);
        teleportCircle.setDepth(0);
        
        // Add pulsing animation
        this.tweens.add({
          targets: teleportCircle,
          alpha: { from: 0.3, to: 0.6 },
          scale: { from: 1, to: 1.2 },
          duration: 800,
          yoyo: true,
          repeat: -1
        });
      });
    }

    // Draw walls with lines (classic Pacman style)
    this.mazeGraphics.lineStyle(3, 0x2121de, 1);

    for (let y = 0; y < CLIENT_MAZE.length; y++) {
      for (let x = 0; x < CLIENT_MAZE[y].length; x++) {
        const cell = CLIENT_MAZE[y][x];
        const px = x * tileSize;
        const py = y * tileSize;

        if (cell === 0) {
          // Wall - draw borders where adjacent to walkable space
          const top = y > 0 && CLIENT_MAZE[y - 1][x] !== 0;
          const bottom = y < CLIENT_MAZE.length - 1 && CLIENT_MAZE[y + 1][x] !== 0;
          const left = x > 0 && CLIENT_MAZE[y][x - 1] !== 0;
          const right = x < CLIENT_MAZE[y].length - 1 && CLIENT_MAZE[y][x + 1] !== 0;

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
      return;
    }

    // Ghost animations - Blinky (red)
    this.anims.create({
      key: 'blinky_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [192, 193] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'blinky_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [194, 195] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'blinky_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [196, 197] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'blinky_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [198, 199] }),
      frameRate: 12,
      repeat: -1
    });

    // Pinky (pink)
    this.anims.create({
      key: 'pinky_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [233, 234] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'pinky_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [235, 236] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'pinky_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [237, 238] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'pinky_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [239, 240] }),
      frameRate: 12,
      repeat: -1
    });

    // Inky (cyan)
    this.anims.create({
      key: 'inky_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [274, 275] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'inky_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [276, 277] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'inky_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [278, 279] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'inky_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [280, 281] }),
      frameRate: 12,
      repeat: -1
    });

    // Clyde (orange)
    this.anims.create({
      key: 'clyde_right',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [315, 316] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'clyde_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [317, 318] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'clyde_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [319, 320] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'clyde_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [321, 322] }),
      frameRate: 12,
      repeat: -1
    });

    // Scared state (blue ghosts)
    const ghosts = ['blinky', 'pinky', 'inky', 'clyde'];
    ghosts.forEach(ghost => {
      this.anims.create({
        key: `${ghost}_scared`,
        frames: this.anims.generateFrameNumbers('sprites', { frames: [200, 201] }),
        frameRate: 8,
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
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'pacman_left',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [69, 70] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'pacman_up',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [110, 111] }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'pacman_down',
      frames: this.anims.generateFrameNumbers('sprites', { frames: [151, 152] }),
      frameRate: 12,
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
        this.pacmanSprite.setScale(tileSize / 16);
      } catch (e) {
        this.pacmanSprite = this.add.circle(targetX, targetY, tileSize / 2 - 2, 0xffff00);
      }
      this.pacmanSprite.setDepth(1);
      this.pacmanSprite.x = targetX;
      this.pacmanSprite.y = targetY;
      this.pacmanSprite.lastDirection = pacman.direction;
    }

    // Create emote text if it doesn't exist
    if (!this.pacmanEmoteText) {
      this.pacmanEmoteText = this.add.text(targetX, targetY - tileSize / 2 - 5, '',
        { fontSize: '20px', fontFamily: 'Arial' });
      this.pacmanEmoteText.setOrigin(0.5);
      this.pacmanEmoteText.setDepth(3);
    }

    // Check if this is a teleportation (large distance jump)
    const currentX = this.pacmanSprite.x;
    const currentY = this.pacmanSprite.y;
    const distSq = (targetX - currentX) ** 2 + (targetY - currentY) ** 2;
    const teleportThreshold = (tileSize * 10) ** 2; // If moved more than 10 tiles, it's a teleport

    if (distSq > teleportThreshold) {
      // Instant teleport - snap to new position
      this.pacmanSprite.x = targetX;
      this.pacmanSprite.y = targetY;
      this.pacmanEmoteText.x = targetX;
      this.pacmanEmoteText.y = targetY - tileSize / 2 - 5;
    }

    // Track direction for animation
    this.pacmanSprite.lastDirection = pacman.direction;

    // Update animation based on direction
    if (this.pacmanSprite.anims) {
      const direction = pacman.direction.toLowerCase();
      const animKey = `pacman_${direction}`;
      if (this.anims.exists(animKey) && this.pacmanSprite.anims.currentAnim?.key !== animKey) {
        this.pacmanSprite.play(animKey);
      }
    }

    // Set target positions for smooth interpolation (only in same direction)
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
          ghost.setScale(tileSize / 16);
          ghost.ghostType = player.ghostType;
        } catch (e) {
          const color = player.state === 'frightened' ? 0x0000ff : colors[player.ghostType];
          ghost = this.add.circle(targetX, targetY, tileSize / 2 - 2, color);
        }
        ghost.setDepth(1);
        ghost.x = targetX;
        ghost.y = targetY;
        ghost.lastDirection = player.direction;

        // Add label showing username
        const labelText = player.ghostType === this.myGhostType ?
          `YOU (${player.username})` : player.username;
        const label = this.add.text(targetX, targetY - tileSize / 2 - 3, labelText,
          { fontSize: '8px', color: '#fff', backgroundColor: '#000', padding: { x: 2, y: 1 } });
        label.setOrigin(0.5);
        label.setDepth(2);
        ghost.label = label;

        this.entities.set(player.socketId, ghost);
      }

      // Check if this is a teleportation (large distance jump)
      const currentX = ghost.x;
      const currentY = ghost.y;
      const distSq = (targetX - currentX) ** 2 + (targetY - currentY) ** 2;
      const teleportThreshold = (tileSize * 10) ** 2; // If moved more than 10 tiles, it's a teleport

      if (distSq > teleportThreshold) {
        // Instant teleport - snap to new position
        ghost.x = targetX;
        ghost.y = targetY;
        if (ghost.label) {
          ghost.label.x = targetX;
          ghost.label.y = targetY - tileSize / 2 - 3;
        }
      }

      // Track direction for animation
      ghost.lastDirection = player.direction;

      // Update animation/color based on state and direction
      if (ghost.anims) {
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

      // Set target positions for smooth interpolation
      ghost.targetX = targetX;
      ghost.targetY = targetY;

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

  isWalkable(x, y) {
    const tileX = Math.round(x);
    const tileY = Math.round(y);

    if (tileY < 0 || tileY >= CLIENT_MAZE.length || tileX < 0 || tileX >= CLIENT_MAZE[0].length) {
      return false;
    }

    const cell = CLIENT_MAZE[tileY][tileX];
    return cell !== 0; // Walkable if not a wall
  }


  update(time, delta) {
    // Smoother, faster interpolation
    const lerpFactor = Math.min(0.35, delta / 30);

    // Update Pacman sprite
    if (this.pacmanSprite && typeof this.pacmanSprite.targetX !== 'undefined') {
      this.pacmanSprite.x += (this.pacmanSprite.targetX - this.pacmanSprite.x) * lerpFactor;
      this.pacmanSprite.y += (this.pacmanSprite.targetY - this.pacmanSprite.y) * lerpFactor;

      if (this.pacmanEmoteText) {
        this.pacmanEmoteText.x = this.pacmanSprite.x;
        this.pacmanEmoteText.y = this.pacmanSprite.y - 18;
      }
    }

    // Update ghost sprites
    for (const sprite of this.entities.values()) {
      if (sprite && typeof sprite.targetX !== 'undefined') {
        sprite.x += (sprite.targetX - sprite.x) * lerpFactor;
        sprite.y += (sprite.targetY - sprite.y) * lerpFactor;

        if (sprite.label) {
          sprite.label.x = sprite.x;
          sprite.label.y = sprite.y - 11;
        }
      }
    }
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
