// Pure game sim — no DOM, no canvas, no audio. Open-world edition: a village hub and
// big scrolling zones (see data/zones.js) with wild monsters grazing in pockets.
// x = across, y = depth (free 2D move), alt = height (launcher pops).
// One-thumb rule: thumb down = steer/rein in; thumb up = your monster fights.
// Wilds notice you, chase, and leash back home if you flee. Gate guardians open the
// way between zones (defeat OR befriend). Aurorix waits at the Summit (two endings).
import { clamp, sign } from '../engine/vec.js';
import { ZONES, VIEW_W, VIEW_H, VISTA } from '../data/zones.js';
import { QUESTS, HUNTS } from '../data/quests.js';

export const GRAV = 2100;
const MOVE_SPD = 250;

export const DAZE_CATCH = 68;
export const DAZE_KO = 100;
export const LVL_CAP = 16;

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
  gustling: { element: 'gust',  style: 'ranged', cadence: 0.5,  baseHp: 6, dmg: 0.9,  shotSpeed: 470, sig: 'gale',       sigName: 'Gale Burst' },
  glimmoth: { element: 'spark', style: 'ranged', cadence: 0.45, baseHp: 5, dmg: 0.8,  shotSpeed: 500, sig: 'lure',       sigName: 'Lure Lantern' },
  mycelisk: { element: 'leaf',  style: 'melee',  cadence: 0.45, baseHp: 8, dmg: 0.95, sig: 'spore',      sigName: 'Drowse Spores' },
  brinemaw: { element: 'tide',  style: 'melee',  cadence: 0.42, baseHp: 7, dmg: 1.1,  sig: 'undertow',   sigName: 'Undertow' },
};

// dex/sanctuary display order — "catch & evolve them all" covers these nine
export const DEX_ORDER = ['cinder', 'sproutle', 'dewdrip', 'voltling', 'frostnip', 'gustling', 'glimmoth', 'mycelisk', 'brinemaw'];

// ---- cooldown abilities: a1 from Lv 1, a2 unlocks when the monster evolves ----
// (the signature move on the bond gauge is separate — see PLAYABLE.sig)
export const ABILITIES = {
  cinder:   { a1: { key: 'flamespit',  name: 'Flame Spit',      cd: 6 },  a2: { key: 'embers',     name: 'Warding Embers',  cd: 11 } },
  sproutle: { a1: { key: 'seedsnap',   name: 'Seed Snap',       cd: 6 },  a2: { key: 'vine',       name: 'Rooting Vine',    cd: 10 } },
  dewdrip:  { a1: { key: 'tidejet',    name: 'Tide Jet',        cd: 6 },  a2: { key: 'mistveil',   name: 'Mist Veil',       cd: 12 } },
  voltling: { a1: { key: 'zap',        name: 'Static Zap',      cd: 5 },  a2: { key: 'overcharge', name: 'Overcharge',      cd: 12 } },
  frostnip: { a1: { key: 'coldsnap',   name: 'Cold Snap',       cd: 7 },  a2: { key: 'hailstone',  name: 'Hailstone',       cd: 10 } },
  gustling: { a1: { key: 'tailwind',   name: 'Tailwind',        cd: 7 },  a2: { key: 'slipstream', name: 'Slipstream Shot', cd: 9 } },
  glimmoth: { a1: { key: 'flash',      name: 'Dazzle Flash',    cd: 8 },  a2: { key: 'glimmer',    name: 'Glimmer Veil',    cd: 12 } },
  mycelisk: { a1: { key: 'bash',       name: 'Shell Bash',      cd: 6 },  a2: { key: 'regrowth',   name: 'Regrowth',        cd: 14 } },
  brinemaw: { a1: { key: 'bite',       name: 'Snap Bite',       cd: 6 },  a2: { key: 'brinearmor', name: 'Brine Armor',     cd: 12 } },
};

// ---- wild side of each species: how it fights when it's the FOE ----
// shoot = its attack is a dodgeable projectile; push = the shot shoves the player.
// aerial = hovers (melee answers with air juggles); ambush = sits dead still, short
// notice range, brutal lunge.
export const SPECIES = {
  cinder:   { name: 'Cinder',   element: 'ember', tell: 0.5,  lungeV: 470, lungeT: 0.34, recover: 0.8,  walk: 100, ringDur: 1.35, xpKo: 10, xpCatch: 26, skittish: false },
  sproutle: { name: 'Sproutle', element: 'leaf',  tell: 0.6,  lungeV: 430, lungeT: 0.38, recover: 0.9,  walk: 88,  ringDur: 1.5,  xpKo: 8,  xpCatch: 20, skittish: false },
  voltling: { name: 'Voltling', element: 'spark', tell: 0.42, lungeV: 540, lungeT: 0.3,  recover: 0.6,  walk: 130, ringDur: 1.25, xpKo: 12, xpCatch: 28, skittish: true },
  dewdrip:  { name: 'Dewdrip',  element: 'tide',  tell: 0.55, lungeV: 0,   lungeT: 0.2,  recover: 1.0,  walk: 76,  ringDur: 1.35, xpKo: 10, xpCatch: 24, shoot: { speed: 330, n: 1 } },
  frostnip: { name: 'Frostnip', element: 'frost', tell: 0.7,  lungeV: 380, lungeT: 0.42, recover: 1.1,  walk: 70,  ringDur: 1.2,  xpKo: 14, xpCatch: 32, shoot: { speed: 280, n: 2 } },
  gustling: { name: 'Gustling', element: 'gust',  tell: 0.5,  lungeV: 0,   lungeT: 0.2,  recover: 0.9,  walk: 95,  ringDur: 1.4,  xpKo: 9,  xpCatch: 22, skittish: true, shoot: { speed: 300, n: 1, push: 70 } },
  glimmoth: { name: 'Glimmoth', element: 'spark', tell: 0.5,  lungeV: 0,   lungeT: 0.2,  recover: 0.8,  walk: 85,  ringDur: 1.15, xpKo: 16, xpCatch: 36, aerial: true, shoot: { speed: 340, n: 2 } },
  mycelisk: { name: 'Mycelisk', element: 'leaf',  tell: 0.65, lungeV: 0,   lungeT: 0.2,  recover: 1.2,  walk: 55,  ringDur: 1.3,  xpKo: 18, xpCatch: 40, tanky: true, shoot: { speed: 240, n: 3 } },
  brinemaw: { name: 'Brinemaw', element: 'tide',  tell: 0.55, lungeV: 560, lungeT: 0.34, recover: 1.3,  walk: 60,  ringDur: 1.2,  xpKo: 20, xpCatch: 44, ambush: true },
};

export const xpNext = (level) => 30 + 25 * (level - 1);

// ---- team ----
export function mkMember(species, level = 1) {
  const P = PLAYABLE[species];
  const maxHp = P.baseHp + Math.floor(level / 2);
  return { species, level, xp: 0, hp: maxHp, maxHp, gauge: 0, evolved: false, fainted: false, cd1: 0, cd2: 0 };
}

export function createWorld() {
  return {
    t: 0,
    zone: 'village',
    cam: { x: 0, y: 0 },
    orbs: 5,
    caught: 0,
    dex: {},                   // species -> catch count
    dexEvolved: {},            // species -> true once evolved
    seen: {},                  // species -> true once spotted in the wild
    ended: null,               // 'befriended' | 'defeated' once the legendary falls
    charm: false,              // Aurora Charm (dex-completion reward)
    team: [],                  // filled by initTeam (starter pick / save load)
    reserve: [],               // caught monsters resting at the Sanctuary
    active: 0,                 // your LEAD — only changeable in the village Sanctuary
    hasteT: 0,                 // Overcharge: attack-speed burst
    swiftT: 0,                 // Tailwind / Mist Veil: move-speed burst
    empower: 0,                // Glimmer Veil: next shots hit much harder
    pickups: [],
    hazards: [],               // {type:'thorn'|'frost'|'fire'|'spore'|'lure', x, y, r, t, slow?, dot?}
    pshots: [], eshots: [],    // player / enemy projectiles
    shield: 0, shieldT: 0,     // Bubble Shield charges / timer
    spawnCount: 0,
    events: [],
    msg: null, msgT: 0,

    player: {
      x: ZONES.village.spawn.x, y: ZONES.village.spawn.y, alt: 0, vAlt: 0,
      vx: 0, vy: 0, facing: 1,
      state: 'idle', atkT: 0, atkKind: null,
      dashT: 0, dashHit: false, dashDX: 1, dashDY: 0,
      blinkT: 0, blinkHits: 0,
      autoT: 0, chain: 0,
      iframes: 0, animT: 0,
    },

    foes: [],
    target: null,              // the foe your monster is currently fighting
    catch: null,               // {foe, phase, t, ringR, resets, lock}

    gatesOpen: [],             // gate ids whose guardian fell / befriended
    gateReady: [],             // gate ids whose guardian has appeared (quest unlocked)
    quests: { i: 0, accepted: false, objDone: false },
    campfiresLit: [],
    visited: ['village'],
    respawn: { zone: 'village', x: ZONES.village.spawn.x, y: ZONES.village.spawn.y },
    pocketState: {},           // zoneId -> {pockets:[{alive,t}], rare:{alive,t}}

    hunt: null,                // {i} — the accepted Warden bounty
    huntsDone: 0,
    cacheState: {},            // zoneId -> [{t}] orb-cache respawn clocks
    areaName: '',              // named sub-area under the player's feet

    transitionT: 0, revealT: 0,
    _travel: null,
    _blockMsgT: 0,
    _respawnT: 0,
    _areaT: 0,
    nearInteract: null,
    colliders: [],
    paused: false,
  };
}

export function initTeam(w, starter) {
  w.team = [mkMember(starter)];
  w.active = 0;
  w.dex[starter] = w.dex[starter] || 0;
}

export const activeMember = (w) => w.team[w.active];
export const activeP = (w) => PLAYABLE[activeMember(w).species];
export const zoneOf = (w) => ZONES[w.zone];

const pdist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const vy = (e, off = 0) => e.y - (e.alt || 0) - off;

function toast(w, text, dur = 2.2) { w.msg = text; w.msgT = dur; }

// ---------- zone geometry ----------
function clampToZone(w, e) {
  const z = zoneOf(w);
  e.x = clamp(e.x, 26, z.w - 26);
  e.y = clamp(e.y, 26, z.h - 26);
}

function buildColliders(w) {
  const z = zoneOf(w);
  const list = [...z.obstacles];
  for (const it of z.interactables) if (it.r) list.push(it);
  for (const g of z.gates) {
    if (!w.gatesOpen.includes(g.id) && !(g.boss.legendary)) list.push({ kind: 'gateblock', x: g.x, y: g.y, r: 58 });
  }
  w.colliders = list;
}

function resolveCircles(w, e, pad = 18) {
  for (const o of w.colliders) {
    if (!o.r) continue;
    const dx = e.x - o.x, dy = e.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = o.r + pad;
    if (d < min && d > 0.001) {
      e.x = o.x + (dx / d) * min;
      e.y = o.y + (dy / d) * min;
    }
  }
}

// ---------- camera ----------
function camTargets(w) {
  const z = zoneOf(w), p = w.player;
  return [
    clamp(p.x - VIEW_W / 2, 0, Math.max(0, z.w - VIEW_W)),
    clamp(p.y - VIEW_H * 0.55, -VISTA, Math.max(-VISTA, z.h - VIEW_H)),
  ];
}
function stepCamera(w, dt) {
  const [tx, ty] = camTargets(w);
  const k = Math.min(1, 8 * dt);
  w.cam.x += (tx - w.cam.x) * k;
  w.cam.y += (ty - w.cam.y) * k;
}
function snapCam(w) {
  const [tx, ty] = camTargets(w);
  w.cam.x = tx; w.cam.y = ty;
}

// ---------- spawning ----------
function mkFoe(w, species, x, y, lvl, opts = {}) {
  w.spawnCount++;
  const spec = SPECIES[species];
  const boss = opts.boss || null;
  const f = {
    species, element: spec.element,
    boss,
    gateId: opts.gateId || null,
    name: boss ? boss.name : spec.name,
    lvl,
    // bosses use their hand-tuned resist; wilds toughen with level
    resist: boss ? boss.resist : 1 + (lvl - 1) * 0.12,
    scale: boss ? boss.scale : 1,
    dmg: (boss && boss.legendary) ? 2 : (lvl >= 10 ? 2 : 1),
    x, y, home: { x, y },
    pocketI: opts.pocketI ?? -1,
    rare: !!opts.rare,
    alpha: !!opts.alpha,
    aggro: false,
    noticeR: boss ? 260 : spec.ambush ? 150 : spec.skittish ? 200 : 230,
    immuneT: 0,
    grazeT: 0, grazeX: x, grazeY: y,
    alt: 0, vAlt: 0, vx: 0, vy: 0, facing: -1,
    daze: 0, dazedT: 0, slowT: 0, rootT: 0,
    state: 'graze', timer: 0.5, animT: Math.random() * 10, hitFlash: 0,
    lungeDX: 0, lungeDY: 0, tellPX: 0, tellPY: 0, lungeHit: false, pattern: 0,
  };
  w.foes.push(f);
  return f;
}

function pocketStateFor(w, zoneId) {
  const z = ZONES[zoneId];
  if (!w.pocketState[zoneId]) {
    w.pocketState[zoneId] = {
      pockets: z.pockets.map(() => ({ alive: -1, t: 0 })),
      rare: { alive: -1, t: 0 },
    };
  }
  return w.pocketState[zoneId];
}

function spawnPocket(w, pk, i, count) {
  for (let j = 0; j < count; j++) {
    const species = pk.species[(w.spawnCount + j) % pk.species.length];
    const ox = ((w.spawnCount * 167 + j * 211) % (pk.r * 2)) - pk.r;
    const oy = ((w.spawnCount * 97 + j * 139) % (pk.r * 1.2)) - pk.r * 0.6;
    const lvl = pk.lvl[0] + ((w.spawnCount + j) % (pk.lvl[1] - pk.lvl[0] + 1));
    const f = mkFoe(w, species, pk.x + ox, pk.y + oy, lvl, { pocketI: i });
    clampToZone(w, f);
    f.home.x = f.x; f.home.y = f.y;
  }
}

function spawnGateGuardians(w) {
  const z = zoneOf(w);
  for (const g of z.gates) {
    if (w.foes.some((f) => f.gateId === g.id || (g.boss.legendary && f.boss && f.boss.legendary))) continue;
    if (g.boss.legendary) {
      if (w.ended) continue;
      mkFoe(w, g.boss.species, g.x, g.y, g.boss.lvl, { boss: g.boss, gateId: g.id });
    } else if (!w.gatesOpen.includes(g.id) && (!g.needsQuest || w.gateReady.includes(g.id))) {
      mkFoe(w, g.boss.species, g.x, g.y, g.boss.lvl, { boss: g.boss, gateId: g.id });
    }
  }
}

function seedZone(w) {
  const z = zoneOf(w);
  w.foes.length = 0;
  const ps = pocketStateFor(w, w.zone);
  z.pockets.forEach((pk, i) => {
    const st = ps.pockets[i];
    if (st.alive === -1 || (st.alive === 0 && w.t >= st.t)) st.alive = pk.n;
    if (st.alive > 0) spawnPocket(w, pk, i, st.alive);
  });
  if (z.rare) {
    if (ps.rare.alive === -1 || (ps.rare.alive === 0 && w.t >= ps.rare.t)) ps.rare.alive = 1;
    if (ps.rare.alive > 0) {
      const f = mkFoe(w, z.rare.species, z.rare.x, z.rare.y, z.rare.lvl, { rare: true });
      f.noticeR = 250;
    }
  }
  spawnGateGuardians(w);
  spawnHuntTarget(w);
  // orb caches tucked off the beaten path — they refill slowly
  if (z.caches) {
    if (!w.cacheState[w.zone]) w.cacheState[w.zone] = z.caches.map(() => ({ t: 0 }));
    z.caches.forEach((c, i) => {
      const st = w.cacheState[w.zone][i];
      if (w.t < st.t) return; // cooldown starts when LOOTED, not when seen
      for (let j = 0; j < c.n; j++) {
        w.pickups.push({ x: c.x + (j % 2) * 44 - 22, y: c.y + Math.floor(j / 2) * 40 - 10, cacheI: i });
      }
    });
  }
}

// ---------- post-ending bounty hunts ----------
export function currentHunt(w) {
  return w.hunt ? HUNTS[w.hunt.i % HUNTS.length] : null;
}

export function acceptHunt(w) {
  if (!w.ended || w.hunt) return;
  w.hunt = { i: w.huntsDone % HUNTS.length };
  if (currentHunt(w).zone === w.zone) spawnHuntTarget(w);
}

function spawnHuntTarget(w) {
  const h = currentHunt(w);
  if (!h || h.zone !== w.zone) return;
  if (w.foes.some((f) => f.alpha || (f.boss && f.boss.rematch))) return;
  if (h.rematch) {
    mkFoe(w, 'frostnip', h.x, h.y, h.lvl, {
      boss: { species: 'frostnip', name: 'STORM ECHO', resist: 5.0, scale: 2, lvl: h.lvl, legendary: true, rematch: true },
      gateId: null,
    });
  } else {
    const f = mkFoe(w, h.species, h.x, h.y, h.lvl, { alpha: true });
    f.name = 'Alpha ' + SPECIES[h.species].name;
    f.resist *= 2.4;
    f.scale = 1.4;
    f.dmg = 2;
    f.noticeR = 300;
  }
}

function huntBounty(w, f) {
  const h = currentHunt(w);
  const orbs = h ? h.bounty : 10;
  w.orbs += orbs;
  w.huntsDone++;
  w.hunt = null;
  w.events.push({ t: 'hunt_done' });
  toast(w, `Bounty complete! The Warden owes you ${orbs} orbs — collected.`, 3.4);
}

// pockets refill while you're away from them
function checkRespawns(w, dt) {
  w._respawnT -= dt;
  if (w._respawnT > 0) return;
  w._respawnT = 1.2;
  const z = zoneOf(w), p = w.player;
  const ps = pocketStateFor(w, w.zone);
  z.pockets.forEach((pk, i) => {
    const st = ps.pockets[i];
    if (st.alive === 0 && w.t >= st.t && pdist(p.x, p.y, pk.x, pk.y) > 520) {
      st.alive = pk.n;
      spawnPocket(w, pk, i, st.alive);
    }
  });
  if (z.rare && ps.rare.alive === 0 && w.t >= ps.rare.t && pdist(p.x, p.y, z.rare.x, z.rare.y) > 520) {
    ps.rare.alive = 1;
    const f = mkFoe(w, z.rare.species, z.rare.x, z.rare.y, z.rare.lvl, { rare: true });
    f.noticeR = 250;
  }
}

// ---------- travel ----------
export function travelTo(w, zoneId, at) {
  w.zone = zoneId;
  const p = w.player;
  p.x = at.x; p.y = at.y; p.vx = 0; p.vy = 0; p.dashT = 0;
  w.hazards.length = 0;
  w.pshots.length = 0; w.eshots.length = 0;
  w.pickups.length = 0;
  w.catch = null; w.target = null;
  // fainted teammates pick themselves back up on the road (1 hp)
  for (const tm of w.team) if (tm.fainted) { tm.fainted = false; tm.hp = Math.max(1, tm.hp); }
  if (!w.visited.includes(zoneId)) w.visited.push(zoneId);
  buildColliders(w);
  seedZone(w);
  snapCam(w);
  w.revealT = 0.35;
  w.events.push({ t: 'zone', zone: zoneId, name: ZONES[zoneId].name });
}

function requestTravel(w, to, at) {
  if (w.transitionT > 0 || w._travel) return;
  w.transitionT = 0.55;
  w._travel = { to, at };
  w.events.push({ t: 'travel' });
}

// ---------- xp / leveling (active member) ----------
function addXp(w, amt, x, y) {
  const m = activeMember(w);
  if (!m) return;
  if (m.level >= LVL_CAP) return;
  m.xp += amt;
  w.events.push({ t: 'xp', amt, x, y });
  while (m.level < LVL_CAP && m.xp >= xpNext(m.level)) {
    m.xp -= xpNext(m.level);
    m.level++;
    m.maxHp = PLAYABLE[m.species].baseHp + Math.floor(m.level / 2);
    m.hp = m.maxHp;
    w.events.push({ t: 'levelup', level: m.level });
    toast(w, `Level up! ${SPECIES[m.species]?.name || m.species} is now Lv ${m.level}!`, 2.6);
  }
}

const foeXp = (f, base) => Math.round(base * (1 + (f.lvl - 1) * 0.18));

function dropPickup(w, x, y) {
  if (w.orbs === 0 || Math.random() < 0.45) {
    const pk = { x, y };
    w.pickups.push(pk);
    clampToZone(w, pk);
  }
}

function foeResolved(w, f) {
  const i = w.foes.indexOf(f);
  if (i >= 0) w.foes.splice(i, 1);
  if (w.catch && w.catch.foe === f) w.catch = null;
  if (w.target === f) w.target = null;
  const ps = pocketStateFor(w, w.zone);
  if (f.pocketI >= 0 && ps.pockets[f.pocketI]) {
    const st = ps.pockets[f.pocketI];
    st.alive = Math.max(0, st.alive - 1);
    if (st.alive === 0) st.t = w.t + zoneOf(w).pockets[f.pocketI].respawn;
  } else if (f.rare) {
    ps.rare.alive = 0;
    ps.rare.t = w.t + (zoneOf(w).rare?.respawn || 180);
  }
}

// ---------- aggro ----------
function markSeen(w, f) {
  if (f.boss || w.seen[f.species]) return;
  w.seen[f.species] = true;
  w.events.push({ t: 'seen', species: f.species });
}

function aggroFoe(w, f) {
  if (f.aggro) return;
  f.aggro = true;
  if (f.state === 'graze' || f.state === 'return') { f.state = 'wander'; f.timer = 0.35; }
  markSeen(w, f);
  w.events.push({ t: f.boss ? 'boss' : 'engage', name: f.name });
  if (f.boss) toast(w, `${f.name} ${f.boss.legendary ? 'wakes — the storm howls!' : 'blocks the way!'}`, 2.6);
}

function aggroPack(w, f) {
  aggroFoe(w, f);
  if (f.pocketI < 0) return;
  for (const o of w.foes) {
    if (o !== f && o.pocketI === f.pocketI && !o.aggro && o.immuneT <= 0 && pdist(o.x, o.y, f.x, f.y) < 420) aggroFoe(w, o);
  }
}

// ---------- combat ----------
function gaugeGain(w, amt) {
  const m = activeMember(w);
  if (!m || m.gauge >= 100) return;
  m.gauge = clamp(m.gauge + amt, 0, 100);
  if (m.gauge >= 100) w.events.push({ t: 'gauge_ready' });
}

// a foe slipping into the golden daze band — the catch window
function maybeDaze(w, f) {
  const catchable = !f.boss || f.boss.legendary || f.gateId;
  if (!(catchable && f.daze >= DAZE_CATCH && f.daze < DAZE_KO && f.dazedT <= 0)) return;
  f.dazedT = f.boss ? 5.0 : 6.5;
  if (SPECIES[f.species].aerial) { f.alt = 0; f.vAlt = 0; }
  if (f.alt <= 0) f.state = 'dazed';
  w.events.push({ t: 'dazed', x: f.x, y: vy(f, 60) });
  toast(w, f.boss && f.boss.legendary ? 'AURORIX is dazed… the storm holds its breath!' : 'It’s dazed! Get close and throw the orb!', 2.6);
  // the pack backs off for a beat — room to walk in and throw
  for (const o of w.foes) {
    if (o !== f && o.aggro && o.dazedT <= 0 && pdist(o.x, o.y, f.x, f.y) < 420 && o.state !== 'air') {
      o.state = 'recover';
      o.timer = Math.max(o.timer, 1.5);
    }
  }
}

function hitFoe(w, f, kind, dmgMul = 1) {
  const p = w.player;
  const m = activeMember(w);
  const P = activeP(w);
  aggroPack(w, f);
  const mult = typeMult(P.element, f.element);
  const strong = mult > 1.01;
  const base = { light: 7, combo: 10, heavy: 16, launcher: 9, air: 8, dash: 12, shot: 8, blink: 11, zone: 1 }[kind];
  if (kind !== 'dash' && kind !== 'blink' && kind !== 'zone') gaugeGain(w, kind === 'shot' ? 8 : 12);

  const dazedNow = f.dazedT > 0;
  const evolvedMul = m && m.evolved ? 1.18 : 1;
  const lvlMul = m ? 1 + (m.level - 1) * 0.05 : 1; // your monster grows stronger too
  const dazeGain = (base * mult * P.dmg * dmgMul * evolvedMul * lvlMul * (dazedNow ? 0.35 : 1)) / f.resist;
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

  maybeDaze(w, f);
  if (f.daze >= DAZE_KO) koFoe(w, f);
}

function openGate(w, id) {
  if (w.gatesOpen.includes(id)) return;
  w.gatesOpen.push(id);
  buildColliders(w);
  w.events.push({ t: 'gate_open', id });
  toast(w, 'The path is open!', 3.0);
}

function koFoe(w, f) {
  const spec = SPECIES[f.species];
  w.events.push({ t: 'ko', x: f.x, y: vy(f, 30) });
  if (f.boss) {
    addXp(w, foeXp(f, 60), f.x, vy(f, 70));
    w.pickups.push({ x: f.x - 40, y: f.y }, { x: f.x + 40, y: f.y });
    if (f.boss.rematch) {
      w.events.push({ t: 'boss_down' });
      foeResolved(w, f);
      huntBounty(w, f);
      return;
    }
    if (f.boss.legendary) {
      w.ended = 'defeated';
      w.events.push({ t: 'ending', kind: 'defeated' });
    } else {
      toast(w, `${f.boss.name} is defeated!`, 3.0);
      w.events.push({ t: 'boss_down' });
      if (f.gateId) openGate(w, f.gateId);
    }
  } else if (f.alpha) {
    addXp(w, foeXp(f, 40), f.x, vy(f, 70));
    foeResolved(w, f);
    huntBounty(w, f);
    return;
  } else {
    toast(w, 'Too rough… it fainted. Gentler next time!', 3.0);
    addXp(w, foeXp(f, spec.xpKo), f.x, vy(f, 70));
    dropPickup(w, f.x, f.y);
  }
  foeResolved(w, f);
}

// your monster's current opponent: nearest aggro'd foe, else a nearby grazing one
// (so thumb-up next to a calm wild deliberately starts the fight)
function nearestFoe(w) {
  const p = w.player;
  let best = null, bd = 420;
  for (const f of w.foes) {
    if (!f.aggro || f.immuneT > 0) continue;
    const d = pdist(p.x, p.y, f.x, f.y);
    if (d < bd) { bd = d; best = f; }
  }
  if (best) return best;
  bd = 200;
  for (const f of w.foes) {
    if (f.aggro || f.immuneT > 0) continue;
    const d = pdist(p.x, p.y, f.x, f.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function tryHit(w, f, kind) {
  const p = w.player;
  if (!f) return;
  const reach = (kind === 'heavy' ? 96 : 82) + (f.boss ? 40 : 0);
  if (pdist(p.x, p.y, f.x, f.y) < reach && Math.abs((f.alt || 0) - p.alt) < 100) {
    p.facing = sign(f.x - p.x) || p.facing;
    hitFoe(w, f, kind);
  }
}

// spawn a player projectile toward (tx,ty); opts: speed/dmgMul/slow/pierce/kb/spread
function mkShot(w, tx, ty, opts = {}) {
  const p = w.player;
  const P = activeP(w);
  const speed = opts.speed || P.shotSpeed || 470;
  const ang = Math.atan2(ty - 34 - (p.y - 34), tx - p.x) + (opts.spread || 0);
  let dmgMul = opts.dmgMul || 1;
  if (w.empower > 0) { dmgMul *= 2.5; w.empower--; }
  w.pshots.push({
    x: p.x, y: p.y - 34,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    element: opts.element || P.element, slow: opts.slow ?? !!P.slow,
    dmgMul, pierce: !!opts.pierce, kb: !!opts.kb, hit: opts.pierce ? [] : null,
    life: 2.2,
  });
  p.facing = sign(tx - p.x) || p.facing;
}

function fireShot(w, f) {
  if (!f) return;
  mkShot(w, f.x, f.y);
  w.events.push({ t: 'shoot' });
}

// aim point for abilities: the current target, else straight ahead
function aimAt(w, dist = 220) {
  const p = w.player;
  return w.target ? [w.target.x, w.target.y] : [p.x + p.facing * dist, p.y];
}

// ---------- signature moves ----------
function useSig(w) {
  const p = w.player;
  const m = activeMember(w);
  const P = activeP(w);
  const f = w.target;
  m.gauge = 0;
  w.events.push({ t: 'sig', sig: P.sig, x: p.x, y: p.y - 40 });
  if (P.sig === 'dash') {
    p.dashT = 0.2; p.dashHit = false;
    if (f) {
      const len = pdist(p.x, p.y, f.x, f.y) || 1;
      p.dashDX = (f.x - p.x) / len; p.dashDY = (f.y - p.y) / len;
    } else { p.dashDX = p.facing; p.dashDY = 0; }
    p.state = 'atk'; p.atkKind = 'dash'; p.atkT = 0.2;
  } else if (P.sig === 'thorn') {
    const tx = f ? f.x : p.x + p.facing * 120;
    const ty = f ? f.y : p.y;
    w.hazards.push({ type: 'thorn', x: tx, y: ty, r: 78, t: 6 });
    if (m.evolved) w.hazards.push({ type: 'thorn', x: tx + 130, y: ty, r: 78, t: 6 });
  } else if (P.sig === 'shield') {
    w.shield = m.evolved ? 3 : 2;
    w.shieldT = 7;
  } else if (P.sig === 'blink') {
    if (f) {
      p.x = f.x - (sign(f.x - p.x) || 1) * 60;
      p.y = f.y;
      clampToZone(w, p);
      p.iframes = Math.max(p.iframes, 0.4);
      hitFoe(w, f, 'blink');
      p.blinkHits = m.evolved ? 1 : 0;
      p.blinkT = 0.25;
    }
  } else if (P.sig === 'frostfield') {
    w.hazards.push({ type: 'frost', x: p.x, y: p.y, r: m.evolved ? 132 : 95, t: 5 });
  } else if (P.sig === 'gale') {
    // radial wind burst: shoves the pack away, pops them airborne, clears shots
    const R = m.evolved ? 260 : 180;
    for (const o of w.foes) {
      if (pdist(p.x, p.y, o.x, o.y) > R) continue;
      aggroPack(w, o);
      let ux = o.x - p.x, uy = o.y - p.y;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len; uy /= len;
      const kb = o.boss ? 0.25 : 1;
      o.vAlt = 300 * kb; o.vx = ux * 260 * kb; o.vy = uy * 170 * kb;
      if (!o.boss) o.state = 'air';
      o.hitFlash = 0.09;
    }
    for (let i = w.eshots.length - 1; i >= 0; i--) {
      if (pdist(p.x, p.y, w.eshots[i].x, w.eshots[i].y) < R + 40) w.eshots.splice(i, 1);
    }
  } else if (P.sig === 'lure') {
    // a lantern that fascinates nearby foes — they chase it instead of you
    const tx = p.x + p.facing * 140, ty = p.y;
    w.hazards.push({ type: 'lure', x: tx, y: ty, r: 110, t: m.evolved ? 8 : 5 });
  } else if (P.sig === 'spore') {
    // drowsy spores: daze-over-time that can NEVER knock out — the catcher's tool
    w.hazards.push({ type: 'spore', x: f ? f.x : p.x + p.facing * 100, y: f ? f.y : p.y, r: 100, t: 6, slow: m.evolved });
  } else if (P.sig === 'undertow') {
    // drag the pack toward you and root them — sets up cleaves and hazards
    const R = 260;
    for (const o of [...w.foes]) {
      const d = pdist(p.x, p.y, o.x, o.y);
      if (d > R || o.boss) { if (d <= R && o.boss) { o.rootT = Math.max(o.rootT, 0.5); } continue; }
      aggroPack(w, o);
      const pull = Math.max(0, d - 90);
      let ux = p.x - o.x, uy = p.y - o.y;
      const len = Math.hypot(ux, uy) || 1;
      o.x += (ux / len) * pull;
      o.y += (uy / len) * pull;
      o.rootT = Math.max(o.rootT, 0.8);
      o.hitFlash = 0.09;
      if (m.evolved) hitFoe(w, o, 'zone', 6);
    }
  }
}

// ---------- cooldown abilities (a1 always, a2 once evolved) ----------
function useAbility(w, slot) {
  const p = w.player;
  const m = activeMember(w);
  const AB = ABILITIES[m.species];
  if (!AB) return;
  const ab = slot === 1 ? AB.a1 : AB.a2;
  if (slot === 2 && !m.evolved) return;
  if ((slot === 1 ? m.cd1 : m.cd2) > 0) return;
  const f = w.target;
  const done = () => {
    if (slot === 1) m.cd1 = ab.cd; else m.cd2 = ab.cd;
    w.events.push({ t: 'ability', key: ab.key, name: ab.name, x: p.x, y: p.y - 44, element: activeP(w).element });
  };

  switch (ab.key) {
    case 'flamespit': { const [tx, ty] = aimAt(w); mkShot(w, tx, ty, { speed: 520, dmgMul: 1.3, element: 'ember', slow: false }); done(); break; }
    case 'embers': w.hazards.push({ type: 'fire', x: p.x, y: p.y, r: 92, t: 4 }); done(); break;
    case 'seedsnap': { const [tx, ty] = aimAt(w); for (const s of [-0.28, 0, 0.28]) mkShot(w, tx, ty, { spread: s, dmgMul: 0.9 }); done(); break; }
    case 'vine': if (f) { f.rootT = Math.max(f.rootT, 1.6); hitFoe(w, f, 'zone', 4); done(); } break;
    case 'tidejet': { const [tx, ty] = aimAt(w); mkShot(w, tx, ty, { speed: 640, dmgMul: 2.2, kb: true, slow: false }); done(); break; }
    case 'mistveil': p.iframes = Math.max(p.iframes, 1.2); w.swiftT = Math.max(w.swiftT, 2.5); done(); break;
    case 'zap': {
      if (!f) break;
      hitFoe(w, f, 'zone', 8);
      let other = null, bd = 220;
      for (const o of w.foes) {
        if (o === f) continue;
        const d = pdist(o.x, o.y, f.x, f.y);
        if (d < bd) { bd = d; other = o; }
      }
      if (other) hitFoe(w, other, 'zone', 8);
      done(); break;
    }
    case 'overcharge': w.hasteT = 4; done(); break;
    case 'coldsnap': {
      for (const o of [...w.foes]) {
        if (pdist(p.x, p.y, o.x, o.y) > 150) continue;
        o.slowT = Math.max(o.slowT, 2.5);
        hitFoe(w, o, 'zone', 3);
      }
      done(); break;
    }
    case 'hailstone': { const [tx, ty] = aimAt(w); mkShot(w, tx, ty, { speed: 260, dmgMul: 2.6, slow: true, element: 'frost' }); done(); break; }
    case 'tailwind': w.swiftT = Math.max(w.swiftT, 2.5); p.iframes = Math.max(p.iframes, 0.35); p.autoT = 0; done(); break;
    case 'slipstream': { const [tx, ty] = aimAt(w); mkShot(w, tx, ty, { speed: 640, dmgMul: 1.4, pierce: true, element: 'gust', slow: false }); done(); break; }
    case 'flash': {
      for (const o of [...w.foes]) {
        if (pdist(p.x, p.y, o.x, o.y) > 175) continue;
        if (o.state === 'tell' || o.state === 'lunge') { o.state = 'recover'; o.timer = 1.2; }
        hitFoe(w, o, 'zone', 4);
      }
      done(); break;
    }
    case 'glimmer': w.empower = 1; p.iframes = Math.max(p.iframes, 1.0); done(); break;
    case 'bash': if (f) { tryHit(w, f, 'heavy'); done(); } break;
    case 'regrowth': if (m.hp < m.maxHp) { m.hp = Math.min(m.maxHp, m.hp + 2); w.events.push({ t: 'heal', x: p.x, y: p.y - 60 }); done(); } break;
    case 'bite': {
      if (f) {
        const len = pdist(p.x, p.y, f.x, f.y) || 1;
        p.dashDX = (f.x - p.x) / len; p.dashDY = (f.y - p.y) / len;
      } else { p.dashDX = p.facing; p.dashDY = 0; }
      p.dashT = 0.12; p.dashHit = false;
      p.state = 'atk'; p.atkKind = 'dash'; p.atkT = 0.12;
      done(); break;
    }
    case 'brinearmor': w.shield = Math.max(w.shield, 1); w.shieldT = 5; done(); break;
  }
}

// ---------- player ----------
function stepPlayer(w, dt, input) {
  const p = w.player;
  const m = activeMember(w);
  const P = activeP(w);
  const z = zoneOf(w);
  p.animT += dt;
  p.iframes = Math.max(0, p.iframes - dt);
  w.hasteT = Math.max(0, w.hasteT - dt);
  w.swiftT = Math.max(0, w.swiftT - dt);
  for (const tm of w.team) { tm.cd1 = Math.max(0, (tm.cd1 || 0) - dt); tm.cd2 = Math.max(0, (tm.cd2 || 0) - dt); }
  if (w.shieldT > 0) { w.shieldT -= dt; if (w.shieldT <= 0) w.shield = 0; }

  w.target = nearestFoe(w);

  // cooldown abilities
  if (input.ability1) useAbility(w, 1);
  if (input.ability2) useAbility(w, 2);

  // evolved blink: the chained second strike
  if (p.blinkT > 0) {
    p.blinkT -= dt;
    if (p.blinkT <= 0 && p.blinkHits > 0 && w.target) {
      p.blinkHits--;
      const f = w.target;
      p.x = f.x + (sign(p.x - f.x) || 1) * 60;
      clampToZone(w, p);
      hitFoe(w, f, 'blink');
      w.events.push({ t: 'sig', sig: 'blink', x: p.x, y: p.y - 40 });
    }
  }

  // Ember Dash in progress
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.iframes = Math.max(p.iframes, 0.06);
    p.x += p.dashDX * 1150 * dt;
    p.y += p.dashDY * 1150 * dt;
    clampToZone(w, p);
    if (m && m.species === 'cinder' && m.evolved && Math.random() < 0.5) w.hazards.push({ type: 'fire', x: p.x, y: p.y, r: 46, t: 2.5 });
    if (!p.dashHit && w.target && pdist(p.x, p.y, w.target.x, w.target.y) < 80 + (w.target.boss ? 40 : 0)) {
      p.dashHit = true;
      hitFoe(w, w.target, 'dash');
    }
    if (p.dashT <= 0) { p.state = 'idle'; resolveCircles(w, p); }
    return;
  }

  // pickups
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    if (pdist(w.pickups[i].x, w.pickups[i].y, p.x, p.y) < 52) {
      w.orbs++;
      const pk = w.pickups[i];
      if (pk.cacheI != null && w.cacheState[w.zone]) w.cacheState[w.zone][pk.cacheI].t = w.t + 300;
      w.events.push({ t: 'pickup', x: pk.x, y: pk.y - 26 });
      w.pickups.splice(i, 1);
    }
  }

  // signature move
  if (input.ability && m && m.gauge >= 100) {
    useSig(w);
    if (activeP(w).sig === 'dash') return;
  }

  // one-thumb grammar
  const spd = MOVE_SPD * (w.swiftT > 0 ? 1.45 : 1);
  p.vx = 0; p.vy = 0;
  if (input.dragging) {
    p.vx = input.moveX * spd;
    p.vy = input.moveY * spd;
    if (input.moveX !== 0) p.facing = sign(input.moveX);
    p.autoT = Math.max(p.autoT, 0.22);
  } else if (w.target) {
    const f = w.target;
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
        p.autoT = P.cadence * (w.hasteT > 0 ? 0.55 : 1);
        fireShot(w, f);
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
          p.autoT = P.cadence * (w.hasteT > 0 ? 0.55 : 1);
        }
        p.state = 'atk'; p.atkKind = kind; p.atkT = 0.18;
        w.events.push({ t: 'swing', big: kind === 'combo' || kind === 'launcher' });
        tryHit(w, f, kind);
      }
    }
  }

  if (p.state === 'atk') {
    p.atkT -= dt;
    if (p.atkT <= 0) p.state = 'idle';
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampToZone(w, p);
  resolveCircles(w, p);

  // zone exits — closed gates shove you back at once; open ways need you to
  // LINGER a beat, so a wild scuffle can't fling you across the border
  let inExit = null;
  for (const ex of z.exits) {
    if (pdist(p.x, p.y, ex.x, ex.y) < ex.r) { inExit = ex; break; }
  }
  const exitBlocked = inExit && ((inExit.gate && !w.gatesOpen.includes(inExit.gate)) || (inExit.needsEnd && !w.ended));
  if (exitBlocked) {
    const ex = inExit;
    let ux = p.x - ex.x, uy = p.y - ex.y;
    const len = Math.hypot(ux, uy) || 1;
    p.x = ex.x + (ux / len) * (ex.r + 8);
    p.y = ex.y + (uy / len) * (ex.r + 8);
    clampToZone(w, p);
    if (w._blockMsgT <= 0) {
      w._blockMsgT = 2.8;
      toast(w, ex.needsEnd
        ? 'The storm beyond is still too wild… settle things at the Ring first.'
        : w.gateReady.includes(ex.gate) ? 'The guardian bars the way!' : 'The way is blocked… the Warden may know more.', 2.6);
    }
    w._exitT = 0;
  } else {
    w._exitT = inExit ? (w._exitT || 0) + dt : 0;
    if (inExit && w._exitT > 0.35) {
      w._exitT = 0;
      requestTravel(w, inExit.to, inExit.at);
    }
  }

  if (p.state !== 'atk') p.state = (Math.abs(p.vx) + Math.abs(p.vy)) > 12 ? 'walk' : 'idle';
}

// ---------- village & campfire interactables ----------
function useCampfire(w, it) {
  for (const tm of w.team) { tm.fainted = false; tm.hp = tm.maxHp; }
  w.respawn = { zone: w.zone, x: it.x, y: it.y + 64 };
  if (!w.campfiresLit.includes(it.id)) {
    w.campfiresLit.push(it.id);
    w.events.push({ t: 'campfire_lit', id: it.id });
  }
  w.events.push({ t: 'campfire', x: it.x, y: it.y - 40 });
  // evolution ceremony: one Lv5+ team member blossoms per rest
  const evo = w.team.find((tm) => tm.level >= 5 && !tm.evolved);
  if (evo) {
    evo.evolved = true;
    w.dexEvolved[evo.species] = true;
    w.events.push({ t: 'evolved', species: evo.species });
    toast(w, `✨ ${SPECIES[evo.species]?.name || evo.species} has grown stronger! Its ${PLAYABLE[evo.species].sigName} evolved!`, 3.6);
  } else {
    toast(w, 'The fire crackles… your team is rested.', 2.6);
  }
}

// which named sub-area is under the player's feet (drawn under the zone tag)
function stepAreas(w, dt) {
  w._areaT -= dt;
  if (w._areaT > 0) return;
  w._areaT = 0.3;
  const z = zoneOf(w), p = w.player;
  let name = '';
  if (z.areas) {
    for (const a of z.areas) {
      const dx = (p.x - a.x) / a.rx, dy = (p.y - a.y) / a.ry;
      if (dx * dx + dy * dy <= 1) { name = a.name; break; }
    }
  }
  w.areaName = name;
}

function stepInteract(w, input) {
  const z = zoneOf(w), p = w.player;
  w.nearInteract = null;
  let bd = 95;
  for (const it of z.interactables) {
    const d = pdist(p.x, p.y, it.x, it.y);
    if (d < bd) { bd = d; w.nearInteract = it; }
  }
  if (w.nearInteract && input.tapped) {
    const it = w.nearInteract;
    if (it.kind === 'campfire') useCampfire(w, it);
    else if (it.kind === 'sanctuary') w.events.push({ t: 'open_sanctuary' });
    else if (it.kind === 'warden') w.events.push({ t: 'open_warden' });
  }
}

// ---------- player getting hurt (lunges and shots share this) ----------
function hurtPlayer(w, fromFoe, dmg = 1) {
  const p = w.player;
  const m = activeMember(w);
  if (p.iframes > 0) return false;
  if (w.shield > 0) {
    w.shield--;
    p.iframes = 0.5;
    w.events.push({ t: 'blocked', x: p.x, y: p.y - 50 });
    // evolved Bubble Shield reflects a sting back
    if (m && m.species === 'dewdrip' && m.evolved && fromFoe) hitFoe(w, fromFoe, 'zone', 8);
    return true;
  }
  m.hp -= dmg;
  p.iframes = 1.1;
  w.events.push({ t: 'player_hurt', x: p.x, y: p.y - 30 });
  if (m.hp <= 0) {
    // your LEAD falls — blackout. Teammates don't step in; choose your lead wisely.
    m.hp = 0;
    const lost = w.charm ? 0 : Math.floor(w.orbs / 3);
    w.orbs -= lost;
    for (const tm of w.team) { tm.fainted = false; tm.hp = Math.max(1, Math.ceil(tm.maxHp / 2)); }
    w.events.push({ t: 'wipe' });
    toast(w, lost > 0 ? `${SPECIES[m.species]?.name || m.species} fell! You blacked out… (-${lost} orbs)` : `${SPECIES[m.species]?.name || m.species} fell! You blacked out…`, 3.2);
    w.transitionT = 0.7;
    w._travel = { to: w.respawn.zone, at: { x: w.respawn.x, y: w.respawn.y } };
  }
  return true;
}

// ---------- foe ----------
function stepFoe(w, f, dt) {
  const p = w.player;
  const spec = SPECIES[f.species];
  f.animT += dt;
  f.hitFlash = Math.max(0, f.hitFlash - dt);
  f.slowT = Math.max(0, f.slowT - dt);
  f.rootT = Math.max(0, f.rootT - dt);
  f.immuneT = Math.max(0, f.immuneT - dt);

  // hazard zones (they persist across swaps — set a trap, swap, cash it in)
  for (const hz of w.hazards) {
    if (hz.type === 'lure') continue;
    if (pdist(hz.x, hz.y, f.x, f.y) < hz.r + 20) {
      if (hz.type === 'thorn') { f.rootT = Math.max(f.rootT, 0.25); hitFoe(w, f, 'zone', 5.5 * dt * 10); }
      if (hz.type === 'frost') f.slowT = Math.max(f.slowT, 0.3);
      if (hz.type === 'fire') hitFoe(w, f, 'zone', 4.5 * dt * 10);
      if (hz.type === 'spore') {
        // drowse: builds daze slowly but can never KO — stay in the cloud ~5s
        aggroPack(w, f);
        f.daze = Math.min(f.daze + (14 / Math.max(0.7, f.resist)) * dt, DAZE_KO - 8);
        if (hz.slow) f.slowT = Math.max(f.slowT, 0.3);
        f.hitFlash = Math.max(f.hitFlash, 0.04);
        maybeDaze(w, f);
      }
      if (!w.foes.includes(f)) return; // the zone tick might KO
    }
  }

  const speedMul = (f.slowT > 0 ? 0.45 : 1) * (f.rootT > 0 ? 0 : 1);

  if (f.dazedT > 0) {
    f.dazedT -= dt;
    if (f.dazedT <= 0) {
      f.daze = 42;
      f.state = f.aggro ? 'wander' : 'graze';
      toast(w, 'It shook off the daze!', 2.0);
      w.events.push({ t: 'recover', x: f.x, y: vy(f, 40) });
    }
  } else if (f.state !== 'return') {
    f.daze = Math.max(0, f.daze - 3.5 * dt);
  }

  // airborne physics (launched)
  if (f.state === 'air' || f.vAlt > 0 || (f.alt > 0 && !spec.aerial)) {
    f.vAlt -= GRAV * dt;
    f.alt = Math.max(0, f.alt + f.vAlt * dt);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    clampToZone(w, f);
    if (f.alt <= 0 && f.vAlt <= 0) {
      f.vAlt = 0; f.vx = 0; f.vy = 0;
      f.state = f.dazedT > 0 ? 'dazed' : 'down';
      f.timer = 0.45;
      w.events.push({ t: 'land', x: f.x, y: f.y });
    }
    return;
  }

  // aerial species hover-bob when grounded-alive
  if (spec.aerial && f.dazedT <= 0 && f.state !== 'down') {
    f.alt = 22 + Math.sin(f.animT * 2.6) * 14;
  }

  if (f.state === 'hurt') {
    f.timer -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    clampToZone(w, f);
    const fr = Math.pow(0.002, dt);
    f.vx *= fr; f.vy *= fr;
    if (f.timer <= 0) { f.state = f.dazedT > 0 ? 'dazed' : (f.aggro ? 'wander' : 'graze'); f.vx = 0; f.vy = 0; }
    return;
  }
  if (f.state === 'down') {
    f.timer -= dt;
    if (f.timer <= 0) f.state = f.dazedT > 0 ? 'dazed' : (f.aggro ? 'wander' : 'graze');
    return;
  }
  if (f.state === 'dazed') {
    f.x += Math.sin(f.animT * 7) * 6 * dt;
    return;
  }

  // ---- calm side: grazing, noticing, leashing home ----
  if (!f.aggro) {
    if (f.state === 'return') {
      const hd = pdist(f.x, f.y, f.home.x, f.home.y);
      f.daze = Math.max(0, f.daze - 10.5 * dt);
      if (hd < 24) { f.state = 'graze'; f.timer = 0.5; }
      else {
        f.facing = sign(f.home.x - f.x) || f.facing;
        f.x += ((f.home.x - f.x) / hd) * spec.walk * 1.2 * dt;
        f.y += ((f.home.y - f.y) / hd) * spec.walk * 1.2 * dt;
      }
      return;
    }
    // notice the player?
    if (f.immuneT <= 0 && pdist(f.x, f.y, p.x, p.y) < f.noticeR) {
      aggroPack(w, f);
    } else {
      // amble around home (ambushers and guardians sit perfectly still)
      if (!spec.ambush && !f.boss) {
        f.grazeT -= dt;
        if (f.grazeT <= 0) {
          f.grazeT = 1.6 + Math.random() * 2.4;
          const R = 110;
          f.grazeX = f.home.x + (Math.random() * 2 - 1) * R;
          f.grazeY = f.home.y + (Math.random() * 2 - 1) * R * 0.6;
        }
        const gd = pdist(f.x, f.y, f.grazeX, f.grazeY);
        if (gd > 14) {
          f.facing = sign(f.grazeX - f.x) || f.facing;
          f.x += ((f.grazeX - f.x) / gd) * spec.walk * 0.35 * speedMul * dt;
          f.y += ((f.grazeY - f.y) / gd) * spec.walk * 0.35 * speedMul * dt;
          clampToZone(w, f);
        }
      }
      return;
    }
  }

  // ---- aggro side: leash first (bosses guard their spot, wilds their pocket) ----
  const leashHome = f.boss ? 520 : 620;
  if (f.dazedT <= 0 && (pdist(f.x, f.y, f.home.x, f.home.y) > leashHome || (!f.boss && pdist(f.x, f.y, p.x, p.y) > 700))) {
    f.aggro = false;
    f.state = 'return';
    f.immuneT = 2;
    return;
  }

  // aim point: the player, unless a Lure Lantern has its attention
  let tx = p.x, ty = p.y;
  for (const hz of w.hazards) {
    if (hz.type === 'lure' && pdist(hz.x, hz.y, f.x, f.y) < 300) { tx = hz.x; ty = hz.y; break; }
  }

  const dx = tx - f.x, dy = ty - f.y;
  const d = Math.hypot(dx, dy) || 1;
  f.facing = sign(dx) || f.facing;
  const tellTime = spec.tell * (f.boss ? 1.15 : 1);
  if (f.state === 'wander') {
    f.timer -= dt;
    const wantRange = spec.shoot ? 260 : (f.boss ? 210 : 120);
    if (d > wantRange) {
      f.x += (dx / d) * spec.walk * speedMul * dt;
      f.y += (dy / d) * spec.walk * speedMul * dt;
      clampToZone(w, f);
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
        // ranged attack: dodgeable projectiles at the target
        const n = f.boss ? 3 : (spec.shoot ? spec.shoot.n : 1);
        const speed = spec.shoot ? spec.shoot.speed : 330;
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.35;
          const ang = Math.atan2(ty - f.y, tx - f.x) + spread;
          w.eshots.push({ x: f.x, y: f.y - 30, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, element: f.element, life: 3, push: spec.shoot ? spec.shoot.push : 0, dmg: f.dmg });
        }
        w.events.push({ t: 'eshoot' });
        f.state = 'recover'; f.timer = spec.recover;
      } else {
        f.state = 'lunge'; f.timer = spec.lungeT;
        const ld = Math.hypot(tx - f.x, ty - f.y) || 1;
        f.lungeDX = (tx - f.x) / ld;
        f.lungeDY = (ty - f.y) / ld;
        w.events.push({ t: 'lunge', x: f.x, y: f.y });
      }
    }
  } else if (f.state === 'lunge') {
    f.timer -= dt;
    f.x += f.lungeDX * spec.lungeV * speedMul * dt;
    f.y += f.lungeDY * spec.lungeV * speedMul * dt;
    clampToZone(w, f);
    if (pdist(f.x, f.y, p.x, p.y) < 46 + (f.boss ? 30 : 0) && p.alt <= 20) {
      if (hurtPlayer(w, f, f.dmg)) f.lungeHit = true;
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
  const z = zoneOf(w);
  for (let i = w.pshots.length - 1; i >= 0; i--) {
    const s = w.pshots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let dead = s.life <= 0 || s.x < 0 || s.x > z.w || s.y < 0 || s.y > z.h;
    if (!dead) {
      for (const f of [...w.foes]) {
        if (s.hit && s.hit.includes(f)) continue; // piercing shots hit each foe once
        if (pdist(s.x, s.y, f.x, f.y - (f.alt || 0) - 30) < 40 + (f.boss ? 40 : 0)) {
          if (s.slow) f.slowT = Math.max(f.slowT, 2.4);
          if (s.kb && !f.boss) {
            const sp = Math.hypot(s.vx, s.vy) || 1;
            f.vx = (s.vx / sp) * 320; f.vy = (s.vy / sp) * 200;
            f.state = 'hurt'; f.timer = 0.25;
          }
          hitFoe(w, f, 'shot', s.dmgMul || 1);
          if (s.pierce) { s.hit.push(f); continue; }
          dead = true;
          break;
        }
      }
    }
    if (dead) w.pshots.splice(i, 1);
  }
  for (let i = w.eshots.length - 1; i >= 0; i--) {
    const s = w.eshots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let dead = s.life <= 0 || s.x < 0 || s.x > z.w || s.y < 0 || s.y > z.h;
    if (!dead && pdist(s.x, s.y, p.x, p.y - 34) < 36) {
      hurtPlayer(w, null, s.dmg || 1);
      if (s.push) {
        const spd = Math.hypot(s.vx, s.vy) || 1;
        p.x += (s.vx / spd) * s.push;
        p.y += (s.vy / spd) * s.push;
        clampToZone(w, p);
      }
      dead = true;
    }
    if (dead) w.eshots.splice(i, 1);
  }
}

// ---------- catching ----------
function stepCatch(w, dt, input) {
  const c = w.catch;
  const f = c && c.foe;
  if (!f || !w.foes.includes(f) || f.dazedT <= 0) { w.catch = null; return; }
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
    w.events.push({ t: 'caught', x: f.x, y: vy(f, 40), species: f.species });
    addXp(w, foeXp(f, spec.xpCatch), f.x, vy(f, 80));
    if (f.boss && f.boss.rematch) {
      toast(w, 'The echo settles, soothed. The Ring is quiet again.', 3.4);
      foeResolved(w, f);
      huntBounty(w, f);
      return;
    }
    if (f.boss && f.boss.legendary) {
      w.ended = 'befriended';
      w.events.push({ t: 'ending', kind: 'befriended' });
      foeResolved(w, f);
      return;
    }
    if (f.gateId) openGate(w, f.gateId);
    const wasAlpha = f.alpha;
    const lvl = clamp(f.lvl, 1, LVL_CAP);
    const haveIt = w.team.some((tm) => tm.species === f.species) || w.reserve.some((tm) => tm.species === f.species);
    if (!haveIt && w.team.length < 4) {
      w.team.push(mkMember(f.species, lvl));
      toast(w, `Gotcha! ${spec.name} joined your team!`, 3.2);
      w.events.push({ t: 'joined', species: f.species });
    } else if (!haveIt) {
      w.reserve.push(mkMember(f.species, lvl));
      toast(w, `Gotcha! ${spec.name} rests at the Sanctuary — visit to swap it in.`, 3.2);
      w.events.push({ t: 'joined', species: f.species });
    } else {
      w.orbs += 2;
      toast(w, `Gotcha! ${spec.name} scampers off happy — it left you 2 orbs.`, 3.0);
    }
    dropPickup(w, f.x + 60, f.y);
    foeResolved(w, f);
    if (wasAlpha) huntBounty(w, f);
  };
  const brokeFree = () => {
    f.dazedT = 0; f.daze = 40; f.state = 'wander'; f.aggro = true;
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

// ---------- quests ----------
function objectiveSatisfied(w, o) {
  if (o.type === 'reach' && o.campfire) return w.campfiresLit.includes(o.campfire);
  if (o.type === 'reach' && o.zone) return w.visited.includes(o.zone);
  if (o.type === 'catch') return o.species ? (w.dex[o.species] || 0) > 0 : w.caught > 0;
  if (o.type === 'seen') return !!w.seen[o.species] || (w.dex[o.species] || 0) > 0;
  if (o.type === 'gate') return w.gatesOpen.includes(o.gate);
  return false;
}

export function acceptQuest(w) {
  const q = QUESTS[w.quests.i];
  if (!q || w.quests.accepted) return;
  w.quests.accepted = true;
  if (objectiveSatisfied(w, q.objective)) w.quests.objDone = true;
}

export function turnInQuest(w) {
  const q = QUESTS[w.quests.i];
  if (!q || !w.quests.accepted || !w.quests.objDone) return;
  if (q.reward && q.reward.orbs) {
    w.orbs += q.reward.orbs;
    toast(w, `Quest reward: +${q.reward.orbs} orbs!`, 2.6);
  }
  if (q.unlocks && !w.gateReady.includes(q.unlocks)) {
    w.gateReady.push(q.unlocks);
    spawnGateGuardians(w);
  }
  w.quests = { i: w.quests.i + 1, accepted: false, objDone: false };
}

function stepQuests(w) {
  const q = QUESTS[w.quests.i];
  if (!q || !w.quests.accepted || w.quests.objDone) return;
  const o = q.objective;
  let hit = false;
  for (const ev of w.events) {
    if (o.type === 'reach' && o.campfire && ev.t === 'campfire_lit' && ev.id === o.campfire) hit = true;
    if (o.type === 'reach' && o.zone && ev.t === 'zone' && ev.zone === o.zone) hit = true;
    if (o.type === 'catch' && ev.t === 'caught' && (!o.species || ev.species === o.species)) hit = true;
    if (o.type === 'seen' && (ev.t === 'seen' || ev.t === 'caught') && ev.species === o.species) hit = true;
    if (o.type === 'gate' && ev.t === 'gate_open' && ev.id === o.gate) hit = true;
  }
  if (hit) {
    w.quests.objDone = true;
    w.events.push({ t: 'quest_obj' });
    toast(w, `Quest complete: ${q.title} — return to the Warden!`, 3.4);
  }
}

// dex-completion mission: all nine caught AND all nine evolved
export function dexComplete(w) {
  return DEX_ORDER.every((sp) => (w.dex[sp] || 0) > 0) && DEX_ORDER.every((sp) => w.dexEvolved[sp]);
}

export function claimCharm(w) {
  if (w.charm || !dexComplete(w)) return false;
  w.charm = true;
  toast(w, '🌟 The Aurora Charm is yours! Wipes cost no orbs now.', 4.0);
  return true;
}

// ---------- main step ----------
export function step(w, dt, input) {
  w.t += dt;
  w.events.length = 0;
  if (!w.team.length || w.paused) return; // waiting for starter pick / map open
  if (w.msgT > 0) { w.msgT -= dt; if (w.msgT <= 0) w.msg = null; }
  w._blockMsgT = Math.max(0, w._blockMsgT - dt);
  if (w.revealT > 0) w.revealT -= dt;

  if (w.transitionT > 0) {
    w.transitionT -= dt;
    if (w.transitionT <= 0 && w._travel) {
      const tr = w._travel;
      w._travel = null;
      travelTo(w, tr.to, tr.at);
    }
    return;
  }

  // hazard timers
  for (let i = w.hazards.length - 1; i >= 0; i--) {
    w.hazards[i].t -= dt;
    if (w.hazards[i].t <= 0) w.hazards.splice(i, 1);
  }

  if (w.catch) {
    // the world holds its breath during a throw
    stepCatch(w, dt, input);
  } else {
    stepPlayer(w, dt, input);
    if (w.transitionT <= 0) {
      const p = w.player;
      for (let i = w.foes.length - 1; i >= 0; i--) {
        const f = w.foes[i];
        if (pdist(f.x, f.y, p.x, p.y) > 1100) {
          // far-away foes idle cheaply
          f.dazedT = Math.max(0, f.dazedT - dt);
          f.daze = Math.max(0, f.daze - 3.5 * dt);
          continue;
        }
        stepFoe(w, f, dt);
      }
      stepShots(w, dt);
      stepInteract(w, input);
      stepAreas(w, dt);
      checkRespawns(w, dt);

      if (input.catchPress) {
        // throw at the nearest dazed foe in range
        let best = null, bd = 340;
        for (const f of w.foes) {
          if (f.dazedT <= 0) continue;
          const d = pdist(f.x, f.y, p.x, p.y);
          if (d < bd) { bd = d; best = f; }
        }
        if (best) {
          if (w.orbs <= 0) {
            toast(w, 'No orbs left!', 2.2);
            w.events.push({ t: 'denied' });
          } else {
            w.orbs--;
            w.catch = { foe: best, phase: 'throw', t: 0, ringR: 96, resets: 0, lock: 0 };
            w.events.push({ t: 'throw', x: p.x, y: p.y - 40 });
          }
        } else if (w.foes.some((f) => f.dazedT > 0)) {
          toast(w, 'Too far — walk closer and throw again!', 2.2);
          w.events.push({ t: 'denied' });
        }
      }
    }
  }

  stepQuests(w);
  stepCamera(w, dt);
}
