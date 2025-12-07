// script.js - replacement (drop into your project, replaces previous script.js)
// This version auto-starts, logs activity to console, and uses consistent names.

// --------------- Settings ----------------
const LANES = 3;
const COLS = 10;
const PLAYER_COL = 1;
const PLAYER_START_LANE = 1;

let START_HEALTH = 8;
let SPAWN_CHANCE = 40; // percent per lane per tick (raised for testing)
let TICK_MS = 700;

// --------------- Linked list basics ---------------
class Node {
  constructor(pos, power = 1, isPlayer = false) {
    this.pos = pos;
    this.power = power;
    this.isPlayer = isPlayer;
    this.next = null;
  }
}

class LinkedList {
  constructor() { this.head = null; this.tail = null; }

  push(pos, power = 1, isPlayer = false) {
    const n = new Node(pos, power, isPlayer);
    if (!this.head) { this.head = this.tail = n; }
    else { this.tail.next = n; this.tail = n; }
    return n;
  }

  traverse(fn) {
    let prev = null, cur = this.head;
    while (cur) { fn(cur, prev); prev = cur; cur = cur.next; }
  }

  deleteAfter(prev) {
    if (prev === null) {
      if (!this.head) return null;
      const rem = this.head;
      this.head = this.head.next;
      if (!this.head) this.tail = null;
      rem.next = null;
      return rem;
    }
    const rem = prev.next;
    if (!rem) return null;
    prev.next = rem.next;
    if (rem === this.tail) this.tail = prev;
    rem.next = null;
    return rem;
  }

  removeAtPos(target) {
    let prev = null, cur = this.head;
    while (cur) {
      if (!cur.isPlayer && cur.pos === target) return this.deleteAfter(prev);
      prev = cur; cur = cur.next;
    }
    return null;
  }

  removeFirstAhead(startPos) {
    let prev = null, cur = this.head;
    while (cur) {
      if (!cur.isPlayer && cur.pos > startPos) return this.deleteAfter(prev);
      prev = cur; cur = cur.next;
    }
    return null;
  }

  advanceAll() {
    this.traverse(node => { if (!node.isPlayer) node.pos -= 1; });
  }

  removeEscaped() {
    let removed = 0;
    let prev = null, cur = this.head;
    while (cur) {
      if (!cur.isPlayer && cur.pos < 0) {
        this.deleteAfter(prev);
        removed++;
        cur = prev ? prev.next : this.head;
      } else { prev = cur; cur = cur.next; }
    }
    return removed;
  }

  toMap() {
    const m = new Map();
    this.traverse(node => { if (node.pos >= 0 && node.pos < COLS && !m.has(node.pos)) m.set(node.pos, node); });
    return m;
  }

  // player helpers
  removePlayerNode() {
    let prev = null, cur = this.head;
    while (cur) { if (cur.isPlayer) return this.deleteAfter(prev); prev = cur; cur = cur.next; }
    return null;
  }
  insertPlayerNodeAt(pos) { this.push(pos, 0, true); }
}

// --------------- Game state ---------------
let lanes = [];
let playerList = null;
let playerLane = PLAYER_START_LANE;
let health = START_HEALTH;
let score = 0;
let running = false;
let tickCount = 0;
let tickInterval = null;

// --------------- DOM ----------------
const board = document.getElementById('game-board');
const healthEl = document.getElementById('health-value');
const scoreEl = document.getElementById('score-value');
const messages = document.getElementById('messages');
const upBtn = document.getElementById('up-btn');
const downBtn = document.getElementById('down-btn');
const shootBtn = document.getElementById('shoot-btn');
const restartBtn = document.getElementById('restart-btn');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScore = document.getElementById('final-score');
const closeGameOver = document.getElementById('close-game-over');

// --------------- Init & start ---------------
function initState() {
  lanes = [];
  for (let i = 0; i < LANES; i++) lanes[i] = new LinkedList();
  playerList = new LinkedList();
  playerList.insertPlayerNodeAt(PLAYER_COL);
  playerLane = PLAYER_START_LANE;
  health = START_HEALTH;
  score = 0;
  running = true;
  tickCount = 0;
  if (gameOverScreen) gameOverScreen.classList.add('hidden');
  messages.innerHTML = '<p>Game started — testing spawns</p>';
  updateUI();
  draw();
  console.clear();
  console.log('Game initialized. Auto-starting ticks.');
}

function startGame() {
  initState();
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(gameTick, TICK_MS);
}

// --------------- Game tick (robust spawn & collisions) ---------------
function gameTick() {
  if (!running) return;
  tickCount++;
  console.log(`tick #${tickCount}`);

  // spawn zombies
  for (let r = 0; r < LANES; r++) {
    const roll = Math.random() * 100;
    if (roll < SPAWN_CHANCE) {
      const power = 1 + Math.floor(Math.random() * 2);
      lanes[r].push(COLS - 1, power, false);
      console.log(`  spawn at lane ${r} (power ${power})`);
    }
  }

  // move zombies
  for (let r = 0; r < LANES; r++) lanes[r].advanceAll();

  // collision robust: any zombie in player lane with pos <= PLAYER_COL && pos >= 0
  let collided = 0;
  let prev = null;
  let cur = lanes[playerLane].head;
  while (cur) {
    if (!cur.isPlayer && cur.pos <= PLAYER_COL && cur.pos >= 0) {
      const rem = lanes[playerLane].deleteAfter(prev);
      if (rem) { health -= rem.power; collided++; console.log(`  collision: -${rem.power} HP`); }
      cur = prev ? prev.next : lanes[playerLane].head;
      continue;
    }
    prev = cur;
    cur = cur.next;
  }
  if (collided > 0) {
    messages.textContent = `⚠️ ${collided} hit(s) the car!`;
    setTimeout(() => { if (messages.textContent) messages.textContent = ''; }, 700);
  }

  // escaped zombies
  let totalEscaped = 0;
  for (let r = 0; r < LANES; r++) {
    const removed = lanes[r].removeEscaped();
    if (removed > 0) {
      totalEscaped += removed;
      health -= removed;
      console.log(`  escaped from lane ${r}: ${removed}`);
    }
  }
  if (totalEscaped > 0) {
    messages.textContent = `🧟 ${totalEscaped} crossed the line!`;
    setTimeout(() => { if (messages.textContent) messages.textContent = ''; }, 900);
  }

  draw();
  updateUI();

  if (health <= 0) {
    endGame();
  }
}

// --------------- Actions ---------------
function shoot() {
  if (!running) return;
  const rem = lanes[playerLane].removeFirstAhead(PLAYER_COL);
  if (rem) { score++; messages.textContent = '🔫 Shot!'; console.log('shot removed'); }
  else { messages.textContent = 'Miss!'; }
  setTimeout(() => { if (messages.textContent) messages.textContent = ''; }, 500);
  draw(); updateUI();
}

function movePlayerTo(newLane) {
  if (!running) return;
  if (newLane < 0 || newLane >= LANES) return;
  playerList.removePlayerNode();
  playerList.insertPlayerNodeAt(PLAYER_COL);
  playerLane = newLane;
  draw();
}

// --------------- Render & UI ---------------
function draw() {
  if (!board) return;
  board.innerHTML = '';
  for (let r = 0; r < LANES; r++) {
    const map = lanes[r].toMap();
    for (let c = 0; c < COLS; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      // player render
      let showPlayer = false;
      playerList.traverse(node => { if (node.isPlayer && node.pos === PLAYER_COL && r === playerLane) showPlayer = true; });
      if (showPlayer && c === PLAYER_COL) {
        div.classList.add('player'); div.textContent = '🚗';
      } else if (map.has(c)) {
        div.classList.add('zombie'); div.textContent = 'Z';
        // power badge
        const badge = document.createElement('span');
        badge.textContent = map.get(c).power || '';
        badge.style.position = 'absolute'; badge.style.top = '4px'; badge.style.right = '6px';
        badge.style.fontSize = '11px'; badge.style.opacity = '0.95'; badge.style.color = '#fff';
        div.appendChild(badge);
      } else { div.textContent = ''; }
      board.appendChild(div);
    }
  }
}

function updateUI() {
  if (healthEl) healthEl.textContent = Math.max(0, health);
  if (scoreEl) scoreEl.textContent = score;
}

function endGame() {
  running = false;
  if (tickInterval) clearInterval(tickInterval);
  if (finalScore) finalScore.textContent = `Final Score: ${score}`;
  if (gameOverScreen) gameOverScreen.classList.remove('hidden');
  console.log('Game Over');
}

// --------------- Controls ---------------
document.addEventListener('keydown', (e) => {
  if (!running && e.code === 'Enter') { startGame(); e.preventDefault(); return; }
  if (!running) return;
  if (e.code === 'ArrowUp') { movePlayerTo(playerLane - 1); e.preventDefault(); }
  else if (e.code === 'ArrowDown') { movePlayerTo(playerLane + 1); e.preventDefault(); }
  else if (e.code === 'Space') { shoot(); e.preventDefault(); }
});

if (upBtn) upBtn.addEventListener('click', () => movePlayerTo(playerLane - 1));
if (downBtn) downBtn.addEventListener('click', () => movePlayerTo(playerLane + 1));
if (shootBtn) shootBtn.addEventListener('click', shoot);
if (restartBtn) restartBtn.addEventListener('click', startGame);
if (closeGameOver) closeGameOver.addEventListener('click', () => gameOverScreen.classList.add('hidden'));

// --------------- Auto-start for testing ---------------
startGame();