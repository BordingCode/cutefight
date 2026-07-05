// Boot + glue: sim events -> FX/audio/HUD. Pure sim lives in game/world.js.
import { CanvasView } from './engine/canvas.js';
import { GameLoop } from './engine/loop.js';
import { FX, updateFX, addTrauma, hitStop, screenFlash, burst, shockwave, floatText } from './engine/fx.js';
import { buildSprites } from './data/sprites.js';
import { createWorld, step, xpNext, initTeam, resumeAt, mkMember, PLAYABLE, SPECIES } from './game/world.js';
import { draw } from './game/render.js';
import { Controls } from './game/controls.js';
import { initAudio, resumeAudio, sfx, startMusic, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const view = new CanvasView(canvas);
const S = buildSprites();
const controls = new Controls($('padzone'), $('catchbtn'));

let world = createWorld();
let started = false;
let frameMs = 0;
let autosaveT = 0;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

FX.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- save v2 ----------
const SAVE_KEY = 'cutefight_save_v2';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      team: world.team, active: world.active, room: world.room,
      orbs: world.orbs, caught: world.caught, dex: world.dex, ended: world.ended,
    }));
  } catch (e) {}
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s || !s.team || !s.team.length) return false;
    world.team = s.team.map((m) => ({ ...mkMember(m.species, m.level || 1), ...m }));
    world.active = Math.min(s.active || 0, world.team.length - 1);
    world.orbs = s.orbs ?? 5;
    world.caught = s.caught ?? 0;
    world.dex = s.dex || {};
    world.ended = s.ended || null;
    resumeAt(world, s.room || 1);
    return true;
  } catch (e) { return false; }
}

// ---------- DOM HUD ----------
function member() { return world.team[world.active]; }

function renderHearts() {
  const m = member();
  const el = $('hearts');
  if (!m) { el.innerHTML = ''; return; }
  let s = '';
  for (let i = 0; i < m.maxHp; i++) s += `<span class="${i < m.hp ? 'hp' : 'hp empty'}">♥</span>`;
  el.innerHTML = s;
}

// mini sprite thumbnails for team strip / starter cards
function thumb(species, size = 44) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(S[species].idle[0].img, 0, 0, size, size);
  return c;
}

let teamKey = '';
function renderTeam() {
  const key = world.team.map((m, i) => `${m.species}:${m.hp}/${m.maxHp}:${m.gauge | 0}:${m.fainted ? 1 : 0}:${m.level}:${m.evolved ? 1 : 0}:${i === world.active ? 1 : 0}`).join('|');
  if (key === teamKey) return;
  teamKey = key;
  const el = $('teamstrip');
  el.innerHTML = '';
  world.team.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'mate' + (i === world.active ? ' on' : '') + (m.fainted ? ' out' : '');
    d.appendChild(thumb(m.species));
    const bar = document.createElement('i');
    bar.style.width = Math.round((m.hp / m.maxHp) * 100) + '%';
    const barwrap = document.createElement('b');
    barwrap.appendChild(bar);
    d.appendChild(barwrap);
    const lv = document.createElement('u');
    lv.textContent = (m.evolved ? '★' : '') + 'Lv' + m.level;
    d.appendChild(lv);
    d.addEventListener('pointerdown', (e) => { world.swapReq = i; e.preventDefault(); e.stopPropagation(); });
    el.appendChild(d);
  });
}

const hud = { orbs: -1, caught: -1, level: -1, xp: -1, gauge: -1, catchShow: null };
function renderCounts() {
  const m = member();
  if (world.orbs !== hud.orbs) { hud.orbs = world.orbs; $('orbcount').textContent = world.orbs; }
  if (world.caught !== hud.caught) { hud.caught = world.caught; $('caughtcount').textContent = world.caught; }
  if (m && m.level !== hud.level) { hud.level = m.level; $('lvltag').textContent = 'Lv ' + m.level; }
  if (m && m.xp !== hud.xp) {
    hud.xp = m.xp;
    $('xpfill').style.width = Math.round((m.xp / xpNext(m.level)) * 100) + '%';
  }
  const g = m ? m.gauge : 0;
  if (g !== hud.gauge) {
    hud.gauge = g;
    $('abilitybtn').classList.toggle('ready', g >= 100);
    $('abilitybtn').style.opacity = g >= 100 ? '' : String(0.35 + (g / 100) * 0.4);
  }
}
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- learn-by-doing coach ----------
const TUT_KEY = 'cutefight_tut_v3';
const tutSteps = [
  { text: '👆 Touch & DRAG anywhere to move' },
  { text: 'Lift your thumb — your monster fights by itself!' },
  { text: '“!” means incoming — DRAG away to dodge!' },
  { text: 'Dazed! Hold to calm down, get close, throw!' },
];
let tutStep = localStorage.getItem(TUT_KEY) ? -1 : 0;
let tutWalk = 0;
function tutShow() {
  const el = $('hint');
  if (tutStep < 0 || tutStep >= tutSteps.length) { el.classList.remove('show'); return; }
  el.textContent = tutSteps[tutStep].text;
  el.classList.add('show');
}
function tutAdvance() {
  tutStep++;
  if (tutStep >= tutSteps.length) { tutStep = -1; localStorage.setItem(TUT_KEY, '1'); }
  tutShow();
}
function tutUpdate(dt, input) {
  if (tutStep < 0) return;
  if (tutStep === 0) {
    if (input.moveX !== 0 || input.moveY !== 0) { tutWalk += dt; if (tutWalk > 0.6) tutAdvance(); }
  } else if (tutStep === 1) {
    if (world.events.some((e) => e.t === 'swing' || e.t === 'shoot')) tutAdvance();
  } else if (tutStep === 2) {
    if (world.events.some((e) => e.t === 'nice_dodge' || e.t === 'dazed')) tutAdvance();
  } else if (tutStep === 3) {
    if (world.events.some((e) => e.t === 'throw')) tutAdvance();
  }
}

// ---------- ending ----------
function showEnding(kind) {
  const el = $('ending');
  $('endtitle').textContent = kind === 'befriended' ? 'The Storm Sleeps' : 'The Storm Breaks';
  $('endtext').textContent = kind === 'befriended'
    ? 'AURORIX was never angry — only lost, and very afraid. It rests now, curled at your side. Down in the valley the clouds open, and for the first time in a year the fields see the sun. You walked the whole way up with one thumb and a soft heart. The Wanderer’s Path lies ahead, if you two feel like walking it together.'
    : 'AURORIX falls, and the storm scatters with it. The valley is saved — the fields will dry, the crops will grow. And yet, as you head down the mountain, you wonder what it was so afraid of. Perhaps some other journey will tell you. The Wanderer’s Path lies ahead.';
  el.classList.add('show');
  saveGame();
}
$('endclose').addEventListener('pointerup', () => $('ending').classList.remove('show'));

// ---------- sim events -> juice ----------
function handleEvents() {
  for (const ev of world.events) {
    switch (ev.t) {
      case 'swing': sfx.swing(ev.big); break;
      case 'shoot': sfx.shoot ? sfx.shoot() : sfx.swing(false); break;
      case 'eshoot': sfx.tell(); break;
      case 'hit':
        sfx.hit();
        if (ev.big) { sfx.boing(); hitStop(0.07); addTrauma(0.18); }
        else hitStop(0.035);
        burst(ev.x, ev.y, ev.big ? 10 : 5, { color: ev.strong ? '#ffd23e' : '#ffffff', speed: 130, grav: 300 });
        break;
      case 'strong':
        sfx.strong();
        floatText(ev.x, ev.y, 'STRONG!', { color: '#ffd23e', size: 20, crit: true });
        break;
      case 'launch':
        sfx.launch(); hitStop(0.09); addTrauma(0.2);
        burst(ev.x, ev.y, 12, { color: '#ffb45e', speed: 180, grav: 260 });
        break;
      case 'bounce': sfx.bounce(); burst(ev.x, ev.y, 6, { color: '#ffffff', speed: 120 }); break;
      case 'land': burst(ev.x, ev.y, 5, { color: '#c3e88f', speed: 90, grav: 200 }); break;
      case 'room_clear': sfx.pickup(); break;
      case 'door': sfx.dash(); saveGame(); break;
      case 'rest': sfx.levelup(); break;
      case 'room': renderHearts(); break;
      case 'nice_dodge':
        sfx.bounce();
        floatText(ev.x, ev.y, 'Nice dodge! +bond', { color: '#7dff8a', size: 16 });
        break;
      case 'tell': sfx.tell(); break;
      case 'dazed':
        sfx.dazed();
        shockwave(ev.x, ev.y, { color: '#ffd23e', max: 70 });
        break;
      case 'throw': sfx.throw(); break;
      case 'struggle': sfx.struggle(); break;
      case 'toosoon':
        sfx.hit();
        floatText(ev.x, ev.y, 'Too soon!', { color: '#ffffff', size: 16 });
        break;
      case 'caught':
        sfx.caught(); screenFlash(0.5, '255,240,190'); addTrauma(0.12);
        burst(ev.x, ev.y, 26, { color: '#ffd23e', speed: 220, grav: 160 });
        burst(ev.x, ev.y, 14, { color: '#ffffff', speed: 140, grav: 120 });
        break;
      case 'joined': renderTeam(); saveGame(); break;
      case 'escape': sfx.escape(); break;
      case 'ko': sfx.ko(); burst(ev.x, ev.y, 16, { color: '#a9c8ef', speed: 160, grav: 240 }); break;
      case 'player_hurt':
        sfx.hurt(); hitStop(0.06); addTrauma(0.3); screenFlash(0.22, '255,90,90');
        renderHearts();
        break;
      case 'blocked':
        sfx.bounce();
        floatText(ev.x, ev.y, 'Blocked!', { color: '#a9e6ff', size: 16 });
        break;
      case 'faint_swap': renderHearts(); renderTeam(); break;
      case 'swap': sfx.hop(); renderHearts(); renderTeam(); break;
      case 'wipe': sfx.wipe(); renderHearts(); renderTeam(); saveGame(); break;
      case 'engage': sfx.engage(); break;
      case 'boss': sfx.bossWarn ? sfx.bossWarn() : sfx.engage(); addTrauma(0.25); break;
      case 'boss_down': sfx.caught(); screenFlash(0.4, '255,240,190'); saveGame(); break;
      case 'denied': sfx.struggle(); break;
      case 'dash':
        sfx.dash(); hitStop(0.03); addTrauma(0.12);
        burst(ev.x, ev.y, 14, { color: '#ff8a3d', speed: 200, grav: 120 });
        break;
      case 'sig':
        if (ev.sig !== 'dash') {
          sfx.dash();
          burst(ev.x, ev.y, 12, { color: '#a9e6ff', speed: 160, grav: 100 });
        }
        break;
      case 'gauge_ready': sfx.gaugeReady(); showToast('Signature move ready — tap the flame!'); break;
      case 'pickup': sfx.pickup(); burst(ev.x, ev.y, 8, { color: '#ffd23e', speed: 120 }); break;
      case 'xp': floatText(ev.x, ev.y, `+${ev.amt} XP`, { color: '#fff0a8', size: 15 }); break;
      case 'levelup': sfx.levelup(); screenFlash(0.3, '255,240,190'); renderHearts(); renderTeam(); saveGame(); break;
      case 'evolved': sfx.caught(); screenFlash(0.35, '200,240,255'); renderTeam(); saveGame(); break;
      case 'ending': showEnding(ev.kind); break;
    }
  }
  const showCatch = !!((world.foe && world.foe.dazedT > 0) || world.catch);
  if (showCatch !== hud.catchShow) { hud.catchShow = showCatch; $('catchbtn').classList.toggle('show', showCatch); }
  if (world.msg && world.msg !== handleEvents._lastMsg) showToast(world.msg);
  handleEvents._lastMsg = world.msg;
  renderCounts();
  renderTeam();
}

// visible floating joystick — transform-only updates
let joyShown = false;
function updateJoystick() {
  const base = $('joybase'), knob = $('joyknob');
  const pad = controls.pad;
  if (pad.id === -1) {
    if (joyShown) { joyShown = false; base.classList.remove('show'); }
    return;
  }
  if (!joyShown) { joyShown = true; base.classList.add('show'); }
  base.style.transform = `translate3d(${pad.ax}px, ${pad.ay}px, 0) translate(-50%, -50%)`;
  const dx = Math.max(-52, Math.min(52, pad.x - pad.ax));
  const dy = Math.max(-52, Math.min(52, pad.y - pad.ay));
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

// ---------- loop ----------
const loop = new GameLoop({
  update(dt) {
    if (!started) return;
    updateFX(dt);
    if (FX.freeze > 0) { FX.freeze -= dt; return; }
    const input = controls.poll();
    step(world, dt, input);
    tutUpdate(dt, input);
    handleEvents();
    autosaveT += dt;
    if (autosaveT > 5) { autosaveT = 0; saveGame(); }
  },
  render() {
    const t0 = performance.now();
    draw(view, world, S);
    frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
    updateJoystick();
  },
});

window.addEventListener('resize', () => view.resize());

// ---------- title / starter pick ----------
const STARTERS = [
  { species: 'cinder', blurb: 'Brawler. Dashes through anything.' },
  { species: 'sproutle', blurb: 'Trapper. Seeds and thornbushes.' },
  { species: 'dewdrip', blurb: 'Sniper. Bubbles from a safe distance.' },
];
function buildStarterCards() {
  const wrap = $('startercards');
  wrap.innerHTML = '';
  for (const st of STARTERS) {
    const card = document.createElement('button');
    card.className = 'startercard';
    card.appendChild(thumb(st.species, 72));
    const nm = document.createElement('strong');
    nm.textContent = SPECIES[st.species].name;
    const el = document.createElement('em');
    el.textContent = PLAYABLE[st.species].sigName;
    const bl = document.createElement('span');
    bl.textContent = st.blurb;
    card.append(nm, el, bl);
    card.addEventListener('pointerup', () => {
      initTeam(world, st.species);
      $('starter').classList.remove('show');
      showToast(`${SPECIES[st.species].name} is with you. To the Summit!`);
      renderHearts(); renderTeam(); saveGame();
      tutShow();
    });
    wrap.appendChild(card);
  }
}

$('startbtn').addEventListener('pointerup', () => {
  initAudio(); resumeAudio(); startMusic();
  $('title').classList.add('hidden');
  started = true;
  if (!world.team.length) {
    buildStarterCards();
    $('starter').classList.add('show');
  } else {
    tutShow();
  }
});
$('mutebtn').addEventListener('pointerup', (e) => {
  const m = setMuted(!isMuted());
  e.target.textContent = m ? '×' : '♪';
  localStorage.setItem('cutefight_muted', m ? '1' : '0');
});
if (localStorage.getItem('cutefight_muted') === '1') { setMuted(true); $('mutebtn').textContent = '×'; }

loadGame();
renderHearts(); renderCounts(); renderTeam();
loop.start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

// debug/test hooks
window.__cf = {
  get world() { return world; },
  controls, view, errors, loop, FX,
  get frameMs() { return frameMs; },
  start() { $('startbtn').dispatchEvent(new Event('pointerup')); },
  pick(species) { initTeam(world, species); $('starter').classList.remove('show'); renderHearts(); renderTeam(); },
  jump(room) { resumeAt(world, room); },
  reset() {
    localStorage.removeItem(SAVE_KEY);
    world = createWorld();
    renderHearts(); renderCounts(); renderTeam();
  },
  save: saveGame,
};
