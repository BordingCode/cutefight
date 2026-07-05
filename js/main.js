// Boot + glue: sim events -> FX/audio/HUD. Pure sim lives in game/world.js.
import { CanvasView } from './engine/canvas.js';
import { GameLoop } from './engine/loop.js';
import { FX, updateFX, addTrauma, hitStop, screenFlash, burst, shockwave, floatText } from './engine/fx.js';
import { buildSprites } from './data/sprites.js';
import { createWorld, step, xpNext } from './game/world.js';
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
let frameMs = 0; // smoothed draw() cost, exposed for perf checks
let autosaveT = 0;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

FX.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- DOM HUD ----------
function renderHearts() {
  const el = $('hearts');
  let s = '';
  for (let i = 0; i < world.player.maxHp; i++) s += `<span class="${i < world.player.hp ? 'hp' : 'hp empty'}">♥</span>`;
  el.innerHTML = s;
}
// HUD updates are change-guarded — touching the DOM 60x/s was part of the phone lag
const hud = { orbs: -1, caught: -1, level: -1, xp: -1, gauge: -1, catchShow: null };
function renderCounts() {
  if (world.orbs !== hud.orbs) { hud.orbs = world.orbs; $('orbcount').textContent = world.orbs; }
  if (world.caught !== hud.caught) { hud.caught = world.caught; $('caughtcount').textContent = world.caught; }
  if (world.level !== hud.level) { hud.level = world.level; $('lvltag').textContent = 'Lv ' + world.level; }
  if (world.xp !== hud.xp) {
    hud.xp = world.xp;
    $('xpfill').style.width = Math.round((world.xp / xpNext(world.level)) * 100) + '%';
  }
  const g = world.player.gauge;
  if (g !== hud.gauge) {
    hud.gauge = g;
    $('abilitybtn').classList.toggle('ready', g >= 100);
    $('abilitybtn').style.opacity = g >= 100 ? '' : String(0.35 + (g / 100) * 0.4);
  }
}

const SAVE_KEY = 'cutefight_save_v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      orbs: world.orbs, caught: world.caught, xp: world.xp, level: world.level, maxHp: world.player.maxHp,
    }));
  } catch (e) {}
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s) return;
    world.orbs = s.orbs ?? world.orbs;
    world.caught = s.caught ?? world.caught;
    world.xp = s.xp ?? world.xp;
    world.level = s.level ?? world.level;
    world.player.maxHp = s.maxHp ?? world.player.maxHp;
    world.player.hp = world.player.maxHp;
  } catch (e) {}
}
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- sim event -> juice ----------
function handleEvents() {
  for (const ev of world.events) {
    switch (ev.t) {
      case 'swing': sfx.swing(ev.big); break;
      case 'hit':
        sfx.hit();
        if (ev.big) { sfx.boing(); hitStop(0.07); addTrauma(0.18); }
        else hitStop(0.035);
        burst(ev.x - world.camX, ev.y, ev.big ? 10 : 5, { color: ev.strong ? '#ffd23e' : '#ffffff', speed: 130, grav: 300 });
        break;
      case 'strong':
        sfx.strong();
        floatText(ev.x - world.camX, ev.y, 'STRONG!', { color: '#ffd23e', size: 20, crit: true });
        break;
      case 'launch':
        sfx.launch(); hitStop(0.09); addTrauma(0.2);
        burst(ev.x - world.camX, ev.y, 12, { color: '#ffb45e', speed: 180, grav: 260 });
        break;
      case 'bounce':
        sfx.bounce();
        burst(ev.x - world.camX, ev.y, 6, { color: '#ffffff', speed: 120 });
        break;
      case 'land': burst(ev.x - world.camX, ev.y, 5, { color: '#c3e88f', speed: 90, grav: 200 }); break;
      case 'room_clear': sfx.pickup(); break;
      case 'door': sfx.dash(); break;
      case 'rest': sfx.levelup(); break;
      case 'room': break;
      case 'nice_dodge':
        sfx.bounce();
        floatText(ev.x - world.camX, ev.y, 'Nice dodge! +bond', { color: '#7dff8a', size: 16 });
        break;
      case 'tell': sfx.tell(); break;
      case 'lunge': break;
      case 'dazed':
        sfx.dazed();
        shockwave(ev.x - world.camX, ev.y, { color: '#ffd23e', max: 70 });
        $('catchbtn').classList.add('show');
        break;
      case 'recover': $('catchbtn').classList.remove('show'); break;
      case 'throw': sfx.throw(); break;
      case 'ring_start': break;
      case 'struggle': sfx.struggle(); break;
      case 'toosoon':
        sfx.hit();
        floatText(ev.x - world.camX, ev.y, 'Too soon!', { color: '#ffffff', size: 16 });
        break;
      case 'caught':
        sfx.caught(); screenFlash(0.5, '255,240,190'); addTrauma(0.12);
        burst(ev.x - world.camX, ev.y, 26, { color: '#ffd23e', speed: 220, grav: 160 });
        burst(ev.x - world.camX, ev.y, 14, { color: '#ffffff', speed: 140, grav: 120 });
        renderCounts();
        break;
      case 'escape':
        sfx.escape();
        $('catchbtn').classList.remove('show');
        break;
      case 'ko':
        sfx.ko();
        burst(ev.x - world.camX, ev.y, 16, { color: '#a9c8ef', speed: 160, grav: 240 });
        $('catchbtn').classList.remove('show');
        break;
      case 'player_hurt':
        sfx.hurt(); hitStop(0.06); addTrauma(0.3); screenFlash(0.22, '255,90,90');
        renderHearts();
        break;
      case 'wipe': sfx.wipe(); renderHearts(); saveGame(); break;
      case 'caught_save': break;
      case 'engage': sfx.engage(); break;
      case 'denied': sfx.struggle(); break;
      case 'dash':
        sfx.dash(); hitStop(0.03); addTrauma(0.12);
        burst(ev.x - world.camX, ev.y - 40, 14, { color: '#ff8a3d', speed: 200, grav: 120 });
        break;
      case 'gauge_ready':
        sfx.gaugeReady();
        showToast('Ember Dash ready — tap the flame!');
        break;
      case 'pickup': sfx.pickup(); burst(ev.x - world.camX, ev.y, 8, { color: '#ffd23e', speed: 120 }); break;
      case 'xp': floatText(ev.x - world.camX, ev.y, `+${ev.amt} XP`, { color: '#fff0a8', size: 15 }); saveGame(); break;
      case 'levelup':
        sfx.levelup(); screenFlash(0.3, '255,240,190');
        renderHearts(); saveGame();
        break;
    }
  }
  // context button visibility: while dazed AND all through the throw/ring, so the
  // player's thumb always has a live tap target (change-guarded)
  const showCatch = !!((world.foe && world.foe.dazedT > 0) || world.catch);
  if (showCatch !== hud.catchShow) { hud.catchShow = showCatch; $('catchbtn').classList.toggle('show', showCatch); }
  if (world.msg && world.msg !== handleEvents._lastMsg) showToast(world.msg);
  handleEvents._lastMsg = world.msg;
  renderCounts();
}

// ---------- learn-by-doing coach (first runs only; one hint at a time) ----------
const TUT_KEY = 'cutefight_tut_v3';
const tutSteps = [
  { text: '👆 Touch & DRAG anywhere to move' },
  { text: 'Lift your thumb — Cinder fights by himself!' },
  { text: '“!” means incoming — DRAG away to dodge!' },
  { text: 'Dazed! Hold to calm Cinder, get close, throw!' },
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
    if (world.events.some((e) => e.t === 'swing')) tutAdvance();
  } else if (tutStep === 2) {
    // learned dodging: either pulled off a nice dodge, or reached the daze band anyway
    if (world.events.some((e) => e.t === 'nice_dodge' || e.t === 'dazed')) tutAdvance();
  } else if (tutStep === 3) {
    if (world.events.some((e) => e.t === 'throw')) tutAdvance();
  }
}

// visible floating joystick — transform-only updates (no layout work per frame)
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
  const dy = Math.max(-30, Math.min(30, pad.y - pad.ay));
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

// ---------- loop ----------
const loop = new GameLoop({
  update(dt) {
    if (!started) return;
    updateFX(dt);
    if (FX.freeze > 0) { FX.freeze -= dt; return; } // hitpause: world holds, FX continue
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

// ---------- title / start ----------
$('startbtn').addEventListener('pointerup', () => {
  initAudio(); resumeAudio(); startMusic();
  $('title').classList.add('hidden');
  started = true;
  tutShow();
});
$('mutebtn').addEventListener('pointerup', (e) => {
  const m = setMuted(!isMuted());
  e.target.textContent = m ? '×' : '♪';
  localStorage.setItem('cutefight_muted', m ? '1' : '0');
});
if (localStorage.getItem('cutefight_muted') === '1') { setMuted(true); $('mutebtn').textContent = '×'; }

loadGame();
renderHearts(); renderCounts();
loop.start();

// service worker
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

// debug/test hooks
window.__cf = {
  get world() { return world; },
  controls, view, errors, loop, FX,
  get frameMs() { return frameMs; },
  start() { $('startbtn').dispatchEvent(new Event('pointerup')); },
  reset() { world = createWorld(); renderHearts(); renderCounts(); },
};
