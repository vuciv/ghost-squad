// Client-side application logic
let socket;
let game;
let currentRoomCode = null;
let selectedGhost = null;

// UI Elements
const mainMenu = document.getElementById('main-menu');
const lobbyScreen = document.getElementById('lobby-screen');
const hudElement = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over-screen');

const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinInput = document.getElementById('join-input');
const roomCodeInput = document.getElementById('room-code-input');
const joinSubmitBtn = document.getElementById('join-submit-btn');
const startGameBtn = document.getElementById('start-game-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const roomCodeDisplay = document.getElementById('room-code-display');
const playersList = document.getElementById('players-list');

// Initialize Socket.IO connection
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });

  socket.on('gameState', (state) => {
    // Handled by Phaser scene
  });

  socket.on('gameStarted', () => {
    startGame();
  });

  socket.on('playerLeft', (data) => {
    console.log('Player left:', data.socketId);
  });
}

// UI Event Handlers
createRoomBtn.addEventListener('click', () => {
  socket.emit('createRoom', (response) => {
    if (response.success) {
      currentRoomCode = response.roomCode;
      showLobby(response.roomCode);
    }
  });
});

joinRoomBtn.addEventListener('click', () => {
  joinInput.classList.toggle('hidden');
  roomCodeInput.focus();
});

joinSubmitBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length === 4) {
    currentRoomCode = code;
    showLobby(code);
  }
});

roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinSubmitBtn.click();
  }
});

// Ghost selection
document.querySelectorAll('.ghost-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const ghostType = btn.dataset.ghost;

    // Try to join with this ghost
    socket.emit('joinRoom', {
      roomCode: currentRoomCode,
      ghostType
    }, (response) => {
      if (response.success) {
        selectedGhost = ghostType;

        // Update UI
        document.querySelectorAll('.ghost-btn').forEach(b => {
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
        startGameBtn.disabled = false;
      } else {
        alert(response.error);
      }
    });
  });
});

startGameBtn.addEventListener('click', () => {
  if (selectedGhost) {
    socket.emit('startGame', { roomCode: currentRoomCode });
  }
});

backToMenuBtn.addEventListener('click', () => {
  location.reload();
});

// Screen Management
function showLobby(roomCode) {
  mainMenu.classList.remove('active');
  lobbyScreen.classList.add('active');
  roomCodeDisplay.textContent = roomCode;
}

function startGame() {
  lobbyScreen.classList.remove('active');
  hudElement.classList.remove('hidden');

  // Initialize Phaser game
  if (!game) {
    game = new Phaser.Game(gameConfig);
    game.scene.start('GameScene', {
      socket,
      roomCode: currentRoomCode,
      myGhostType: selectedGhost
    });
  }
}

// Initialize app
window.addEventListener('DOMContentLoaded', () => {
  initSocket();
});

// Prevent accidental page closure
window.addEventListener('beforeunload', (e) => {
  if (currentRoomCode) {
    e.preventDefault();
    e.returnValue = '';
  }
});
