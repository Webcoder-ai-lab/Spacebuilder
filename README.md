# 🚀 SpaceBuilder

Multiplayer endless space ship building game. Teams compete to build the biggest/best spaceship.

Real-time multiplayer: join a team, fly your ship into space, collect parts, build on your ship, and climb the scoreboard!

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

## How to Play

1. **Join a team** - Pick your team color
2. **Launch** - Click "Launch" to fly your mini ship into space
3. **Collect parts** - Fly to glowing yellow parts to collect them
4. **Build** - Return to dock and build parts on your ship
5. **Score** - Bigger ship = higher score. Build more Dok's for more mini ships!

## Controls

- **W** - Thrust forward
- **A/D** - Rotate left/right

## Parts & Scoring

| Part | Points | Combo Bonus |
|------|--------|-------------|
| Crew Bed | 5 | +2 |
| Hull | 10 | +5 |
| Motor | 15 | +10 |
| Generator | 20 | +8 |
| Shield | 25 | +12 |
| Weapon | 30 | +15 |
| Lab | 35 | +20 |
| Dok | 50 | - |

## Deploy

Deploy to Render, Glitch, or any Node.js host.

## Tech Stack

- Node.js + Express
- Socket.io
- Vanilla HTML5 Canvas