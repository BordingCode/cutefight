// One-thumb grammar (Archero-style): the thumb only STEERS. Touch anywhere and drag
// = move your monster (and hold it back from attacking). Thumb up = the monster
// fights for itself. Quick tap = start/stop walking on the journey. Context buttons
// (ability flame, catch orb) are the only buttons. During a catch, ANY tap counts
// as the ring tap. Keyboard fallback for testing: A/D or arrows steer, S = hold
// still (reins), Space = journey tap, F = ability, E = catch/ring.
export class Controls {
  constructor(padZone, catchBtn) {
    this._tap = false; this._ability = false; this._catch = false; this._ringTap = false;

    // ---- the pad: full-screen steer surface ----
    this.pad = { id: -1, ax: 0, ay: 0, x: 0, y: 0, t0: 0, moved: 0 };
    padZone.addEventListener('pointerdown', (e) => {
      if (this.pad.id !== -1) return;
      this.pad.id = e.pointerId;
      this.pad.ax = e.clientX; this.pad.ay = e.clientY;
      this.pad.x = e.clientX; this.pad.y = e.clientY;
      this.pad.t0 = performance.now();
      this.pad.moved = 0;
      try { padZone.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    padZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pad.id) return;
      this.pad.x = e.clientX; this.pad.y = e.clientY;
      this.pad.moved = Math.max(this.pad.moved, Math.hypot(e.clientX - this.pad.ax, e.clientY - this.pad.ay));
      e.preventDefault();
    });
    const padEnd = (e) => {
      if (e.pointerId !== this.pad.id) return;
      // a short, still press = a tap (journey start/stop)
      if (performance.now() - this.pad.t0 < 220 && this.pad.moved < 12) this._tap = true;
      this.pad.id = -1;
    };
    padZone.addEventListener('pointerup', padEnd);
    padZone.addEventListener('pointercancel', padEnd);

    // ---- ability button (Ember Dash, needs a full bond gauge) ----
    const abilityBtn = document.getElementById('abilitybtn');
    if (abilityBtn) {
      abilityBtn.addEventListener('pointerdown', (e) => {
        this._ability = true;
        e.preventDefault();
      });
    }

    // ---- catch button (context) ----
    catchBtn.addEventListener('pointerdown', (e) => {
      this._catch = true;
      this._ringTap = true;
      e.preventDefault();
    });

    // ---- ring tap: during a catch, ANY tap anywhere counts ----
    window.addEventListener('pointerdown', () => { this._ringTap = true; }, { capture: true });

    // ---- keyboard fallback ----
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'Space') { this._tap = true; this._ringTap = true; }
      if (e.code === 'KeyF') this._ability = true;
      if (e.code === 'KeyE') { this._catch = true; this._ringTap = true; }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  // one poll per sim step; edge flags are consumed
  poll() {
    let mx = 0, my = 0;
    let dragging = false;
    if (this.pad.id !== -1) {
      dragging = true;                          // any touch = holding the reins
      const dx = this.pad.x - this.pad.ax;
      const dy = this.pad.y - this.pad.ay;
      mx = Math.max(-1, Math.min(1, dx / 52));
      my = Math.max(-1, Math.min(1, dy / 52));
      if (Math.hypot(mx, my) < 0.12) { mx = 0; my = 0; } // deadzone: hold = stand still
    }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) { mx = -1; dragging = true; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { mx = 1; dragging = true; }
    if (this.keys['KeyW'] || this.keys['ArrowUp']) { my = -1; dragging = true; }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) { my = 1; dragging = true; }
    if (this.keys['KeyX']) dragging = true;      // hold still (rein in)

    const out = {
      moveX: mx,
      moveY: my,
      dragging,
      tapped: this._tap,
      ability: this._ability,
      catchPress: this._catch,
      ringTap: this._ringTap,
    };
    this._tap = this._ability = this._catch = this._ringTap = false;
    return out;
  }
}
