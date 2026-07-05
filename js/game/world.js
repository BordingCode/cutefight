// Pure game sim — no DOM, no canvas, no audio. Archero-style top-down rooms.
// x = across, y = depth (free 2D move), alt = height (launcher pops).
// One-thumb rule: thumb down = steer/rein in; thumb up = your monster fights.
// FULL GAME: team of 4 playable species (melee/ranged styles + signature moves),
// 3 biomes of 10 rooms with bosses, the Summit legendary (defeat OR befriend),
// per-monster levels, evolution upgrades, hazard zones that persist across swaps.
import { clamp, sign } from '../engine/vec.js';
import { WORLD_W } from '../engine/canvas.js';

export const FLOOR_TOP = 430;
export const FLOOR_BOT = 900;
export const ROOM_L = 34;
export const ROOM_R = WORLD_W - 34;
export const DOOR_X = WORLD_W / 2;
export const DOOR_Y = FLOOR_TOP + 26;
export const GRAV = 2100;
const MOVE_SPD = 250;

export const DAZE_CATCH = 68;
export const DAZE_KO = 100;

const BEATS = { ember: 'leaf', leaf: 'tide', tide: 'ember', spark: 'frost', frost: 'gust', gust: 'spark' };
export function typeMult(atk, def) {
  if (BEATS[atk] === def) return 1.6;
  if (BEATS[def] === atk) return 0.6;
  return 1.0;
}

// ---- playable side of each species: how it fights when YOU are it ----
export const PLAYABLE = {
  cinder:   { element: 'ember', style: 'melee',  cadence: 0.38, baseHp: 6, dmg: 1.0, sig: 'dash',       sigName: 'Ember Dash' },
  sproutle: { element: 'leaf',  style: 'ranged', cadence: 0.55, baseHp: 7, dmg: 1.15, shotSpeed: 430, sig: 'thorn',      sigName: 'Thornbush' },
  dewdrip:  { element: 'tide',  style: 'ranged', cadence: 0.4,  baseHp: 5, dmg: 0.8,  shotSpeed: 540, sig: 'shield',     sigName: 'Bubble Shield' },
  voltling: { element: 'spark', style: 'melee',  cadence: 0.27, baseHp: 5, dmg: 0.72, sig: 'blink',      sigName: 'Blink' },
  frostnip: { element: 'frost', style: 'ranged', cadence: 0.62, baseHp: 6, dmg: 0.9,  shotSpeed: 380, slow: true, sig: 'frostfield', sigName: 'Frost Field' },
};

// ---- wild side of each species: how it fights when it's the FOE ----
// shoot:true = its attack is a dodgeable projectile instead of a lunge
export const SPECIES = {
  cinder:   { name: 'Cinder',   element: 'ember', tell: 0.5,  lungeV: 470, lungeT: 0.34, recover: 0.8,  walk: 100, ringDur: 1.35, xpKo: 10, xpCatch: 26, skittish: false },
  sproutle: { name: 'Sproutle', element: 'leaf',  tell: 0.6,  lungeV: 430, lungeT: 0.38, recover: 0.9,  walk: 88,  ringDur: 1.5,  xpKo: 8,  xpCatch: 20, skittish: false },
  voltling: { name: 'Voltling', element: 'spark', tell: 0.42, lungeV: 540, lungeT: 0.3,  recover: 0.6,  walk: 130, ringDur: 1.25, xpKo: 12, xpCatch: 28, skittish: true },
  dewdrip:  { name: 'Dewdrip',  element: 'tide',  tell: 0.55, lungeV: 0,   lungeT: 0.2,  recover: 1.0,  walk: 76,  ringDur: 1.35, xpKo: 10, xpCatch: 24, shoot: { speed: 330, n: 1 } },
  frostnip: { name: 'Frostnip', element: 'frost', tell: 0.7,  lungeV: 380, lungeT: 0.42, recover: 1.1,  walk: 70,  ringDur: 1.2,  xpKo: 14, xpCatch: 32, shoot: { speed: 280, n: 2 } },
};

export const xpNext = (level) => 30 + 25 * (level - 1);

// ---- biomes: 10 rooms each, boss on the last; every 4th room is a rest ----
export const BIOMES = [
  { name: 'Meadow Reach',   from: 1,  to: 10, pool: ['sproutle', 'sproutle', 'voltling', 'cinder'],  boss: { species: 'sproutle', name: 'Bramble Warden', resist: 3.0, scale: 2 },  pal: 0 },
  { name: 'Thunder Bluffs', from: 11, to: 20, pool: ['voltling', 'voltling', 'dewdrip'],             boss: { species: 'voltling', name: 'Storm Alpha',    resist: 3.6, scale: 2 },  pal: 1 },
  { name: 'Frostpeak Pass', from: 21, to: 30, pool: ['frostnip', 'frostnip', 'dewdrip', 'voltling'], boss: { species: 'frostnip', name: 'AURORIX',        resist: 4.2, scale: 2, legendary: true }, pal: 2 },
];
export function biomeFor(room) {
  for (const b of BIOMES) if (room <= b.to) return b;
  return { ...BIOMES[2], name: 'Wanderer’s Path', pool: ['sproutle', 'voltling', 'dewdrip', 'frostnip'], boss: null };
}
export const isRestRoom = (room) => room % 4 === 0 && !isBossRoom(room);
export const isBossRoom = (room) => room === 10 || room === 20 || room === 30;
const roomFoeCount = (room) => (isBossRoom(room) ? 1 : isRestRoom(room) ? 0 : room <= 2 ? 1 : (room % 3 === 0 ? 2 : 1));

// ---- team ----
export function mkMember(species, level = 1) {
  const P = PLAYABLE[species];
  const maxHp = P.baseHp + Math.floor(level / 2);
  return { species, level, xp: 0, hp: maxHp, maxHp, gauge: 0, evolved: false, fainted: false };
}

export function createWorld() {
  return {
    t: 0,
    room: 1,
    roomLeft: roomFoeCount(1),
    doorOpen: false,
    transitionT: 0,
    camX: 0,
    orbs: 5,
    caught: 0,
    dex: {},
    ended: null,               // 'befriended' | 'defeated' once the legendary falls
    team: [],                  // filled by initTeam (starter pick / save load)
    active: 0,
    swapCd: 0,
    swapReq: -1,               // main sets this; sim consumes it
    xpTotalKO: 0,
    pickups: [],
    hazards: [],               // {type:'thorn'|'frost'|'fire', x, y, r, t}
    pshots: [], eshots: [],    // player / enemy projectiles
    shield: 0, shieldT: 0,     // Bubble Shield charges / timer
    spawnCount: 0,
    events: [],
    msg: null, msgT: 0,

    player: {
      x: WORLD_W / 2, y: FLOOR_BOT - 80, alt: 0, vAlt: 0,
      vx: 0, vy: 0, facing: 1,
      state: 'idle', atkT: 0, atkKind: null,
      dashT: 0, dashHit: false, dashDX: 1, dashDY: 0,
      blinkT: 0, blinkHits: 0,
      autoT: 0, chain: 0,
      iframes: 0, animT: 0,
    },

    foe: null,
    nextFoeT: 1.0,
    catch: null,
  };
}

export function initTeam(w, starter) {
  w.team = [mkMember(starter)];
  w.active = 0;
  w.dex[starter] = w.dex[starter] || 0;
}

export const activeMember = (w) => w.team[w.active];
export const activeP = (w) => PLAYABLE[activeMember(w).species];

const pdist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const vy = (e, off = 0) => e.y - (e.alt || 0) - off;

function toast(w, text, dur = 2.2) { w.msg = text; w.msgT = dur; }

// ---------- spawning ----------
function spawnFoe(w) {
  w.spawnCount++;
  const biome = biomeFor(w.room);
  let species, boss = null;
  if (isBossRoom(w.room) && biome.boss && !(biome.boss.legendary && w.ended)) {
    species = biome.boss.species;
    boss = biome.boss;
  } else {
    species = biome.pool[Math.floor(Math.random() * biome.pool.length)];
  }
  const spec = SPECIES[species];
  const depth = Math.max(0, w.room - 1);
  w.foe = {
    species, element: spec.element,
    boss,
    name: boss ? boss.name : spec.name,
    resist: (boss ? boss.resist : 1) * (1 + depth * 0.012),
    scale: boss ? boss.scale : 1,
    x: WORLD_W / 2, y: FLOOR_TOP + 110,
    alt: 0, vAlt: 0, vx: 0, vy: 0, facing: -1,
    daze: 0, dazedT: 0, slowT: 0, rootT: 0,
    state: 'wander', timer: boss ? 1.4 : 0.8, animT: 0, hitFlash: 0,
    lungeDX: 0, lungeDY: 0, tellPX: 0, tellPY: 0, lungeHit: false, pattern: 0,
  };
  if (!boss) {
    w.foe.x = ROOM_L + 80 + ((w.spawnCount * 167) % (ROOM_R - ROOM_L - 160));
    w.foe.y = FLOOR_TOP + 70 + ((w.spawnCount * 97) % 120);
  }
  w.events.push({ t: boss ? 'boss' : 'engage', name: w.foe.name });
  if (boss) toast(w, `${boss.name} blocks the way!`, 2.6);
}

// ---------- xp / leveling (active member) ----------
function addXp(w, amt, x, y) {
  const m = activeMember(w);
  if (!m) return;
  if (m.level >= 10) return;
  m.xp += amt;
  w.events.push({ t: 'xp', amt, x, y });
  while (m.level < 10 && m.xp >= xpNext(m.level)) {
    m.xp -= xpNext(m.level);
    m.level++;
    m.maxHp = PLAYABLE[m.species].baseHp + Math.floor(m.level / 2);
    m.hp = m.maxHp;
    w.events.push({ t: 'levelup', level: m.level });
    toast(w, `Level up! ${SPECIES[m.species]?.name || 'Cinder'} is now Lv ${m.level}!`, 2.6);
  }
}

function dropPickup(w, x, y) {
  if (w.orbs === 0 || Math.random() < 0.45) w.pickups.push({ x, y: clamp(y, FLOOR_TOP + 20, FLOOR_BOT) });
}

function foeResolved(w, delay) {
  w.foe = null;
  w.catch = null;
  w.nextFoeT = delay;
}

// ---------- combat ----------
function gaugeGain(w, amt) {
  const m = activeMember(w);
  if (!m || m.gauge >= 100) return;
  m.gauge = clamp(m.gauge + amt, 0, 100);
  if (m.gauge >= 100) w.events.push({ t: 'gauge_ready' });
}

function hitFoe(w, kind, dmgMul = 1) {
  const p = w.player, f = w.foe;
  const m = activeMember(w);
  const P = activeP(w);
  const mult = typeMult(P.element, f.element);
  const strong = mult > 1.01;
  const base = { light: 7, combo: 10, heavy: 16, launcher: 9, air: 8, dash: 12, shot: 8, blink: 11, zone: 1 }[kind];
  if (kind !== 'dash' && kind !== 'blink' && kind !== 'zone') gaugeGain(w, kind === 'shot' ? 8 : 12);

  const dazedNow = f.dazedT > 0;
  const evolvedMul = m && m.evolved ? 1.18 : 1;
  const dazeGain = (base * mult * P.dmg * dmgMul * evolvedMul * (dazedNow ? 0.35 : 1)) / f.resist;
  f.daze = clamp(f.daze + dazeGain, 0, DAZE_KO);
  f.hitFlash = 0.09;

  let ux = f.x - p.x, uy = f.y - p.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  const kbMul = f.boss ? 0.25 : 1;

  if (kind === 'zone') {
    // hazard tick: no knockback, tiny flash only
  } else if (kind === 'dash' || kind === 'blink') {
    f.vAlt = 240 * kbMul; f.vx = ux * 190 * kbMul; f.vy = uy * 120 * kbMul; if (!f.boss) f.state = 'air';
    w.events.push({ t: 'hit', x: f.x, y: vy(f, 30), strong, big: true });
  } else if (kind === 'launcher') {
    f.vAlt = 620 * kbMul; f.vx = ux * 110 * kbMul; f.vy = uy * 70 * kbMul; if (!f.boss) f.state = 'air';
    w.events.push({ t: 'launch', x: f.x, y: vy(f, 24) });
  } else if (kind === 'air') {
    f.vAlt = Math.max(f.vAlt, 240); f.vx = ux * 140; f.vy = uy * 90;
    w.events.push({ t: 'hit', x: f.x, y: vy(f, 30), strong, big: false });
  } else {
    const kb = { light: 150, combo: 320, heavy: 460, shot: 60 }[kind];
    const gentle = dazedNow || f.daze >= DAZE_CATCH;
    f.vx = ux * kb * kbMul * (gentle ? 0.4 : 1);
    f.vy = uy * kb * 0.6 * kbMul * (gentle ? 0.4 : 1);
    if (f.state !== 'air' && kind !== 'shot') { f.state = 'hurt'; f.timer = 0.22; }
    w.events.push({ t: 'hit', x: f.x, y: vy(f, 30), strong, big: kind === 'combo' });
  }
  if (strong && kind !== 'light' && kind !== 'shot' && kind !== 'zone') w.events.push({ t: 'strong', x: f.x, y: vy(f, 58) });

  const catchable = !f.boss || f.boss.legendary;
  if (catchable && f.daze >= DAZE_CATCH && f.daze < DAZE_KO && f.dazedT <= 0) {
    f.dazedT = f.boss ? 5.0 : 6.5;
    if (f.alt <= 0) f.state = 'dazed';
    w.events.push({ t: 'dazed', x: f.x, y: vy(f, 60) });
    toast(w, f.boss ? 'AURORIX is dazed… the storm holds its breath!' : 'It’s dazed! Get close and throw the orb!', 2.6);
  }
  if (f.daze >= DAZE_KO) koFoe(w);
}

function koFoe(w) {
  const f = w.foe;
  const spec = SPECIES[f.species];
  w.events.push({ t: 'ko', x: f.x, y: vy(f, 30) });
  if (f.boss) {
    addXp(w, 60, f.x, vy(f, 70));
    w.pickups.push({ x: f.x - 40, y: f.y }, { x: f.x + 40, y: f.y });
    if (f.boss.legendary) {
      w.ended = 'defeated';
      w.events.push({ t: 'ending', kind: 'defeated' });
    } else {
      toast(w, `${f.boss.name} is defeated! The path is open.`, 3.0);
      w.events.push({ t: 'boss_down' });
    }
  } else {
    toast(w, 'Too rough… it fainted. Gentler next time!', 3.0);
    addXp(w, spec.xpKo, f.x, vy(f, 70));
    dropPickup(w, f.x, f.y);
  }
  foeResolved(w, 1.6);
}

function tryHit(w, kind) {
  const p = w.player, f = w.foe;
  if (!f) return;
  const reach = (kind === 'heavy' ? 96 : 82) + (f.boss ? 40 : 0);
  if (pdist(p.x, p.y, f.x, f.y) < reach && Math.abs((f.alt || 0) - p.alt) < 100) {
    p.facing = sign(f.x - p.x) || p.facing;
    hitFoe(w, kind);
  }
}

function fireShot(w) {
  const p = w.player, f = w.foe;
  const P = activeP(w);
  if (!f) return;
  const d = pdist(p.x, p.y, f.x, f.y) || 1;
  w.pshots.push({
    x: p.x, y: p.y - 34,
    vx: ((f.x - p.x) / d) * P.shotSpeed,
    vy: ((f.y - 34 - (p.y - 34)) / d) * P.shotSpeed,
    element: P.element, slow: !!P.slow, life: 2.2,
  });
  p.facing = sign(f.x - p.x) || p.facing;
  w.events.push({ t: 'shoot' });
}

// ---------- signature moves ----------
function useSig(w) {
  const p = w.player;
  const m = activeMember(w);
  const P = activeP(w);
  m.gauge = 0;
  w.events.push({ t: 'sig', sig: P.sig, x: p.x, y: p.y - 40 });
  if (P.sig === 'dash') {
    p.dashT = 0.2; p.dashHit = false;
    if (w.foe) {
      const len = pdist(p.x, p.y, w.foe.x, w.foe.y) || 1;
      p.dashDX = (w.foe.x - p.x) / len; p.dashDY = (w.foe.y - p.y) / len;
    } else { p.dashDX = p.facing; p.dashDY = 0; }
    p.state = 'atk'; p.atkKind = 'dash'; p.atkT = 0.2;
  } else if (P.sig === 'thorn') {
    const tx = w.foe ? w.foe.x : p.x + p.facing * 120;
    const ty = w.foe ? w.foe.y : p.y;
    w.hazards.push({ type: 'thorn', x: tx, y: ty, r: 78, t: 6 });
    if (m.evolved) w.hazards.push({ type: 'thorn', x: clamp(tx + 130, ROOM_L, ROOM_R), y: ty, r: 78, t: 6 });
  } else if (P.sig === 'shield') {
    w.shield = m.evolved ? 3 : 2;
    w.shieldT = 7;
  } else if (P.sig === 'blink') {
    if (w.foe) {
      const f = w.foe;
      p.x = clamp(f.x - sign(f.x - p.x) * 60 || f.x - 60, ROOM_L, ROOM_R);
      p.y = clamp(f.y, FLOOR_TOP, FLOOR_BOT);
      p.iframes = Math.max(p.iframes, 0.4);
      hitFoe(w, 'blink');
      p.blinkHits = m.evolved ? 1 : 0;
      p.blinkT = 0.25;
    }
  } else if (P.sig === 'frostfield') {
    w.hazards.push({ type: 'frost', x: p.x, y: p.y, r: m.evolved ? 132 : 95, t: 5 });
  }
}

// ---------- player ----------
function stepPlayer(w, dt, input) {
  const p = w.player;
  const m = activeMember(w);
  const P = activeP(w);
  p.animT += dt;
  p.iframes = Math.max(0, p.iframes - dt);
  w.swapCd = Math.max(0, w.swapCd - dt);
  if (w.shieldT > 0) { w.shieldT -= dt; if (w.shieldT <= 0) w.shield = 0; }

  // swap request from the team strip
  if (w.swapReq >= 0) {
    const i = w.swapReq;
    w.swapReq = -1;
    if (i !== w.active && w.team[i] && !w.team[i].fainted && w.swapCd <= 0) {
      w.active = i;
      w.swapCd = w.foe ? 4 : 0.4;
      p.iframes = Math.max(p.iframes, 0.6);
      p.chain = 0; p.autoT = 0.4;
      w.events.push({ t: 'swap', species: w.team[i].species });
    }
  }

  // evolved blink: the chained second strike
  if (p.blinkT > 0) {
    p.blinkT -= dt;
    if (p.blinkT <= 0 && p.blinkHits > 0 && w.foe) {
      p.blinkHits--;
      const f = w.foe;
      p.x = clamp(f.x + sign(p.x - f.x) * 60 || f.x + 60, ROOM_L, ROOM_R);
      hitFoe(w, 'blink');
      w.events.push({ t: 'sig', sig: 'blink', x: p.x, y: p.y - 40 });
    }
  }

  // Ember Dash in progress
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.iframes = Math.max(p.iframes, 0.06);
    p.x = clamp(p.x + p.dashDX * 1150 * dt, ROOM_L, ROOM_R);
    p.y = clamp(p.y + p.dashDY * 1150 * dt, FLOOR_TOP, FLOOR_BOT);
    if (m && m.evolved && Math.random() < 0.5) w.hazards.push({ type: 'fire', x: p.x, y: p.y, r: 46, t: 2.5 });
    if (!p.dashHit && w.foe && pdist(p.x, p.y, w.foe.x, w.foe.y) < 80 + (w.foe.boss ? 40 : 0)) {
      p.dashHit = true;
      hitFoe(w, 'dash');
    }
    if (p.dashT <= 0) p.state = 'idle';
    return;
  }

  // pickups
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    if (pdist(w.pickups[i].x, w.pickups[i].y, p.x, p.y) < 52) {
      w.orbs++;
      w.events.push({ t: 'pickup', x: w.pickups[i].x, y: w.pickups[i].y - 26 });
      w.pickups.splice(i, 1);
    }
  }

  // signature move
  if (input.ability && m && m.gauge >= 100) {
    useSig(w);
    if (activeP(w).sig === 'dash') return;
  }

  // one-thumb grammar
  p.vx = 0; p.vy = 0;
  if (input.dragging) {
    p.vx = input.moveX * MOVE_SPD;
    p.vy = input.moveY * MOVE_SPD;
    if (input.moveX !== 0) p.facing = sign(input.moveX);
    p.autoT = Math.max(p.autoT, 0.22);
  } else if (w.foe) {
    const f = w.foe;
    const dx = f.x - p.x, dy = f.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.facing = sign(dx) || p.facing;
    p.autoT -= dt;
    if (P.style === 'ranged') {
      // keep comfortable distance, shoot on cadence
      const ideal = 240;
      if (d < ideal - 50) { p.vx = (-dx / d) * 150; p.vy = (-dy / d) * 150; }
      else if (d > ideal + 90) { p.vx = (dx / d) * 165; p.vy = (dy / d) * 165; }
      if (p.autoT <= 0 && p.state !== 'atk') {
        p.state = 'atk'; p.atkKind = 'shot'; p.atkT = 0.16;
        p.autoT = P.cadence;
        fireShot(w);
      }
    } else {
      const range = (f.alt <= 0 ? 74 : 62) + (f.boss ? 40 : 0);
      if (d > range) {
        p.vx = (dx / d) * 175;
        p.vy = (dy / d) * 175;
      } else if (p.autoT <= 0 && p.state !== 'atk') {
        let kind;
        if (f.alt > 0 && !f.boss) { kind = 'air'; p.autoT = 0.3; }
        else {
          p.chain = (p.chain + 1) % 4;
          kind = ['light', 'light', 'combo', 'launcher'][p.chain];
          p.autoT = P.cadence;
        }
        p.state = 'atk'; p.atkKind = kind; p.atkT = 0.18;
        w.events.push({ t: 'swing', big: kind === 'combo' || kind === 'launcher' });
        tryHit(w, kind);
      }
    }
  } else if (w.doorOpen && w.transitionT <= 0) {
    const dx = DOOR_X - p.x, dy = DOOR_Y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) { p.vx = (dx / d) * 200; p.vy = (dy / d) * 200; p.facing = sign(dx) || p.facing; }
  }

  if (p.state === 'atk') {
    p.atkT -= dt;
    if (p.atkT <= 0) p.state = 'idle';
  }

  p.x = clamp(p.x + p.vx * dt, ROOM_L, ROOM_R);
  p.y = clamp(p.y + p.vy * dt, FLOOR_TOP, FLOOR_BOT);

  if (w.doorOpen && w.transitionT <= 0 && pdist(p.x, p.y, DOOR_X, DOOR_Y) < 46) {
    w.transitionT = 0.55;
    w.events.push({ t: 'door' });
  }

  if (p.state !== 'atk') p.state = (Math.abs(p.vx) + Math.abs(p.vy)) > 12 ? 'walk' : 'idle';
}

// ---------- player getting hurt (lunges and shots share this) ----------
function hurtPlayer(w, fromX, fromY) {
  const p = w.player;
  const m = activeMember(w);
  if (p.iframes > 0) return false;
  if (w.shield > 0) {
    w.shield--;
    p.iframes = 0.5;
    w.events.push({ t: 'blocked', x: p.x, y: p.y - 50 });
    // evolved Bubble Shield reflects a sting back
    if (m && m.species === 'dewdrip' && m.evolved && w.foe) hitFoe(w, 'zone', 8);
    return true;
  }
  m.hp -= 1;
  p.iframes = 1.1;
  w.events.push({ t: 'player_hurt', x: p.x, y: p.y - 30 });
  if (m.hp <= 0) {
    m.hp = 0; m.fainted = true;
    const next = w.team.findIndex((tm) => !tm.fainted);
    if (next >= 0) {
      w.active = next;
      p.iframes = 1.4;
      w.events.push({ t: 'faint_swap', species: w.team[next].species });
      toast(w, `${SPECIES[m.species]?.name || m.species} fainted! Go, ${SPECIES[w.team[next].species]?.name || w.team[next].species}!`, 2.6);
    } else {
      // full wipe: back to the last rest room, team revived, drop some orbs
      const lost = Math.floor(w.orbs / 3);
      w.orbs -= lost;
      for (const tm of w.team) { tm.fainted = false; tm.hp = Math.max(1, Math.ceil(tm.maxHp / 2)); }
      w.active = 0;
      let backTo = w.room;
      while (backTo > 1 && !isRestRoom(backTo)) backTo--;
      w.room = Math.max(1, backTo);
      w.events.push({ t: 'wipe' });
      toast(w, lost > 0 ? `You blacked out… woke at the clearing (-${lost} orbs)` : 'You blacked out… woke at the last clearing', 3.2);
      w.transitionT = 0.55;
      w._wipeReset = true;
    }
  }
  return true;
}

// ---------- foe ----------
function stepFoe(w, dt) {
  const f = w.foe, p = w.player;
  const spec = SPECIES[f.species];
  f.animT += dt;
  f.hitFlash = Math.max(0, f.hitFlash - dt);
  f.slowT = Math.max(0, f.slowT - dt);
  f.rootT = Math.max(0, f.rootT - dt);

  // hazard zones (they persist across swaps — set a trap, swap, cash it in)
  for (const hz of w.hazards) {
    if (pdist(hz.x, hz.y, f.x, f.y) < hz.r + 20) {
      if (hz.type === 'thorn') { f.rootT = Math.max(f.rootT, 0.25); hitFoe(w, 'zone', 5.5 * dt * 10); }
      if (hz.type === 'frost') f.slowT = Math.max(f.slowT, 0.3);
      if (hz.type === 'fire') hitFoe(w, 'zone', 4.5 * dt * 10);
      if (!w.foe) return; // the zone tick might KO
    }
  }

  const speedMul = (f.slowT > 0 ? 0.45 : 1) * (f.rootT > 0 ? 0 : 1);

  if (f.dazedT > 0) {
    f.dazedT -= dt;
    if (f.dazedT <= 0) {
      f.daze = 42;
      f.state = 'wander';
      toast(w, 'It shook off the daze!', 2.0);
      w.events.push({ t: 'recover', x: f.x, y: vy(f, 40) });
    }
  } else {
    f.daze = Math.max(0, f.daze - 3.5 * dt);
  }

  if (f.alt > 0 || f.vAlt > 0) {
    f.vAlt -= GRAV * dt;
    f.alt = Math.max(0, f.alt + f.vAlt * dt);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.x < ROOM_L && f.vx < 0) { f.x = ROOM_L; f.vx *= -0.65; w.events.push({ t: 'bounce', x: f.x, y: vy(f, 20) }); }
    if (f.x > ROOM_R && f.vx > 0) { f.x = ROOM_R; f.vx *= -0.65; w.events.push({ t: 'bounce', x: f.x, y: vy(f, 20) }); }
    f.y = clamp(f.y, FLOOR_TOP, FLOOR_BOT);
    if (f.alt <= 0 && f.vAlt <= 0) {
      f.vAlt = 0; f.vx = 0; f.vy = 0;
      f.state = f.dazedT > 0 ? 'dazed' : 'down';
      f.timer = 0.45;
      w.events.push({ t: 'land', x: f.x, y: f.y });
    }
    return;
  }

  if (f.state === 'hurt') {
    f.timer -= dt;
    f.x = clamp(f.x + f.vx * dt, ROOM_L, ROOM_R);
    f.y = clamp(f.y + f.vy * dt, FLOOR_TOP, FLOOR_BOT);
    const fr = Math.pow(0.002, dt);
    f.vx *= fr; f.vy *= fr;
    if (f.timer <= 0) { f.state = f.dazedT > 0 ? 'dazed' : 'wander'; f.vx = 0; f.vy = 0; }
    return;
  }
  if (f.state === 'down') {
    f.timer -= dt;
    if (f.timer <= 0) f.state = f.dazedT > 0 ? 'dazed' : 'wander';
    return;
  }
  if (f.state === 'dazed') {
    f.x += Math.sin(f.animT * 7) * 6 * dt;
    return;
  }

  const dx = p.x - f.x, dy = p.y - f.y;
  const d = Math.hypot(dx, dy) || 1;
  f.facing = sign(dx) || f.facing;
  const tellTime = spec.tell * (f.boss ? 1.15 : 1);
  if (f.state === 'wander') {
    f.timer -= dt;
    const wantRange = spec.shoot ? 260 : (f.boss ? 210 : 120);
    if (d > wantRange) {
      f.x += (dx / d) * spec.walk * speedMul * dt;
      f.y += (dy / d) * spec.walk * speedMul * dt;
    } else if (f.timer <= 0) {
      f.state = 'tell'; f.timer = tellTime;
      f.tellPX = p.x; f.tellPY = p.y; f.lungeHit = false;
      w.events.push({ t: 'tell', x: f.x, y: vy(f, 62) });
    }
  } else if (f.state === 'tell') {
    f.timer -= dt;
    if (f.timer <= 0) {
      f.pattern++;
      // bosses answer kiting with a volley; otherwise they alternate lunge/volley
      const volley = spec.shoot || (f.boss && (f.pattern % 2 === 0 || pdist(f.x, f.y, p.x, p.y) > 180));
      if (volley) {
        // ranged attack: dodgeable projectiles at the player
        const n = f.boss ? 3 : (spec.shoot ? spec.shoot.n : 1);
        const speed = spec.shoot ? spec.shoot.speed : 330;
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.35;
          const ang = Math.atan2(p.y - f.y, p.x - f.x) + spread;
          w.eshots.push({ x: f.x, y: f.y - 30, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, element: f.element, life: 3 });
        }
        w.events.push({ t: 'eshoot' });
        f.state = 'recover'; f.timer = spec.recover;
      } else {
        f.state = 'lunge'; f.timer = spec.lungeT;
        const ld = Math.hypot(p.x - f.x, p.y - f.y) || 1;
        f.lungeDX = (p.x - f.x) / ld;
        f.lungeDY = (p.y - f.y) / ld;
        w.events.push({ t: 'lunge', x: f.x, y: f.y });
      }
    }
  } else if (f.state === 'lunge') {
    f.timer -= dt;
    f.x = clamp(f.x + f.lungeDX * spec.lungeV * speedMul * dt, ROOM_L, ROOM_R);
    f.y = clamp(f.y + f.lungeDY * spec.lungeV * speedMul * dt, FLOOR_TOP, FLOOR_BOT);
    if (pdist(f.x, f.y, p.x, p.y) < 46 + (f.boss ? 30 : 0) && p.alt <= 20) {
      if (hurtPlayer(w, f.x, f.y)) f.lungeHit = true;
    }
    if (f.timer <= 0) {
      if (!f.lungeHit && pdist(p.x, p.y, f.tellPX, f.tellPY) > 60) {
        gaugeGain(w, 20);
        w.events.push({ t: 'nice_dodge', x: p.x, y: p.y - 70 });
      }
      if (spec.skittish && !f.boss) {
        f.vAlt = 300;
        f.vx = -f.lungeDX * 220;
        f.vy = -f.lungeDY * 160;
        f.state = 'air';
      } else {
        f.state = 'recover'; f.timer = spec.recover;
      }
    }
  } else if (f.state === 'recover') {
    f.timer -= dt;
    if (f.timer <= 0) { f.state = 'wander'; f.timer = 0.6 + Math.random() * 0.9; }
  }
}

// ---------- projectiles ----------
function stepShots(w, dt) {
  const p = w.player;
  for (let i = w.pshots.length - 1; i >= 0; i--) {
    const s = w.pshots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let dead = s.life <= 0 || s.x < 0 || s.x > WORLD_W;
    if (!dead && w.foe && pdist(s.x, s.y, w.foe.x, w.foe.y - (w.foe.alt || 0) - 30) < 40 + (w.foe.boss ? 40 : 0)) {
      if (s.slow) w.foe.slowT = Math.max(w.foe.slowT, 2.4);
      hitFoe(w, 'shot');
      dead = true;
    }
    if (dead) w.pshots.splice(i, 1);
  }
  for (let i = w.eshots.length - 1; i >= 0; i--) {
    const s = w.eshots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let dead = s.life <= 0 || s.x < 0 || s.x > WORLD_W;
    if (!dead && pdist(s.x, s.y, p.x, p.y - 34) < 36) {
      hurtPlayer(w, s.x, s.y);
      dead = true;
    }
    if (dead) w.eshots.splice(i, 1);
  }
}

// ---------- catching ----------
function stepCatch(w, dt, input) {
  const c = w.catch, f = w.foe;
  if (!f || f.dazedT <= 0) { w.catch = null; return; }
  c.t += dt;
  if (c.phase === 'throw') {
    if (c.t >= 0.42) { c.phase = 'ring'; c.t = 0; c.ringR = 96; w.events.push({ t: 'ring_start' }); }
    return;
  }
  const DUR = f.boss ? 0.95 : SPECIES[f.species].ringDur;
  const GRACE = 0.25;
  c.ringR = Math.max(10, 96 - (96 - 10) * (c.t / DUR));
  c.lock = Math.max(0, (c.lock || 0) - dt);
  const done = c.t - DUR > GRACE;
  const r = c.ringR;

  const caughtIt = () => {
    const spec = SPECIES[f.species];
    w.caught++;
    w.dex[f.species] = (w.dex[f.species] || 0) + 1;
    w.events.push({ t: 'caught', x: f.x, y: vy(f, 40) });
    addXp(w, spec.xpCatch, f.x, vy(f, 80));
    if (f.boss && f.boss.legendary) {
      w.ended = 'befriended';
      w.events.push({ t: 'ending', kind: 'befriended' });
    } else if (w.team.length < 4 && !w.team.some((tm) => tm.species === f.species)) {
      const lvl = Math.max(1, activeMember(w).level - 1);
      w.team.push(mkMember(f.species, lvl));
      toast(w, `Gotcha! ${spec.name} joined your team!`, 3.2);
      w.events.push({ t: 'joined', species: f.species });
    } else {
      toast(w, `Gotcha! ${spec.name} rests in the meadow sanctuary.`, 3.0);
    }
    dropPickup(w, f.x + 60, f.y);
    foeResolved(w, 1.6);
  };
  const brokeFree = () => {
    f.dazedT = 0; f.daze = 40; f.state = 'wander';
    w.catch = null;
    w.events.push({ t: 'escape', x: f.x, y: vy(f, 40) });
    toast(w, 'It broke free!', 2.0);
  };

  if (done) brokeFree();
  else if (input.ringTap && c.lock <= 0) {
    if (r <= 56) caughtIt();
    else if (r <= 78) {
      if (c.resets < 1) {
        c.resets++;
        c.t = 0; c.ringR = 96;
        w.events.push({ t: 'struggle', x: f.x, y: vy(f, 40) });
        toast(w, 'Almost! It’s struggling… once more!', 1.6);
      } else brokeFree();
    } else {
      c.lock = 0.3;
      w.events.push({ t: 'toosoon', x: f.x, y: vy(f, 92) });
    }
  }
}

// ---------- rooms ----------
function enterRoom(w) {
  w.roomLeft = roomFoeCount(w.room);
  w.doorOpen = false;
  w.pickups.length = 0;
  w.hazards.length = 0;
  w.pshots.length = 0;
  w.eshots.length = 0;
  w.foe = null;
  w.catch = null;
  w.nextFoeT = isBossRoom(w.room) ? 1.4 : 0.9;
  const p = w.player;
  p.x = WORLD_W / 2;
  p.y = FLOOR_BOT - 70;
  p.vx = 0; p.vy = 0; p.dashT = 0;
  // fainted teammates pick themselves back up between rooms (1 hp)
  for (const tm of w.team) if (tm.fainted) { tm.fainted = false; tm.hp = 1; }
  if (isRestRoom(w.room)) {
    for (const tm of w.team) tm.hp = Math.min(tm.maxHp, tm.hp + 3);
    w.pickups.push({ x: WORLD_W / 2 - 100, y: FLOOR_TOP + 190 });
    w.pickups.push({ x: WORLD_W / 2 + 100, y: FLOOR_TOP + 250 });
    w.events.push({ t: 'rest' });
    // evolution: a monster at Lv 5+ blossoms at the campfire
    const evo = w.team.find((tm) => tm.level >= 5 && !tm.evolved);
    if (evo) {
      evo.evolved = true;
      w.events.push({ t: 'evolved', species: evo.species });
      toast(w, `✨ ${SPECIES[evo.species]?.name || evo.species} has grown stronger! Its ${PLAYABLE[evo.species].sigName} evolved!`, 3.6);
    } else {
      // the Warden's trail notes — the story in passing
      const WARDEN = [
        'A note on a post: “The storm eats another field each week. Hurry. — the Warden”',
        '“I catalogue monsters, yet I fear them. You befriend them. Odd world. — W.”',
        '“Whatever waits on the Summit… it is not angry. It is frightened. — W.”',
      ];
      if (w.room % 8 === 4 && !w.ended) toast(w, WARDEN[(w.room / 8) % WARDEN.length | 0], 4.2);
      else toast(w, 'A quiet clearing… rest up!', 2.4);
    }
  }
  w.events.push({ t: 'room', room: w.room });
}

function nextRoom(w) {
  if (w._wipeReset) { w._wipeReset = false; enterRoom(w); return; }
  w.room++;
  enterRoom(w);
}

// resume a loaded save at the start of its room
export function resumeAt(w, room) {
  w.room = Math.max(1, room);
  enterRoom(w);
}

export function step(w, dt, input) {
  w.t += dt;
  w.events.length = 0;
  if (!w.team.length) return; // waiting for starter pick
  if (w.msgT > 0) { w.msgT -= dt; if (w.msgT <= 0) w.msg = null; }

  if (w.transitionT > 0) {
    w.transitionT -= dt;
    if (w.transitionT <= 0) nextRoom(w);
    return;
  }

  // hazard timers
  for (let i = w.hazards.length - 1; i >= 0; i--) {
    w.hazards[i].t -= dt;
    if (w.hazards[i].t <= 0) w.hazards.splice(i, 1);
  }

  if (!w.foe && !w.doorOpen) {
    if (w.roomLeft > 0) {
      w.nextFoeT -= dt;
      if (w.nextFoeT <= 0) { w.roomLeft--; spawnFoe(w); }
    } else {
      w.doorOpen = true;
      w.events.push({ t: 'room_clear' });
      if (!isRestRoom(w.room)) toast(w, 'Clear! Onward ▲', 1.8);
    }
  }

  if (w.catch) {
    stepCatch(w, dt, input);
  } else {
    stepPlayer(w, dt, input);
    if (w.foe) stepFoe(w, dt);
    stepShots(w, dt);
    if (input.catchPress && w.foe && w.foe.dazedT > 0) {
      const d = pdist(w.foe.x, w.foe.y, w.player.x, w.player.y);
      if (w.orbs <= 0) {
        toast(w, 'No orbs left!', 2.2);
        w.events.push({ t: 'denied' });
      } else if (d > 340) {
        toast(w, 'Too far — walk closer and throw again!', 2.2);
        w.events.push({ t: 'denied' });
      } else {
        w.orbs--;
        w.catch = { phase: 'throw', t: 0, ringR: 96, resets: 0, lock: 0 };
        w.events.push({ t: 'throw', x: w.player.x, y: w.player.y - 40 });
      }
    }
  }
}
