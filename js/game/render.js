// Renderer — reads world state, never mutates it. Open-world edition: a fixed
// screen-space sky/horizon band up top, a camera-scrolled ground plane below it,
// tiled ground pattern, parallax hills, depth-sorted entities and props.
import { WORLD_W } from '../engine/canvas.js';
import { DAZE_CATCH, typeMult, PLAYABLE } from './world.js';
import { ZONES, HORIZON } from '../data/zones.js';
import { FX, drawFX } from '../engine/fx.js';
import { TAU } from '../engine/vec.js';

const ELEM_COLOR = { ember: '#ff8a3d', leaf: '#8fd06a', tide: '#4fa3d8', spark: '#f5d34a', frost: '#a9c8ef', gust: '#b9d4c2' };

const SCALE = 4;
const SPR = 24 * SCALE;

// per-biome scenery palettes: meadow / stormy pines / snowy pass
const PALS = [
  { skyA: '#6db9e8', skyB: '#c8ecf7', far: '#b6d9a4', mid: '#8cc47e', floor: '#7cbf5f', tufts: ['#8fd06a', '#6fae52', '#93d16c'], edge: '#5f9a4b', sun: 'rgba(255,240,190,0.9)' },
  { skyA: '#7186bd', skyB: '#cdd9ec', far: '#8fa3bd', mid: '#6f89a8', floor: '#79a26b', tufts: ['#8cba7a', '#5f8f57', '#93b06c'], edge: '#54724a', sun: 'rgba(235,235,245,0.65)' },
  { skyA: '#8fb5d8', skyB: '#eef8ff', far: '#cfe4f2', mid: '#aac9e0', floor: '#e6f1f5', tufts: ['#ffffff', '#c9dde8', '#d8e9f0'], edge: '#b3ccd9', sun: 'rgba(255,250,230,0.75)' },
];

function pickFrame(frames, animT, rate = 0.28) {
  return frames[Math.floor(animT / rate) % frames.length];
}

function drawSprite(ctx, frame, x, y, facing, squashY = 1, scale = 1) {
  const img = facing < 0 ? frame.imgL : frame.img;
  const wpx = SPR * scale;
  const h = wpx * squashY;
  ctx.drawImage(img, Math.round(x - wpx / 2), Math.round(y - h + 2), wpx, h);
}

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

function buildBG(pal, tileKey, S, ctx) {
  const P = PALS[pal];
  // hills live in the fixed horizon band (HORIZON px tall) and scroll with parallax
  const far = hillBand(HORIZON * 0.48, [[2, 16, 0], [4, 9, 1.7]], P.far, HORIZON);
  const mid = hillBand(HORIZON * 0.72, [[3, 12, 0.9], [5, 6, 2.4]], P.mid, HORIZON);
  // ground pattern chunk: 4×4 tiles at ×4 scale + deterministic tuft variation
  const chunk = document.createElement('canvas');
  chunk.width = 256; chunk.height = 256;
  const g = chunk.getContext('2d');
  g.imageSmoothingEnabled = false;
  const tile = (S.tiles && (S.tiles[tileKey] || S.tiles.grass)) || null;
  if (tile) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.drawImage(tile, x * 64, y * 64, 64, 64);
  } else {
    g.fillStyle = P.floor;
    g.fillRect(0, 0, 256, 256);
  }
  g.globalAlpha = 0.55;
  for (let i = 0; i < 42; i++) {
    g.fillStyle = P.tufts[i % 3];
    g.fillRect((i * 53) % 250, (i * 97) % 250, 6, 4);
  }
  g.globalAlpha = 1;
  BG = { key: pal + ':' + tileKey, P, far, mid, groundPat: ctx.createPattern(chunk, 'repeat'), sky: null, skyKey: '' };
}

function drawHazard(ctx, hz, t) {
  const a = Math.min(1, hz.t / 0.6);
  if (hz.type === 'thorn') {
    ctx.fillStyle = `rgba(56,102,63,${0.4 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(40,70,45,${0.8 * a})`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * TAU + t * 0.4;
      const sx = hz.x + Math.cos(ang) * hz.r * 0.7;
      const sy = hz.y + Math.sin(ang) * hz.r * 0.35;
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy + 6);
      ctx.lineTo(sx, sy - 10);
      ctx.lineTo(sx + 5, sy + 6);
      ctx.stroke();
    }
  } else if (hz.type === 'frost') {
    ctx.fillStyle = `rgba(190,225,250,${0.42 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + t;
      ctx.fillRect(hz.x + Math.cos(ang) * hz.r * 0.6 - 2, hz.y + Math.sin(ang) * hz.r * 0.3 - 2, 4, 4);
    }
  } else if (hz.type === 'spore') {
    ctx.fillStyle = `rgba(120,160,90,${0.36 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(201,238,154,${0.8 * a})`;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + t * 0.7;
      const rr = hz.r * (0.3 + 0.4 * ((i * 37 % 10) / 10));
      const bob = Math.sin(t * 2.4 + i) * 8;
      ctx.fillRect(hz.x + Math.cos(ang) * rr - 2, hz.y + Math.sin(ang) * rr * 0.5 - 12 - bob, 4, 4);
    }
  } else if (hz.type === 'lure') {
    const pulse = 0.7 + Math.sin(t * 5) * 0.3;
    ctx.fillStyle = `rgba(255,223,126,${0.28 * a * pulse})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.5, 0, 0, TAU); ctx.fill();
    // the lantern itself
    ctx.fillStyle = '#684234';
    ctx.fillRect(hz.x - 3, hz.y - 40, 6, 40);
    ctx.fillStyle = `rgba(255,210,80,${0.9 * a})`;
    ctx.beginPath(); ctx.arc(hz.x, hz.y - 46, 10 + pulse * 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#33272e'; ctx.lineWidth = 2;
    ctx.strokeRect(hz.x - 8, hz.y - 56, 16, 20);
  } else {
    ctx.fillStyle = `rgba(255,138,61,${0.4 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,223,126,${0.6 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r * 0.5, hz.r * 0.24, 0, 0, TAU); ctx.fill();
  }
}

function drawCampfire(ctx, x, y, t, lit) {
  ctx.fillStyle = 'rgba(40,60,35,0.28)';
  ctx.beginPath(); ctx.ellipse(x, y + 6, 30, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#684234';
  ctx.fillRect(x - 22, y - 4, 44, 8);
  ctx.fillRect(x - 8, y - 10, 16, 18);
  if (lit) {
    const fl = Math.sin(t * 9) * 4;
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 6);
    ctx.quadraticCurveTo(x - 4, y - 34 - fl, x, y - 40 - fl);
    ctx.quadraticCurveTo(x + 6, y - 30 + fl, x + 12, y - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffdf7e';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 5);
    ctx.quadraticCurveTo(x, y - 22 - fl, x + 5, y - 5);
    ctx.closePath();
    ctx.fill();
  } else {
    const em = 0.5 + Math.sin(t * 3) * 0.2;
    ctx.fillStyle = `rgba(255,138,61,${em})`;
    ctx.fillRect(x - 4, y - 8, 8, 6);
  }
}

function drawProp(ctx, S, kind, x, y, big) {
  if (kind === 'water') return; // invisible pond collider
  const img = S.props && S.props[kind];
  ctx.fillStyle = 'rgba(40,60,35,0.25)';
  if (!img) {
    ctx.beginPath(); ctx.ellipse(x, y + 4, 26, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5f9a4b';
    ctx.beginPath(); ctx.arc(x, y - 30, 30, 0, TAU); ctx.fill();
    return;
  }
  const sc = big ? SCALE * 1.8 : SCALE;
  const w4 = img.width * sc, h4 = img.height * sc;
  if (img.height > 12) { // tiny ground decals cast no shadow
    ctx.beginPath(); ctx.ellipse(x, y + 5, w4 * 0.32, big ? 13 : 9, 0, 0, TAU); ctx.fill();
  }
  ctx.drawImage(img, Math.round(x - w4 / 2), Math.round(y - h4 + 12), w4, h4);
}

// worn paths: guide the eye (and the thumb) between the places that matter
const PATH_COLOR = ['#e8cf9d', '#c9b184', '#dcE8f2'];
function drawPaths(ctx, z) {
  if (!z.paths) return;
  const col = z.pal === 2 ? '#d8e7f0' : PATH_COLOR[z.pal] || PATH_COLOR[0];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of z.paths) {
    for (const [w2, c, a] of [[path.w + 10, '#33272e', 0.12], [path.w, col, 0.85]]) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = c;
      ctx.lineWidth = w2;
      ctx.beginPath();
      ctx.moveTo(path.pts[0][0], path.pts[0][1]);
      for (let i = 1; i < path.pts.length; i++) ctx.lineTo(path.pts[i][0], path.pts[i][1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ponds & frozen lakes
function drawWaters(ctx, z, t) {
  if (!z.waters) return;
  for (const w of z.waters) {
    if (w.frozen) {
      ctx.fillStyle = '#33272e';
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.ellipse(w.x, w.y + 4, w.rx + 6, w.ry + 5, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#cfe6f2';
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx, w.ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9f6fd';
      ctx.beginPath(); ctx.ellipse(w.x - w.rx * 0.2, w.y - w.ry * 0.15, w.rx * 0.55, w.ry * 0.5, 0, 0, TAU); ctx.fill();
      // the fishing hole
      ctx.fillStyle = '#2f6d9e';
      ctx.beginPath(); ctx.ellipse(w.x + w.rx * 0.25, w.y + w.ry * 0.1, 26, 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a9c8ef';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#2f6d9e';
      ctx.beginPath(); ctx.ellipse(w.x, w.y + 3, w.rx + 6, w.ry + 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4fa3d8';
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx, w.ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a5dff2';
      const sh = Math.sin(t * 1.6) * 6;
      ctx.beginPath(); ctx.ellipse(w.x - w.rx * 0.25 + sh, w.y - w.ry * 0.2, w.rx * 0.4, w.ry * 0.3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 14]);
      ctx.lineDashOffset = -t * 14;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx * 0.72, w.ry * 0.68, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ambient weather: petals / falling leaves / snow, per biome — cheap screen-space drift
const AMBIENT = { colors: [['#ffd9e8', '#fff0a8'], ['#8fd06a', '#c9ee9a'], ['#ffffff', '#e2f1ff']] };
function drawAmbient(ctx, view, w, pal) {
  const [c1, c2] = AMBIENT.colors[pal] || AMBIENT.colors[0];
  const H = view.bgY1 - view.bgY0;
  const W = view.bgX1 - view.bgX0;
  for (let i = 0; i < 20; i++) {
    const speed = 26 + (i * 37) % 30;
    const sway = pal === 1 ? 34 : 16;
    const x = view.bgX0 + (((i * 173.3) + w.t * (10 + (i % 5) * 4) - w.cam.x * 0.25) % W + W) % W;
    const y = view.bgY0 + (((i * 259.7) + w.t * speed - w.cam.y * 0.25) % H + H) % H;
    const wob = Math.sin(w.t * 1.8 + i * 1.7) * sway;
    ctx.globalAlpha = 0.5 + (i % 3) * 0.15;
    ctx.fillStyle = i % 2 ? c1 : c2;
    if (pal === 2) {
      ctx.fillRect(x + wob, y, 3.5, 3.5);
    } else {
      ctx.save();
      ctx.translate(x + wob, y);
      ctx.rotate(w.t * 1.3 + i);
      ctx.fillRect(-3, -1.5, 6, 3);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

export function draw(view, w, S) {
  const ctx = view.ctx;
  const z = ZONES[w.zone];
  const bgKey = z.pal + ':' + z.tile;
  if (!BG || BG.key !== bgKey) buildBG(z.pal, z.tile, S, ctx);
  const P = BG.P;
  view.begin();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.translate(FX.shakeX, FX.shakeY);

  // ================= screen-space sky & horizon band =================
  const skyKey = view.bgY0 + ':' + view.bgY1;
  if (BG.skyKey !== skyKey) {
    const g = ctx.createLinearGradient(0, view.bgY0, 0, HORIZON);
    g.addColorStop(0, P.skyA);
    g.addColorStop(1, P.skyB);
    BG.sky = g; BG.skyKey = skyKey;
  }
  ctx.fillStyle = BG.sky;
  ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, HORIZON - view.bgY0);

  ctx.fillStyle = P.sun;
  ctx.beginPath(); ctx.arc(WORLD_W - 110, 52, 26, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 197 + w.t * 8) % (WORLD_W + 160)) - 80;
    const cy = 26 + (i * 67) % 60;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34, 11, 0, 0, TAU);
    ctx.ellipse(cx + 20, cy - 6, 21, 9, 0, 0, TAU);
    ctx.fill();
  }

  // parallax hills scroll with the camera
  for (const [band, k] of [[BG.far, 0.18], [BG.mid, 0.42]]) {
    const xOff = -((w.cam.x * k) % WORLD_W);
    for (let r = -1; r <= 1; r++) {
      ctx.drawImage(band, xOff + r * WORLD_W, HORIZON - band.height);
    }
  }

  // ================= world layer (camera) =================
  ctx.save();
  // nothing from the world may draw over the sky band
  ctx.beginPath();
  ctx.rect(view.bgX0, HORIZON, view.bgX1 - view.bgX0, view.bgY1 - HORIZON);
  ctx.clip();
  ctx.translate(-w.cam.x, HORIZON - w.cam.y);

  // visible world rect (covers letterbox margins too)
  const vx0 = w.cam.x + view.bgX0, vx1 = w.cam.x + view.bgX1;
  const vy0 = w.cam.y, vy1 = w.cam.y + (view.bgY1 - HORIZON);

  // beyond-the-zone backdrop, then the tiled ground
  ctx.fillStyle = P.edge;
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  ctx.fillStyle = BG.groundPat;
  ctx.fillRect(Math.max(0, vx0), Math.max(0, vy0), Math.min(z.w, vx1) - Math.max(0, vx0), Math.min(z.h, vy1) - Math.max(0, vy0));

  drawPaths(ctx, z);
  drawWaters(ctx, z, w.t);

  const seen = (x, y, m = 90) => x > vx0 - m && x < vx1 + m && y > vy0 - m - 60 && y < vy1 + m;

  // zone exits: glowing waymarks on the ground
  for (const ex of z.exits) {
    if (!seen(ex.x, ex.y)) continue;
    const open = !ex.gate || w.gatesOpen.includes(ex.gate);
    const pulse = 0.45 + Math.sin(w.t * 4) * 0.2;
    ctx.strokeStyle = open ? `rgba(255,223,126,${pulse})` : 'rgba(51,39,46,0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(ex.x, ex.y, ex.r * 0.8, ex.r * 0.4, 0, 0, TAU); ctx.stroke();
    if (!open) {
      ctx.font = '900 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(51,39,46,0.85)';
      ctx.fillText('✕', ex.x, ex.y + 9);
    }
  }

  // hazard zones (on the floor, under entities)
  for (const hz of w.hazards) if (seen(hz.x, hz.y, 160)) drawHazard(ctx, hz, w.t);

  // depth-sorted entities & props
  const items = [];
  if (z.decor) for (const o of z.decor) if (seen(o.x, o.y)) items.push({ y: o.y, kind: 'prop', o });
  for (const o of z.obstacles) if (seen(o.x, o.y)) items.push({ y: o.y, kind: 'prop', o });
  for (const it of z.interactables) if (seen(it.x, it.y)) items.push({ y: it.y, kind: it.kind === 'campfire' ? 'campfire' : 'building', o: it });
  for (const g of z.gates) {
    if (!g.boss.legendary && !w.gatesOpen.includes(g.id) && seen(g.x, g.y)) items.push({ y: g.y, kind: 'gate', o: g });
  }
  for (const pk of w.pickups) if (seen(pk.x, pk.y)) items.push({ y: pk.y, kind: 'pickup', o: pk });
  for (const f of w.foes) if (seen(f.x, f.y, 140)) items.push({ y: f.y, kind: 'foe', o: f });
  if (w.team.length) items.push({ y: w.player.y, kind: 'player', o: w.player });
  items.sort((a, b) => a.y - b.y);

  for (const it of items) {
    if (it.kind === 'prop') {
      drawProp(ctx, S, it.o.kind, it.o.x, it.o.y, it.o.big);
      continue;
    }
    if (it.kind === 'building') {
      drawProp(ctx, S, it.o.kind === 'warden' ? 'hut' : it.o.kind, it.o.x, it.o.y);
      continue;
    }
    if (it.kind === 'campfire') {
      drawCampfire(ctx, it.o.x, it.o.y, w.t, w.campfiresLit.includes(it.o.id));
      continue;
    }
    if (it.kind === 'gate') {
      // debris blocking the way until its guardian falls
      const g = it.o;
      ctx.fillStyle = 'rgba(40,60,35,0.25)';
      ctx.beginPath(); ctx.ellipse(g.x, g.y + 6, 46, 12, 0, 0, TAU); ctx.fill();
      drawProp(ctx, S, 'rock', g.x - 26, g.y + 4);
      drawProp(ctx, S, 'rock', g.x + 24, g.y);
      drawProp(ctx, S, 'rock', g.x - 2, g.y - 14);
      continue;
    }
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
      const sc = f.scale || 1;
      ctx.fillStyle = 'rgba(40,60,35,0.28)';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 26 * sc * (1 - Math.min(0.5, f.alt / 400)), 8 * sc, 0, 0, TAU); ctx.fill();

      const a = S[f.species];
      const tellF = a.tell ? a.tell[0] : (a.atk ? a.atk[0] : a.idle[0]);
      const lungeF = a.lunge ? a.lunge[0] : (a.atk ? a.atk[1] : a.idle[0]);
      let frame;
      if (f.state === 'tell') frame = tellF;
      else if (f.state === 'lunge' || f.state === 'air' || (f.alt > 0 && !SPECIESAERIAL(f))) frame = lungeF;
      else if (f.state === 'wander' || f.state === 'graze' || f.state === 'return') frame = pickFrame(a.walk, f.animT, f.state === 'graze' ? 0.34 : 0.2);
      else frame = pickFrame(a.idle, f.animT, f.state === 'dazed' ? 0.22 : 0.42);
      const squash = f.state === 'down' ? 0.62 : (f.state === 'tell' ? 0.88 : 1);
      const wob = f.state === 'dazed' ? Math.sin(f.animT * 9) * 3 : 0;
      const fy = f.y - f.alt;
      ctx.save();
      if (wob) { ctx.translate(f.x, fy); ctx.rotate(wob * 0.03); ctx.translate(-f.x, -fy); }
      drawSprite(ctx, frame, f.x, fy, f.facing, squash, sc);
      if (f.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, f.hitFlash / 0.09) * 0.85;
        drawSprite(ctx, { img: frame.white, imgL: frame.white }, f.x, fy, 1, squash, sc);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (f.slowT > 0) {
        ctx.fillStyle = 'rgba(170,210,240,0.3)';
        ctx.beginPath(); ctx.ellipse(f.x, fy - SPR * sc * 0.4, 40 * sc, 44 * sc, 0, 0, TAU); ctx.fill();
      }

      if (f.state === 'tell') {
        const bump = Math.sin(f.animT * 20) * 2;
        ctx.font = '900 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#33272e';
        ctx.strokeText('!', f.x, fy - SPR * sc - 8 + bump);
        ctx.fillStyle = '#ffd23e';
        ctx.fillText('!', f.x, fy - SPR * sc - 8 + bump);
      }

      // rare monsters sparkle so they read as special from afar
      if (f.rare) {
        const ang = w.t * 2.2;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff0a8';
        ctx.fillText('✦', f.x + Math.cos(ang) * 30, fy - SPR - 14 + Math.sin(ang * 1.7) * 6);
      }

      // daze meter — only once a foe is part of the fight (calm reads calm)
      const showBar = f.aggro || f.daze > 0.5 || f.dazedT > 0 || f.boss;
      if (showBar) {
        const bw = f.boss ? 140 : 76, bh = 9, bx = f.x - bw / 2, by = fy - SPR * sc - 26;
        if (f.boss) {
          ctx.font = '800 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
          ctx.strokeText(f.name, f.x, by - 8);
          ctx.fillStyle = f.boss.legendary ? '#a9e6ff' : '#ffd23e';
          ctx.fillText(f.name, f.x, by - 8);
        } else {
          ctx.font = '700 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(51,39,46,0.7)';
          ctx.strokeText(`Lv ${f.lvl}`, f.x, by - 6);
          ctx.fillStyle = '#fff3df';
          ctx.fillText(`Lv ${f.lvl}`, f.x, by - 6);
        }
        ctx.fillStyle = 'rgba(30,22,30,0.75)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        if (!f.boss || f.boss.legendary || f.gateId) {
          ctx.fillStyle = 'rgba(255,210,80,0.35)';
          ctx.fillRect(bx + bw * (DAZE_CATCH / 100), by, bw * (1 - DAZE_CATCH / 100), bh);
        }
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
        if (w.team.length && w.target === f) {
          const mult = typeMult(PLAYABLE[w.team[w.active].species].element, f.element);
          if (mult > 1.01) { ctx.fillStyle = '#e8434f'; ctx.fillText('▼', bx + bw + 5, by + 9); }
          else if (mult < 0.99) { ctx.fillStyle = '#ff9d2e'; ctx.fillText('▲', bx + bw + 5, by + 9); }
        }
      }

      if (f.dazedT > 0) {
        for (let i = 0; i < 3; i++) {
          const ang = f.animT * 3.6 + (i * TAU) / 3;
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = i % 2 ? '#ffd23e' : '#fff0a8';
          ctx.fillText('★', f.x + Math.cos(ang) * 22 * sc, fy - SPR * sc + 6 + Math.sin(ang) * 7);
        }
      }
      continue;
    }
    // player (active team member's art)
    const p = it.o;
    const species = w.team[w.active].species;
    const a = S[species] || S.cinder;
    ctx.fillStyle = 'rgba(40,60,35,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 26, 8, 0, 0, TAU); ctx.fill();

    let frame;
    const atkFrames = a.atk || null;
    if (p.dashT > 0) frame = atkFrames ? atkFrames[1] : a.lunge[0];
    else if (p.state === 'atk') frame = atkFrames ? (p.atkT > 0.1 ? atkFrames[0] : atkFrames[1]) : a.lunge[0];
    else if (p.state === 'walk') frame = pickFrame(a.walk, p.animT, 0.16);
    else frame = pickFrame(a.idle, p.animT, 0.45);

    const blink = p.iframes > 0 && Math.floor(p.iframes * 14) % 2 === 0;
    if (!blink) drawSprite(ctx, frame, p.x, p.y - p.alt, p.facing);

    // Aurora Charm sparkle trail
    if (w.charm && Math.floor(w.t * 30) % 3 === 0) {
      ctx.fillStyle = 'rgba(169,230,255,0.7)';
      ctx.fillRect(p.x - 20 + Math.sin(w.t * 7) * 18, p.y - 60 + Math.cos(w.t * 5) * 20, 4, 4);
    }

    // Bubble Shield
    if (w.shield > 0) {
      const pu = 1 + Math.sin(w.t * 6) * 0.04;
      ctx.strokeStyle = 'rgba(140,210,250,0.9)';
      ctx.fillStyle = 'rgba(140,210,250,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y - 40, 62 * pu, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  // "tap!" prompt over the nearest interactable
  if (w.nearInteract && !w.catch) {
    const it = w.nearInteract;
    const bob = Math.sin(w.t * 5) * 4;
    const py = it.y - (it.kind === 'campfire' ? 66 : (it.r ? it.r * 2.2 : 90)) + bob;
    ctx.font = '800 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
    ctx.strokeText('tap!', it.x, py);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('tap!', it.x, py);
  }

  // projectiles
  for (const s of w.pshots) {
    ctx.fillStyle = ELEM_COLOR[s.element] || '#fff';
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, TAU); ctx.fill();
  }
  for (const s of w.eshots) {
    ctx.strokeStyle = '#33272e';
    ctx.fillStyle = ELEM_COLOR[s.element] || '#fff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, TAU); ctx.fill(); ctx.stroke();
  }

  // catch sequence overlays (dim + ring in world space)
  if (w.catch && w.catch.foe) {
    const c = w.catch;
    const f = c.foe;
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
      ctx.fillRect(vx0, vy0 + view.bgY0 - HORIZON, vx1 - vx0, view.bgY1 - view.bgY0);
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
  ctx.restore(); // end camera

  drawAmbient(ctx, view, w, z.pal);

  // ================= screen-space UI =================
  ctx.font = '800 14px sans-serif';
  ctx.textAlign = 'center';
  const tagY = 24 - Math.min(0, view.bgY0 + 24);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(51,39,46,0.6)';
  ctx.strokeText(z.name, WORLD_W / 2, tagY);
  ctx.fillStyle = '#fff3df';
  ctx.fillText(z.name, WORLD_W / 2, tagY);

  ctx.restore(); // end shake

  if (w.transitionT > 0) {
    ctx.fillStyle = `rgba(30,22,40,${Math.min(1, 1 - w.transitionT / 0.55)})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  } else if (w.revealT > 0) {
    ctx.fillStyle = `rgba(30,22,40,${Math.max(0, w.revealT / 0.35)})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }

  if (FX.flash > 0) {
    ctx.fillStyle = `rgba(${FX.flashColor},${FX.flash})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }
}

// aerial species keep their lunge frame off the launch path
function SPECIESAERIAL(f) {
  return f.species === 'glimmoth';
}
