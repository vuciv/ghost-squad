# Ghost Squad

Multiplayer Pacman variant where players control ghosts hunting an AI-controlled Pacman.

## Overview

Up to 4 players work together as Blinky, Pinky, Inky, and Clyde to capture AI Pacman before he clears the maze. When Pacman eats a Power Pellet, ghosts enter Frightened mode.

Win Conditions:
- **Ghosts Win**: Capture Pacman 3 times
- **Pacman Wins**: Eat all dots in the maze

Game Modes:
- **Chase**: Hunt Pacman (default)
- **Frightened**: Ghosts can be eaten for 10 seconds after power pellet
- **Respawn**: 5 second delay after capture

## Quick Start

### Install and Run

```bash
npm install
npm start
```

Open `http://localhost:3000`

### Controls

- Arrow Keys or WASD: Move
- Room codes are 4 characters

## Technical Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: HTML5, Phaser 3
- AI: A* pathfinding, Reinforcement Learning (Tabular Hybrid Reward Architecture)
- Networking: WebSocket real-time multiplayer

## Architecture

```
server/
├── Game.ts              # Core game logic
├── GameManager.ts       # Room management
├── PacmanAI.ts          # Defensive AI
├── AggressiveAI.ts      # Power pellet hunting
├── PacmanBrain.ts       # Predictive lookahead
└── rl/                  # Reinforcement learning models
    ├── TabularHybridCoordinator.ts
    ├── GhostQLearningAgent.ts
    └── train-*.ts

shared/
├── maze.ts
└── constants.ts

client/
├── game.js              # Phaser scene
├── app.js               # Socket.IO client
└── index.html
```

## Configuration

Edit `shared/constants.ts`:
- Game tick rate, ghost speeds
- Frightened mode duration
- Scoring multipliers

Edit `shared/maze.ts`:
- `0` = Wall
- `1` = Dot
- `2` = Power Pellet
- `3` = Ghost House

## Training Models

Train reinforcement learning models:

```bash
npm run build
node dist/server/rl/train-pacman.js
node dist/server/rl/train-adversarial.js
```

Models save to `./models/adversarial_tabular/`

## Port Configuration

```bash
PORT=8080 npm start
```

## License

MIT
