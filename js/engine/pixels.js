// Pixel-grid sprite pipeline. Sprites are authored as arrays of strings — one char per
// pixel, mapped to colors via a palette object. Each frame is baked ONCE to an offscreen
// canvas at 1px-per-cell; rendering blits it scaled with smoothing off (crisp pixels).
// Art stays editable text in js/data/sprites.js — no image files, nothing to load.

// Bake one frame. rows: string[], pal: {char: '#hex'}. '.' and ' ' are transparent.
export function bake(rows, pal) {
  const h = rows.length;
  const w = rows[0].length;
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) {
      throw new Error(`sprite row ${y} is ${rows[y].length} chars, expected ${w}: "${rows[y]}"`);
    }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const hex = pal[ch];
      if (!hex) throw new Error(`sprite uses unknown palette char "${ch}" at ${x},${y}`);
      const i = (y * w + x) * 4;
      d[i] = parseInt(hex.slice(1, 3), 16);
      d[i + 1] = parseInt(hex.slice(3, 5), 16);
      d[i + 2] = parseInt(hex.slice(5, 7), 16);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Horizontally mirrored copy (sprites are authored facing RIGHT; we flip for left).
export function flip(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

// Solid-color silhouette copy (for 1-frame hurt flash — no extra art needed).
export function tint(canvas, color) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// Bake a whole animation set: {idle:[rows,rows], walk:[...]} -> same shape with
// {img, imgL (flipped), white (tint)} per frame.
export function bakeSet(anims, pal) {
  const out = {};
  for (const [name, frames] of Object.entries(anims)) {
    out[name] = frames.map((rows) => {
      const img = bake(rows, pal);
      return { img, imgL: flip(img), white: tint(img, '#ffffff'), w: img.width, h: img.height };
    });
  }
  return out;
}
