// Pure combat sim — no DOM, no canvas, no audio. Archero-style top-down arena:
// the world is a sequence of ROOMS on a grass floor plane. x = across, y = depth
// (both free-move), alt = height above the floor (launcher pops, gravity).
// One rule of input: thumb down = steer / rein your monster in; thumb up = it
// fights for itself. One daze meter per wild: the DAZED band (catchable) sits
// BEFORE the KO line — hit too hard past it and the catch is lost.
import { clamp, sign } from '../engine/vec.js';
import { WORLD_W } from '../engine/canvas.js';

export const FLOOR_TOP = 430;         // the floor plane runs from here to FLOOR_BOT
export const FLOOR_BOT = 900;
export const ROOM_L = 34;
export const ROOM_R = WORLD_W - 34;
export const DOOR_X = WORLD_W / 2;    // doorway at the top edge of the floor
export const DOOR_Y = FLOOR_TOP + 26;
export const GRAV = 2100;             // pulls `alt` back down
const MOVE_SPD = 250;

// daze meter thresholds (0..100)
export const DAZE_CATCH = 68;
export const DAZE_KO = 100;

// element chart: two RPS triangles. life: ember>leaf>tide>ember, storm: spark>frost>gust>spark
const BEATS = { ember: 'leaf', leaf: 'tide', tide: 'ember', spark: 'frost', frost: 'gust', gust: 'spark' };
export function typeMult(atk, def) {
  if (BEATS[atk] === def) return 1.6;
  if (BEATS[def] === atk) return 0.6;
  return 1.0;
}

// wild species — each row is a different fight, not a reskin
export const SPECIES = {
  sproutle: {
    name: 'Sproutle', element: 'leaf',
    tell: 0.6, lungeV: 430, lungeT: 0.38, recover: 0.9, walk: 88,
    ringDur: 1.5, xpKo: 8, xpCatch: 20, skittish: false,
  },
  voltling: {
    name: 'Voltling', element: 'spark',
    tell: 0.42, lungeV: 540, lungeT: 0.3, recover: 0.6, walk: 130,
    ringDur: 1.25, xpKo: 12, xpCatch: 28, skittish: true, // hops away after lunging
  },
};

export const xpNext = (level) => 30 + 25 * (level - 1);

// rooms: how many wilds each room holds (sequential spawns), rest room every 4th
const roomFoeCount = (room) => (room % 4 === 0 ? 0 : room <= 2 ? 1 : (room % 3 === 0 ? 2 : 1));
export const isRestRoom = (room) => room % 4 === 0;

export function createWorld() {
  const w = {
    t: 0,
    room: 1,
    roomLeft: roomFoeCount(1),   // wilds still to spawn in this room
    doorOpen: false,
    transitionT: 0,              // door fade in progress
    camX: 0,                     // kept for renderer/FX compatibility (always 0)
    orbs: 5,
    caught: 0,
    xp: 0, level: 1,
    pickups: [],                 // orbs dropped on the floor
    spawnCount: 0,
    events: [],
    msg: null, msgT: 0,

    player: {
      species: 'cinder', element: 'ember',
      x: WORLD_W / 2, y: FLOOR_BOT - 80, alt: 0, vAlt: 0,
      vx: 0, vy: 0, facing: 1,
      hp: 5, maxHp: 5,
      state: 'idle',             // idle|walk|atk
      atkT: 0, atkKind: null,
      gauge: 0,                  // bond gauge: fill by landing hits, spend on Ember Dash
      dashT: 0, dashHit: false, dashDX: 1, dashDY: 0,
      autoT: 0, chain: 0,
      iframes: 0, animT: 0,
    },

    foe: null,
    nextFoeT: 1.0,
    catch: null,                 // {phase:'throw'|'ring', t, ringR, resets, lock}
  };
  return w;
}

const pdist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function spawnFoe(w) {
  w.spawnCount++;
  const species = w.spawnCount <= 2 ? 'sproutle' : (Math.random() < 0.5 ? 'sproutle' : 'voltling');
  const spec = SPECIES[species];
  w.foe = {
    species, element: spec.element,
    x: ROOM_L + 80 + ((w.spawnCount * 167) % (ROOM_R - ROOM_L - 160)),
    y: FLOOR_TOP + 70 + ((w.spawnCount * 97) % 120),
    alt: 0, vAlt: 0, vx: 0, vy: 0, facing: -1,
    daze: 0, dazedT: 0,
    state: 'wander',             // wander|tell|lunge|recover|hurt|air|down|dazed
    timer: 0.8, animT: 0, hitFlash: 0,
    lungeDX: 0, lungeDY: 0, tellPX: 0, tellPY: 0, lungeHit: false,
  };
  w.events.push({ t: 'engage' });
}

function toast(w, text, dur = 2.2) { w.msg = text; w.msgT = dur; }

function addXp(w, amt, x, y) {
  w.xp += amt;
  w.events.push({ t: 'xp', amt, x, y });
  while (w.xp >= xpNext(w.level)) {
    w.xp -= xpNext(w.level);
    w.level++;
    if (w.level % 2 === 0) w.player.maxHp = Math.min(8, w.player.maxHp + 1);
    w.player.hp = w.player.maxHp;
    w.events.push({ t: 'levelup', level: w.level });
    toast(w, `Level up! Cinder is now Lv ${w.level}!`, 2.8);
  }
}

function dropPickup(w, x, y) {
  if (w.orbs === 0 || Math.random() < 0.5) w.pickups.push({ x, y });
}

// a foe left the field (caught or fainted) — maybe more spawns, else open the door
function foeResolved(w, delay) {
  w.foe = null;
  w.catch = null;
  w.nextFoeT = delay;
}

// visual y for events (depth minus altitude)
const vy = (e, off = 0) => e.y - e.alt - off;

// apply one player hit to the foe. kind: light|combo|heavy|launcher|air|dash
function hitFoe(w, kind) {
  const p = w.player, f = w.foe;
  const mult = typeMult(p.element, f.element);
  const strong = mult > 1.01;
  const base = { light: 7, combo: 10, heavy: 16, launcher: 9, air: 8, dash: 12 }[kind];
  if (kind !== 'dash' && p.gauge < 100) {
    p.gauge = clamp(p.gauge + 12, 0, 100);
    if (p.gauge >= 100) w.events.push({ t: 'gauge_ready' });
  }
  const dazedNow = f.dazedT > 0;
  const dazeGain = base * mult * (dazedNow ? 0.35 : 1);
  f.daze = clamp(f.daze + dazeGain, 0, DAZE_KO);
  f.hitFlash = 0.09;

  // knockback direction: away from the player on the floor plane
  let ux = f.x - p.x, uy = f.y - p.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;

  if (kind === 'dash') {
    f.vAlt = 240; f.vx = ux * 190; f.vy = uy * 120; f.state = 'air';
    w.events.push({ t: 'hit', x: f.x, y: vy(f, 30), strong, big: true });
  } else if (kind === 'launcher') {
    f.vAlt = 620; f.vx = ux * 110; f.vy = uy * 70; f.state = 'air';
    w.events.push({ t: 'launch', x: f.x, y: vy(f, 24) });
  } else if (kind === 'air') {
    f.vAlt = Math.max(f.vAlt, 240);
    f.vx = ux * 140; f.vy = uy * 90;
    w.events.push({ t: 'hit', x: f.x, y: vy(f, 30), strong, big: false });
  } else {
    const kb = { light: 150, combo: 320, heavy: 460 }[kind];
    const gentle = dazedNow || f.daze >= DAZE_CATCH;
    f.vx = ux * kb * (gentle ? 0.4 : 1);
    f.vy = uy * kb * 0.6 * (gentle ? 0.4 : 1);
    if (kind === 'heavy') { f.vAlt = 200; f.state = 'air'; }
    else if (f.state !== 'air') { f.state = 'hurt'; f.timer = 0.22; }
    w.events.push({ t: 'hit', x: f.x, y: vy(f, 30), strong, big: kind !== 'light' });
  }
  if (strong && kind !== 'light') w.events.push({ t: 'strong', x: f.x, y: vy(f, 58) });

  if (f.daze >= DAZE_CATCH && f.daze < DAZE_KO && f.dazedT <= 0) {
    f.dazedT = 6.5;
    if (f.alt <= 0) f.state = 'dazed';
    w.events.push({ t: 'dazed', x: f.x, y: vy(f, 60) });
    toast(w, 'It’s dazed! Get close and throw the orb!', 2.6);
  }
  if (f.daze >= DAZE_KO) {
    const spec = SPECIES[f.species];
    w.events.push({ t: 'ko', x: f.x, y: vy(f, 30) });
    toast(w, 'Too rough… it fainted. Gentler next time!', 3.0);
    addXp(w, spec.xpKo, f.x, vy(f, 70));
    dropPickup(w, f.x, f.y);
    foeResolved(w, 1.6);
  }
}

// player attack hitbox: planar distance + similar altitude. Auto-faces.
function tryHit(w, kind) {
  const p = w.player, f = w.foe;
  if (!f) return;
  const reach = kind === 'heavy' ? 96 : 82;
  if (pdist(p.x, p.y, f.x, f.y) < reach && Math.abs(f.alt - p.alt) < 100) {
    p.facing = sign(f.x - p.x) || p.facing;
    hitFoe(w, kind);
  }
}

function stepPlayer(w, dt, input) {
  const p = w.player;
  p.animT += dt;
  p.iframes = Math.max(0, p.iframes - dt);

  // Ember Dash in progress: burst toward the foe with i-frames
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.iframes = Math.max(p.iframes, 0.06);
    p.x += p.dashDX * 1150 * dt;
    p.y += p.dashDY * 1150 * dt;
    p.x = clamp(p.x, ROOM_L, ROOM_R);
    p.y = clamp(p.y, FLOOR_TOP, FLOOR_BOT);
    if (!p.dashHit && w.foe && pdist(p.x, p.y, w.foe.x, w.foe.y) < 80) {
      p.dashHit = true;
      hitFoe(w, 'dash');
    }
    if (p.dashT <= 0) p.state = 'idle';
    return;
  }

  // collect orb pickups by walking over them
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    if (pdist(w.pickups[i].x, w.pickups[i].y, p.x, p.y) < 52) {
      w.orbs++;
      w.events.push({ t: 'pickup', x: w.pickups[i].x, y: w.pickups[i].y - 26 });
      w.pickups.splice(i, 1);
    }
  }

  // EMBER DASH — earned by fighting well; aims at the foe (or straight ahead)
  if (input.ability && p.gauge >= 100) {
    p.gauge = 0;
    p.dashT = 0.2;
    p.dashHit = false;
    if (w.foe) {
      const len = pdist(p.x, p.y, w.foe.x, w.foe.y) || 1;
      p.dashDX = (w.foe.x - p.x) / len;
      p.dashDY = (w.foe.y - p.y) / len;
    } else { p.dashDX = p.facing; p.dashDY = 0; }
    p.state = 'atk'; p.atkKind = 'dash'; p.atkT = 0.2;
    w.events.push({ t: 'dash', x: p.x, y: p.y - 40 });
    return;
  }

  // ---- ONE-THUMB GRAMMAR ----
  p.vx = 0; p.vy = 0;
  if (input.dragging) {
    // steering: move (or hold still) — Cinder never attacks while held
    p.vx = input.moveX * MOVE_SPD;
    p.vy = input.moveY * MOVE_SPD;
    if (input.moveX !== 0) p.facing = sign(input.moveX);
    p.autoT = Math.max(p.autoT, 0.22);
  } else if (w.foe) {
    // thumb up: auto-fight — approach, then attack on a cadence
    const f = w.foe;
    const dx = f.x - p.x, dy = f.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.facing = sign(dx) || p.facing;
    const range = f.alt <= 0 ? 74 : 62;
    p.autoT -= dt;
    if (d > range) {
      p.vx = (dx / d) * 175;
      p.vy = (dy / d) * 175;
    } else if (p.autoT <= 0 && p.state !== 'atk') {
      let kind;
      if (f.alt > 0) { kind = 'air'; p.autoT = 0.3; }
      else {
        p.chain = (p.chain + 1) % 4;
        kind = ['light', 'light', 'combo', 'launcher'][p.chain];
        p.autoT = 0.38;
      }
      p.state = 'atk'; p.atkKind = kind; p.atkT = 0.18;
      w.events.push({ t: 'swing', big: kind === 'combo' || kind === 'launcher' });
      tryHit(w, kind);
    }
  } else if (w.doorOpen && w.transitionT <= 0) {
    // room cleared: stroll to the doorway by himself
    const dx = DOOR_X - p.x, dy = DOOR_Y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) { p.vx = (dx / d) * 200; p.vy = (dy / d) * 200; p.facing = sign(dx) || p.facing; }
  }

  // attack animation timer
  if (p.state === 'atk') {
    p.atkT -= dt;
    if (p.atkT <= 0) p.state = 'idle';
  }

  p.x = clamp(p.x + p.vx * dt, ROOM_L, ROOM_R);
  p.y = clamp(p.y + p.vy * dt, FLOOR_TOP, FLOOR_BOT);

  // walking through the open door (steered or auto)
  if (w.doorOpen && w.transitionT <= 0 && pdist(p.x, p.y, DOOR_X, DOOR_Y) < 46) {
    w.transitionT = 0.55;
    w.events.push({ t: 'door' });
  }

  if (p.state !== 'atk') p.state = (Math.abs(p.vx) + Math.abs(p.vy)) > 12 ? 'walk' : 'idle';
}

function stepFoe(w, dt) {
  const f = w.foe, p = w.player;
  const spec = SPECIES[f.species];
  f.animT += dt;
  f.hitFlash = Math.max(0, f.hitFlash - dt);

  // daze decay / dazed window
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

  // airborne (launched/juggled)
  if (f.alt > 0 || f.vAlt > 0) {
    f.vAlt -= GRAV * dt;
    f.alt = Math.max(0, f.alt + f.vAlt * dt);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    // bounce off the room bounds — juggles stay on screen
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

  // ---- AI: approach, telegraph, lunge (2D) ----
  const dx = p.x - f.x, dy = p.y - f.y;
  const d = Math.hypot(dx, dy) || 1;
  f.facing = sign(dx) || f.facing;
  if (f.state === 'wander') {
    f.timer -= dt;
    if (d > 120) {
      f.x += (dx / d) * spec.walk * dt;
      f.y += (dy / d) * spec.walk * dt;
    } else if (f.timer <= 0) {
      f.state = 'tell'; f.timer = spec.tell;
      f.tellPX = p.x; f.tellPY = p.y; f.lungeHit = false;
      w.events.push({ t: 'tell', x: f.x, y: vy(f, 62) });
    }
  } else if (f.state === 'tell') {
    f.timer -= dt;
    if (f.timer <= 0) {
      f.state = 'lunge'; f.timer = spec.lungeT;
      const ld = Math.hypot(p.x - f.x, p.y - f.y) || 1;
      f.lungeDX = (p.x - f.x) / ld;
      f.lungeDY = (p.y - f.y) / ld;
      w.events.push({ t: 'lunge', x: f.x, y: f.y });
    }
  } else if (f.state === 'lunge') {
    f.timer -= dt;
    f.x = clamp(f.x + f.lungeDX * spec.lungeV * dt, ROOM_L, ROOM_R);
    f.y = clamp(f.y + f.lungeDY * spec.lungeV * dt, FLOOR_TOP, FLOOR_BOT);
    if (p.iframes <= 0 && pdist(f.x, f.y, p.x, p.y) < 46 && p.alt <= 20) {
      f.lungeHit = true;
      p.hp -= 1;
      p.iframes = 1.1;
      w.events.push({ t: 'player_hurt', x: p.x, y: p.y - 30 });
      if (p.hp <= 0) {
        p.hp = p.maxHp;
        f.daze = 0; f.dazedT = 0;
        toast(w, 'You blacked out… (campfires come later!)', 3.0);
        w.events.push({ t: 'wipe' });
        p.x = WORLD_W / 2; p.y = FLOOR_BOT - 60;
      }
    }
    if (f.timer <= 0) {
      // dodged it by steering away? reward the read with bond gauge
      if (!f.lungeHit && pdist(p.x, p.y, f.tellPX, f.tellPY) > 60 && p.gauge < 100) {
        p.gauge = clamp(p.gauge + 20, 0, 100);
        w.events.push({ t: 'nice_dodge', x: p.x, y: p.y - 70 });
        if (p.gauge >= 100) w.events.push({ t: 'gauge_ready' });
      }
      if (spec.skittish) {
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
    if (f.timer <= 0) { f.state = 'wander'; f.timer = 0.7 + Math.random() * 0.9; }
  }
}

// the catch mini-sequence: orb arc, then a shrinking ring — tap when it's GREEN.
function stepCatch(w, dt, input) {
  const c = w.catch, f = w.foe;
  if (!f || f.dazedT <= 0) { w.catch = null; return; }
  c.t += dt;
  if (c.phase === 'throw') {
    if (c.t >= 0.42) { c.phase = 'ring'; c.t = 0; c.ringR = 96; w.events.push({ t: 'ring_start' }); }
    return;
  }
  const DUR = SPECIES[f.species].ringDur, GRACE = 0.25;
  c.ringR = Math.max(10, 96 - (96 - 10) * (c.t / DUR));
  c.lock = Math.max(0, (c.lock || 0) - dt);
  const done = c.t - DUR > GRACE;
  const r = c.ringR;

  const caughtIt = () => {
    const spec = SPECIES[f.species];
    w.caught++;
    w.events.push({ t: 'caught', x: f.x, y: vy(f, 40) });
    toast(w, `Gotcha! ${spec.name} joined your team!`, 3.2);
    addXp(w, spec.xpCatch, f.x, vy(f, 80));
    dropPickup(w, f.x + 60, f.y);
    foeResolved(w, 1.6);
  };
  const brokeFree = () => {
    f.dazedT = 0; f.daze = 40; f.state = 'wander';
    w.catch = null;
    w.events.push({ t: 'escape', x: f.x, y: vy(f, 40) });
    toast(w, 'It broke free!', 2.0);
  };

  if (done) {
    brokeFree();
  } else if (input.ringTap && c.lock <= 0) {
    if (r <= 56) {
      caughtIt();                       // GREEN = CAUGHT. The cue is the promise.
    } else if (r <= 78) {
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

// advance to the next room after the door fade
function nextRoom(w) {
  w.room++;
  w.roomLeft = roomFoeCount(w.room);
  w.doorOpen = false;
  w.pickups.length = 0;
  w.foe = null;
  w.catch = null;
  w.nextFoeT = 0.9;
  const p = w.player;
  p.x = WORLD_W / 2;
  p.y = FLOOR_BOT - 70;
  p.vx = 0; p.vy = 0;
  if (isRestRoom(w.room)) {
    // campfire room: heal + free orbs on the grass
    p.hp = Math.min(p.maxHp, p.hp + 2);
    w.pickups.push({ x: WORLD_W / 2 - 90, y: FLOOR_TOP + 180 });
    w.pickups.push({ x: WORLD_W / 2 + 90, y: FLOOR_TOP + 240 });
    toast(w, 'A quiet clearing… rest up!', 2.4);
    w.events.push({ t: 'rest' });
  }
  w.events.push({ t: 'room', room: w.room });
}

export function step(w, dt, input) {
  w.t += dt;
  w.events.length = 0;
  if (w.msgT > 0) { w.msgT -= dt; if (w.msgT <= 0) w.msg = null; }

  // door transition fade
  if (w.transitionT > 0) {
    w.transitionT -= dt;
    if (w.transitionT <= 0) nextRoom(w);
    return;
  }

  // room population: spawn the next wild, or open the door when the room is done
  if (!w.foe && !w.doorOpen) {
    if (w.roomLeft > 0) {
      w.nextFoeT -= dt;
      if (w.nextFoeT <= 0) { w.roomLeft--; spawnFoe(w); }
    } else {
      w.doorOpen = true;
      w.events.push({ t: 'room_clear' });
      if (!isRestRoom(w.room)) toast(w, 'Clear! Onward →', 1.8);
    }
  }

  if (w.catch) {
    stepCatch(w, dt, input);
  } else {
    stepPlayer(w, dt, input);
    if (w.foe) stepFoe(w, dt);
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
