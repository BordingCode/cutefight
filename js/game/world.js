// Pure combat sim — no DOM, no canvas, no audio. The renderer and main read this state;
// side effects (sfx, hitpause, particles) are driven by the events list the sim emits
// each step. One daze meter per wild monster: the DAZED band (catchable) sits BEFORE the
// KO line — hit too hard past it and the catch is lost. That tension is the game.
import { clamp, sign } from '../engine/vec.js';
import { WORLD_W } from '../engine/canvas.js';

export const GROUND_Y = 448;          // world y of the ground line (feet rest here)
export const GRAV = 2500;
const MOVE_SPD = 265;
const HOP_VY = -800;

// daze meter thresholds (0..100)
export const DAZE_CATCH = 68;         // >= this: dazed & catchable
export const DAZE_KO = 100;           // reach this: faints, catch lost

// element chart: two RPS triangles. life: ember>leaf>tide>ember, storm: spark>frost>gust>spark
const BEATS = { ember: 'leaf', leaf: 'tide', tide: 'ember', spark: 'frost', frost: 'gust', gust: 'spark' };
export function typeMult(atk, def) {
  if (BEATS[atk] === def) return 1.6;
  if (BEATS[def] === atk) return 0.6;
  return 1.0;
}

export function createWorld() {
  return {
    t: 0,
    camX: 0,
    engaged: false,            // combat zone active: camera locked, walls bounce
    zoneL: 0, zoneR: 0,        // combat zone wall x positions
    orbs: 5,
    caught: 0,
    events: [],                // {t:'hit'|'strong'|'launch'|'bounce'|'tell'|'player_hurt'|...}
    msg: null, msgT: 0,        // transient toast message

    player: {
      species: 'cinder', element: 'ember',
      x: 140, y: GROUND_Y, vx: 0, vy: 0, onGround: true, facing: 1,
      hp: 5, maxHp: 5,
      state: 'idle',           // idle|walk|air|atk|hurt
      atkT: 0, atkKind: null, combo: 0, comboT: 0,
      chargeT: 0, charging: false,
      iframes: 0, animT: 0,
    },

    foe: null,
    nextFoeT: 1.2,             // spawn the first wild shortly after start
    catch: null,               // {phase:'throw'|'ring', t, ringR, resets}
  };
}

function spawnFoe(w) {
  w.foe = {
    species: 'sproutle', element: 'leaf',
    x: w.player.x + 620, y: GROUND_Y, vx: 0, vy: 0, onGround: true, facing: -1,
    daze: 0, dazedT: 0,        // dazedT>0 means in the dazed (catchable) window
    state: 'wander',           // wander|tell|lunge|recover|hurt|air|down|dazed
    timer: 0, animT: 0, hitFlash: 0,
    downT: 0,
  };
}

function toast(w, text, dur = 2.2) { w.msg = text; w.msgT = dur; }

// apply one player hit to the foe. kind: light|combo|heavy|launcher|air
function hitFoe(w, kind) {
  const p = w.player, f = w.foe;
  const mult = typeMult(p.element, f.element);
  const strong = mult > 1.01;
  const base = { light: 7, combo: 10, heavy: 16, launcher: 9, air: 8 }[kind];
  const dazedNow = f.dazedT > 0;
  // dazed foes take much less daze from stray hits — only big verbs risk the overkill
  const dazeGain = base * mult * (dazedNow ? 0.35 : 1);
  f.daze = clamp(f.daze + dazeGain, 0, DAZE_KO);
  f.hitFlash = 0.09;

  const dir = sign(f.x - p.x) || p.facing;
  if (kind === 'launcher') {
    f.vy = -660; f.vx = dir * 120; f.state = 'air'; f.onGround = false;
    w.events.push({ t: 'launch', x: f.x, y: f.y - 24 });
  } else if (kind === 'air') {
    f.vy = Math.min(f.vy, -300) - 120; f.vx = dir * 150;
    w.events.push({ t: 'hit', x: f.x, y: f.y - 30, strong, big: false });
  } else {
    const kb = { light: 150, combo: 330, heavy: 470 }[kind];
    f.vx = dir * kb * (dazedNow ? 0.5 : 1);
    if (kind === 'heavy') { f.vy = -220; f.onGround = false; f.state = 'air'; }
    else if (f.state !== 'air') { f.state = 'hurt'; f.timer = 0.22; }
    w.events.push({ t: 'hit', x: f.x, y: f.y - 30, strong, big: kind !== 'light' });
  }
  if (strong && kind !== 'light') w.events.push({ t: 'strong', x: f.x, y: f.y - 58 });

  // crossing into the dazed band
  if (f.daze >= DAZE_CATCH && f.daze < DAZE_KO && f.dazedT <= 0) {
    f.dazedT = 6.5;
    f.state = f.onGround ? 'dazed' : f.state;
    w.events.push({ t: 'dazed', x: f.x, y: f.y - 60 });
    toast(w, 'It’s dazed! Throw the orb!', 2.6);
  }
  // overkill — fainted, catch lost
  if (f.daze >= DAZE_KO) {
    w.events.push({ t: 'ko', x: f.x, y: f.y - 30 });
    toast(w, 'Too rough… it fainted. Gentler next time!', 3.0);
    w.foe = null;
    w.engaged = false;
    w.nextFoeT = 2.8;
  }
}

// player attack hitbox check. Auto-face: the player owns movement, the game owns
// targeting (Archero split-control) — a tap never "misses backwards".
function tryHit(w, kind) {
  const p = w.player, f = w.foe;
  if (!f) return;
  const reach = kind === 'heavy' ? 86 : 72;
  const dx = f.x - p.x;
  const closeX = Math.abs(dx) < reach;
  const closeY = Math.abs(f.y - p.y) < (kind === 'air' || !f.onGround ? 110 : 60);
  if (closeX && closeY) {
    p.facing = sign(dx) || p.facing;
    hitFoe(w, kind);
  }
}

function stepPlayer(w, dt, input) {
  const p = w.player;
  p.animT += dt;
  p.iframes = Math.max(0, p.iframes - dt);
  p.comboT = Math.max(0, p.comboT - dt);
  if (p.comboT <= 0) p.combo = 0;

  // movement (locked briefly during ground attacks)
  const lockMove = p.state === 'atk' && p.onGround;
  const mx = lockMove ? 0 : input.moveX;
  p.vx = mx * MOVE_SPD;
  if (mx !== 0) p.facing = sign(mx);

  if (input.hop && p.onGround && p.state !== 'atk') {
    p.vy = HOP_VY; p.onGround = false;
    w.events.push({ t: 'hop', x: p.x, y: p.y });
  }

  // charging heavy (hold) — slows walk while charging. The charge value is read on the
  // SAME step the release arrives, so stash it before resetting.
  const releaseCharge = p.chargeT;
  if (input.charging && p.state !== 'atk') { p.chargeT += dt; p.vx *= 0.4; }
  else if (!input.charging) p.chargeT = 0;

  // attacks
  if (p.state === 'atk') {
    p.atkT -= dt;
    if (p.atkT <= 0) p.state = p.onGround ? 'idle' : 'air';
  } else {
    if (input.launcher) {
      p.state = 'atk'; p.atkKind = 'launcher'; p.atkT = 0.26;
      w.events.push({ t: 'swing', big: true });
      tryHit(w, 'launcher');
    } else if (input.heavyRelease && releaseCharge >= 0.28) {
      p.state = 'atk'; p.atkKind = 'heavy'; p.atkT = 0.32;
      w.events.push({ t: 'swing', big: true });
      tryHit(w, 'heavy');
      p.chargeT = 0;
    } else if (input.light) {
      const airborne = !p.onGround;
      p.combo = p.comboT > 0 ? p.combo + 1 : 1;
      p.comboT = 0.9;
      const kind = airborne ? 'air' : (p.combo >= 3 ? 'combo' : 'light');
      if (p.combo >= 3) p.combo = 0;
      p.state = 'atk'; p.atkKind = kind; p.atkT = airborne ? 0.2 : 0.18;
      w.events.push({ t: 'swing', big: false });
      tryHit(w, kind);
    }
  }

  // physics
  if (!p.onGround) {
    p.vy += GRAV * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND_Y) { p.y = GROUND_Y; p.vy = 0; p.onGround = true; if (p.state === 'air') p.state = 'idle'; }
  }
  p.x += p.vx * dt;

  // walls: combat zone when engaged, otherwise world start
  const L = w.engaged ? w.zoneL + 26 : 26;
  const R = w.engaged ? w.zoneR - 26 : Infinity;
  p.x = clamp(p.x, L, R);

  if (p.state !== 'atk') p.state = !p.onGround ? 'air' : (Math.abs(p.vx) > 10 ? 'walk' : 'idle');
}

function stepFoe(w, dt) {
  const f = w.foe, p = w.player;
  f.animT += dt;
  f.hitFlash = Math.max(0, f.hitFlash - dt);

  // daze decay (never decays out of the dazed window by itself while dazedT runs)
  if (f.dazedT > 0) {
    f.dazedT -= dt;
    if (f.dazedT <= 0) {
      f.daze = 42;             // shakes it off — partial reset, the window closed
      f.state = 'wander';
      toast(w, 'It shook off the daze!', 2.0);
      w.events.push({ t: 'recover', x: f.x, y: f.y - 40 });
    }
  } else {
    f.daze = Math.max(0, f.daze - 3.5 * dt);
  }

  // physics for airborne / knockback states
  if (!f.onGround) {
    f.vy += GRAV * dt;
    f.y += f.vy * dt;
    f.x += f.vx * dt;
    // wall bounce inside the combat zone — keeps juggles on screen (SoR4 style)
    if (w.engaged) {
      if (f.x < w.zoneL + 20 && f.vx < 0) { f.x = w.zoneL + 20; f.vx *= -0.65; w.events.push({ t: 'bounce', x: f.x, y: f.y - 20 }); }
      if (f.x > w.zoneR - 20 && f.vx > 0) { f.x = w.zoneR - 20; f.vx *= -0.65; w.events.push({ t: 'bounce', x: f.x, y: f.y - 20 }); }
    }
    if (f.y >= GROUND_Y) {
      f.y = GROUND_Y; f.vy = 0; f.onGround = true; f.vx = 0;
      f.state = f.dazedT > 0 ? 'dazed' : 'down'; f.timer = 0.45;
      w.events.push({ t: 'land', x: f.x, y: f.y });
    }
    return;
  }

  // grounded knockback slide
  if (f.state === 'hurt') {
    f.timer -= dt;
    f.x += f.vx * dt;
    f.vx *= Math.pow(0.002, dt); // heavy friction
    if (w.engaged) f.x = clamp(f.x, w.zoneL + 20, w.zoneR - 20);
    if (f.timer <= 0) { f.state = f.dazedT > 0 ? 'dazed' : 'wander'; f.vx = 0; }
    return;
  }
  if (f.state === 'down') {
    f.timer -= dt;
    if (f.timer <= 0) f.state = f.dazedT > 0 ? 'dazed' : 'wander';
    return;
  }
  if (f.state === 'dazed') {
    f.x += Math.sin(f.animT * 7) * 6 * dt; // woozy sway
    return;
  }

  // ---- AI: approach, telegraph, lunge ----
  const dx = p.x - f.x;
  f.facing = sign(dx) || f.facing;
  if (f.state === 'wander') {
    f.timer -= dt;
    if (Math.abs(dx) > 120) f.x += sign(dx) * 88 * dt;
    else if (f.timer <= 0) {
      f.state = 'tell'; f.timer = 0.6;
      w.events.push({ t: 'tell', x: f.x, y: f.y - 62 });
    }
  } else if (f.state === 'tell') {
    f.timer -= dt;
    if (f.timer <= 0) {
      f.state = 'lunge'; f.timer = 0.38;
      f.vx = sign(dx) * 430;
      w.events.push({ t: 'lunge', x: f.x, y: f.y });
    }
  } else if (f.state === 'lunge') {
    f.timer -= dt;
    f.x += f.vx * dt;
    if (w.engaged) f.x = clamp(f.x, w.zoneL + 20, w.zoneR - 20);
    // hit the player?
    if (p.iframes <= 0 && Math.abs(f.x - p.x) < 42 && Math.abs(f.y - p.y) < 50) {
      p.hp -= 1;
      p.iframes = 1.1;
      p.vx = sign(p.x - f.x) * 300;
      w.events.push({ t: 'player_hurt', x: p.x, y: p.y - 30 });
      if (p.hp <= 0) {
        // M0 wipe: reset in place (campfires come in M1)
        p.hp = p.maxHp;
        f.daze = 0; f.dazedT = 0;
        toast(w, 'You blacked out… (checkpoints come later!)', 3.0);
        w.events.push({ t: 'wipe' });
        p.x = Math.max(60, w.zoneL + 40);
      }
    }
    if (f.timer <= 0) { f.state = 'recover'; f.timer = 0.9; f.vx = 0; }
  } else if (f.state === 'recover') {
    f.timer -= dt;
    if (f.timer <= 0) { f.state = 'wander'; f.timer = 0.7 + Math.random() * 0.9; }
  }
}

// the catch mini-sequence: orb arc, then a shrinking ring — tap when it's tight.
function stepCatch(w, dt, input) {
  const c = w.catch, f = w.foe;
  if (!f || f.dazedT <= 0) { w.catch = null; return; }
  c.t += dt;
  if (c.phase === 'throw') {
    if (c.t >= 0.42) { c.phase = 'ring'; c.t = 0; c.ringR = 96; w.events.push({ t: 'ring_start' }); }
    return;
  }
  // ring shrinks 96 -> 10 over ~1.15s
  c.ringR = 96 - (96 - 10) * (c.t / 1.15);
  const done = c.ringR <= 10;
  if (input.ringTap || done) {
    const r = c.ringR;
    if (!done && r <= 34) {
      // CAUGHT!
      w.caught++;
      w.events.push({ t: 'caught', x: f.x, y: f.y - 40 });
      toast(w, 'Gotcha! Sproutle joined your team!', 3.2);
      w.foe = null;
      w.engaged = false;
      w.catch = null;
      w.nextFoeT = 3.2;
    } else if (!done && r <= 58 && c.resets < 1) {
      c.resets++;
      c.t = 0; c.ringR = 96;
      w.events.push({ t: 'struggle', x: f.x, y: f.y - 40 });
      toast(w, 'It’s struggling… once more!', 1.6);
    } else {
      // broke free
      f.dazedT = 0; f.daze = 40; f.state = 'wander';
      w.catch = null;
      w.events.push({ t: 'escape', x: f.x, y: f.y - 40 });
      toast(w, 'It broke free!', 2.0);
    }
  }
}

export function step(w, dt, input) {
  w.t += dt;
  w.events.length = 0;
  if (w.msgT > 0) { w.msgT -= dt; if (w.msgT <= 0) w.msg = null; }

  // wild spawning
  if (!w.foe) {
    w.nextFoeT -= dt;
    if (w.nextFoeT <= 0) spawnFoe(w);
  }

  // engage: wild noticed you — lock the combat zone camera
  if (w.foe && !w.engaged && Math.abs(w.foe.x - w.player.x) < 470) {
    w.engaged = true;
    const cx = (w.foe.x + w.player.x) / 2;
    w.zoneL = cx - WORLD_W / 2 + 10;
    w.zoneR = cx + WORLD_W / 2 - 10;
    w.events.push({ t: 'engage' });
  }

  if (w.catch) {
    // cinematic: the world holds its breath during the throw & ring
    stepCatch(w, dt, input);
  } else {
    stepPlayer(w, dt, input);
    if (w.foe) stepFoe(w, dt);
    // start a catch?
    if (input.catchPress && w.foe && w.foe.dazedT > 0 && w.orbs > 0 && Math.abs(w.foe.x - w.player.x) < 200) {
      w.orbs--;
      w.catch = { phase: 'throw', t: 0, ringR: 96, resets: 0 };
      w.events.push({ t: 'throw', x: w.player.x, y: w.player.y - 40 });
    }
  }

  // camera: locked to zone while engaged, else trails the player
  const target = w.engaged ? w.zoneL - 10 : w.player.x - 320;
  w.camX += (Math.max(0, target) - w.camX) * Math.min(1, dt * 6);
}
