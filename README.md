# 👻 Ghost Squad

A multiplayer Pacman game where **players control the ghosts** and hunt down an **AI-controlled Pacman**!

## 🎮 Game Overview

Ghost Squad flips the classic Pacman formula on its head. Up to 4 players work together as Blinky, Pinky, Inky, and Clyde to capture the AI Pacman before he clears the maze. When Pacman eats a Power Pellet, the tables turn and the ghosts must flee!

### Win Conditions
- **Ghosts Win**: Capture Pacman 3 times
- **Pacman Wins**: Eat all dots in the maze

### Game Modes
- **Chase Mode**: Hunt down Pacman (default)
- **Frightened Mode**: Run away! Pacman can eat you for 10 seconds after eating a Power Pellet
- **Respawn**: If caught, ghosts respawn after 5 seconds

## 🚀 Quick Start

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

### How to Play

1. **Create a Game**: Click "Create Game" to generate a 4-character room code
2. **Share the Code**: Give the code to your friends
3. **Join Game**: Friends enter the code and select a ghost
4. **Start Game**: Once ready, the host clicks "Start Game"
5. **Hunt Pacman**: Work together to corner and capture the AI Pacman!

### Controls
- **Arrow Keys** or **WASD**: Move your ghost
- Work together with teammates to corner Pacman

## 🛠️ Technical Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5, Phaser 3, CSS
- **Networking**: WebSocket (real-time multiplayer)
- **AI**: A* pathfinding with behavior trees

## 🎯 Features

### AI Pacman Behavior
The AI features three behavioral states:
- **Dot Seeking**: Targets the nearest cluster of dots
- **Evasion**: Detects nearby ghosts and takes evasive routes
- **Aggressive**: After eating a Power Pellet, actively hunts ghosts

### Multiplayer
- Room-based matchmaking with 4-character codes
- Support for 1-4 players
- Authoritative server prevents cheating
- 20 tick/second game state updates
- Client-side interpolation for smooth movement

### Scoring
- Base points for capturing Pacman
- Multiplier bonus when multiple ghosts are nearby
- Team-based scoring system

## 📁 Project Structure

```
pacman/
├── client/           # Frontend files
│   ├── index.html    # Main HTML
│   ├── style.css     # Styles
│   ├── game.js       # Phaser game scene
│   └── app.js        # Client application logic
├── server/           # Backend files
│   ├── index.js      # Server entry point
│   ├── GameManager.js # Manages game rooms
│   ├── Game.js       # Core game logic
│   ├── PacmanAI.js   # AI behavior
│   └── AStar.js      # Pathfinding algorithm
├── shared/           # Shared constants
│   ├── constants.js  # Game constants
│   └── maze.js       # Maze layout
└── package.json
```

## 🎨 Customization

### Adjust Difficulty
Edit `shared/constants.js` to modify:
- Ghost/Pacman speeds
- Frightened mode duration
- Respawn delays
- Scoring values

### Modify the Maze
Edit `shared/maze.js` to create custom maze layouts:
- `0` = Wall
- `1` = Dot
- `2` = Power Pellet
- `3` = Ghost House (empty space)

## 🐛 Troubleshooting

**Port already in use?**
```bash
PORT=8080 npm start
```

**Can't connect to server?**
- Ensure firewall allows connections on port 3000
- Check that no other service is using the port

## 📝 License

MIT License - Feel free to modify and distribute!

## 🤝 Contributing

This is a fun project! Feel free to:
- Add new ghost AI patterns
- Implement different maze layouts
- Add power-ups and special abilities
- Improve the Pacman AI

## 🎵 Future Enhancements

- [ ] Sound effects and background music
- [ ] Multiple maze layouts
- [ ] Difficulty settings
- [ ] Player statistics and leaderboards
- [ ] Spectator mode
- [ ] Mobile support with touch controls

---

Made with ❤️ for retro gaming fans
