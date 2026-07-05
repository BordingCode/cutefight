// Touch grammar (research-backed): LEFT half = floating move pad (slide to walk,
// flick UP also hops). RIGHT = JUMP button + one big attack button — tap = light,
// hold&release = heavy, slide up off it = launcher. A context CATCH button appears
// only when a foe is dazed. Keyboard fallback for desktop/testing: A/D or arrows move,
// Space hop, J light, K hold = heavy, W or L launcher, E catch/ring-tap.
export class Controls {
  constructor(padZone, atkBtn, catchBtn, jumpBtn) {
    this.moveX = 0;
    this._hop = false; this._light = false; this._heavyRelease = false;
    this._launcher = false; this._catch = false; this._ringTap = false;
    this.charging = false;

    // ---- floating pad (left) ----
    this.pad = { id: -1, ax: 0, ay: 0, x: 0, y: 0, lastY: 0, lastT: 0, hopLock: false };
    padZone.addEventListener('pointerdown', (e) => {
      if (this.pad.id !== -1) return;
      this.pad.id = e.pointerId;
      this.pad.ax = e.clientX; this.pad.ay = e.clientY;
      this.pad.x = e.clientX; this.pad.y = e.clientY;
      this.pad.lastY = e.clientY; this.pad.lastT = performance.now();
      this.pad.hopLock = false;
      try { padZone.setPointerCapture(e.pointerId); } catch (_) {}
      this.padActive = true;
      this.padAX = e.clientX; this.padAY = e.clientY;
      e.preventDefault();
    });
    padZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pad.id) return;
      const now = performance.now();
      const dt = Math.max(1, now - this.pad.lastT);
      const vy = (e.clientY - this.pad.lastY) / dt * 1000; // px/s
      this.pad.lastY = e.clientY; this.pad.lastT = now;
      this.pad.x = e.clientX; this.pad.y = e.clientY;
      // flick up = hop (velocity gate, re-armed when finger comes back down)
      if (vy < -650 && !this.pad.hopLock) { this._hop = true; this.pad.hopLock = true; }
      if (vy > 150) this.pad.hopLock = false;
      e.preventDefault();
    });
    const padEnd = (e) => {
      if (e.pointerId !== this.pad.id) return;
      this.pad.id = -1;
      this.padActive = false;
    };
    padZone.addEventListener('pointerup', padEnd);
    padZone.addEventListener('pointercancel', padEnd);

    // ---- attack button (right) ----
    this.atk = { id: -1, t0: 0, y0: 0, launcherFired: false };
    atkBtn.addEventListener('pointerdown', (e) => {
      if (this.atk.id !== -1) return;
      this.atk.id = e.pointerId;
      this.atk.t0 = performance.now();
      this.atk.y0 = e.clientY;
      this.atk.launcherFired = false;
      try { atkBtn.setPointerCapture(e.pointerId); } catch (_) {}
      atkBtn.classList.add('pressed');
      e.preventDefault();
    });
    atkBtn.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.atk.id || this.atk.launcherFired) return;
      if (this.atk.y0 - e.clientY > 42) {
        this._launcher = true;
        this._ringTap = true; // a swipe during the ring still counts as the tap
        this.atk.launcherFired = true;
        this.charging = false;
        atkBtn.classList.remove('pressed');
      }
    });
    const atkEnd = (e) => {
      if (e.pointerId !== this.atk.id) return;
      const held = performance.now() - this.atk.t0;
      if (!this.atk.launcherFired) {
        if (held < 240) { this._light = true; this._ringTap = true; }
        else this._heavyRelease = true;
      }
      this.atk.id = -1;
      this.charging = false;
      atkBtn.classList.remove('pressed');
    };
    atkBtn.addEventListener('pointerup', atkEnd);
    atkBtn.addEventListener('pointercancel', atkEnd);

    // ---- jump button ----
    jumpBtn.addEventListener('pointerdown', (e) => {
      this._hop = true;
      jumpBtn.classList.add('pressed');
      e.preventDefault();
    });
    const jumpEnd = () => jumpBtn.classList.remove('pressed');
    jumpBtn.addEventListener('pointerup', jumpEnd);
    jumpBtn.addEventListener('pointercancel', jumpEnd);

    // ---- catch button (context) ----
    catchBtn.addEventListener('pointerdown', (e) => {
      this._catch = true;
      this._ringTap = true;
      e.preventDefault();
    });

    // ---- keyboard fallback ----
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { this.keys[e.code] = true; return; }
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp') this._hop = true;
      if (e.code === 'KeyJ') { this._light = true; this._ringTap = true; }
      if (e.code === 'KeyW' || e.code === 'KeyL') { this._launcher = true; this._ringTap = true; }
      if (e.code === 'KeyE') { this._catch = true; this._ringTap = true; }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyK') this._heavyRelease = true;
    });
  }

  // one poll per sim step; edge flags are consumed
  poll() {
    // pad: horizontal offset from anchor -> -1..1
    let mx = 0;
    if (this.pad.id !== -1) {
      const dx = this.pad.x - this.pad.ax;
      mx = Math.max(-1, Math.min(1, dx / 52));
      if (Math.abs(mx) < 0.12) mx = 0; // deadzone
    }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) mx = 1;

    // heavy charging: attack held past the tap window, or K held
    const heldMs = this.atk.id !== -1 ? performance.now() - this.atk.t0 : 0;
    this.charging = (this.atk.id !== -1 && !this.atk.launcherFired && heldMs >= 240) || !!this.keys['KeyK'];

    const out = {
      moveX: mx,
      hop: this._hop,
      light: this._light,
      charging: this.charging,
      heavyRelease: this._heavyRelease,
      launcher: this._launcher,
      catchPress: this._catch,
      ringTap: this._ringTap,
    };
    this._hop = this._light = this._heavyRelease = this._launcher = this._catch = this._ringTap = false;
    return out;
  }
}
