# Sprite Assets

## Required Sprites

All sprites should be 20x20 pixels (matching TILE_SIZE).

### Ghost Sprites (for each: blinky, pinky, inky, clyde)
- `{ghost}_left_1.png` - Left facing, frame 1
- `{ghost}_left_2.png` - Left facing, frame 2
- `{ghost}_right_1.png` - Right facing, frame 1
- `{ghost}_right_2.png` - Right facing, frame 2
- `{ghost}_up_1.png` - Up facing, frame 1
- `{ghost}_up_2.png` - Up facing, frame 2
- `{ghost}_down_1.png` - Down facing, frame 1
- `{ghost}_down_2.png` - Down facing, frame 2
- `{ghost}_scared_1.png` - Scared state, frame 1
- `{ghost}_scared_2.png` - Scared state, frame 2
- `{ghost}_dead_1.png` - Dead/flashing state, frame 1
- `{ghost}_dead_2.png` - Dead/flashing state, frame 2

### Pacman Sprites
- `pacman_left_1.png` - Left facing, mouth open
- `pacman_left_2.png` - Left facing, mouth closed
- `pacman_right_1.png` - Right facing, mouth open
- `pacman_right_2.png` - Right facing, mouth closed
- `pacman_up_1.png` - Up facing, mouth open
- `pacman_up_2.png` - Up facing, mouth closed
- `pacman_down_1.png` - Down facing, mouth open
- `pacman_down_2.png` - Down facing, mouth closed

## Animation System
- Direction animations: 2 frames, alternating at 10fps
- Scared: 2 frames, alternating at 5fps
- Dead/flashing: 2 frames, alternating at 15fps
