// Renderer — reads world state, never mutates it. Portrait Archero-style room:
// horizon band up top (baked hills), a grass floor plane below, entities drawn
// depth-sorted by their floor y; `alt` lifts the sprite off its shadow.
import { WORLD_W, WORLD_H } from '../engine/canvas.js';
import { FLOOR_TOP, FLOOR_BOT, DOOR_X, DAZE_CATCH, typeMult } from './world.js';
import { FX, drawFX } from '../engine/fx.js';
import { TAU } from '../engine/vec.js';

const ELEM_COLOR = { ember: '#ff8a3d', leaf: '#8fd06a', tide: '#4fa3d8', spark: '#f5d34a', frost: '#a9c8ef', gust: '#b9d4c2' };

const SCALE = 4;            // 24px art -> 96px
const SPR = 24 * SCALE;

function pickFrame(frames, animT, rate = 0.28) {
  return frames[Math.floor(animT / rate) % frames.length];
}

function drawSprite(ctx, frame, x, y, facing, squashY = 1) {
  const img = facing < 0 ? frame.imgL : frame.img;
  const h = SPR * squashY;
  ctx.drawImage(img, Math.round(x - SPR / 2), Math.round(y - h + 2), SPR, h);
}

// ---------------------------------------------------------------------------
// Pre-baked scenery (built once): horizon hill strips + the grass floor.
// ---------------------------------------------------------------------------
let BG = null;

function hillBand(baseY, waves, color, h) {
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = h;
  const x2 = c.getContext('2d');
  x2.fillStyle = color;
  x2.beginPath();
  x2.moveTo(0, h);
  for (let x = 0; x <= WORLD_W; x += 6) {
    let y = baseY;
    for (const [n, amp, ph] of waves) y += Math.sin((x / WORLD_W) * TAU * n + ph) * amp;
    x2.lineTo(x, y);
  }
  x2.lineTo(WORLD_W, h);
  x2.closePath();
  x2.fill();
  return c;
}

function buildBG() {
  const far = hillBand(300, [[2, 24, 0], [4, 13, 1.7]], '#b6d9a4', FLOOR_TOP);
  const mid = hillBand(368, [[3, 18, 0.9], [5, 8, 2.4]], '#8cc47e', FLOOR_TOP);

  // grass floor plane with deterministic tufts + darker back edge
  const floor = document.createElement('canvas');
  floor.width = WORLD_W; floor.height = WORLD_H - FLOOR_TOP + 40;
  const g = floor.getContext('2d');
  g.fillStyle = '#7cbf5f';
  g.fillRect(0, 0, floor.width, floor.height);
  for (let i = 0; i < 240; i++) {
    const x = (i * 131) % WORLD_W;
    const y = (i * 197) % floor.height;
    g.fillStyle = i % 3 === 0 ? '#8fd06a' : i % 3 === 1 ? '#6fae52' : '#93d16c';
    g.fillRect(x, y, 6, 4);
  }
  // back edge (meets the hills)
  g.fillStyle = '#5f9a4b';
  g.fillRect(0, 0, WORLD_W, 8);
  BG = { far, mid, floor, sky: null, skyKey: '' };
}

export function draw(view, w, S) {
  const ctx = view.ctx;
  if (!BG) buildBG();
  view.begin();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.translate(FX.shakeX, FX.shakeY);

  // --- sky (cached gradient; covers letterbox too) ---
  const skyKey = view.bgY0 + ':' + view.bgY1;
  if (BG.skyKey !== skyKey) {
    const g = ctx.createLinearGradient(0, view.bgY0, 0, FLOOR_TOP);
    g.addColorStop(0, '#6db9e8');
    g.addColorStop(1, '#c8ecf7');
    BG.sky = g; BG.skyKey = skyKey;
  }
  ctx.fillStyle = BG.sky;
  ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, FLOOR_TOP - view.bgY0);

  // sun + drifting clouds
  ctx.fillStyle = 'rgba(255,240,190,0.9)';
  ctx.beginPath(); ctx.arc(WORLD_W - 110, 90, 34, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 197 + w.t * 8) % (WORLD_W + 160)) - 80;
    const cy = 60 + (i * 67) % 130;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 42, 14, 0, 0, TAU);
    ctx.ellipse(cx + 24, cy - 8, 26, 11, 0, 0, TAU);
    ctx.fill();
  }

  // horizon hills
  ctx.drawImage(BG.far, 0, 0);
  ctx.drawImage(BG.mid, 0, 0);

  // --- floor plane (fills to the bottom letterbox too) ---
  ctx.drawImage(BG.floor, 0, FLOOR_TOP);
  if (view.bgY1 > WORLD_H) {
    ctx.fillStyle = '#7cbf5f';
    ctx.fillRect(view.bgX0, WORLD_H, view.bgX1 - view.bgX0, view.bgY1 - WORLD_H);
  }
  ctx.fillStyle = '#7cbf5f';
  if (view.bgX0 < 0) { ctx.fillRect(view.bgX0, FLOOR_TOP, -view.bgX0, view.bgY1 - FLOOR_TOP); ctx.fillRect(WORLD_W, FLOOR_TOP, view.bgX1 - WORLD_W, view.bgY1 - FLOOR_TOP); }

  // --- the doorway at the top of the room ---
  {
    const open = w.doorOpen;
    const dx = DOOR_X;
    // hedge walls along the top edge with a gap for the door
    ctx.fillStyle = '#5f9a4b';
    ctx.fillRect(0, FLOOR_TOP - 6, dx - 64, 20);
    ctx.fillRect(dx + 64, FLOOR_TOP - 6, WORLD_W - dx - 64, 20);
    // door arch
    ctx.fillStyle = open ? '#33272e' : '#4d7a3e';
    ctx.beginPath();
    ctx.moveTo(dx - 52, FLOOR_TOP + 14);
    ctx.lineTo(dx - 52, FLOOR_TOP - 34);
    ctx.arc(dx, FLOOR_TOP - 34, 52, Math.PI, 0);
    ctx.lineTo(dx + 52, FLOOR_TOP + 14);
    ctx.closePath();
    ctx.fill();
    if (open) {
      const pulse = 0.55 + Math.sin(w.t * 5) * 0.2;
      ctx.fillStyle = `rgba(255,223,126,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(dx - 38, FLOOR_TOP + 12);
      ctx.lineTo(dx - 38, FLOOR_TOP - 28);
      ctx.arc(dx, FLOOR_TOP - 28, 38, Math.PI, 0);
      ctx.lineTo(dx + 38, FLOOR_TOP + 12);
      ctx.closePath();
      ctx.fill();
      ctx.font = '800 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
      ctx.strokeText('▲ next', dx, FLOOR_TOP - 52);
      ctx.fillStyle = '#ffdf7e';
      ctx.fillText('▲ next', dx, FLOOR_TOP - 52);
    }
  }

  // room tag
  ctx.font = '800 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(51,39,46,0.6)';
  ctx.strokeText(`Meadow Reach · Room ${w.room}`, WORLD_W / 2, 24 - Math.min(0, view.bgY0 + 24));
  ctx.fillStyle = '#fff3df';
  ctx.fillText(`Meadow Reach · Room ${w.room}`, WORLD_W / 2, 24 - Math.min(0, view.bgY0 + 24));

  // --- depth-sorted drawables ---
  const items = [];
  for (const pk of w.pickups) items.push({ y: pk.y, kind: 'pickup', o: pk });
  if (w.foe) items.push({ y: w.foe.y, kind: 'foe', o: w.foe });
  items.push({ y: w.player.y, kind: 'player', o: w.player });
  items.sort((a, b) => a.y - b.y);

  for (const it of items) {
    if (it.kind === 'pickup') {
      const pk = it.o;
      const bob = Math.sin(w.t * 4 + pk.x) * 4;
      ctx.fillStyle = 'rgba(40,60,35,0.25)';
      ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 3, 12, 5, 0, 0, TAU); ctx.fill();
      ctx.drawImage(S.orb, pk.x - 12, pk.y - 30 + bob, 24, 24);
      continue;
    }
    if (it.kind === 'foe') {
      const f = it.o;
      ctx.fillStyle = 'rgba(40,60,35,0.28)';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 26 * (1 - Math.min(0.5, f.alt / 400)), 8, 0, 0, TAU); ctx.fill();

      const a = S[f.species];
      let frame;
      if (f.state === 'tell') frame = a.tell[0];
      else if (f.state === 'lunge' || f.alt > 0) frame = a.lunge[0];
      else if (f.state === 'wander') frame = pickFrame(a.walk, f.animT, 0.2);
      else frame = pickFrame(a.idle, f.animT, f.state === 'dazed' ? 0.22 : 0.42);
      const squash = f.state === 'down' ? 0.62 : (f.state === 'tell' ? 0.88 : 1);
      const wob = f.state === 'dazed' ? Math.sin(f.animT * 9) * 3 : 0;
      const fy = f.y - f.alt;
      ctx.save();
      if (wob) { ctx.translate(f.x, fy); ctx.rotate(wob * 0.03); ctx.translate(-f.x, -fy); }
      drawSprite(ctx, frame, f.x, fy, f.facing, squash);
      if (f.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, f.hitFlash / 0.09) * 0.85;
        drawSprite(ctx, { img: frame.white, imgL: frame.white }, f.x, fy, 1, squash);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (f.state === 'tell') {
        const bump = Math.sin(f.animT * 20) * 2;
        ctx.font = '900 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#33272e';
        ctx.strokeText('!', f.x, fy - SPR - 8 + bump);
        ctx.fillStyle = '#ffd23e';
        ctx.fillText('!', f.x, fy - SPR - 8 + bump);
      }

      // daze meter above the foe
      const bw = 76, bh = 9, bx = f.x - bw / 2, by = fy - SPR - 26;
      ctx.fillStyle = 'rgba(30,22,30,0.75)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = 'rgba(255,210,80,0.35)';
      ctx.fillRect(bx + bw * (DAZE_CATCH / 100), by, bw * (1 - DAZE_CATCH / 100), bh);
      const k = f.daze / 100;
      ctx.fillStyle = f.dazedT > 0 ? '#ffd23e' : '#ff9d5c';
      ctx.fillRect(bx, by, bw * k, bh);
      ctx.fillStyle = '#e8434f';
      ctx.fillRect(bx + bw - 2, by - 2, 2, bh + 4);
      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = ELEM_COLOR[f.element] || '#ccc';
      ctx.fillRect(bx - 16, by - 3, 12, 12);
      ctx.strokeStyle = '#33272e'; ctx.lineWidth = 2; ctx.strokeRect(bx - 16, by - 3, 12, 12);
      const mult = typeMult(w.player.element, f.element);
      if (mult > 1.01) { ctx.fillStyle = '#e8434f'; ctx.fillText('▼', bx + bw + 5, by + 9); }
      else if (mult < 0.99) { ctx.fillStyle = '#ff9d2e'; ctx.fillText('▲', bx + bw + 5, by + 9); }

      if (f.dazedT > 0) {
        for (let i = 0; i < 3; i++) {
          const ang = f.animT * 3.6 + (i * TAU) / 3;
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = i % 2 ? '#ffd23e' : '#fff0a8';
          ctx.fillText('★', f.x + Math.cos(ang) * 22, fy - SPR + 6 + Math.sin(ang) * 7);
        }
      }
      continue;
    }
    // player
    const p = it.o;
    ctx.fillStyle = 'rgba(40,60,35,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 26, 8, 0, 0, TAU); ctx.fill();

    const a = S.cinder;
    let frame;
    if (p.dashT > 0) frame = a.atk[1];
    else if (p.state === 'atk') frame = p.atkT > 0.1 ? a.atk[0] : a.atk[1];
    else if (p.state === 'walk') frame = pickFrame(a.walk, p.animT, 0.16);
    else frame = pickFrame(a.idle, p.animT, 0.45);

    const blink = p.iframes > 0 && Math.floor(p.iframes * 14) % 2 === 0;
    if (!blink) drawSprite(ctx, frame, p.x, p.y - p.alt, p.facing);
  }

  // --- catch sequence overlays ---
  if (w.catch && w.foe) {
    const c = w.catch;
    const f = w.foe;
    const fy = f.y - f.alt;
    if (c.phase === 'throw') {
      const k = Math.min(1, c.t / 0.42);
      const sx = w.player.x, sy = w.player.y - 50;
      const ox = sx + (f.x - sx) * k;
      const oy = sy + (fy - 60 - sy) * k - Math.sin(k * Math.PI) * 90;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(c.t * 14);
      ctx.drawImage(S.orb, -12, -12, 24, 24);
      ctx.restore();
    } else {
      const cy = fy - 40;
      ctx.fillStyle = 'rgba(30,22,40,0.25)';
      ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
      ctx.strokeStyle = 'rgba(255,220,110,0.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(f.x, cy, 34, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      const inSweet = c.ringR <= 56;
      ctx.strokeStyle = inSweet ? '#7dff8a' : '#ffffff';
      ctx.lineWidth = inSweet ? 6 : 4;
      ctx.beginPath(); ctx.arc(f.x, cy, c.ringR, 0, TAU); ctx.stroke();
      ctx.drawImage(S.orb, f.x - 12, cy - 12, 24, 24);
      ctx.font = '800 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
      const hint = inSweet ? 'TAP NOW! (anywhere)' : 'wait for it…';
      ctx.strokeText(hint, f.x, cy + 74);
      ctx.fillStyle = inSweet ? '#7dff8a' : '#fff';
      ctx.fillText(hint, f.x, cy + 74);
    }
  }

  drawFX(ctx);
  ctx.restore();

  // door transition fade (screen space, unshaken)
  if (w.transitionT > 0) {
    ctx.fillStyle = `rgba(30,22,40,${1 - w.transitionT / 0.55})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }

  if (FX.flash > 0) {
    ctx.fillStyle = `rgba(${FX.flashColor},${FX.flash})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }
}
