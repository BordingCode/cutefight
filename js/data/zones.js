// The whole open world, hand-authored. All coordinates in world units.
// The camera shows VIEW_W×VIEW_H of ground; the top HORIZON px of the screen is
// always sky + parallax hills (drawn screen-space, before the camera translate).
//
// Zone shape:
//   w,h        ground plane spans x∈[0,w], y∈[0,h]
//   pal        index into render PALS (0 meadow / 1 stormy / 2 snowy)
//   tile       key into S.tiles for the ground pattern
//   exits      circles that travel to another zone; gate:'id' = closed until that
//              gate id is in w.gatesOpen
//   obstacles  soft circle colliders with a prop look {kind,x,y,r}
//   interactables campfire / sanctuary / warden (activate with a still tap nearby)
//   gates      guardian bosses; needsQuest = guardian only appears once that quest
//              has been turned in (w.gateReady)
//   pockets    grazing wild packs {x,y,r,species[],n,lvl:[lo,hi],respawn seconds}
//   rare       one special solo spawn, long respawn
export const VIEW_W = 540;
export const VIEW_H = 810;
export const HORIZON = 150;

export const ZONES = {
  village: {
    name: 'Emberlight Village', pal: 0, w: 1080, h: 960, tile: 'path',
    spawn: { x: 540, y: 660 },
    exits: [
      { x: 1060, y: 560, r: 64, to: 'meadow', at: { x: 110, y: 700 } },
    ],
    obstacles: [
      { kind: 'tree', x: 120, y: 180, r: 30 }, { kind: 'tree', x: 250, y: 120, r: 30 },
      { kind: 'tree', x: 950, y: 150, r: 30 }, { kind: 'tree', x: 90, y: 700, r: 30 },
      { kind: 'tree', x: 140, y: 880, r: 30 }, { kind: 'tree', x: 990, y: 880, r: 30 },
      { kind: 'bush', x: 420, y: 250, r: 20 }, { kind: 'bush', x: 660, y: 240, r: 20 },
      { kind: 'bush', x: 880, y: 700, r: 20 }, { kind: 'rock', x: 320, y: 800, r: 22 },
      { kind: 'sign', x: 940, y: 620, r: 12 },
    ],
    interactables: [
      { kind: 'campfire', id: 'village', x: 540, y: 500 },
      { kind: 'sanctuary', x: 300, y: 350, r: 60 },
      { kind: 'warden', x: 800, y: 340, r: 48 },
    ],
    gates: [],
    pockets: [],
  },

  meadow: {
    name: 'Meadow Reach', pal: 0, w: 2160, h: 1400, tile: 'meadow',
    exits: [
      { x: 30, y: 700, r: 64, to: 'village', at: { x: 980, y: 560 } },
      { x: 2130, y: 700, r: 64, to: 'forest', at: { x: 110, y: 800 }, gate: 'bridge' },
    ],
    obstacles: [
      { kind: 'tree', x: 300, y: 300, r: 30 }, { kind: 'tree', x: 700, y: 200, r: 30 },
      { kind: 'tree', x: 1500, y: 250, r: 30 }, { kind: 'tree', x: 1950, y: 350, r: 30 },
      { kind: 'tree', x: 500, y: 1250, r: 30 }, { kind: 'tree', x: 1100, y: 1320, r: 30 },
      { kind: 'rock', x: 900, y: 750, r: 24 }, { kind: 'rock', x: 1650, y: 950, r: 24 },
      { kind: 'bush', x: 400, y: 620, r: 20 }, { kind: 'bush', x: 1250, y: 480, r: 20 },
      { kind: 'bush', x: 1800, y: 1250, r: 20 }, { kind: 'sign', x: 160, y: 640, r: 12 },
    ],
    interactables: [
      { kind: 'campfire', id: 'meadow', x: 1150, y: 420 },
    ],
    gates: [
      { id: 'bridge', x: 2040, y: 700, boss: { species: 'sproutle', name: 'Bramble Warden', resist: 3.0, scale: 2, lvl: 5 }, needsQuest: 'q3' },
    ],
    pockets: [
      { x: 480, y: 950, r: 150, species: ['sproutle', 'sproutle', 'cinder'], n: 2, lvl: [1, 2], respawn: 30 },
      { x: 820, y: 520, r: 160, species: ['sproutle', 'gustling'], n: 2, lvl: [2, 3], respawn: 30 },
      { x: 1350, y: 1050, r: 170, species: ['gustling', 'voltling', 'sproutle'], n: 3, lvl: [3, 4], respawn: 30 },
      { x: 1780, y: 600, r: 160, species: ['voltling', 'gustling'], n: 2, lvl: [4, 5], respawn: 35 },
    ],
    rare: { species: 'glimmoth', x: 1950, y: 1260, lvl: 6, respawn: 180 },
  },

  forest: {
    name: 'Pinewhisper Forest', pal: 1, w: 2160, h: 1600, tile: 'forest',
    exits: [
      { x: 30, y: 800, r: 64, to: 'meadow', at: { x: 2050, y: 700 } },
      { x: 2130, y: 500, r: 64, to: 'frost', at: { x: 110, y: 1400 }, gate: 'pass' },
    ],
    obstacles: [
      { kind: 'pine', x: 250, y: 300, r: 28 }, { kind: 'pine', x: 480, y: 180, r: 28 },
      { kind: 'pine', x: 800, y: 350, r: 28 }, { kind: 'pine', x: 1150, y: 200, r: 28 },
      { kind: 'pine', x: 1500, y: 400, r: 28 }, { kind: 'pine', x: 1850, y: 250, r: 28 },
      { kind: 'pine', x: 350, y: 1400, r: 28 }, { kind: 'pine', x: 700, y: 1500, r: 28 },
      { kind: 'pine', x: 1300, y: 1450, r: 28 }, { kind: 'pine', x: 1700, y: 1520, r: 28 },
      { kind: 'rock', x: 600, y: 800, r: 24 }, { kind: 'rock', x: 1450, y: 900, r: 24 },
      { kind: 'bush', x: 1000, y: 650, r: 20 }, { kind: 'bush', x: 1750, y: 1100, r: 20 },
      { kind: 'sign', x: 160, y: 740, r: 12 },
    ],
    interactables: [
      { kind: 'campfire', id: 'forest', x: 1100, y: 500 },
    ],
    gates: [
      { id: 'pass', x: 2040, y: 500, boss: { species: 'voltling', name: 'Storm Alpha', resist: 3.6, scale: 2, lvl: 10 }, needsQuest: 'q5' },
    ],
    pockets: [
      { x: 520, y: 1150, r: 160, species: ['voltling', 'dewdrip'], n: 2, lvl: [5, 6], respawn: 30 },
      { x: 950, y: 950, r: 170, species: ['dewdrip', 'gustling', 'voltling'], n: 3, lvl: [6, 7], respawn: 30 },
      { x: 1480, y: 1200, r: 160, species: ['voltling', 'voltling', 'dewdrip'], n: 2, lvl: [7, 8], respawn: 30 },
      { x: 1800, y: 750, r: 160, species: ['dewdrip', 'gustling'], n: 2, lvl: [8, 9], respawn: 35 },
    ],
    rare: { species: 'mycelisk', x: 1920, y: 1420, lvl: 9, respawn: 180 },
  },

  frost: {
    name: 'Frostpeak Slopes', pal: 2, w: 2160, h: 1600, tile: 'snow',
    exits: [
      { x: 30, y: 1400, r: 64, to: 'forest', at: { x: 2050, y: 500 } },
      { x: 2130, y: 400, r: 64, to: 'summit', at: { x: 110, y: 700 } },
    ],
    obstacles: [
      { kind: 'pine', x: 300, y: 250, r: 28 }, { kind: 'pine', x: 750, y: 400, r: 28 },
      { kind: 'pine', x: 1200, y: 300, r: 28 }, { kind: 'pine', x: 1650, y: 200, r: 28 },
      { kind: 'pine', x: 500, y: 900, r: 28 }, { kind: 'pine', x: 1900, y: 900, r: 28 },
      { kind: 'rock', x: 400, y: 1200, r: 26 }, { kind: 'rock', x: 900, y: 700, r: 26 },
      { kind: 'rock', x: 1350, y: 1100, r: 26 }, { kind: 'rock', x: 1750, y: 1350, r: 26 },
      { kind: 'rock', x: 1100, y: 1450, r: 26 }, { kind: 'sign', x: 170, y: 1340, r: 12 },
    ],
    interactables: [
      { kind: 'campfire', id: 'frost', x: 1050, y: 1000 },
    ],
    gates: [],
    pockets: [
      { x: 550, y: 550, r: 160, species: ['frostnip', 'dewdrip'], n: 2, lvl: [10, 11], respawn: 32 },
      { x: 1050, y: 400, r: 170, species: ['frostnip', 'voltling', 'frostnip'], n: 3, lvl: [11, 12], respawn: 32 },
      { x: 1500, y: 800, r: 160, species: ['frostnip', 'frostnip'], n: 2, lvl: [12, 13], respawn: 35 },
      { x: 800, y: 1250, r: 160, species: ['dewdrip', 'frostnip'], n: 2, lvl: [11, 12], respawn: 35 },
    ],
    rare: { species: 'brinemaw', x: 1850, y: 320, lvl: 12, respawn: 180 },
  },

  summit: {
    name: 'The Summit', pal: 2, w: 1080, h: 960, tile: 'snow',
    exits: [
      { x: 30, y: 700, r: 64, to: 'frost', at: { x: 2050, y: 400 } },
    ],
    obstacles: [
      { kind: 'rock', x: 200, y: 300, r: 26 }, { kind: 'rock', x: 880, y: 750, r: 26 },
      { kind: 'rock', x: 150, y: 850, r: 26 }, { kind: 'pine', x: 950, y: 220, r: 28 },
    ],
    interactables: [
      { kind: 'campfire', id: 'summit', x: 280, y: 720 },
    ],
    gates: [
      { id: 'aurorix', x: 620, y: 400, boss: { species: 'frostnip', name: 'AURORIX', resist: 5.0, scale: 2, lvl: 16, legendary: true } },
    ],
    pockets: [],
  },
};

// Stylised map-screen layout: screen-space rects on the 540×960 map overlay,
// following the journey chain village → meadow → forest → frost → summit.
export const MAP_LAYOUT = {
  village: { x: 190, y: 770, w: 150, h: 120 },
  meadow: { x: 320, y: 590, w: 190, h: 150 },
  forest: { x: 110, y: 420, w: 230, h: 150 },
  frost: { x: 170, y: 230, w: 230, h: 150 },
  summit: { x: 230, y: 70, w: 130, h: 130 },
};

// which zone borders which (for the ribbons on the map)
export const MAP_LINKS = [
  ['village', 'meadow'], ['meadow', 'forest'], ['forest', 'frost'], ['frost', 'summit'],
];
