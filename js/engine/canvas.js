// DPR-aware PORTRAIT canvas (Cute Fight v3 is an Archero-style one-thumb arena game).
// Fixed virtual world (WORLD_W x WORLD_H), letterboxed/scaled to fill the screen.
// All gameplay is in world coordinates; we map pointer -> world.
export const WORLD_W = 540;
export const WORLD_H = 960;

export class CanvasView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.cssW = 0;
    this.cssH = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.cssW = cssW; this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    // contain-fit the world into the screen so the whole 9:16 world (all of x∈[0,540])
    // is always visible — no cropped side edges. On taller phones this leaves letterbox
    // margins; the background is painted across the full canvas (see begin/render) so the
    // bars are filled with the starfield and it still reads full-bleed.
    const sx = cssW / WORLD_W;
    const sy = cssH / WORLD_H;
    this.scale = Math.min(sx, sy);
    this.offX = (cssW - WORLD_W * this.scale) / 2;
    this.offY = (cssH - WORLD_H * this.scale) / 2;
    this.dpr = dpr;
    // letterbox margins expressed in world units — the background fills out to these
    // (negative -> beyond the world rect) so the bars are painted with the starfield.
    this.bgX0 = -this.offX / this.scale;
    this.bgY0 = -this.offY / this.scale;
    this.bgX1 = WORLD_W - this.bgX0;
    this.bgY1 = WORLD_H - this.bgY0;
  }

  // begin a frame: set transform so we can draw in world coords.
  // No clear here — the world background (cover-fit) repaints every pixel each frame.
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.offX, this.dpr * this.offY);
  }

  toWorld(clientX, clientY) {
    return {
      x: (clientX - this.offX) / this.scale,
      y: (clientY - this.offY) / this.scale,
    };
  }
}
