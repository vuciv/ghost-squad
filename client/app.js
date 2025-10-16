// Client-side application logic

let socket;
let game;
let currentRoomCode = null;
let selectedGhost = null;
let selectedAI = 'heuristic';
let currentGameState = null;
let gameStarting = false;

// UI Elements
const mainMenu = document.getElementById('main-menu');
const lobbyScreen = document.getElementById('lobby-screen');
const timerDisplay = document.getElementById('timer-display');
const gameOverScreen = document.getElementById('game-over-screen');

const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const readyBtn = document.getElementById('ready-btn');
const retryBtn = document.getElementById('retry-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeBadge = document.getElementById('room-code-badge');
const playersList = document.getElementById('players-list-compact');
const readyStatus = document.getElementById('ready-status');

// Initialize Socket.IO connection
function initSocket() {
  socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  socket.on('connect', () => {
  });

  socket.on('connect_error', (error) => {
  });

  socket.on('disconnect', () => {
  });

  socket.on('gameState', (state) => {
    currentGameState = state;
    // Only update lobby if lobby screen is active
    if (lobbyScreen.classList.contains('active')) {
      updateLobbyPlayers(state);
    }
  });

  socket.on('gameStarted', () => {
    gameStarting = false;
    startGame();
  });

  socket.on('playerLeft', (data) => {
    // Player left
  });

  socket.on('gameRestarted', () => {
    gameStarting = false;
    document.getElementById('game-over-screen').classList.remove('active');
    timerDisplay.classList.remove('hidden');
    document.getElementById('lives-display').classList.remove('hidden');

    if (game && game.scene.scenes.length > 0) {
      const scene = game.scene.scenes[0];
      scene.scene.restart({
        socket,
        roomCode: currentRoomCode,
        myGhostType: selectedGhost
      });
    } else {
      game = new Phaser.Game(window.gameConfig);
      game.scene.start('GameScene', {
        socket,
        roomCode: currentRoomCode,
        myGhostType: selectedGhost
      });
    }
  });
}

// UI Event Handlers
createRoomBtn.addEventListener('click', () => {
  socket.emit('createRoom', (response) => {
    if (response.success) {
      currentRoomCode = response.roomCode;
      showLobby(response.roomCode);

      const firstGhost = 'blinky';
      socket.emit('joinRoom', {
        roomCode: currentRoomCode,
        username: 'Ghost',
        ghostType: firstGhost,
        aiType: selectedAI
      }, (joinResponse) => {
        if (joinResponse.success) {
          selectedGhost = firstGhost;
          document.querySelector(`.ghost-btn[data-ghost="${firstGhost}"]`)?.classList.add('selected');
        }
      });
    }
  });
});

joinRoomBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();

  if (code.length !== 4) {
    alert('Please enter a 4-character room code!');
    roomCodeInput.focus();
    return;
  }

  currentRoomCode = code;
  showLobby(code);
  socket.emit('requestGameState', { roomCode: code });
});

roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinRoomBtn.click();
  }
});

// Ghost selection
document.querySelectorAll('.ghost-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const ghostType = btn.dataset.ghost;
    const potentialUsernames = ['inky', 'pinky', 'clyde', 'blinky'];
    const funPostfixes = ['lover', 'fan3000', 'the third', 'otaku', 'hater']
    const funRandomUsername = potentialUsernames[Math.floor(Math.random() * potentialUsernames.length)];
    const funRandomPostfix = funPostfixes[Math.floor(Math.random() * funPostfixes.length)];
    // Try to join with this ghost
    socket.emit('joinRoom', {
      roomCode: currentRoomCode,
      username: funRandomUsername + '-' + funRandomPostfix,
      ghostType,
      aiType: selectedAI
    }, (response) => {
      if (response.success) {
        selectedGhost = ghostType;

        document.querySelectorAll('.ghost-btn').forEach(b => {
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
      } else {
        alert(response.error);
      }
    });
  });
});

document.querySelectorAll('.ai-btn-compact').forEach(btn => {
  btn.addEventListener('click', () => {
    const aiType = btn.dataset.ai;
    selectedAI = aiType;

    document.querySelectorAll('.ai-btn-compact').forEach(b => {
      b.classList.remove('selected');
    });
    btn.classList.add('selected');
  });
});

readyBtn.addEventListener('click', () => {
  socket.emit('toggleReady', { roomCode: currentRoomCode });
});

retryBtn.addEventListener('click', () => {
  socket.emit('restartGame', { roomCode: currentRoomCode });
});

backToMenuBtn.addEventListener('click', () => {
  // Hide game over screen
  gameOverScreen.classList.remove('active');

  // Show main menu
  mainMenu.classList.add('active');

  // Hide timer and lives
  timerDisplay.classList.add('hidden');
  document.getElementById('lives-display').classList.add('hidden');

  // Destroy the game
  if (game) {
    game.destroy(true);
    game = null;
  }

  // Reset state
  currentRoomCode = null;
  selectedGhost = null;
  currentGameState = null;
  gameStarting = false;
});

// Click-to-copy room code
roomCodeBadge.addEventListener('click', () => {
  const code = roomCodeDisplay.textContent;
  const url = `${window.location.origin}?code=${code}`;
  navigator.clipboard.writeText(url).then(() => {
    // Visual feedback
    roomCodeDisplay.classList.add('copied');
    const originalContent = roomCodeDisplay.textContent;
    roomCodeDisplay.textContent = 'COPIED';

    setTimeout(() => {
      roomCodeDisplay.textContent = originalContent;
      roomCodeDisplay.classList.remove('copied');
    }, 1500);
  }).catch(err => {
    alert('Room code: ' + code);
  });
});

// Screen Management
function showLobby(roomCode) {
  mainMenu.classList.remove('active');
  lobbyScreen.classList.add('active');
  roomCodeDisplay.textContent = roomCode;

  // Request current game state to show who's already in the lobby
  if (currentGameState) {
    updateLobbyPlayers(currentGameState);
  }
}

function startGame() {
  lobbyScreen.classList.remove('active');
  timerDisplay.classList.remove('hidden');
  document.getElementById('lives-display').classList.remove('hidden');

  // Initialize Phaser game
  if (!game) {
    game = new Phaser.Game(window.gameConfig);
    game.scene.start('GameScene', {
      socket,
      roomCode: currentRoomCode,
      myGhostType: selectedGhost
    });
  }
}

// Load and draw sprites on canvases
function loadSprites() {
  const img = new Image();
  img.src = 'assets/spritesheet.png';

  img.onload = () => {
    // Draw title screen sprites (all 4 ghosts + pacman)
    const titleCanvas = document.getElementById('title-sprites');
    if (titleCanvas) {
      const ctx = titleCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      const marginX = 8;
      const frameWidth = 16;
      const frameHeight = 16;

      // Helper to draw a frame
      const drawFrame = (frameNum, x, y, scale = 2) => {
        const cols = Math.floor((img.width - marginX * 2) / frameWidth);
        const col = frameNum % cols;
        const row = Math.floor(frameNum / cols);
        const srcX = marginX + col * frameWidth;
        const srcY = row * frameHeight;

        ctx.drawImage(img, srcX, srcY, frameWidth, frameHeight,
                      x, y, frameWidth * scale, frameHeight * scale);
      };

      // Draw: Pacman, Blinky, Pinky, Inky, Clyde
      drawFrame(28, 0, 4);    // Pacman right
      drawFrame(192, 40, 4);  // Blinky right
      drawFrame(233, 72, 4);  // Pinky right
      drawFrame(274, 104, 4); // Inky right
      drawFrame(315, 136, 4); // Clyde right
    }

    // Draw ghost selection button sprites
    const ghostFrames = {
      blinky: 192,
      pinky: 233,
      inky: 274,
      clyde: 315
    };

    document.querySelectorAll('.ghost-icon-canvas').forEach(canvas => {
      const ghostType = canvas.dataset.ghost;
      const frameNum = ghostFrames[ghostType];

      if (frameNum) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const marginX = 8;
        const frameWidth = 16;
        const frameHeight = 16;
        const cols = Math.floor((img.width - marginX * 2) / frameWidth);
        const col = frameNum % cols;
        const row = Math.floor(frameNum / cols);
        const srcX = marginX + col * frameWidth;
        const srcY = row * frameHeight;

        // Draw centered and scaled 2x
        ctx.drawImage(img, srcX, srcY, frameWidth, frameHeight,
                      0, 0, 32, 32);
      }
    });
  };
}

// Initialize app
window.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadSprites();

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code && code.length === 4) {
    roomCodeInput.value = code;
    setTimeout(() => {
      joinRoomBtn.click();
    }, 500);
  }
});

// Update lobby to show players and lock ghosts
function updateLobbyPlayers(state) {
  if (!state || !state.players) return;

  // Update ghost buttons to show taken ghosts
  document.querySelectorAll('.ghost-btn').forEach(btn => {
    const ghostType = btn.dataset.ghost;
    const player = state.players.find(p => p.ghostType === ghostType);
    const label = btn.querySelector('.player-label');

    if (player) {
      // Ghost is taken - disable and show username
      if (player.socketId !== socket.id) {
        btn.disabled = true;
        btn.classList.remove('selected');
      } else {
        btn.classList.add('selected');
      }

      // Set username label
      if (label) {
        label.textContent = player.username;
      }
    } else {
      // Ghost is available
      btn.disabled = false;
      if (ghostType !== selectedGhost) {
        btn.classList.remove('selected');
      }

      // Clear label
      if (label) {
        label.textContent = '';
      }
    }
  });

  // Update player count
  const playerCountDisplay = document.getElementById('player-count-display');
  if (playerCountDisplay) {
    const count = state.players.length;
    playerCountDisplay.textContent = `${count}/4 Player${count !== 1 ? 's' : ''}`;
  }

  // Update ready button state
  const myPlayer = state.players.find(p => p.socketId === socket.id);
  if (myPlayer) {
    readyBtn.textContent = myPlayer.ready ? '✓ Ready' : 'Ready Up';
    readyBtn.classList.toggle('ready', myPlayer.ready);
  }

  // Check if all players are ready
  const allReady = state.players.length > 0 && state.players.every(p => p.ready);

  // Update ready status message
  const readyCount = state.players.filter(p => p.ready).length;
  readyStatus.textContent = allReady
    ? '✓ All players ready! Starting game...'
    : `${readyCount}/${state.players.length} players ready`;

  // Auto-start game when all players are ready
  if (allReady && !gameStarting && lobbyScreen.classList.contains('active')) {
    gameStarting = true;
    socket.emit('startGame', { roomCode: currentRoomCode });
  }

  playersList.innerHTML = '';
  const colors = { blinky: '#ff0000', pinky: '#ffb8ff', inky: '#00ffff', clyde: '#ffb852' };
  state.players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    const icon = player.ready ? '✓' : '◯';
    playerDiv.innerHTML = `<span style="color: ${colors[player.ghostType]}">👻</span> ${icon} ${player.username}`;
    playersList.appendChild(playerDiv);
  });
}

window.addEventListener('beforeunload', (e) => {
  if (currentRoomCode) {
    e.preventDefault();
    e.returnValue = '';
  }
});
