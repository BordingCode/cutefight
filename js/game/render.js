// Renderer — reads world state, never mutates it. Pixel sprites are baked 1px-per-cell
// canvases blitted at SCALE with smoothing off. Feet anchor: sprite bottom row sits on
// the entity's y (the ground line when grounded).
import { WORLD_W, WORLD_H } from '../engine/canvas.js';
import { GROUND_Y, DAZE_CATCH } from './world.js';
import { FX, drawFX } from '../engine/fx.js';
import { TAU } from '../engine/vec.js';

const SCALE = 4;            // 24px art -> 96px on the 960x540 world (chunky, Smash-scale)
const SPR = 24 * SCALE;

function pickFrame(frames, animT, rate = 0.28) {
  return frames[Math.floor(animT / rate) % frames.length];
}

function drawSprite(ctx, frame, x, y, facing, squashY = 1) {
  const img = facing < 0 ? frame.imgL : frame.img;
  const h = SPR * squashY;
  ctx.drawImage(img, Math.round(x - SPR / 2), Math.round(y - h + 2), SPR, h);
}

// soft parallax hills as a filled wave
function hills(ctx, camX, par, baseY, amp, color, step = 90) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const off = camX * par;
  ctx.moveTo(-20, WORLD_H + 20);
  for (let sx = -20; sx <= WORLD_W + 20; sx += 8) {
    const wx = sx + off;
    const yy = baseY + Math.sin(wx / step) * amp + Math.sin(wx / (step * 2.7) + 1.7) * amp * 0.6;
    ctx.lineTo(sx, yy);
  }
  ctx.lineTo(WORLD_W + 20, WORLD_H + 20);
  ctx.closePath();
  ctx.fill();
}

export function draw(view, w, S) {
  const ctx = view.ctx;
  view.begin();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.translate(FX.shakeX, FX.shakeY);

  // --- sky (painted past the world rect into letterbox bars) ---
  const g = ctx.createLinearGradient(0, view.bgY0, 0, WORLD_H);
  g.addColorStop(0, '#6db9e8');
  g.addColorStop(0.55, '#a6dcf2');
  g.addColorStop(1, '#d9f2fa');
  ctx.fillStyle = g;
  ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);

  // sun
  ctx.fillStyle = 'rgba(255,240,190,0.9)';
  ctx.beginPath(); ctx.arc(WORLD_W - 150, 90, 38, 0, TAU); ctx.fill();

  // clouds (slow parallax, deterministic positions)
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 347 - w.camX * 0.12) % (WORLD_W + 200) + WORLD_W + 200) % (WORLD_W + 200) - 100;
    const cy = 60 + (i * 53) % 110;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 46, 15, 0, 0, TAU);
    ctx.ellipse(cx + 26, cy - 8, 28, 12, 0, 0, TAU);
    ctx.fill();
  }

  // far + mid hills
  hills(ctx, -w.camX, 0.18, 330, 26, '#b6d9a4', 160);
  hills(ctx, -w.camX, 0.45, 400, 20, '#8cc47e', 110);

  // mid bushes
  for (let i = 0; i < 30; i++) {
    const bx = i * 260 - w.camX * 0.7;
    const sx = ((bx % (WORLD_W + 300)) + WORLD_W + 300) % (WORLD_W + 300) - 150;
    ctx.fillStyle = i % 3 ? '#79b768' : '#6aa95c';
    ctx.beginPath();
    ctx.ellipse(sx, 442, 42, 26 + (i % 3) * 6, 0, Math.PI, 0);
    ctx.fill();
  }

  // --- ground tiles (full parallax) ---
  const T = 16 * SCALE;
  const gy = GROUND_Y - 10;
  const startX = Math.floor(w.camX / T) * T;
  for (let tx = startX; tx < w.camX + WORLD_W + T; tx += T) {
    const sx = tx - w.camX;
    ctx.drawImage(S.tiles.grass, sx, gy, T, T);
    for (let ty = gy + T; ty < WORLD_H; ty += T) ctx.drawImage(S.tiles.soil, sx, ty, T, T);
  }

  // --- foe ---
  if (w.foe) {
    const f = w.foe;
    const fx = f.x - w.camX;
    // shadow
    ctx.fillStyle = 'rgba(40,50,40,0.25)';
    ctx.beginPath(); ctx.ellipse(fx, GROUND_Y + 4, 26, 7, 0, 0, TAU); ctx.fill();

    let frame;
    const a = S.sproutle;
    if (f.state === 'tell') frame = a.tell[0];
    else if (f.state === 'lunge' || (!f.onGround)) frame = a.lunge[0];
    else if (f.state === 'wander') frame = pickFrame(a.walk, f.animT, 0.2);
    else frame = pickFrame(a.idle, f.animT, f.state === 'dazed' ? 0.22 : 0.42);
    const squash = f.state === 'down' ? 0.62 : (f.state === 'tell' ? 0.88 : 1);
    const wob = f.state === 'dazed' ? Math.sin(f.animT * 9) * 3 : 0;
    ctx.save();
    if (wob) { ctx.translate(fx, f.y); ctx.rotate(wob * 0.03); ctx.translate(-fx, -f.y); }
    drawSprite(ctx, frame, fx, f.y, f.facing, squash);
    if (f.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, f.hitFlash / 0.09) * 0.85;
      drawSprite(ctx, { img: frame.white, imgL: frame.white }, fx, f.y, 1, squash);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // "!" telegraph
    if (f.state === 'tell') {
      const bump = Math.sin(f.animT * 20) * 2;
      ctx.font = '900 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = '#33272e';
      ctx.strokeText('!', fx, f.y - SPR - 8 + bump);
      ctx.fillStyle = '#ffd23e';
      ctx.fillText('!', fx, f.y - SPR - 8 + bump);
    }

    // daze meter above the foe: catch band marked, KO at the end
    const bw = 76, bh = 9, bx = fx - bw / 2, by = f.y - SPR - 26;
    ctx.fillStyle = 'rgba(30,22,30,0.75)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    // catch band (gold zone)
    ctx.fillStyle = 'rgba(255,210,80,0.35)';
    ctx.fillRect(bx + bw * (DAZE_CATCH / 100), by, bw * (1 - DAZE_CATCH / 100), bh);
    // fill
    const k = f.daze / 100;
    ctx.fillStyle = f.dazedT > 0 ? '#ffd23e' : '#ff9d5c';
    ctx.fillRect(bx, by, bw * k, bh);
    // KO tick
    ctx.fillStyle = '#e8434f';
    ctx.fillRect(bx + bw - 2, by - 2, 2, bh + 4);
    // element badge + matchup chevron (leaf, weak vs ember -> red down-arrow)
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fd06a';
    ctx.fillRect(bx - 16, by - 3, 12, 12);
    ctx.strokeStyle = '#33272e'; ctx.lineWidth = 2; ctx.strokeRect(bx - 16, by - 3, 12, 12);
    ctx.fillStyle = '#e8434f';
    ctx.fillText('▼', bx + bw + 5, by + 9);

    // dizzy stars while dazed
    if (f.dazedT > 0) {
      for (let i = 0; i < 3; i++) {
        const ang = f.animT * 3.6 + (i * TAU) / 3;
        const sx = fx + Math.cos(ang) * 22;
        const sy = f.y - SPR + 6 + Math.sin(ang) * 7;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = i % 2 ? '#ffd23e' : '#fff0a8';
        ctx.fillText('★', sx, sy);
      }
    }
  }

  // --- player ---
  {
    const p = w.player;
    const px = p.x - w.camX;
    ctx.fillStyle = 'rgba(40,50,40,0.25)';
    ctx.beginPath(); ctx.ellipse(px, GROUND_Y + 4, 26, 7, 0, 0, TAU); ctx.fill();

    const a = S.cinder;
    let frame;
    if (p.state === 'atk') frame = p.atkKind === 'light' || p.atkKind === 'air' ? a.atk[1] : (p.atkT > 0.16 ? a.atk[0] : a.atk[1]);
    else if (p.charging && p.chargeT > 0.12) frame = a.atk[0];
    else if (p.state === 'walk') frame = pickFrame(a.walk, p.animT, 0.16);
    else if (p.state === 'air') frame = a.walk[0];
    else frame = pickFrame(a.idle, p.animT, 0.45);

    // i-frame blink after being hit
    const blink = p.iframes > 0 && Math.floor(p.iframes * 14) % 2 === 0;
    if (!blink) {
      // charge glow underfoot
      if (p.charging && p.chargeT > 0.12) {
        const cr = Math.min(1, p.chargeT / 0.28);
        ctx.fillStyle = `rgba(255,180,90,${0.25 + cr * 0.3})`;
        ctx.beginPath(); ctx.ellipse(px, GROUND_Y + 3, 30 + cr * 8, 9, 0, 0, TAU); ctx.fill();
      }
      drawSprite(ctx, frame, px, p.y, p.facing);
    }
  }

  // --- catch sequence overlays ---
  if (w.catch && w.foe) {
    const c = w.catch;
    const f = w.foe;
    const fx = f.x - w.camX;
    if (c.phase === 'throw') {
      const k = Math.min(1, c.t / 0.42);
      const sx = w.player.x - w.camX, sy = w.player.y - 50;
      const ox = sx + (fx - sx) * k;
      const oy = sy + (f.y - 60 - sy) * k - Math.sin(k * Math.PI) * 90;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(c.t * 14);
      ctx.drawImage(S.orb, -12, -12, 24, 24);
      ctx.restore();
    } else {
      const cy = f.y - 40;
      // dim the world a touch — this is the moment
      ctx.fillStyle = 'rgba(30,22,40,0.25)';
      ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
      // sweet-spot ring (static)
      ctx.strokeStyle = 'rgba(255,220,110,0.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(fx, cy, 34, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      // shrinking ring
      const inSweet = c.ringR <= 34;
      ctx.strokeStyle = inSweet ? '#7dff8a' : '#ffffff';
      ctx.lineWidth = inSweet ? 6 : 4;
      ctx.beginPath(); ctx.arc(fx, cy, c.ringR, 0, TAU); ctx.stroke();
      // orb floats above
      ctx.drawImage(S.orb, fx - 12, cy - 12, 24, 24);
      ctx.font = '800 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
      const hint = inSweet ? 'TAP NOW!' : 'wait for it…';
      ctx.strokeText(hint, fx, cy + 74);
      ctx.fillStyle = inSweet ? '#7dff8a' : '#fff';
      ctx.fillText(hint, fx, cy + 74);
    }
  }

  drawFX(ctx);
  ctx.restore();

  // full-screen flash (screen space, unshaken)
  if (FX.flash > 0) {
    ctx.fillStyle = `rgba(${FX.flashColor},${FX.flash})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }
}
