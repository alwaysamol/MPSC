/* =====================================================================
   ZONE ROYALE — an original top-down battle royale game
   Pure JavaScript + HTML5 Canvas, no dependencies.
   ===================================================================== */

"use strict";

/* ---------------------------- Config ---------------------------- */

const MAP_SIZE = 3200;
const TOTAL_PLAYERS = 24;
const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 230;
const BOT_SPEED = 205;
const PICKUP_RADIUS = 30;

const WEAPONS = {
  fists:   { name: "Fists",   tier: 0, dmg: 12, rof: 0.45, range: 42,   melee: true },
  pistol:  { name: "Pistol",  tier: 1, dmg: 16, rof: 0.30, mag: 15, reload: 1.2, spread: 0.05, speed: 900,  range: 700,  pellets: 1 },
  shotgun: { name: "Shotgun", tier: 2, dmg: 9,  rof: 0.95, mag: 5,  reload: 2.2, spread: 0.16, speed: 800,  range: 420,  pellets: 7 },
  smg:     { name: "SMG",     tier: 2, dmg: 12, rof: 0.09, mag: 30, reload: 1.7, spread: 0.09, speed: 950,  range: 750,  pellets: 1 },
  rifle:   { name: "Rifle",   tier: 3, dmg: 24, rof: 0.14, mag: 30, reload: 2.0, spread: 0.045, speed: 1100, range: 1100, pellets: 1 },
  sniper:  { name: "Sniper",  tier: 4, dmg: 72, rof: 1.60, mag: 5,  reload: 2.6, spread: 0.006, speed: 1600, range: 1800, pellets: 1 },
};

const VEST_REDUCTION = [0, 0.30, 0.40, 0.50]; // by vest level

const ZONE_PHASES = [
  { wait: 18, shrink: 22, dps: 1,  mult: 0.62 },
  { wait: 14, shrink: 18, dps: 2,  mult: 0.60 },
  { wait: 12, shrink: 15, dps: 4,  mult: 0.55 },
  { wait: 10, shrink: 12, dps: 7,  mult: 0.50 },
  { wait: 8,  shrink: 10, dps: 10, mult: 0.45 },
  { wait: 8,  shrink: 8,  dps: 14, mult: 0.01 },
];

const BOT_NAMES = [
  "Viper", "Ghost", "Recon", "Havoc", "Blitz", "Falcon", "Onyx", "Razor",
  "Titan", "Nomad", "Frost", "Jackal", "Storm", "Zero", "Ranger", "Wolf",
  "Cobra", "Drifter", "Ember", "Rogue", "Hawk", "Bishop", "Slate",
];

/* ---------------------------- Canvas ---------------------------- */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mmCanvas = document.getElementById("minimap");
const mmCtx = mmCanvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

/* ---------------------------- Utilities ---------------------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------------------------- Sound (procedural) ---------------------------- */

const SFX = (() => {
  let ac = null;
  function ensure() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function noiseBurst(duration, freq, vol) {
    try {
      const a = ensure();
      const len = Math.floor(a.sampleRate * duration);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(a.destination);
      src.start();
    } catch (e) { /* audio unavailable */ }
  }
  function tone(freq, duration, vol, type = "sine") {
    try {
      const a = ensure();
      const osc = a.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = a.createGain();
      gain.gain.setValueAtTime(vol, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
      osc.connect(gain).connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + duration);
    } catch (e) { /* audio unavailable */ }
  }
  return {
    unlock: ensure,
    shot: (dist) => { const v = clamp(0.25 * (1 - dist / 1400), 0.02, 0.25); noiseBurst(0.12, 2200, v); },
    shotHeavy: (dist) => { const v = clamp(0.3 * (1 - dist / 1600), 0.02, 0.3); noiseBurst(0.2, 900, v); },
    hit: () => tone(180, 0.08, 0.12, "square"),
    pickup: () => tone(660, 0.09, 0.08, "sine"),
    heal: () => tone(520, 0.25, 0.06, "sine"),
    punch: () => noiseBurst(0.06, 500, 0.1),
  };
})();

/* ---------------------------- Input ---------------------------- */

const keys = {};
const mouse = { x: 0, y: 0, down: false };

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (game && game.state === "playing") {
    if (e.key === "1") switchWeapon(0);
    if (e.key === "2") switchWeapon(1);
    if (e.key === "3") startHeal("bandage");
    if (e.key === "4") startHeal("medkit");
    if (e.key.toLowerCase() === "r") startReload(game.player);
  }
});
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", () => { mouse.down = true; SFX.unlock(); });
window.addEventListener("mouseup", () => (mouse.down = false));

/* ---------------------------- World generation ---------------------------- */

function makeWorld() {
  const buildings = [];
  const trees = [];
  const rocks = [];
  const patches = [];

  // Towns: clusters of buildings, PUBG-style loot hotspots
  const townCenters = [];
  for (let i = 0; i < 7; i++) {
    townCenters.push({ x: rand(400, MAP_SIZE - 400), y: rand(400, MAP_SIZE - 400) });
  }
  for (const t of townCenters) {
    const count = randInt(3, 6);
    for (let i = 0; i < count; i++) {
      const w = rand(110, 240), h = rand(110, 240);
      const x = clamp(t.x + rand(-320, 320), 60, MAP_SIZE - w - 60);
      const y = clamp(t.y + rand(-320, 320), 60, MAP_SIZE - h - 60);
      const rect = { x, y, w, h };
      if (!buildings.some((b) => rectsOverlap(b, rect, 40))) buildings.push(rect);
    }
  }

  for (let i = 0; i < 70; i++) {
    const p = freePoint(buildings, 30);
    trees.push({ x: p.x, y: p.y, r: rand(16, 26) });
  }
  for (let i = 0; i < 26; i++) {
    const p = freePoint(buildings, 30);
    rocks.push({ x: p.x, y: p.y, r: rand(20, 34) });
  }
  for (let i = 0; i < 240; i++) {
    patches.push({ x: rand(0, MAP_SIZE), y: rand(0, MAP_SIZE), r: rand(30, 90), tone: Math.random() });
  }

  return { buildings, trees, rocks, patches, townCenters };
}

function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

function freePoint(buildings, margin) {
  for (let tries = 0; tries < 60; tries++) {
    const x = rand(80, MAP_SIZE - 80);
    const y = rand(80, MAP_SIZE - 80);
    const inside = buildings.some((b) => x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin);
    if (!inside) return { x, y };
  }
  return { x: rand(80, MAP_SIZE - 80), y: rand(80, MAP_SIZE - 80) };
}

/* ---------------------------- Loot ---------------------------- */

const LOOT_COLORS = {
  weapon: "#f2a900",
  ammo: "#c9c9c9",
  bandage: "#57c84d",
  medkit: "#ff5c5c",
  vest: "#4aa8ff",
};

function spawnLoot(world) {
  const loot = [];
  const gunKeys = ["pistol", "pistol", "shotgun", "smg", "smg", "rifle", "rifle", "sniper"];

  const add = (x, y, type, data) => loot.push({ x, y, type, data, id: loot.length + Math.random() });

  // Dense loot in/near buildings
  for (const b of world.buildings) {
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const x = rand(b.x + 25, b.x + b.w - 25);
      const y = rand(b.y + 25, b.y + b.h - 25);
      const roll = Math.random();
      if (roll < 0.42) add(x, y, "weapon", pick(gunKeys));
      else if (roll < 0.6) add(x, y, "ammo", 40);
      else if (roll < 0.78) add(x, y, "bandage", 1);
      else if (roll < 0.9) add(x, y, "vest", randInt(1, 3));
      else add(x, y, "medkit", 1);
    }
  }
  // Scattered field loot
  for (let i = 0; i < 55; i++) {
    const p = freePoint(world.buildings, 20);
    const roll = Math.random();
    if (roll < 0.35) add(p.x, p.y, "weapon", pick(gunKeys));
    else if (roll < 0.6) add(p.x, p.y, "ammo", 30);
    else if (roll < 0.85) add(p.x, p.y, "bandage", 1);
    else add(p.x, p.y, "vest", randInt(1, 2));
  }
  return loot;
}

/* ---------------------------- Entities ---------------------------- */

function makeWeaponInstance(key) {
  const w = WEAPONS[key];
  if (w.melee) return { key, mag: Infinity, reserve: Infinity };
  return { key, mag: w.mag, reserve: w.mag * 2 };
}

function makeCharacter(name, isBot, world) {
  const p = freePoint(world.buildings, 40);
  return {
    name, isBot,
    x: p.x, y: p.y,
    hp: 100, maxHp: 100,
    vest: 0,
    angle: 0,
    weapons: [makeWeaponInstance("fists"), null],
    slot: 0,
    bandages: 0, medkits: 0,
    fireCooldown: 0,
    reloading: 0,
    healing: null, // { type, t, total }
    alive: true,
    kills: 0,
    hitFlash: 0,
    // bot brain
    ai: isBot ? {
      state: "loot",
      target: null,
      wanderAngle: rand(0, Math.PI * 2),
      wanderTimer: 0,
      reactTimer: 0,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      strafeTimer: 0,
    } : null,
  };
}

function currentWeapon(ch) {
  const inst = ch.weapons[ch.slot] || ch.weapons[0];
  return { inst, def: WEAPONS[inst.key] };
}

/* ---------------------------- Game state ---------------------------- */

let game = null;

function newGame() {
  const world = makeWorld();
  const player = makeCharacter("You", false, world);
  const bots = [];
  const usedNames = new Set();
  for (let i = 0; i < TOTAL_PLAYERS - 1; i++) {
    let n = pick(BOT_NAMES);
    while (usedNames.has(n)) n = pick(BOT_NAMES) + randInt(2, 99);
    usedNames.add(n);
    bots.push(makeCharacter(n, true, world));
  }

  game = {
    state: "playing",
    world,
    loot: spawnLoot(world),
    player,
    bots,
    bullets: [],
    particles: [],
    feed: [],
    zone: {
      cx: MAP_SIZE / 2, cy: MAP_SIZE / 2, r: MAP_SIZE * 0.62,
      tx: MAP_SIZE / 2, ty: MAP_SIZE / 2, tr: MAP_SIZE * 0.62,
      phase: -1, timer: 6, shrinking: false, dps: 0,
    },
    camera: { x: player.x, y: player.y },
    time: 0,
    zoneTick: 0,
    over: false,
  };
  scheduleNextZone();
}

function scheduleNextZone() {
  const z = game.zone;
  z.phase++;
  const ph = ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)];
  z.dps = ph.dps;
  z.timer = ph.wait;
  z.shrinking = false;
  // choose next circle inside the current one
  const newR = z.r * ph.mult;
  const maxOff = Math.max(0, z.r - newR);
  const a = rand(0, Math.PI * 2);
  const d = rand(0, maxOff * 0.85);
  z.tx = clamp(z.cx + Math.cos(a) * d, newR, MAP_SIZE - newR);
  z.ty = clamp(z.cy + Math.sin(a) * d, newR, MAP_SIZE - newR);
  z.tr = newR;
  z.shrinkFrom = { cx: z.cx, cy: z.cy, r: z.r };
  z.shrinkDur = ph.shrink;
}

/* ---------------------------- Collision & LOS ---------------------------- */

function collideWorld(ch) {
  // buildings (solid rects)
  for (const b of game.world.buildings) {
    const nx = clamp(ch.x, b.x, b.x + b.w);
    const ny = clamp(ch.y, b.y, b.y + b.h);
    const dx = ch.x - nx, dy = ch.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < PLAYER_RADIUS * PLAYER_RADIUS) {
      if (d2 === 0) { ch.x = b.x - PLAYER_RADIUS; continue; }
      const d = Math.sqrt(d2);
      ch.x = nx + (dx / d) * PLAYER_RADIUS;
      ch.y = ny + (dy / d) * PLAYER_RADIUS;
    }
  }
  // rocks & trees (circles)
  for (const list of [game.world.rocks, game.world.trees]) {
    for (const o of list) {
      const dx = ch.x - o.x, dy = ch.y - o.y;
      const min = PLAYER_RADIUS + o.r * 0.6;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0) {
        const d = Math.sqrt(d2);
        ch.x = o.x + (dx / d) * min;
        ch.y = o.y + (dy / d) * min;
      }
    }
  }
  ch.x = clamp(ch.x, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
  ch.y = clamp(ch.y, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
}

function pointBlocked(x, y) {
  for (const b of game.world.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  for (const o of game.world.rocks) {
    if (dist2(x, y, o.x, o.y) < o.r * o.r) return true;
  }
  return false;
}

function hasLineOfSight(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by);
  const steps = Math.ceil(d / 24);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointBlocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/* ---------------------------- Shooting ---------------------------- */

function tryFire(ch) {
  const { inst, def } = currentWeapon(ch);
  if (ch.fireCooldown > 0 || ch.reloading > 0 || ch.healing) return;

  if (def.melee) {
    ch.fireCooldown = def.rof;
    SFX.punch();
    // melee hit check
    const px = ch.x + Math.cos(ch.angle) * def.range;
    const py = ch.y + Math.sin(ch.angle) * def.range;
    for (const other of allAlive()) {
      if (other === ch) continue;
      if (dist2(px, py, other.x, other.y) < (PLAYER_RADIUS + 16) ** 2) {
        damage(other, def.dmg, ch);
        break;
      }
    }
    return;
  }

  if (inst.mag <= 0) { startReload(ch); return; }

  ch.fireCooldown = def.rof;
  inst.mag--;

  for (let i = 0; i < def.pellets; i++) {
    const a = ch.angle + rand(-def.spread, def.spread);
    game.bullets.push({
      x: ch.x + Math.cos(a) * (PLAYER_RADIUS + 8),
      y: ch.y + Math.sin(a) * (PLAYER_RADIUS + 8),
      vx: Math.cos(a) * def.speed,
      vy: Math.sin(a) * def.speed,
      dmg: def.dmg,
      owner: ch,
      travelled: 0,
      range: def.range,
    });
  }

  const dToPlayer = ch.isBot ? dist(ch.x, ch.y, game.player.x, game.player.y) : 0;
  if (def.tier >= 3) SFX.shotHeavy(dToPlayer); else SFX.shot(dToPlayer);

  // muzzle flash particle
  game.particles.push({
    x: ch.x + Math.cos(ch.angle) * (PLAYER_RADIUS + 10),
    y: ch.y + Math.sin(ch.angle) * (PLAYER_RADIUS + 10),
    life: 0.05, maxLife: 0.05, type: "flash",
  });
}

function startReload(ch) {
  const { inst, def } = currentWeapon(ch);
  if (def.melee || ch.reloading > 0 || inst.mag >= def.mag || inst.reserve <= 0) return;
  ch.reloading = def.reload;
}

function finishReload(ch) {
  const { inst, def } = currentWeapon(ch);
  if (def.melee) return;
  const need = def.mag - inst.mag;
  const take = Math.min(need, inst.reserve);
  inst.mag += take;
  inst.reserve -= take;
}

function damage(target, amount, attacker) {
  if (!target.alive) return;
  const reduced = amount * (1 - VEST_REDUCTION[target.vest]);
  target.hp -= reduced;
  target.hitFlash = 0.12;
  target.healing = null; // interrupt healing
  if (target === game.player) SFX.hit();
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    if (attacker && attacker.alive) attacker.kills++;
    dropDeathLoot(target);
    addFeed(attacker ? attacker.name : "The Zone", target.name, attacker === game.player);
    checkGameOver(target);
  }
}

function dropDeathLoot(ch) {
  for (const w of ch.weapons) {
    if (w && w.key !== "fists") {
      game.loot.push({ x: ch.x + rand(-18, 18), y: ch.y + rand(-18, 18), type: "weapon", data: w.key, id: Math.random() });
    }
  }
  if (ch.bandages > 0) game.loot.push({ x: ch.x + rand(-22, 22), y: ch.y + rand(-22, 22), type: "bandage", data: ch.bandages, id: Math.random() });
  if (ch.medkits > 0) game.loot.push({ x: ch.x + rand(-22, 22), y: ch.y + rand(-22, 22), type: "medkit", data: ch.medkits, id: Math.random() });
}

/* ---------------------------- Healing & pickups ---------------------------- */

function startHeal(type) {
  const p = game.player;
  if (p.healing || !p.alive) return;
  if (type === "bandage" && p.bandages > 0 && p.hp < p.maxHp) {
    p.healing = { type, t: 0, total: 2.0 };
  } else if (type === "medkit" && p.medkits > 0 && p.hp < p.maxHp) {
    p.healing = { type, t: 0, total: 4.0 };
  }
}

function applyHeal(ch) {
  const h = ch.healing;
  ch.healing = null;
  if (h.type === "bandage") { ch.bandages--; ch.hp = Math.min(ch.maxHp, ch.hp + 30); }
  else { ch.medkits--; ch.hp = ch.maxHp; }
  if (ch === game.player) SFX.heal();
}

function switchWeapon(slot) {
  const p = game.player;
  if (p.weapons[slot] && p.slot !== slot) {
    p.slot = slot;
    p.reloading = 0;
  }
}

function tryPickup(ch) {
  for (let i = game.loot.length - 1; i >= 0; i--) {
    const item = game.loot[i];
    if (dist2(ch.x, ch.y, item.x, item.y) > PICKUP_RADIUS * PICKUP_RADIUS) continue;

    let taken = false;
    if (item.type === "weapon") {
      taken = pickupWeapon(ch, item.data);
    } else if (item.type === "ammo") {
      const { inst, def } = currentWeapon(ch);
      if (!def.melee) { inst.reserve += item.data; taken = true; }
      else {
        // give to other slot if it holds a gun
        const other = ch.weapons.find((w) => w && !WEAPONS[w.key].melee);
        if (other) { other.reserve += item.data; taken = true; }
      }
    } else if (item.type === "bandage") {
      if (ch.bandages < 8) { ch.bandages = Math.min(8, ch.bandages + item.data); taken = true; }
    } else if (item.type === "medkit") {
      if (ch.medkits < 3) { ch.medkits = Math.min(3, ch.medkits + item.data); taken = true; }
    } else if (item.type === "vest") {
      if (item.data > ch.vest) { ch.vest = item.data; taken = true; }
    }

    if (taken) {
      game.loot.splice(i, 1);
      if (ch === game.player) SFX.pickup();
    }
  }
}

function pickupWeapon(ch, key) {
  const tier = WEAPONS[key].tier;
  // fill fists slot 0 first
  if (ch.weapons[0].key === "fists") { ch.weapons[0] = makeWeaponInstance(key); ch.slot = 0; return true; }
  if (!ch.weapons[1]) { ch.weapons[1] = makeWeaponInstance(key); return true; }
  // both slots full: replace current if new is strictly better
  const cur = ch.weapons[ch.slot];
  if (tier > WEAPONS[cur.key].tier) {
    game.loot.push({ x: ch.x, y: ch.y, type: "weapon", data: cur.key, id: Math.random() });
    ch.weapons[ch.slot] = makeWeaponInstance(key);
    return true;
  }
  return false;
}

/* ---------------------------- Bot AI ---------------------------- */

function updateBot(bot, dt) {
  const ai = bot.ai;
  const z = game.zone;
  ai.wanderTimer -= dt;
  ai.strafeTimer -= dt;
  if (ai.strafeTimer <= 0) { ai.strafeDir *= -1; ai.strafeTimer = rand(0.8, 2.0); }

  // find nearest visible enemy
  let enemy = null, enemyD2 = Infinity;
  for (const other of allAlive()) {
    if (other === bot) continue;
    const d2 = dist2(bot.x, bot.y, other.x, other.y);
    if (d2 < enemyD2 && d2 < 620 ** 2 && hasLineOfSight(bot.x, bot.y, other.x, other.y)) {
      enemy = other; enemyD2 = d2;
    }
  }

  const outsideZone = dist(bot.x, bot.y, z.cx, z.cy) > z.r - 60;
  const { def } = currentWeapon(bot);
  const hasGun = !def.melee;

  // decide state
  if (outsideZone) ai.state = "zone";
  else if (enemy && (hasGun || enemyD2 < 220 ** 2)) ai.state = "attack";
  else if (bot.hp < 45 && (bot.bandages > 0 || bot.medkits > 0)) ai.state = "heal";
  else ai.state = "loot";

  let mx = 0, my = 0;

  if (ai.state === "zone") {
    const a = Math.atan2(z.cy - bot.y, z.cx - bot.x);
    mx = Math.cos(a); my = Math.sin(a);
    bot.angle = a;
    // still shoot back if enemy is close
    if (enemy && enemyD2 < 350 ** 2 && hasGun) {
      aimAndFire(bot, enemy, dt);
    }
  } else if (ai.state === "attack" && enemy) {
    const d = Math.sqrt(enemyD2);
    aimAndFire(bot, enemy, dt);
    const ideal = hasGun ? clamp(def.range * 0.55, 180, 420) : 20;
    const a = Math.atan2(enemy.y - bot.y, enemy.x - bot.x);
    if (d > ideal + 40) { mx = Math.cos(a); my = Math.sin(a); }
    else if (d < ideal - 60) { mx = -Math.cos(a); my = -Math.sin(a); }
    // strafe
    mx += Math.cos(a + Math.PI / 2) * ai.strafeDir * 0.8;
    my += Math.sin(a + Math.PI / 2) * ai.strafeDir * 0.8;
  } else if (ai.state === "heal") {
    if (!bot.healing) {
      bot.healing = { type: bot.medkits > 0 && bot.hp < 40 ? "medkit" : "bandage", t: 0, total: 2.2 };
      if (bot.healing.type === "bandage" && bot.bandages <= 0) bot.healing.type = "medkit";
    }
  } else {
    // loot / wander
    if (!ai.target || !game.loot.includes(ai.target)) {
      // want a gun first, then vest/heals
      let best = null, bestScore = -Infinity;
      for (const item of game.loot) {
        const d = dist(bot.x, bot.y, item.x, item.y);
        if (d > 900) continue;
        // skip loot outside the target zone
        if (dist(item.x, item.y, z.tx, z.ty) > z.tr + 200) continue;
        let want = 0;
        if (item.type === "weapon") want = hasGun ? WEAPONS[item.data].tier - WEAPONS[currentWeapon(bot).inst.key].tier : 10;
        else if (item.type === "vest") want = item.data > bot.vest ? 4 : -1;
        else if (item.type === "medkit") want = bot.medkits < 2 ? 3 : -1;
        else if (item.type === "bandage") want = bot.bandages < 4 ? 2 : -1;
        else if (item.type === "ammo") want = hasGun ? 2 : -1;
        if (want <= 0) continue;
        const score = want * 200 - d;
        if (score > bestScore) { bestScore = score; best = item; }
      }
      ai.target = best;
    }
    if (ai.target) {
      const a = Math.atan2(ai.target.y - bot.y, ai.target.x - bot.x);
      mx = Math.cos(a); my = Math.sin(a);
      bot.angle = a;
    } else {
      // wander toward zone-ish
      if (ai.wanderTimer <= 0) {
        const toCenter = Math.atan2(z.ty - bot.y, z.tx - bot.x);
        ai.wanderAngle = toCenter + rand(-1.4, 1.4);
        ai.wanderTimer = rand(1.5, 3.5);
      }
      mx = Math.cos(ai.wanderAngle); my = Math.sin(ai.wanderAngle);
      bot.angle = ai.wanderAngle;
    }
  }

  // move
  if (!bot.healing) {
    const len = Math.hypot(mx, my);
    if (len > 0) {
      bot.x += (mx / len) * BOT_SPEED * dt;
      bot.y += (my / len) * BOT_SPEED * dt;
    }
  }
  collideWorld(bot);
  tryPickup(bot);
}

function aimAndFire(bot, enemy, dt) {
  const { def } = currentWeapon(bot);
  // lead + aim error
  const err = rand(-0.09, 0.09);
  bot.angle = Math.atan2(enemy.y - bot.y, enemy.x - bot.x) + err;
  const d = dist(bot.x, bot.y, enemy.x, enemy.y);
  if (def.melee) {
    if (d < def.range + PLAYER_RADIUS) tryFire(bot);
    return;
  }
  if (d < def.range * 0.95) {
    // bots pause fire in bursts
    bot.ai.reactTimer -= dt;
    if (bot.ai.reactTimer <= 0) {
      tryFire(bot);
      if (Math.random() < 0.12) bot.ai.reactTimer = rand(0.5, 1.1); // tactical pause
    }
    // auto reload with infinite reserve for bots (keeps fights going)
    const inst = currentWeapon(bot).inst;
    if (inst.mag <= 0 && bot.reloading <= 0) { inst.reserve = Math.max(inst.reserve, def.mag); startReload(bot); }
  }
}

/* ---------------------------- Game over / feed ---------------------------- */

function allAlive() {
  const out = [];
  if (game.player.alive) out.push(game.player);
  for (const b of game.bots) if (b.alive) out.push(b);
  return out;
}

function addFeed(killer, victim, isMe) {
  game.feed.push({ killer, victim, t: 6, isMe });
  if (game.feed.length > 6) game.feed.shift();
  renderFeed();
}

function renderFeed() {
  const el = document.getElementById("killfeed");
  el.innerHTML = "";
  for (const f of game.feed) {
    const div = document.createElement("div");
    div.className = "feed-entry" + (f.isMe ? " me" : "");
    div.innerHTML = `<span class="killer">${f.killer}</span> ☠ <span class="victim">${f.victim}</span>`;
    el.appendChild(div);
  }
}

function checkGameOver(justDied) {
  const alive = allAlive();
  if (!game.player.alive && !game.over) {
    game.over = true;
    setTimeout(() => showEnd(false, alive.length + 1), 900);
  } else if (alive.length === 1 && alive[0] === game.player && !game.over) {
    game.over = true;
    setTimeout(() => showEnd(true, 1), 900);
  }
}

function showEnd(won, placement) {
  game.state = "over";
  const end = document.getElementById("end-screen");
  const title = document.getElementById("end-title");
  const sub = document.getElementById("end-sub");
  const stats = document.getElementById("end-stats");
  end.classList.remove("hidden", "lost");
  if (won) {
    title.textContent = "#1 SURVIVOR!";
    sub.textContent = "You outlasted the battlegrounds. Dinner is served.";
  } else {
    end.classList.add("lost");
    title.textContent = `#${placement} OF ${TOTAL_PLAYERS}`;
    sub.textContent = "Better luck next drop.";
  }
  stats.innerHTML = `
    <div class="stat"><div class="num">${game.player.kills}</div><div class="lbl">KILLS</div></div>
    <div class="stat"><div class="num">${Math.floor(game.time)}s</div><div class="lbl">SURVIVED</div></div>
    <div class="stat"><div class="num">#${placement}</div><div class="lbl">PLACEMENT</div></div>`;
}

/* ---------------------------- Update ---------------------------- */

function update(dt) {
  game.time += dt;
  const p = game.player;
  const z = game.zone;

  /* --- zone --- */
  if (!z.shrinking) {
    z.timer -= dt;
    if (z.timer <= 0) { z.shrinking = true; z.timer = z.shrinkDur; }
  } else {
    z.timer -= dt;
    const t = clamp(1 - z.timer / z.shrinkDur, 0, 1);
    z.cx = z.shrinkFrom.cx + (z.tx - z.shrinkFrom.cx) * t;
    z.cy = z.shrinkFrom.cy + (z.ty - z.shrinkFrom.cy) * t;
    z.r = z.shrinkFrom.r + (z.tr - z.shrinkFrom.r) * t;
    if (z.timer <= 0) scheduleNextZone();
  }

  // zone damage (ticks once per second)
  game.zoneTick -= dt;
  if (game.zoneTick <= 0) {
    game.zoneTick = 1;
    for (const ch of allAlive()) {
      if (dist(ch.x, ch.y, z.cx, z.cy) > z.r) damage(ch, z.dps, null);
    }
  }

  /* --- player --- */
  if (p.alive) {
    let mx = 0, my = 0;
    if (keys["w"] || keys["arrowup"]) my -= 1;
    if (keys["s"] || keys["arrowdown"]) my += 1;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    const len = Math.hypot(mx, my);
    const speedMul = p.healing ? 0.45 : 1;
    if (len > 0) {
      p.x += (mx / len) * PLAYER_SPEED * speedMul * dt;
      p.y += (my / len) * PLAYER_SPEED * speedMul * dt;
    }
    collideWorld(p);

    p.angle = Math.atan2(
      mouse.y - canvas.height / 2,
      mouse.x - canvas.width / 2
    );

    if (mouse.down) tryFire(p);
    tryPickup(p);
  }

  /* --- shared character updates --- */
  for (const ch of [p, ...game.bots]) {
    if (!ch.alive) continue;
    ch.fireCooldown = Math.max(0, ch.fireCooldown - dt);
    ch.hitFlash = Math.max(0, ch.hitFlash - dt);
    if (ch.reloading > 0) {
      ch.reloading -= dt;
      if (ch.reloading <= 0) { ch.reloading = 0; finishReload(ch); }
    }
    if (ch.healing) {
      ch.healing.t += dt;
      if (ch.healing.t >= ch.healing.total) applyHeal(ch);
    }
  }

  /* --- bots --- */
  for (const bot of game.bots) {
    if (bot.alive) updateBot(bot, dt);
  }

  /* --- bullets --- */
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    const step = Math.hypot(b.vx, b.vy) * dt;
    const substeps = Math.ceil(step / 12);
    let dead = false;
    for (let s = 0; s < substeps && !dead; s++) {
      b.x += (b.vx * dt) / substeps;
      b.y += (b.vy * dt) / substeps;
      b.travelled += step / substeps;
      if (b.travelled > b.range || b.x < 0 || b.y < 0 || b.x > MAP_SIZE || b.y > MAP_SIZE) { dead = true; break; }
      if (pointBlocked(b.x, b.y)) {
        dead = true;
        game.particles.push({ x: b.x, y: b.y, life: 0.15, maxLife: 0.15, type: "spark" });
        break;
      }
      for (const ch of allAlive()) {
        if (ch === b.owner) continue;
        if (dist2(b.x, b.y, ch.x, ch.y) < PLAYER_RADIUS * PLAYER_RADIUS) {
          damage(ch, b.dmg, b.owner);
          game.particles.push({ x: b.x, y: b.y, life: 0.2, maxLife: 0.2, type: "blood" });
          dead = true;
          break;
        }
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }

  /* --- particles / feed timers --- */
  for (let i = game.particles.length - 1; i >= 0; i--) {
    game.particles[i].life -= dt;
    if (game.particles[i].life <= 0) game.particles.splice(i, 1);
  }
  let feedChanged = false;
  for (let i = game.feed.length - 1; i >= 0; i--) {
    game.feed[i].t -= dt;
    if (game.feed[i].t <= 0) { game.feed.splice(i, 1); feedChanged = true; }
  }
  if (feedChanged) renderFeed();

  /* --- camera --- */
  const target = p.alive ? p : (allAlive()[0] || p);
  game.camera.x += (target.x - game.camera.x) * Math.min(1, dt * 6);
  game.camera.y += (target.y - game.camera.y) * Math.min(1, dt * 6);
}

/* ---------------------------- Rendering ---------------------------- */

function worldToScreen(x, y) {
  return {
    x: x - game.camera.x + canvas.width / 2,
    y: y - game.camera.y + canvas.height / 2,
  };
}

function render() {
  const W = canvas.width, H = canvas.height;
  const cam = game.camera;
  const ox = cam.x - W / 2, oy = cam.y - H / 2;

  // ground
  ctx.fillStyle = "#4a6b41";
  ctx.fillRect(0, 0, W, H);

  // out-of-map darkness
  ctx.fillStyle = "#22301f";
  if (ox < 0) ctx.fillRect(0, 0, -ox, H);
  if (oy < 0) ctx.fillRect(0, 0, W, -oy);
  if (ox + W > MAP_SIZE) ctx.fillRect(MAP_SIZE - ox, 0, W - (MAP_SIZE - ox), H);
  if (oy + H > MAP_SIZE) ctx.fillRect(0, MAP_SIZE - oy, W, H - (MAP_SIZE - oy));

  // grass patches
  for (const g of game.world.patches) {
    if (g.x + g.r < ox || g.x - g.r > ox + W || g.y + g.r < oy || g.y - g.r > oy + H) continue;
    ctx.fillStyle = g.tone < 0.5 ? "rgba(58,90,50,0.5)" : "rgba(90,120,70,0.4)";
    ctx.beginPath();
    ctx.ellipse(g.x - ox, g.y - oy, g.r, g.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // grid (subtle)
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  ctx.lineWidth = 1;
  const grid = 200;
  for (let gx = Math.floor(ox / grid) * grid; gx < ox + W; gx += grid) {
    ctx.beginPath(); ctx.moveTo(gx - ox, 0); ctx.lineTo(gx - ox, H); ctx.stroke();
  }
  for (let gy = Math.floor(oy / grid) * grid; gy < oy + H; gy += grid) {
    ctx.beginPath(); ctx.moveTo(0, gy - oy); ctx.lineTo(W, gy - oy); ctx.stroke();
  }

  // loot
  for (const item of game.loot) {
    const s = worldToScreen(item.x, item.y);
    if (s.x < -30 || s.x > W + 30 || s.y < -30 || s.y > H + 30) continue;
    const pulse = 1 + Math.sin(game.time * 4 + item.id * 10) * 0.12;
    ctx.save();
    ctx.shadowColor = LOOT_COLORS[item.type];
    ctx.shadowBlur = 12;
    ctx.fillStyle = LOOT_COLORS[item.type];
    if (item.type === "weapon") {
      ctx.translate(s.x, s.y);
      ctx.rotate(0.6);
      ctx.fillRect(-11 * pulse, -4 * pulse, 22 * pulse, 8 * pulse);
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // label under weapons
    if (item.type === "weapon") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(WEAPONS[item.data].name, s.x, s.y + 20);
    }
  }

  // rocks
  for (const o of game.world.rocks) {
    const s = worldToScreen(o.x, o.y);
    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) continue;
    ctx.fillStyle = "#7a7d78";
    ctx.beginPath(); ctx.arc(s.x, s.y, o.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8d918b";
    ctx.beginPath(); ctx.arc(s.x - o.r * 0.25, s.y - o.r * 0.25, o.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  // buildings
  for (const b of game.world.buildings) {
    const s = worldToScreen(b.x, b.y);
    if (s.x + b.w < 0 || s.x > W || s.y + b.h < 0 || s.y > H) continue;
    ctx.fillStyle = "#5c5650";
    ctx.fillRect(s.x + 5, s.y + 6, b.w, b.h); // shadow
    ctx.fillStyle = "#8a8078";
    ctx.fillRect(s.x, s.y, b.w, b.h);
    ctx.fillStyle = "#9c938a";
    ctx.fillRect(s.x + 8, s.y + 8, b.w - 16, b.h - 16);
    ctx.strokeStyle = "#4c453f";
    ctx.lineWidth = 3;
    ctx.strokeRect(s.x, s.y, b.w, b.h);
  }

  // bullets (tracers)
  ctx.strokeStyle = "#ffe08a";
  ctx.lineWidth = 2;
  for (const b of game.bullets) {
    const s = worldToScreen(b.x, b.y);
    const tl = 14;
    const d = Math.hypot(b.vx, b.vy);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - (b.vx / d) * tl, s.y - (b.vy / d) * tl);
    ctx.stroke();
  }

  // characters
  for (const ch of [game.player, ...game.bots]) {
    if (!ch.alive) continue;
    const s = worldToScreen(ch.x, ch.y);
    if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) continue;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(s.x + 3, s.y + 5, PLAYER_RADIUS, PLAYER_RADIUS * 0.7, 0, 0, Math.PI * 2); ctx.fill();

    // gun barrel
    const { def } = currentWeapon(ch);
    if (!def.melee) {
      ctx.strokeStyle = "#2b2b2b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(ch.angle) * 6, s.y + Math.sin(ch.angle) * 6);
      ctx.lineTo(s.x + Math.cos(ch.angle) * (PLAYER_RADIUS + 12), s.y + Math.sin(ch.angle) * (PLAYER_RADIUS + 12));
      ctx.stroke();
    }

    // body
    const isP = ch === game.player;
    ctx.fillStyle = ch.hitFlash > 0 ? "#ff6b6b" : isP ? "#e8c88f" : "#c96a5b";
    ctx.beginPath(); ctx.arc(s.x, s.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isP ? "#f2a900" : "#5a2c25";
    ctx.lineWidth = 3;
    ctx.stroke();

    // vest ring
    if (ch.vest > 0) {
      ctx.strokeStyle = `rgba(74,168,255,${0.35 + ch.vest * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, PLAYER_RADIUS + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // arms/hands direction dot
    ctx.fillStyle = "#d8b077";
    ctx.beginPath();
    ctx.arc(s.x + Math.cos(ch.angle) * (PLAYER_RADIUS - 3), s.y + Math.sin(ch.angle) * (PLAYER_RADIUS - 3), 5, 0, Math.PI * 2);
    ctx.fill();

    // name + health bar for bots
    if (!isP) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ch.name, s.x, s.y - PLAYER_RADIUS - 14);
      const bw = 34;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(s.x - bw / 2, s.y - PLAYER_RADIUS - 10, bw, 4);
      ctx.fillStyle = ch.hp > 50 ? "#7CFC00" : ch.hp > 25 ? "#ffd76a" : "#ff5c5c";
      ctx.fillRect(s.x - bw / 2, s.y - PLAYER_RADIUS - 10, bw * (ch.hp / ch.maxHp), 4);
    }

    // healing indicator
    if (ch.healing) {
      ctx.fillStyle = "#57c84d";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+", s.x, s.y - PLAYER_RADIUS - (isP ? 8 : 24));
    }
  }

  // trees on top (canopy)
  for (const t of game.world.trees) {
    const s = worldToScreen(t.x, t.y);
    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) continue;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.arc(s.x + 4, s.y + 6, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f4d28";
    ctx.beginPath(); ctx.arc(s.x, s.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3c6132";
    ctx.beginPath(); ctx.arc(s.x - t.r * 0.2, s.y - t.r * 0.2, t.r * 0.65, 0, Math.PI * 2); ctx.fill();
  }

  // particles
  for (const pt of game.particles) {
    const s = worldToScreen(pt.x, pt.y);
    const a = pt.life / pt.maxLife;
    if (pt.type === "flash") {
      ctx.fillStyle = `rgba(255,220,120,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
    } else if (pt.type === "spark") {
      ctx.fillStyle = `rgba(200,200,180,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
    } else if (pt.type === "blood") {
      ctx.fillStyle = `rgba(190,30,20,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* --- zone overlay --- */
  const z = game.zone;
  const zs = worldToScreen(z.cx, z.cy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(zs.x, zs.y, z.r, 0, Math.PI * 2, true);
  ctx.fillStyle = "rgba(45, 110, 220, 0.28)";
  ctx.fill();
  ctx.restore();
  // blue edge
  ctx.strokeStyle = "rgba(80, 150, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(zs.x, zs.y, z.r, 0, Math.PI * 2); ctx.stroke();
  // next zone (white)
  if (!z.shrinking || z.r > z.tr + 5) {
    const ns = worldToScreen(z.tx, z.ty);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(ns.x, ns.y, z.tr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  renderMinimap();
  renderHUD();
}

function renderMinimap() {
  const S = mmCanvas.width;
  const k = S / MAP_SIZE;
  mmCtx.fillStyle = "#33482c";
  mmCtx.fillRect(0, 0, S, S);

  mmCtx.fillStyle = "#6b6259";
  for (const b of game.world.buildings) {
    mmCtx.fillRect(b.x * k, b.y * k, Math.max(2, b.w * k), Math.max(2, b.h * k));
  }

  const z = game.zone;
  // blue zone
  mmCtx.strokeStyle = "#5096ff";
  mmCtx.lineWidth = 1.5;
  mmCtx.beginPath(); mmCtx.arc(z.cx * k, z.cy * k, z.r * k, 0, Math.PI * 2); mmCtx.stroke();
  // white next zone
  mmCtx.strokeStyle = "rgba(255,255,255,0.8)";
  mmCtx.beginPath(); mmCtx.arc(z.tx * k, z.ty * k, z.tr * k, 0, Math.PI * 2); mmCtx.stroke();

  // player
  const p = game.player;
  if (p.alive) {
    mmCtx.fillStyle = "#ffd94a";
    mmCtx.beginPath(); mmCtx.arc(p.x * k, p.y * k, 3.5, 0, Math.PI * 2); mmCtx.fill();
    mmCtx.strokeStyle = "#ffd94a";
    mmCtx.beginPath();
    mmCtx.moveTo(p.x * k, p.y * k);
    mmCtx.lineTo(p.x * k + Math.cos(p.angle) * 8, p.y * k + Math.sin(p.angle) * 8);
    mmCtx.stroke();
  }
}

function renderHUD() {
  const p = game.player;
  const z = game.zone;

  document.getElementById("alive-count").textContent = allAlive().length;
  document.getElementById("kill-count").textContent = p.kills;

  // health
  const hf = document.getElementById("health-fill");
  hf.style.width = `${(p.hp / p.maxHp) * 100}%`;
  hf.className = p.hp <= 25 ? "low" : p.hp <= 55 ? "mid" : "";
  document.getElementById("health-text").textContent = Math.ceil(p.hp);
  document.getElementById("armor-fill").style.width = `${(p.vest / 3) * 100}%`;

  // heal progress
  const healBar = document.getElementById("heal-bar");
  if (p.healing) {
    healBar.classList.remove("hidden");
    document.getElementById("heal-fill").style.width = `${(p.healing.t / p.healing.total) * 100}%`;
    document.getElementById("heal-label").textContent = p.healing.type === "bandage" ? "Bandaging..." : "Using Medkit...";
  } else {
    healBar.classList.add("hidden");
  }

  document.getElementById("bandage-count").textContent = `x${p.bandages}`;
  document.getElementById("medkit-count").textContent = `x${p.medkits}`;

  // weapons
  for (let i = 0; i < 2; i++) {
    const el = document.getElementById(`wslot-${i}`);
    const w = p.weapons[i];
    el.querySelector(".wname").textContent = w ? WEAPONS[w.key].name : "—";
    el.classList.toggle("active", p.slot === i && !!w);
  }
  const { inst, def } = currentWeapon(p);
  const ammoEl = document.getElementById("ammo-display");
  if (p.reloading > 0) {
    ammoEl.textContent = "RELOADING";
    ammoEl.classList.add("reloading");
  } else {
    ammoEl.classList.remove("reloading");
    ammoEl.textContent = def.melee ? "— / —" : `${inst.mag} / ${inst.reserve === Infinity ? "∞" : inst.reserve}`;
  }

  // zone message
  const zm = document.getElementById("zone-msg");
  const outside = p.alive && dist(p.x, p.y, z.cx, z.cy) > z.r;
  if (outside) {
    zm.textContent = "⚠ OUTSIDE THE ZONE — GET INSIDE!";
    zm.className = "danger";
  } else if (z.shrinking) {
    zm.textContent = "ZONE IS SHRINKING";
    zm.className = "danger";
  } else {
    zm.textContent = `Zone shrinks in ${Math.ceil(z.timer)}s`;
    zm.className = "";
  }

  // damage vignette
  document.getElementById("vignette").style.opacity =
    p.hitFlash > 0 ? 1 : p.hp < 30 ? 0.6 : outside ? 0.35 : 0;
}

/* ---------------------------- Main loop ---------------------------- */

let lastTime = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0.016);
  lastTime = ts;
  if (game && game.state === "playing") {
    update(dt);
    render();
  } else if (game && game.state === "over") {
    render(); // keep rendering background behind end screen
  }
  requestAnimationFrame(loop);
}

/* ---------------------------- Boot ---------------------------- */

document.getElementById("play-btn").addEventListener("click", () => {
  SFX.unlock();
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  newGame();
});

document.getElementById("restart-btn").addEventListener("click", () => {
  document.getElementById("end-screen").classList.add("hidden");
  newGame();
});

requestAnimationFrame(loop);
