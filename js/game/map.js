// The tap-to-open journey map: a stylised overview of the whole world with the
// player dot, campfires, boss gates, and the current quest target. Drawn once
// per open (no animation) onto the #mapcanvas overlay.
import { ZONES, MAP_LAYOUT, MAP_LINKS } from '../data/zones.js';
import { QUESTS } from '../data/quests.js';

const ZONE_FLOOR = ['#7cbf5f', '#79a26b', '#e6f1f5'];
const INK = '#33272e';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const center = (L) => [L.x + L.w / 2, L.y + L.h / 2];

// world point -> map point inside a zone's rect
function mapPt(zoneId, wx, wy) {
  const L = MAP_LAYOUT[zoneId];
  const z = ZONES[zoneId];
  return [L.x + (wx / z.w) * L.w, L.y + (wy / z.h) * L.h];
}

// where should the quest marker point?
function questTarget(w) {
  const q = QUESTS[w.quests.i];
  if (!q) return null;
  if (!w.quests.accepted || w.quests.objDone) return { zone: 'village', label: 'the Warden' };
  const o = q.objective;
  if (o.type === 'reach' && o.campfire) {
    for (const [id, z] of Object.entries(ZONES)) {
      const it = z.interactables.find((i) => i.kind === 'campfire' && i.id === o.campfire);
      if (it) return { zone: id, x: it.x, y: it.y, label: q.title };
    }
  }
  if (o.type === 'reach' && o.zone) return { zone: o.zone, label: q.title };
  if (o.type === 'gate') {
    for (const [id, z] of Object.entries(ZONES)) {
      const g = z.gates.find((g) => g.id === o.gate);
      if (g) return { zone: id, x: g.x, y: g.y, label: q.title };
    }
  }
  if (o.type === 'catch' || o.type === 'seen') {
    if (!o.species) return null;
    for (const [id, z] of Object.entries(ZONES)) {
      if (z.rare && z.rare.species === o.species) return { zone: id, x: z.rare.x, y: z.rare.y, label: q.title };
      if (z.pockets.some((p) => p.species.includes(o.species))) return { zone: id, label: q.title };
    }
  }
  return null;
}

export function drawMap(canvas, w) {
  canvas.width = 540;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#241c2b';
  ctx.fillRect(0, 0, 540, 960);
  ctx.fillStyle = 'rgba(255,243,223,0.06)';
  for (let i = 0; i < 60; i++) ctx.fillRect((i * 131) % 540, (i * 197) % 960, 3, 3);

  ctx.font = '800 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff3df';
  ctx.fillText('The Journey', 270, 40);

  // path ribbons
  ctx.strokeStyle = 'rgba(255,243,223,0.35)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 16]);
  for (const [a, b] of MAP_LINKS) {
    const [ax, ay] = center(MAP_LAYOUT[a]);
    const [bx, by] = center(MAP_LAYOUT[b]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.setLineDash([]);

  // zones
  for (const [id, L] of Object.entries(MAP_LAYOUT)) {
    const z = ZONES[id];
    const known = w.visited.includes(id);
    ctx.globalAlpha = known ? 1 : 0.28;
    ctx.fillStyle = ZONE_FLOOR[z.pal];
    rr(ctx, L.x, L.y, L.w, L.h, 22);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = '800 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(51,39,46,0.75)';
    const label = known ? z.name : '???';
    ctx.strokeText(label, L.x + L.w / 2, L.y - 8);
    ctx.fillStyle = '#fff3df';
    ctx.fillText(label, L.x + L.w / 2, L.y - 8);
    ctx.globalAlpha = 1;

    if (!known) continue;

    // campfires: flame-coloured dot (grey until lit) — plain shapes, no emoji
    for (const it of z.interactables) {
      if (it.kind !== 'campfire') continue;
      const [mx, my] = mapPt(id, it.x, it.y);
      const lit = w.campfiresLit.includes(it.id);
      ctx.fillStyle = lit ? '#ff8a3d' : 'rgba(51,39,46,0.55)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (lit) {
        ctx.fillStyle = '#ffdf7e';
        ctx.beginPath(); ctx.arc(mx, my - 1, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // village buildings: little house squares
    if (id === 'village') {
      for (const [bx, by] of [[300, 350], [800, 340]]) {
        const [mx, my] = mapPt(id, bx, by);
        ctx.fillStyle = '#fff3df';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.fillRect(mx - 5, my - 4, 10, 8);
        ctx.strokeRect(mx - 5, my - 4, 10, 8);
        ctx.fillStyle = '#b5433c';
        ctx.beginPath(); ctx.moveTo(mx - 7, my - 4); ctx.lineTo(mx, my - 10); ctx.lineTo(mx + 7, my - 4); ctx.closePath(); ctx.fill();
      }
    }
    // gates: padlock (closed) / open ring — the legendary is a star
    for (const g of z.gates) {
      const [mx, my] = mapPt(id, g.x, g.y);
      if (g.boss.legendary) {
        ctx.font = '800 18px sans-serif';
        ctx.fillStyle = w.ended ? '#ffd23e' : '#a9e6ff';
        ctx.fillText('★', mx, my + 6);
      } else if (w.gatesOpen.includes(g.id)) {
        ctx.strokeStyle = '#8fd06a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#33272e';
        ctx.fillRect(mx - 6, my - 3, 12, 10);
        ctx.strokeStyle = '#33272e';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(mx, my - 4, 4, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#ffd23e';
        ctx.fillRect(mx - 1.5, my - 1, 3, 4);
      }
    }
  }

  // player dot
  {
    const p = w.player;
    const [mx, my] = mapPt(w.zone, p.x, p.y);
    ctx.fillStyle = '#e8434f';
    ctx.strokeStyle = '#fff3df';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '800 13px sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(51,39,46,0.85)';
    ctx.strokeText('you', mx, my - 14);
    ctx.fillStyle = '#fff3df';
    ctx.fillText('you', mx, my - 14);
  }

  // quest marker
  const qt = questTarget(w);
  if (qt && MAP_LAYOUT[qt.zone]) {
    let mx, my;
    if (qt.x != null && w.visited.includes(qt.zone)) [mx, my] = mapPt(qt.zone, qt.x, qt.y);
    else [mx, my] = center(MAP_LAYOUT[qt.zone]);
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '800 20px sans-serif';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('★', mx, my - 22);
  }

  // legend + current quest
  const q = QUESTS[w.quests.i];
  ctx.font = '700 14px sans-serif';
  ctx.fillStyle = 'rgba(255,243,223,0.85)';
  if (q) {
    const line = !w.quests.accepted
      ? `New quest waiting at the Warden's hut`
      : w.quests.objDone
        ? `“${q.title}” done — return to the Warden ★`
        : `Quest: ${q.title} ★`;
    ctx.fillText(line, 270, 930);
  } else {
    ctx.fillText('The valley is at peace. Fill the Sanctuary!', 270, 930);
  }
  ctx.fillText('● campfire · lock = guardian · ★ quest', 270, 906);
}
