const socket = io();

let currentPlayer = null;
let currentTeam = null;
let gameState = 'login';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight - 60;

const keys = { w: false, a: false, s: false, d: false, space: false };
const otherPlayers = new Map();
const collectedParts = [];
let localShip = null;

const PART_NAMES = {
  hull: 'Hull',
  motor: 'Motor',
  dok: 'Dok',
  generator: 'Generator',
  bed: 'Crew Bed',
  shield: 'Shield',
  weapon: 'Weapon',
  lab: 'Lab'
};

const COLORS = {
  red: '#ff4444',
  blue: '#4488ff',
  green: '#44ff44',
  yellow: '#ffff44',
  purple: '#aa44ff',
  orange: '#ff8844',
  cyan: '#44ffff',
  pink: '#ff44aa'
};

let landingPage, gameModal;

document.addEventListener('DOMContentLoaded', () => {
  landingPage = document.getElementById('landingPage');
  gameModal = document.getElementById('gameModal');

  document.getElementById('joinBtn').addEventListener('click', () => {
    const name = document.getElementById('playerName').value.trim() || 'Player';
    const teamId = document.getElementById('teamSelect').value;
    if (!teamId) { alert('Kies een team!'); return; }
    if (!socket.connected) {
      document.getElementById('connStatus').textContent = '⚠ Server offline - start de server met "npm start"';
      return;
    }
    socket.emit('joinTeam', { teamId: parseInt(teamId), playerName: name });
  });

  document.getElementById('launchBtn').addEventListener('click', () => socket.emit('launch'));
  document.getElementById('dockBtn').addEventListener('click', () => socket.emit('dock'));

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'w') keys.w = true;
    if (e.key.toLowerCase() === 'a') keys.a = true;
    if (e.key.toLowerCase() === 's') keys.s = true;
    if (e.key.toLowerCase() === 'd') keys.d = true;
    if (e.key === ' ') keys.space = true;
  });

  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'w') keys.w = false;
    if (e.key.toLowerCase() === 'a') keys.a = false;
    if (e.key.toLowerCase() === 's') keys.s = false;
    if (e.key.toLowerCase() === 'd') keys.d = false;
    if (e.key === ' ') keys.space = false;
  });

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 60;
  });

  loadLiveScores();
  setInterval(loadLiveScores, 5000);
});

function loadLiveScores() {
  fetch('/api/scores').catch(() => {}).finally(() => {
    socket.emit('getScoreboard');
  });
}

const connStatus = document.getElementById('connStatus');

socket.on('connect', () => {
  if (connStatus) connStatus.textContent = '';
  socket.emit('getTeams');
  socket.emit('getScoreboard');
});

socket.on('disconnect', () => {
  if (connStatus) connStatus.textContent = '⚠ Server offline - start de server met npm start';
});

socket.on('connect_error', () => {
  if (connStatus) connStatus.textContent = '⚠ Server offline - start de server met npm start';
});

socket.on('teamsList', (teams) => {
  const select = document.getElementById('teamSelect');
  select.innerHTML = '<option value="">Kies een team...</option>';
  teams.forEach(team => {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = team.name;
    select.appendChild(option);
  });
});

socket.on('joined', (data) => {
  currentPlayer = data.player;
  currentTeam = data.team;

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');

  document.getElementById('teamName').textContent = currentTeam.name;
  document.getElementById('teamName').style.color = COLORS[currentTeam.color];
  document.getElementById('scoreDisplay').textContent = `Score: ${currentTeam.score}`;

  updateInventoryDisplay();
  requestAnimationFrame(gameLoop);
});

socket.on('playerJoined', (player) => {
  if (player.id !== socket.id) otherPlayers.set(player.id, player);
});

socket.on('playerLeft', (playerId) => otherPlayers.delete(playerId));

socket.on('shipLaunched', (data) => {
  if (data.playerId !== socket.id) {
    const p = otherPlayers.get(data.playerId);
    if (p) p.ship = data.ship;
  }
});

socket.on('shipUpdate', (data) => {
  const player = otherPlayers.get(data.playerId);
  if (player?.ship) {
    player.ship.x = data.x;
    player.ship.y = data.y;
    player.ship.angle = data.angle;
    player.ship.speed = data.speed;
  }
});

socket.on('partSpawned', (part) => {
  if (part.teamId === currentTeam?.id) collectedParts.push(part);
});

socket.on('partPickedUp', (data) => {
  const idx = collectedParts.findIndex(p => p.id === data.partId);
  if (idx !== -1) collectedParts.splice(idx, 1);
});

socket.on('partCollected', () => updateInventoryDisplay());

socket.on('inventoryUpdate', (data) => {
  currentTeam.inventory = new Map(data.inventory);
  updateInventoryDisplay();
});

socket.on('launched', (ship) => {
  localShip = ship;
  currentPlayer.state = 'flying';
  updateShipState();
});

socket.on('positionUpdate', (data) => {
  localShip.x = data.x;
  localShip.y = data.y;
  localShip.angle = data.angle;
  localShip.speed = data.speed;
});

socket.on('docked', () => {
  localShip = null;
  currentPlayer.state = 'docked';
  updateShipState();
});

socket.on('partBuilt', (data) => {
  currentTeam.score = data.score;
  document.getElementById('scoreDisplay').textContent = `Score: ${data.score}`;
});

socket.on('scoreboard', (scores) => {
  const scoreList = document.getElementById('scoreList');
  if (scoreList) {
    scoreList.innerHTML = '';
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${s.name} - ${s.score.toLocaleString()}`;
      scoreList.appendChild(li);
    });
  }

  const liveScores = document.getElementById('scoresList');
  if (liveScores) {
    liveScores.innerHTML = '';
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${i + 1}. ${s.name}</span><span>${s.score.toLocaleString()}</span>`;
      liveScores.appendChild(li);
    });
  }
});

function updateInventoryDisplay() {
  const list = document.getElementById('inventoryList');
  if (!list) return;
  list.innerHTML = '';

  if (currentTeam?.inventory) {
    currentTeam.inventory.forEach((count, type) => {
      if (count > 0) {
        const li = document.createElement('li');
        li.textContent = `${PART_NAMES[type]}: ${count}`;
        list.appendChild(li);
      }
    });
  }
  updateBuildMenu();
}

function updateBuildMenu() {
  const container = document.getElementById('buildParts');
  if (!container) return;
  container.innerHTML = '';

  if (currentTeam?.inventory) {
    currentTeam.inventory.forEach((count, type) => {
      if (count > 0) {
        const btn = document.createElement('button');
        btn.className = 'build-part-btn';
        btn.textContent = `${PART_NAMES[type]} (${count})`;
        btn.onclick = () => socket.emit('buildPart', { type: type });
        container.appendChild(btn);
      }
    });
  }
}

function updateShipState() {
  const stateEl = document.getElementById('shipState');
  const launchBtn = document.getElementById('launchBtn');
  const dockBtn = document.getElementById('dockBtn');
  const buildMenu = document.getElementById('buildMenu');

  if (!stateEl || !launchBtn || !dockBtn || !buildMenu) return;

  if (currentPlayer?.state === 'docked') {
    stateEl.textContent = 'Gedokt';
    stateEl.style.color = '#4ade80';
    launchBtn.disabled = false;
    dockBtn.classList.add('hidden');
    buildMenu.classList.remove('hidden');
  } else {
    stateEl.textContent = 'In de ruimte';
    stateEl.style.color = '#ff6b6b';
    launchBtn.disabled = true;
    dockBtn.classList.remove('hidden');
    buildMenu.classList.add('hidden');
  }
}

function gameLoop() {
  if (currentPlayer?.state === 'flying' && localShip) {
    let angle = localShip.angle;
    let thrusting = false;

    if (keys.a) angle -= 0.05;
    if (keys.d) angle += 0.05;
    if (keys.w) thrusting = true;

    socket.emit('fly', { angle: angle, thrusting: thrusting });

    collectedParts.forEach(part => {
      if (!part.collected && localShip) {
        const dx = localShip.x - part.x;
        const dy = localShip.y - part.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) socket.emit('collectPart', part.id);
      }
    });
  }

  render();
  requestAnimationFrame(gameLoop);
}

function render() {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!currentTeam || !currentPlayer) return;

  const offsetX = canvas.width / 2 - (currentPlayer.x || 0);
  const offsetY = canvas.height / 2 - (currentPlayer.y || 0);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  for (const part of collectedParts) {
    if (part.teamId === currentTeam.id && !part.collected) {
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(part.x, part.y, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(PART_NAMES[part.type]?.[0] || '?', part.x, part.y + 4);
    }
  }

  if (currentPlayer.state === 'flying' && localShip) {
    ctx.save();
    ctx.translate(localShip.x, localShip.y);
    ctx.rotate(localShip.angle);

    ctx.fillStyle = COLORS[currentTeam.color] || '#fff';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();

    if (localShip.speed > 0) {
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-20 - Math.random() * 5, 0);
      ctx.lineTo(-12, 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  otherPlayers.forEach(player => {
    if (player.ship) {
      ctx.save();
      ctx.translate(player.ship.x || 0, player.ship.y || 0);
      ctx.rotate(player.ship.angle || 0);
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -6);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });

  ctx.restore();
}