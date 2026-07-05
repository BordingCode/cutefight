// The one cozy palette for ALL Cute Fight art (~28 colors). Every sprite indexes into
// this via single chars. Ramps: 3 shades per element so the world reads as one piece.
// '.' and ' ' are transparent (handled by the baker, not listed here).
export const PAL = {
  // outline + neutrals
  k: '#33272e', // universal soft-dark outline (warm plum, not black)
  d: '#5b4650', // dark neutral (shading, soil shadow)
  w: '#fff3df', // cream (bellies, muzzles)
  W: '#ffffff', // pure white (eye shine, sparkle)
  c: '#ffe3b8', // warm sand / light cream shade
  p: '#ff9e9e', // blush cheek pink

  // Ember ramp 🔥
  r: '#b5433c', // dark
  o: '#e8763e', // mid
  O: '#ffb45e', // light
  F: '#ff8a3d', // flame mid
  f: '#ffdf7e', // flame core

  // Leaf ramp 🌿
  e: '#38663f', // dark
  g: '#5ba24e', // mid
  G: '#8fd06a', // light
  l: '#c9ee9a', // pale sprout

  // Tide ramp 💧
  n: '#2f6d9e', // dark (navy)
  b: '#4fa3d8', // mid
  B: '#a5dff2', // light

  // Spark ramp ⚡
  y: '#c98f22', // dark gold
  Y: '#f5d34a', // mid yellow
  Z: '#fff0a8', // pale zap

  // Frost ramp ❄️
  i: '#6f8fc9', // dark ice-blue
  I: '#a9c8ef', // mid
  J: '#e2f1ff', // pale ice

  // Gust ramp 🌬️
  u: '#7f9a8f', // dark sage
  U: '#b9d4c2', // mid
  V: '#eef7ea', // pale air

  // world / ground
  s: '#8a5a44', // soil
  S: '#684234', // soil dark
  t: '#6fae52', // grass top
  T: '#93d16c', // grass light
  h: '#c3e88f', // grass highlight
  m: '#a98abf', // dusk lavender (far hills, accents)
  q: '#f2b134', // gold (orb, coins)
};
