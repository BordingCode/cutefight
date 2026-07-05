// Renderer — reads world state, never mutates it. Portrait Archero-style rooms with
// per-biome palettes, depth-sorted entities, boss scaling, shots, hazard zones.
import { WORLD_W, WORLD_H } from '../engine/canvas.js';
import { FLOOR_TOP, DOOR_X, DAZE_CATCH, typeMult, biomeFor, isRestRoom, PLAYABLE } from './world.js';
import { FX, drawFX } from '../engine/fx.js';
import { TAU } from '../engine/vec.js';

const ELEM_COLOR = { ember: '#ff8a3d', leaf: '#8fd06a', tide: '#4fa3d8', spark: '#f5d34a', frost: '#a9c8ef', gust: '#b9d4c2' };

const SCALE = 4;
const SPR = 24 * SCALE;

// per-biome scenery palettes: meadow / stormy bluffs / snowy pass
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

function buildBG(palIdx) {
  const P = PALS[palIdx];
  const far = hillBand(300, [[2, 24, 0], [4, 13, 1.7]], P.far, FLOOR_TOP);
  const mid = hillBand(368, [[3, 18, 0.9], [5, 8, 2.4]], P.mid, FLOOR_TOP);
  const floor = document.createElement('canvas');
  floor.width = WORLD_W; floor.height = WORLD_H - FLOOR_TOP + 40;
  const g = floor.getContext('2d');
  g.fillStyle = P.floor;
  g.fillRect(0, 0, floor.width, floor.height);
  for (let i = 0; i < 240; i++) {
    const x = (i * 131) % WORLD_W;
    const y = (i * 197) % floor.height;
    g.fillStyle = P.tufts[i % 3];
    g.fillRect(x, y, 6, 4);
  }
  g.fillStyle = P.edge;
  g.fillRect(0, 0, WORLD_W, 8);
  BG = { far, mid, floor, sky: null, skyKey: '', palIdx, P };
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
  } else {
    ctx.fillStyle = `rgba(255,138,61,${0.4 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,223,126,${0.6 * a})`;
    ctx.beginPath(); ctx.ellipse(hz.x, hz.y, hz.r * 0.5, hz.r * 0.24, 0, 0, TAU); ctx.fill();
  }
}

export function draw(view, w, S) {
  const ctx = view.ctx;
  const biome = biomeFor(w.room);
  if (!BG || BG.palIdx !== biome.pal) buildBG(biome.pal);
  const P = BG.P;
  view.begin();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.translate(FX.shakeX, FX.shakeY);

  const skyKey = view.bgY0 + ':' + view.bgY1;
  if (BG.skyKey !== skyKey) {
    const g = ctx.createLinearGradient(0, view.bgY0, 0, FLOOR_TOP);
    g.addColorStop(0, P.skyA);
    g.addColorStop(1, P.skyB);
    BG.sky = g; BG.skyKey = skyKey;
  }
  ctx.fillStyle = BG.sky;
  ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, FLOOR_TOP - view.bgY0);

  ctx.fillStyle = P.sun;
  ctx.beginPath(); ctx.arc(WORLD_W - 110, 90, 34, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 197 + w.t * 8) % (WORLD_W + 160)) - 80;
    const cy = 60 + (i * 67) % 130;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 42, 14, 0, 0, TAU);
    ctx.ellipse(cx + 24, cy - 8, 26, 11, 0, 0, TAU);
    ctx.fill();
  }

  ctx.drawImage(BG.far, 0, 0);
  ctx.drawImage(BG.mid, 0, 0);
  ctx.drawImage(BG.floor, 0, FLOOR_TOP);
  if (view.bgY1 > WORLD_H) {
    ctx.fillStyle = P.floor;
    ctx.fillRect(view.bgX0, WORLD_H, view.bgX1 - view.bgX0, view.bgY1 - WORLD_H);
  }
  if (view.bgX0 < 0) {
    ctx.fillStyle = P.floor;
    ctx.fillRect(view.bgX0, FLOOR_TOP, -view.bgX0, view.bgY1 - FLOOR_TOP);
    ctx.fillRect(WORLD_W, FLOOR_TOP, view.bgX1 - WORLD_W, view.bgY1 - FLOOR_TOP);
  }

  // doorway
  {
    const open = w.doorOpen;
    const dx = DOOR_X;
    ctx.fillStyle = P.edge;
    ctx.fillRect(0, FLOOR_TOP - 6, dx - 64, 20);
    ctx.fillRect(dx + 64, FLOOR_TOP - 6, WORLD_W - dx - 64, 20);
    ctx.fillStyle = open ? '#33272e' : P.mid;
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
    }
  }

  // room tag
  ctx.font = '800 14px sans-serif';
  ctx.textAlign = 'center';
  const tagY = 24 - Math.min(0, view.bgY0 + 24);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(51,39,46,0.6)';
  ctx.strokeText(`${biome.name} · Room ${w.room}`, WORLD_W / 2, tagY);
  ctx.fillStyle = '#fff3df';
  ctx.fillText(`${biome.name} · Room ${w.room}`, WORLD_W / 2, tagY);

  // campfire in rest rooms
  if (isRestRoom(w.room)) {
    const fx0 = WORLD_W / 2, fy0 = FLOOR_TOP + 150;
    ctx.fillStyle = 'rgba(40,60,35,0.28)';
    ctx.beginPath(); ctx.ellipse(fx0, fy0 + 6, 30, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#684234';
    ctx.fillRect(fx0 - 22, fy0 - 4, 44, 8);
    ctx.fillRect(fx0 - 8, fy0 - 10, 16, 18);
    const fl = Math.sin(w.t * 9) * 4;
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(fx0 - 12, fy0 - 6);
    ctx.quadraticCurveTo(fx0 - 4, fy0 - 34 - fl, fx0, fy0 - 40 - fl);
    ctx.quadraticCurveTo(fx0 + 6, fy0 - 30 + fl, fx0 + 12, fy0 - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffdf7e';
    ctx.beginPath();
    ctx.moveTo(fx0 - 6, fy0 - 5);
    ctx.quadraticCurveTo(fx0, fy0 - 22 - fl, fx0 + 5, fy0 - 5);
    ctx.closePath();
    ctx.fill();
  }

  // hazard zones (on the floor, under entities)
  for (const hz of w.hazards) drawHazard(ctx, hz, w.t);

  // depth-sorted entities
  const items = [];
  for (const pk of w.pickups) items.push({ y: pk.y, kind: 'pickup', o: pk });
  if (w.foe) items.push({ y: w.foe.y, kind: 'foe', o: w.foe });
  if (w.team.length) items.push({ y: w.player.y, kind: 'player', o: w.player });
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
      const sc = f.scale || 1;
      ctx.fillStyle = 'rgba(40,60,35,0.28)';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 26 * sc * (1 - Math.min(0.5, f.alt / 400)), 8 * sc, 0, 0, TAU); ctx.fill();

      const a = S[f.species];
      const tellF = a.tell ? a.tell[0] : (a.atk ? a.atk[0] : a.idle[0]);
      const lungeF = a.lunge ? a.lunge[0] : (a.atk ? a.atk[1] : a.idle[0]);
      let frame;
      if (f.state === 'tell') frame = tellF;
      else if (f.state === 'lunge' || f.alt > 0) frame = lungeF;
      else if (f.state === 'wander') frame = pickFrame(a.walk, f.animT, 0.2);
      else frame = pickFrame(a.idle, f.animT, f.state === 'dazed' ? 0.22 : 0.42);
      const squash = f.state === 'down' ? 0.62 : (f.state === 'tell' ? 0.88 : 1);
      const wob = f.state === 'dazed' ? Math.sin(f.animT * 9) * 3 : 0;
      const fy = f.y - f.alt;
      ctx.save();
      if (wob) { ctx.translate(f.x, fy); ctx.rotate(wob * 0.03); ctx.translate(-f.x, -fy); }
      if (f.slowT > 0) { ctx.filter = 'none'; } // (visual slow shown via frost tint square below)
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

      // daze meter (+ boss name)
      const bw = f.boss ? 140 : 76, bh = 9, bx = f.x - bw / 2, by = fy - SPR * sc - 26;
      if (f.boss) {
        ctx.font = '800 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#33272e';
        ctx.strokeText(f.name, f.x, by - 8);
        ctx.fillStyle = f.boss.legendary ? '#a9e6ff' : '#ffd23e';
        ctx.fillText(f.name, f.x, by - 8);
      }
      ctx.fillStyle = 'rgba(30,22,30,0.75)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      if (!f.boss || f.boss.legendary) {
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
      if (w.team.length) {
        const mult = typeMult(PLAYABLE[w.team[w.active].species].element, f.element);
        if (mult > 1.01) { ctx.fillStyle = '#e8434f'; ctx.fillText('▼', bx + bw + 5, by + 9); }
        else if (mult < 0.99) { ctx.fillStyle = '#ff9d2e'; ctx.fillText('▲', bx + bw + 5, by + 9); }
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

    // Bubble Shield
    if (w.shield > 0) {
      const pu = 1 + Math.sin(w.t * 6) * 0.04;
      ctx.strokeStyle = 'rgba(140,210,250,0.9)';
      ctx.fillStyle = 'rgba(140,210,250,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y - 40, 62 * pu, 0, TAU); ctx.fill(); ctx.stroke();
    }
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

  // catch sequence overlays
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

  if (w.transitionT > 0) {
    ctx.fillStyle = `rgba(30,22,40,${1 - w.transitionT / 0.55})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }

  if (FX.flash > 0) {
    ctx.fillStyle = `rgba(${FX.flashColor},${FX.flash})`;
    ctx.fillRect(view.bgX0, view.bgY0, view.bgX1 - view.bgX0, view.bgY1 - view.bgY0);
  }
}
