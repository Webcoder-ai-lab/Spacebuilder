const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/scores', (req, res) => {
  const scores = Array.from(teams.values())
    .map(t => ({ name: t.name, color: t.color, score: t.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  res.json(scores);
});

const PART_TYPES = {
  hull: { name: 'Hull', points: 10, comboBonus: 5 },
  motor: { name: 'Motor', points: 15, comboBonus: 10 },
  dok: { name: 'Dok', points: 50, comboBonus: 0 },
  generator: { name: 'Generator', points: 20, comboBonus: 8 },
  bed: { name: 'Crew Bed', points: 5, comboBonus: 2 },
  shield: { name: 'Shield', points: 25, comboBonus: 12 },
  weapon: { name: 'Weapon', points: 30, comboBonus: 15 },
  lab: { name: 'Lab', points: 35, comboBonus: 20 }
};

const teams = new Map();
const players = new Map();
const parts = new Map();
const dockedShips = new Map();

let partIdCounter = 0;
let teamIdCounter = 0;
let shipIdCounter = 0;

function createTeam(name, color) {
  const teamId = ++teamIdCounter;
  const team = {
    id: teamId,
    name: name || `Team ${color}`,
    color: color,
    inventory: new Map(),
    ship: {
      cockpit: 1,
      dok: 1
    },
    score: 0,
    partsBuilt: [],
    miniShips: 1,
    spawnCenter: { x: 0, y: 0 }
  };
  teams.set(teamId, team);
  return team;
}

function calculateScore(team) {
  let totalPoints = 0;
  const counts = {};

  for (const partType of team.partsBuilt) {
    counts[partType] = (counts[partType] || 0) + 1;
  }

  for (const [partType, count] of Object.entries(counts)) {
    const part = PART_TYPES[partType];
    if (part) {
      totalPoints += part.points * count;
      if (count > 1 && part.comboBonus > 0) {
        totalPoints += part.comboBonus * (count - 1);
      }
    }
  }

  team.score = totalPoints;
  return totalPoints;
}

function spawnPart(teamId) {
  const team = teams.get(teamId);
  if (!team) return;

  const partTypes = Object.keys(PART_TYPES);
  const type = partTypes[Math.floor(Math.random() * partTypes.length)];

  const angle = Math.random() * Math.PI * 2;
  const distance = 200 + Math.random() * 400;

  const part = {
    id: ++partIdCounter,
    type: type,
    teamId: teamId,
    x: team.spawnCenter.x + Math.cos(angle) * distance,
    y: team.spawnCenter.y + Math.sin(angle) * distance,
    collected: false
  };

  parts.set(part.id, part);
  io.to(`team_${teamId}`).emit('partSpawned', part);
}

function buildTeamDefault() {
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
  colors.forEach((color, index) => {
    const team = createTeam(`Team ${color.charAt(0).toUpperCase() + color.slice(1)}`, color);
    team.spawnCenter = {
      x: (index % 4) * 800 - 1200,
      y: Math.floor(index / 4) * 600 - 600
    };
  });
}

buildTeamDefault();

setInterval(() => {
  teams.forEach((team, teamId) => {
    if (Math.random() < 0.3) {
      spawnPart(teamId);
    }
  });
}, 3000);

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('getTeams', () => {
    const teamsList = Array.from(teams.values()).map(t => ({
      id: t.id,
      name: t.name,
      color: t.color
    }));
    socket.emit('teamsList', teamsList);
  });

  socket.on('joinTeam', (data) => {
    const team = teams.get(data.teamId);
    if (!team) return;

    const player = {
      id: socket.id,
      name: data.playerName || `Player ${players.size + 1}`,
      teamId: data.teamId,
      state: 'docked',
      shipId: null,
      x: 0,
      y: 0,
      angle: 0,
      thrusting: false
    };

    players.set(socket.id, player);
    socket.join(`team_${data.teamId}`);

    socket.emit('joined', {
      player: player,
      team: team,
      parts: Array.from(parts.values()).filter(p => p.teamId === data.teamId && !p.collected)
    });

    io.to(`team_${data.teamId}`).emit('playerJoined', player);
  });

  socket.on('launch', () => {
    const player = players.get(socket.id);
    if (!player || player.state !== 'docked') return;

    const team = teams.get(player.teamId);
    if (!team || team.ship.dok < 1) return;

    const ship = {
      id: ++shipIdCounter,
      playerId: socket.id,
      teamId: player.teamId,
      x: team.spawnCenter.x,
      y: team.spawnCenter.y,
      angle: -Math.PI / 2,
      speed: 0
    };

    dockedShips.set(ship.id, ship);
    player.state = 'flying';
    player.shipId = ship.id;
    player.x = ship.x;
    player.y = ship.y;
    player.angle = ship.angle;

    socket.emit('launched', ship);
    io.to(`team_${player.teamId}`).emit('shipLaunched', { playerId: socket.id, ship: ship });
  });

  socket.on('fly', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.shipId) return;

    const ship = dockedShips.get(player.shipId);
    if (!ship) return;

    ship.angle = data.angle;
    ship.speed = data.thrusting ? 5 : 0;

    if (ship.speed > 0) {
      ship.x += Math.cos(ship.angle) * ship.speed;
      ship.y += Math.sin(ship.angle) * ship.speed;
    }

    player.x = ship.x;
    player.y = ship.y;
    player.angle = ship.angle;
    player.thrusting = data.thrusting;

    socket.emit('positionUpdate', { x: ship.x, y: ship.y, angle: ship.angle, speed: ship.speed });
    io.to(`team_${player.teamId}`).emit('shipUpdate', {
      playerId: socket.id,
      x: ship.x,
      y: ship.y,
      angle: ship.angle,
      speed: ship.speed
    });
  });

  socket.on('collectPart', (partId) => {
    const player = players.get(socket.id);
    if (!player || !player.shipId) return;

    const part = parts.get(partId);
    if (!part || part.collected || part.teamId !== player.teamId) return;

    const dx = player.x - part.x;
    const dy = player.y - part.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 30) {
      part.collected = true;
      parts.delete(partId);

      const team = teams.get(player.teamId);
      team.inventory.set(part.type, (team.inventory.get(part.type) || 0) + 1);

      socket.emit('partCollected', { type: part.type, partId: part.id });
      io.to(`team_${player.teamId}`).emit('partPickedUp', { 
        playerId: socket.id, 
        partId: part.id, 
        type: part.type 
      });

      socket.emit('inventoryUpdate', {
        inventory: Array.from(team.inventory.entries())
      });
    }
  });

  socket.on('dock', () => {
    const player = players.get(socket.id);
    if (!player || player.state !== 'flying') return;

    const team = teams.get(player.teamId);
    const dx = player.x - team.spawnCenter.x;
    const dy = player.y - team.spawnCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 100) {
      if (player.shipId) {
        dockedShips.delete(player.shipId);
      }
      player.state = 'docked';
      player.shipId = null;

      socket.emit('docked');
    }
  });

  socket.on('buildPart', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const team = teams.get(player.teamId);
    const count = team.inventory.get(data.type) || 0;

    if (count < 1) return;

    team.inventory.set(data.type, count - 1);
    team.partsBuilt.push(data.type);

    if (data.type === 'dok') {
      team.ship.dok = (team.ship.dok || 0) + 1;
      team.miniShips = team.ship.dok;
    } else {
      team.ship[data.type] = (team.ship[data.type] || 0) + 1;
    }

    calculateScore(team);

    io.to(`team_${player.teamId}`).emit('partBuilt', {
      type: data.type,
      score: team.score
    });

    socket.emit('inventoryUpdate', {
      inventory: Array.from(team.inventory.entries())
    });
  });

  socket.on('getScoreboard', () => {
    const scores = Array.from(teams.values())
      .map(t => ({ name: t.name, color: t.color, score: t.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    socket.emit('scoreboard', scores);
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      if (player.shipId) {
        dockedShips.delete(player.shipId);
      }
      players.delete(socket.id);
      io.to(`team_${player.teamId}`).emit('playerLeft', socket.id);
    }
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SpaceBuilder server running on port ${PORT}`);
});