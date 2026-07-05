// Procedural warm-chiptune audio — no files. Rounded square/triangle voices, soft
// envelopes; hits are bouncy "boings", not violence. Unlocked on first gesture.
let ctx = null, master = null, musicGain = null;
let muted = false, musicTimer = null, musicTarget = 0;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  } catch (e) { ctx = null; }
}
export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
  return muted;
}
export function isMuted() { return muted; }

function duck(depth = 0.5, dur = 0.3) {
  if (!ctx || !musicGain || musicTarget <= 0) return;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setTargetAtTime(musicTarget * (1 - depth), now, 0.02);
  musicGain.gain.setTargetAtTime(musicTarget, now + dur, 0.2);
}

function tone(freq, dur, { type = 'sine', gain = 0.25, slideTo = null, delay = 0, attack = 0.006, dest = null } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, { gain = 0.2, type = 'bandpass', freq = 1500, q = 1, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

const vary = (v) => v * (1 + (Math.random() - 0.5) * 0.08);

export const sfx = {
  swing(big) { noise(big ? 0.16 : 0.09, { gain: big ? 0.12 : 0.07, type: 'bandpass', freq: big ? 900 : 1600, q: 1.4 }); },
  // soft bouncy thud — the normal hit
  hit() { const v = vary(1); tone(240 * v, 0.09, { type: 'triangle', gain: 0.2, slideTo: 130 * v }); noise(0.05, { gain: 0.06, freq: 2400 }); },
  // bigger boing for heavy/combo knockback
  boing() { const v = vary(1); duck(0.3, 0.2); tone(180 * v, 0.22, { type: 'triangle', gain: 0.3, slideTo: 70 * v }); tone(360 * v, 0.1, { type: 'square', gain: 0.06, slideTo: 140 * v }); },
  // super-effective crunch chord — the type-advantage teacher
  strong() { duck(0.4, 0.3); [523, 659, 784].forEach((f, i) => tone(vary(f), 0.16, { type: 'square', gain: 0.09, delay: i * 0.015 })); noise(0.1, { gain: 0.1, freq: 3000 }); },
  launch() { tone(200, 0.28, { type: 'square', gain: 0.14, slideTo: 640 }); noise(0.2, { gain: 0.08, type: 'highpass', freq: 1200 }); },
  bounce() { const v = vary(1); tone(300 * v, 0.1, { type: 'triangle', gain: 0.16, slideTo: 480 * v }); },
  hop() { tone(330, 0.1, { type: 'triangle', gain: 0.1, slideTo: 520 }); },
  tell() { tone(880, 0.12, { type: 'square', gain: 0.07 }); tone(880, 0.12, { type: 'square', gain: 0.07, delay: 0.16 }); },
  dazed() { duck(0.45, 0.5); [659, 784, 988, 1175].forEach((f, i) => tone(f, 0.3, { type: 'sine', gain: 0.14, delay: i * 0.07 })); },
  throw() { tone(500, 0.3, { type: 'sine', gain: 0.12, slideTo: 900 }); },
  struggle() { tone(300, 0.16, { type: 'square', gain: 0.12, slideTo: 240 }); tone(240, 0.16, { type: 'square', gain: 0.1, delay: 0.18, slideTo: 200 }); },
  escape() { duck(0.4, 0.4); tone(400, 0.4, { type: 'sawtooth', gain: 0.12, slideTo: 120 }); },
  caught() {
    duck(0.7, 1.4);
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.16, delay: i * 0.09 }));
    noise(0.5, { gain: 0.05, type: 'highpass', freq: 6000, delay: 0.5 });
  },
  ko() { duck(0.4, 0.5); [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.14, delay: i * 0.12, slideTo: f * 0.85 })); },
  hurt() { duck(0.5, 0.3); tone(200, 0.2, { type: 'sawtooth', gain: 0.18, slideTo: 80 }); },
  wipe() { duck(0.8, 1.2); [330, 294, 262, 196].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.15, delay: i * 0.15, slideTo: f * 0.7 })); },
  engage() { tone(392, 0.14, { type: 'square', gain: 0.09 }); tone(523, 0.18, { type: 'square', gain: 0.09, delay: 0.12 }); },
};

// ---- meadow music: gentle chiptune loop (pentatonic major, two voices + soft pulse bass)
const MELODY = [523, 587, 659, 784, 659, 587, 523, 392, 440, 523, 587, 523, 440, 392, 330, 392];
const BASS = [131, 131, 165, 165, 196, 196, 165, 165];
let step = 0;
export function startMusic() {
  if (!ctx || musicTimer) return;
  musicTarget = 0.42;
  musicGain.gain.setTargetAtTime(musicTarget, ctx.currentTime, 1.2);
  const beat = () => {
    if (!ctx) return;
    const m = MELODY[step % MELODY.length];
    const b = BASS[Math.floor(step / 2) % BASS.length];
    if (step % 2 === 0) tone(b, 0.5, { type: 'triangle', gain: 0.11, attack: 0.02, dest: musicGain });
    tone(m, 0.32, { type: 'square', gain: 0.045, attack: 0.02, dest: musicGain });
    if (step % 4 === 2) tone(m * 1.5, 0.24, { type: 'sine', gain: 0.03, dest: musicGain });
    step++;
    musicTimer = setTimeout(beat, 300);
  };
  beat();
}
export function setMusicIntensity(x) {
  musicTarget = 0.35 + x * 0.3;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(musicTarget, ctx.currentTime, 0.6);
}
export function stopMusic() {
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  musicTarget = 0;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
}
