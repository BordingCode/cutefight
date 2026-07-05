// Boot + glue: sim events -> FX/audio/HUD. Pure sim lives in game/world.js.
import { CanvasView } from './engine/canvas.js';
import { GameLoop } from './engine/loop.js';
import { FX, updateFX, addTrauma, hitStop, screenFlash, burst, shockwave, floatText } from './engine/fx.js';
import { buildSprites } from './data/sprites.js';
import { createWorld, step } from './game/world.js';
import { draw } from './game/render.js';
import { Controls } from './game/controls.js';
import { initAudio, resumeAudio, sfx, startMusic, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const view = new CanvasView(canvas);
const S = buildSprites();
const controls = new Controls($('padzone'), $('atkbtn'), $('catchbtn'), $('jumpbtn'));

let world = createWorld();
let started = false;
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
function renderCounts() {
  $('orbcount').textContent = world.orbs;
  $('caughtcount').textContent = world.caught;
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
      case 'hop': sfx.hop(); break;
      case 'tell': sfx.tell(); break;
      case 'lunge': break;
      case 'dazed':
        sfx.dazed();
        shockwave(ev.x - world.camX, ev.y, { color: '#ffd23e', max: 70 });
        $('catchbtn').classList.add('show');
        break;
      case 'recover': $('catchbtn').classList.remove('show'); break;
      case 'throw': sfx.throw(); $('catchbtn').classList.remove('show'); break;
      case 'ring_start': break;
      case 'struggle': sfx.struggle(); break;
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
      case 'wipe': sfx.wipe(); renderHearts(); break;
      case 'engage': sfx.engage(); break;
      case 'denied': sfx.struggle(); break;
    }
  }
  // context button visibility safety net (e.g. daze timer ran out with no event consumed)
  const dazedNow = world.foe && world.foe.dazedT > 0 && !world.catch;
  $('catchbtn').classList.toggle('show', !!dazedNow);
  if (world.msg && world.msg !== handleEvents._lastMsg) showToast(world.msg);
  handleEvents._lastMsg = world.msg;
  renderCounts();
}

// ---------- learn-by-doing coach (first runs only; one hint at a time) ----------
const TUT_KEY = 'cutefight_tut_v1';
const tutSteps = [
  { text: '👈 Slide your LEFT thumb to walk' },
  { text: 'Tap the PAW to attack! It aims for you' },
  { text: 'Tap ⬆ to JUMP — dodge the “!” pounce!' },
  { text: 'HOLD the paw = heavy hit · SWIPE it up = launch!' },
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
    if (input.moveX !== 0) tutWalk += dt;
    if (tutWalk > 0.7) tutAdvance();
  } else if (tutStep === 1) {
    if (world.events.some((e) => e.t === 'swing')) tutAdvance();
  } else if (tutStep === 2) {
    if (world.events.some((e) => e.t === 'hop')) tutAdvance();
  } else if (tutStep === 3) {
    if (world.events.some((e) => e.t === 'launch' || (e.t === 'swing' && e.big))) tutAdvance();
  }
}

// visible floating joystick — mirrors the touch pad state
function updateJoystick() {
  const base = $('joybase'), knob = $('joyknob');
  const pad = controls.pad;
  if (pad.id === -1) { base.classList.remove('show'); return; }
  base.classList.add('show');
  base.style.left = pad.ax + 'px';
  base.style.top = pad.ay + 'px';
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
  },
  render() {
    draw(view, world, S);
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
  start() { $('startbtn').dispatchEvent(new Event('pointerup')); },
  reset() { world = createWorld(); renderHearts(); renderCounts(); },
};
