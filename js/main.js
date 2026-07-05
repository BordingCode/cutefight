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
const controls = new Controls($('padzone'), $('atkbtn'), $('catchbtn'));

let world = createWorld();
let started = false;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

FX.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- DOM HUD ----------
function renderHearts() {
  const el = $('hearts');
  let s = '';
  for (let i = 0; i < world.player.maxHp; i++) s += i < world.player.hp ? '❤️' : '🖤';
  el.textContent = s;
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
    }
  }
  // context button visibility safety net (e.g. daze timer ran out with no event consumed)
  const dazedNow = world.foe && world.foe.dazedT > 0 && !world.catch;
  $('catchbtn').classList.toggle('show', !!dazedNow);
  if (world.msg && world.msg !== handleEvents._lastMsg) showToast(world.msg);
  handleEvents._lastMsg = world.msg;
  renderCounts();
}

// ---------- loop ----------
const loop = new GameLoop({
  update(dt) {
    if (!started) return;
    updateFX(dt);
    if (FX.freeze > 0) { FX.freeze -= dt; return; } // hitpause: world holds, FX continue
    const input = controls.poll();
    step(world, dt, input);
    handleEvents();
  },
  render() {
    draw(view, world, S);
  },
});

window.addEventListener('resize', () => view.resize());

// ---------- title / start ----------
$('startbtn').addEventListener('pointerup', () => {
  initAudio(); resumeAudio(); startMusic();
  $('title').classList.add('hidden');
  started = true;
});
$('mutebtn').addEventListener('pointerup', (e) => {
  const m = setMuted(!isMuted());
  e.target.textContent = m ? '🔇' : '🔊';
  localStorage.setItem('cutefight_muted', m ? '1' : '0');
});
if (localStorage.getItem('cutefight_muted') === '1') { setMuted(true); $('mutebtn').textContent = '🔇'; }

renderHearts(); renderCounts();
loop.start();

// service worker
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

// debug/test hooks
window.__cf = {
  get world() { return world; },
  controls, view, errors,
  start() { $('startbtn').dispatchEvent(new Event('pointerup')); },
  reset() { world = createWorld(); renderHearts(); renderCounts(); },
};
