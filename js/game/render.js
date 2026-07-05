// Renderer — reads world state, never mutates it. Pixel sprites are baked 1px-per-cell
// canvases blitted at SCALE with smoothing off. Feet anchor: sprite bottom row sits on
// the entity's y (the ground line when grounded).
import { WORLD_W, WORLD_H } from '../engine/canvas.js';
import { GROUND_Y, DAZE_CATCH, typeMult } from './world.js';

const ELEM_COLOR = { ember: '#ff8a3d', leaf: '#8fd06a', tide: '#4fa3d8', spark: '#f5d34a', frost: '#a9c8ef', gust: '#b9d4c2' };
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

// ---------------------------------------------------------------------------
// Pre-rendered scenery. Hills/bushes/ground are baked ONCE into seamless
// repeating strips; per frame we just blit 2-3 copies of each. This replaces
// hundreds of path segments + gradient builds per frame — the phone lag fix.
// ---------------------------------------------------------------------------
const STRIP_W = 1920;
let BG = null;

function hillStrip(baseY, waves, color) {
  const c = document.createElement('canvas');
  c.width = STRIP_W; c.height = WORLD_H;
  const x2 = c.getContext('2d');
  x2.fillStyle = color;
  x2.beginPath();
  x2.moveTo(0, WORLD_H);
  for (let x = 0; x <= STRIP_W; x += 6) {
    // integer wave counts over the strip width -> perfectly seamless tiling
    let y = baseY;
    for (const [n, amp, ph] of waves) y += Math.sin((x / STRIP_W) * TAU * n + ph) * amp;
    x2.lineTo(x, y);
  }
  x2.lineTo(STRIP_W, WORLD_H);
  x2.closePath();
  x2.fill();
  return c;
}

function buildBG(S) {
  const far = hillStrip(330, [[2, 26, 0], [5, 15, 1.7]], '#b6d9a4');
  const mid = hillStrip(400, [[3, 20, 0.9], [7, 9, 2.4]], '#8cc47e');
  // bushes baked onto the mid strip's foot
  const mx = mid.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const bx = (i * 253 + 60) % STRIP_W;
    mx.fillStyle = i % 3 ? '#79b768' : '#6aa95c';
    mx.beginPath();
    mx.ellipse(bx, 442, 42, 26 + (i % 3) * 6, 0, Math.PI, 0);
    mx.fill();
  }
  // ground strip: one row of grass tiles + soil below, baked at final scale
  const T = 16 * SCALE;
  const gh = WORLD_H + 220 - (GROUND_Y - 10);
  const ground = document.createElement('canvas');
  ground.width = STRIP_W; ground.height = gh;
  const gx = ground.getContext('2d');
  gx.imageSmoothingEnabled = false;
  for (let x = 0; x < STRIP_W; x += T) {
    gx.drawImage(S.tiles.grass, x, 0, T, T);
    for (let y = T; y < gh; y += T) gx.drawImage(S.tiles.soil, x, y, T, T);
  }
  BG = { far, mid, ground, sky: null, skyKey: '' };
}

// blit a repeating strip with parallax; covers the letterbox too
function blitStrip(ctx, view, strip, par, camX, y) {
  const off = camX * par;
  let x = Math.floor((view.bgX0 + off) / STRIP_W) * STRIP_W - off;
  for (; x < view.bgX1; x += STRIP_W) ctx.drawImage(strip, x, y);
}

export function draw(view, w, S) {
  const ctx = view.ctx;
  if (!BG) buildBG(S);
  view.begin();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.translate(FX.shakeX, FX.shakeY);

  // --- sky (gradient cached; only rebuilt when the viewport changes) ---
  const skyKey = view.bgY0 + ':' + view.bgY1;
  if (BG.skyKey !== skyKey) {
    const g = ctx.createLinearGradient(0, view.bgY0, 0, WORLD_H);
    g.addColorStop(0, '#6db9e8');
    g.addColorStop(0.55, '#a6dcf2');
    g.addColorStop(1, '#d9f2fa');
    BG.sky = g; BG.skyKey = skyKey;
  }
  ctx.fillStyle = BG.sky;
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

  // --- pre-baked parallax strips ---
  blitStrip(ctx, view, BG.far, 0.18, w.camX, 0);
  blitStrip(ctx, view, BG.mid, 0.45, w.camX, 0);
  blitStrip(ctx, view, BG.ground, 1, w.camX, GROUND_Y - 10);

  // --- orb pickups on the path ---
  if (w.pickups) {
    for (const pk of w.pickups) {
      const px = pk.x - w.camX;
      if (px < -30 || px > WORLD_W + 30) continue;
      const bob = Math.sin(w.t * 4 + pk.x) * 4;
      ctx.drawImage(S.orb, px - 12, pk.y - 34 + bob, 24, 24);
    }
  }

  // --- foe ---
  if (w.foe) {
    const f = w.foe;
    const fx = f.x - w.camX;
    // shadow
    ctx.fillStyle = 'rgba(40,50,40,0.25)';
    ctx.beginPath(); ctx.ellipse(fx, GROUND_Y + 4, 26, 7, 0, 0, TAU); ctx.fill();

    let frame;
    const a = S[f.species];
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
    // element badge + live matchup chevron: ▼ = weak against you, ▲ = strong vs you
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = ELEM_COLOR[f.element] || '#ccc';
    ctx.fillRect(bx - 16, by - 3, 12, 12);
    ctx.strokeStyle = '#33272e'; ctx.lineWidth = 2; ctx.strokeRect(bx - 16, by - 3, 12, 12);
    const mult = typeMult(w.player.element, f.element);
    if (mult > 1.01) { ctx.fillStyle = '#e8434f'; ctx.fillText('▼', bx + bw + 5, by + 9); }
    else if (mult < 0.99) { ctx.fillStyle = '#ff9d2e'; ctx.fillText('▲', bx + bw + 5, by + 9); }

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
      // shrinking ring — the green cue LEADS the catch window (reaction time)
      const inSweet = c.ringR <= 56;
      ctx.strokeStyle = inSweet ? '#7dff8a' : '#ffffff';
      ctx.lineWidth = inSweet ? 6 : 4;
      ctx.beginPath(); ctx.arc(fx, cy, c.ringR, 0, TAU); ctx.stroke();
      // orb floats above
      ctx.drawImage(S.orb, fx - 12, cy - 12, 24, 24);
      ctx.font = '800 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
      const hint = inSweet ? 'TAP NOW! (anywhere)' : 'wait for it…';
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
