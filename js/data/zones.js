// The whole open world, hand-authored. All coordinates in world units.
// Every zone is designed by hand around a few rules (see gamedev-kb overworld
// playbook): worn paths guide the eye between the places that matter; combat
// pockets keep ~300 units of clear ground; decoration hugs edges and clusters
// into authored set-pieces; each zone has one tall hero landmark and named
// sub-areas with their own character.
//
// Zone shape:
//   w,h        ground plane spans x∈[0,w], y∈[0,h]
//   pal        index into render PALS (0 meadow / 1 pines / 2 snow / 3 dusk)
//   tile       key into S.tiles for the ground pattern
//   areas      named sub-areas {name,x,y,rx,ry} — subtitle + hunt flavour
//   exits      travel circles; gate:'id' = closed until gate opens;
//              needsEnd = only after the Aurorix ending
//   obstacles  soft circle colliders with a prop look; kind:'water' = invisible
//   interactables campfire / sanctuary / warden (still tap nearby)
//   gates      guardian bosses; needsQuest = appears once that quest unlocks it
//   pockets    grazing wild packs {x,y,r,species[],n,lvl:[lo,hi],respawn}
//   rare       one special solo spawn, long respawn
//   caches     orb stashes {x,y,n} hidden off the beaten path (respawn slowly)
export const VIEW_W = 540;
export const VIEW_H = 960;
// how far the camera may float past a zone's NORTH edge — revealing the sky
// vista that lives above y=0 in world space (the horizon is a place, not a UI bar)
export const VISTA = 170;

export const ZONES = {
  // ================================================================ VILLAGE
  village: {
    name: 'Emberlight Village', pal: 0, w: 1280, h: 1100, tile: 'path',
    spawn: { x: 640, y: 760 },
    areas: [
      { name: 'the Hearth', x: 640, y: 580, rx: 260, ry: 220 },
      { name: 'the South Paddock', x: 500, y: 950, rx: 380, ry: 160 },
    ],
    exits: [
      { x: 1260, y: 640, r: 64, to: 'meadow', at: { x: 110, y: 900 } },
    ],
    obstacles: [
      { kind: 'tree', x: 140, y: 220, r: 30 }, { kind: 'tree', x: 290, y: 140, r: 30 },
      { kind: 'tree', x: 1100, y: 180, r: 30 }, { kind: 'tree', x: 100, y: 800, r: 30 },
      { kind: 'tree', x: 170, y: 1000, r: 30 }, { kind: 'tree', x: 1170, y: 1000, r: 30 },
      { kind: 'bush', x: 500, y: 290, r: 20 }, { kind: 'bush', x: 780, y: 280, r: 20 },
      { kind: 'bush', x: 1040, y: 800, r: 20 }, { kind: 'rock', x: 380, y: 900, r: 22 },
      { kind: 'sign', x: 1130, y: 700, r: 12 },
      { kind: 'well', x: 520, y: 480, r: 32 },
      // the South Paddock: Emberlight's little farm
      { kind: 'fence', x: 300, y: 880, r: 26 }, { kind: 'fence', x: 410, y: 880, r: 26 },
      { kind: 'fence', x: 300, y: 1020, r: 26 }, { kind: 'fence', x: 410, y: 1020, r: 26 },
      { kind: 'haybale', x: 360, y: 950, r: 22 }, { kind: 'haybale', x: 760, y: 940, r: 22 },
      { kind: 'fence', x: 700, y: 1000, r: 26 }, { kind: 'fence', x: 810, y: 1000, r: 26 },
    ],
    paths: [
      { pts: [[640, 760], [640, 600], [520, 520], [400, 460], [330, 430]], w: 52 },
      { pts: [[640, 600], [800, 500], [890, 460]], w: 52 },
      { pts: [[640, 660], [900, 660], [1260, 640]], w: 56 },
      { pts: [[640, 760], [560, 900], [420, 950]], w: 44 },
    ],
    decor: [
      { kind: 'flowers', x: 460, y: 570 }, { kind: 'flowers2', x: 730, y: 560 },
      { kind: 'flowers', x: 810, y: 720 }, { kind: 'flowers2', x: 540, y: 720 },
      { kind: 'flowers', x: 260, y: 520 }, { kind: 'flowers2', x: 1010, y: 500 },
      { kind: 'tallgrass', x: 210, y: 640 }, { kind: 'tallgrass', x: 1000, y: 900 },
      { kind: 'tallgrass', x: 600, y: 990 }, { kind: 'mushrooms', x: 180, y: 300 },
      { kind: 'stump', x: 980, y: 230 }, { kind: 'flowers', x: 900, y: 590 },
    ],
    interactables: [
      { kind: 'campfire', id: 'village', x: 640, y: 580 },
      { kind: 'sanctuary', x: 330, y: 400, r: 60 },
      { kind: 'warden', x: 900, y: 420, r: 48 },
    ],
    gates: [],
    pockets: [],
    caches: [{ x: 120, y: 1060, n: 2 }],
  },

  // ============================================================ MEADOW REACH
  meadow: {
    name: 'Meadow Reach', pal: 0, w: 3000, h: 2000, tile: 'meadow',
    areas: [
      { name: 'the Hayfields', x: 450, y: 750, rx: 420, ry: 420 },
      { name: 'the Pondshallows', x: 800, y: 1600, rx: 500, ry: 380 },
      { name: 'the Old Orchard', x: 2350, y: 450, rx: 550, ry: 400 },
      { name: 'the Night Glade', x: 2600, y: 1650, rx: 380, ry: 320 },
      { name: 'Great Oak Hill', x: 1550, y: 1150, rx: 380, ry: 320 },
    ],
    exits: [
      { x: 30, y: 900, r: 64, to: 'village', at: { x: 1180, y: 640 } },
      { x: 2970, y: 1000, r: 64, to: 'forest', at: { x: 110, y: 1000 }, gate: 'bridge' },
    ],
    obstacles: [
      // Hayfields — a working farm gone quiet
      { kind: 'fence', x: 260, y: 560, r: 26 }, { kind: 'fence', x: 370, y: 560, r: 26 },
      { kind: 'fence', x: 480, y: 560, r: 26 }, { kind: 'haybale', x: 320, y: 640, r: 22 },
      { kind: 'haybale', x: 560, y: 610, r: 22 }, { kind: 'haybale', x: 430, y: 980, r: 22 },
      { kind: 'tree', x: 200, y: 380, r: 30 }, { kind: 'tree', x: 700, y: 300, r: 30 },
      // north tree line
      { kind: 'tree', x: 1100, y: 240, r: 30 }, { kind: 'tree', x: 1350, y: 180, r: 30 },
      { kind: 'tree', x: 1600, y: 260, r: 30 }, { kind: 'tree', x: 1850, y: 190, r: 30 },
      // the Old Orchard — planted rows, two by two
      { kind: 'tree', x: 2150, y: 330, r: 30 }, { kind: 'tree', x: 2330, y: 330, r: 30 },
      { kind: 'tree', x: 2510, y: 330, r: 30 }, { kind: 'tree', x: 2150, y: 560, r: 30 },
      { kind: 'tree', x: 2330, y: 560, r: 30 }, { kind: 'tree', x: 2510, y: 560, r: 30 },
      { kind: 'fence', x: 2040, y: 440, r: 26 }, { kind: 'stump', x: 2620, y: 440, r: 18 },
      // Great Oak Hill — the landmark and its grove
      { kind: 'tree', x: 1550, y: 1150, r: 46, big: true },
      { kind: 'tree', x: 1430, y: 1070, r: 30 }, { kind: 'tree', x: 1670, y: 1090, r: 30 },
      // catcher's camp on the east road
      { kind: 'log', x: 2150, y: 1000, r: 30 }, { kind: 'stump', x: 2220, y: 1040, r: 18 },
      { kind: 'sign', x: 2090, y: 1020, r: 12 },
      // scattered
      { kind: 'rock', x: 1150, y: 900, r: 24 }, { kind: 'rock', x: 1900, y: 1450, r: 24 },
      { kind: 'bush', x: 550, y: 1200, r: 20 }, { kind: 'bush', x: 1700, y: 620, r: 20 },
      { kind: 'bush', x: 2450, y: 1250, r: 20 }, { kind: 'sign', x: 170, y: 830, r: 12 },
      { kind: 'tree', x: 750, y: 1900, r: 30 }, { kind: 'tree', x: 1400, y: 1880, r: 30 },
      // the pond (invisible water colliders under the drawn ellipse)
      { kind: 'water', x: 720, y: 1580, r: 92 }, { kind: 'water', x: 880, y: 1600, r: 92 },
    ],
    paths: [
      // the east road: village gate → campfire → catcher's camp → bridge
      { pts: [[30, 900], [400, 830], [820, 720], [1250, 640], [1550, 620], [1900, 800], [2150, 960], [2500, 1000], [2970, 1000]], w: 56 },
      { pts: [[1250, 640], [1270, 560]], w: 44 },
      // a mown side-trail down to the Pondshallows
      { pts: [[820, 720], [800, 1100], [850, 1400]], w: 40 },
    ],
    waters: [{ x: 800, y: 1590, rx: 190, ry: 95 }],
    decor: [
      { kind: 'flowers', x: 600, y: 700 }, { kind: 'flowers2', x: 700, y: 760 },
      { kind: 'flowers', x: 1050, y: 600 }, { kind: 'flowers2', x: 1180, y: 680 },
      { kind: 'flowers', x: 1450, y: 540 }, { kind: 'flowers2', x: 1620, y: 580 },
      { kind: 'flowers', x: 350, y: 850 }, { kind: 'flowers2', x: 2280, y: 450 },
      { kind: 'flowers', x: 2420, y: 480 }, { kind: 'flowers2', x: 2200, y: 500 },
      { kind: 'tallgrass', x: 480, y: 1080 }, { kind: 'tallgrass', x: 600, y: 1180 },
      { kind: 'tallgrass', x: 400, y: 1200 }, { kind: 'tallgrass', x: 1000, y: 620 },
      { kind: 'tallgrass', x: 920, y: 740 }, { kind: 'tallgrass', x: 1750, y: 1500 },
      { kind: 'tallgrass', x: 1900, y: 1350 }, { kind: 'tallgrass', x: 2000, y: 1500 },
      { kind: 'tallgrass', x: 2350, y: 700 }, { kind: 'tallgrass', x: 2500, y: 620 },
      { kind: 'lily', x: 700, y: 1550 }, { kind: 'lily', x: 880, y: 1630 },
      { kind: 'lily', x: 800, y: 1520 },
      // the Night Glade: dark mushrooms where the Glimmoth sleeps
      { kind: 'mushrooms', x: 2500, y: 1580 }, { kind: 'mushrooms', x: 2700, y: 1620 },
      { kind: 'mushrooms', x: 2580, y: 1740 }, { kind: 'tallgrass', x: 2660, y: 1560 },
      { kind: 'stump', x: 2480, y: 1700 },
      { kind: 'mushrooms', x: 1350, y: 300 }, { kind: 'stump', x: 2800, y: 1400 },
      { kind: 'flowers', x: 2750, y: 800 }, { kind: 'flowers2', x: 2850, y: 870 },
    ],
    interactables: [
      { kind: 'campfire', id: 'meadow', x: 1270, y: 540 },
    ],
    gates: [
      { id: 'bridge', x: 2880, y: 1000, boss: { species: 'sproutle', name: 'Bramble Warden', resist: 3.0, scale: 2, lvl: 5 }, needsQuest: 'q3' },
    ],
    pockets: [
      { x: 500, y: 800, r: 150, species: ['sproutle', 'sproutle', 'cinder'], n: 2, lvl: [1, 2], respawn: 30 },
      { x: 1000, y: 450, r: 160, species: ['sproutle', 'gustling'], n: 2, lvl: [2, 3], respawn: 30 },
      { x: 1250, y: 1500, r: 170, species: ['gustling', 'voltling', 'sproutle'], n: 3, lvl: [3, 4], respawn: 30 },
      { x: 2350, y: 750, r: 160, species: ['voltling', 'gustling'], n: 2, lvl: [4, 5], respawn: 35 },
      { x: 1900, y: 1150, r: 150, species: ['cinder', 'sproutle'], n: 2, lvl: [3, 4], respawn: 30 },
      { x: 450, y: 1600, r: 150, species: ['dewdrip', 'sproutle'], n: 2, lvl: [2, 4], respawn: 32 },
    ],
    rare: { species: 'glimmoth', x: 2600, y: 1660, lvl: 6, respawn: 180 },
    caches: [
      { x: 2870, y: 180, n: 3 },   // beyond the orchard rows
      { x: 150, y: 1850, n: 2 },   // the far paddock corner
    ],
  },

  // ======================================================= PINEWHISPER FOREST
  forest: {
    name: 'Pinewhisper Forest', pal: 1, w: 3000, h: 2100, tile: 'forest',
    areas: [
      { name: 'the Loggers’ Rest', x: 500, y: 1000, rx: 450, ry: 400 },
      { name: 'the Deep Pines', x: 1500, y: 800, rx: 500, ry: 450 },
      { name: 'the Whisper Hollow', x: 1100, y: 1700, rx: 450, ry: 320 },
      { name: 'the Fallen Shrine', x: 2550, y: 1750, rx: 420, ry: 320 },
    ],
    exits: [
      { x: 30, y: 1000, r: 64, to: 'meadow', at: { x: 2860, y: 1000 } },
      { x: 2970, y: 600, r: 64, to: 'frost', at: { x: 110, y: 1800 }, gate: 'pass' },
    ],
    obstacles: [
      // northern tree wall
      { kind: 'pine', x: 200, y: 260, r: 28 }, { kind: 'pine', x: 480, y: 180, r: 28 },
      { kind: 'pine', x: 800, y: 300, r: 28 }, { kind: 'pine', x: 1150, y: 200, r: 28 },
      { kind: 'pine', x: 1500, y: 280, r: 28 }, { kind: 'pine', x: 1850, y: 190, r: 28 },
      { kind: 'pine', x: 2200, y: 280, r: 28 }, { kind: 'pine', x: 2550, y: 200, r: 28 },
      // southern wall
      { kind: 'pine', x: 350, y: 1900, r: 28 }, { kind: 'pine', x: 700, y: 2000, r: 28 },
      { kind: 'pine', x: 1500, y: 1980, r: 28 }, { kind: 'pine', x: 1900, y: 2020, r: 28 },
      // the Loggers' Rest: stumps where pines once stood
      { kind: 'stump', x: 380, y: 900, r: 18 }, { kind: 'stump', x: 520, y: 840, r: 18 },
      { kind: 'stump', x: 460, y: 1050, r: 18 }, { kind: 'stump', x: 640, y: 960, r: 18 },
      { kind: 'log', x: 560, y: 1180, r: 30 }, { kind: 'log', x: 300, y: 1100, r: 30 },
      { kind: 'sign', x: 420, y: 780, r: 12 },
      // the Deep Pines: the Elder Pine and its dense children (occluders)
      { kind: 'pine', x: 1500, y: 850, r: 44, big: true },
      { kind: 'pine', x: 1380, y: 760, r: 28 }, { kind: 'pine', x: 1620, y: 780, r: 28 },
      { kind: 'pine', x: 1300, y: 950, r: 28 }, { kind: 'pine', x: 1700, y: 960, r: 28 },
      { kind: 'pine', x: 1150, y: 700, r: 28 }, { kind: 'pine', x: 1850, y: 720, r: 28 },
      // Whisper Hollow: a hushed stone circle
      { kind: 'stone', x: 1000, y: 1650, r: 20 }, { kind: 'stone', x: 1120, y: 1600, r: 20 },
      { kind: 'stone', x: 1200, y: 1700, r: 20 }, { kind: 'stone', x: 1080, y: 1780, r: 20 },
      // the Fallen Shrine
      { kind: 'ruin', x: 2450, y: 1680, r: 24 }, { kind: 'ruin', x: 2650, y: 1800, r: 24 },
      { kind: 'stone', x: 2380, y: 1800, r: 20 }, { kind: 'ruin', x: 2550, y: 1620, r: 24 },
      // scattered
      { kind: 'rock', x: 900, y: 1200, r: 24 }, { kind: 'rock', x: 2000, y: 1300, r: 24 },
      { kind: 'bush', x: 1250, y: 1250, r: 20 }, { kind: 'bush', x: 2250, y: 900, r: 20 },
      { kind: 'log', x: 2300, y: 500, r: 30 }, { kind: 'sign', x: 170, y: 940, r: 12 },
      { kind: 'pine', x: 2750, y: 1200, r: 28 }, { kind: 'pine', x: 2600, y: 1000, r: 28 },
    ],
    paths: [
      // the through-road: meadow bridge → campfire → the pass
      { pts: [[30, 1000], [400, 940], [800, 760], [1180, 560], [1500, 500], [1950, 480], [2400, 520], [2970, 600]], w: 54 },
      // an overgrown spur down to the Whisper Hollow
      { pts: [[800, 760], [900, 1200], [1050, 1550]], w: 38 },
    ],
    decor: [
      { kind: 'mushrooms', x: 550, y: 700 }, { kind: 'mushrooms', x: 750, y: 1000 },
      { kind: 'mushrooms', x: 1250, y: 800 }, { kind: 'mushrooms', x: 1650, y: 650 },
      { kind: 'mushrooms', x: 350, y: 1350 }, { kind: 'mushrooms', x: 2100, y: 700 },
      { kind: 'tallgrass', x: 950, y: 900 }, { kind: 'tallgrass', x: 1400, y: 1150 },
      { kind: 'tallgrass', x: 700, y: 1300 }, { kind: 'tallgrass', x: 1850, y: 1100 },
      { kind: 'flowers2', x: 1150, y: 480 }, { kind: 'flowers', x: 1300, y: 620 },
      { kind: 'flowers2', x: 1050, y: 1680 }, { kind: 'flowers', x: 1150, y: 1740 },
      // the mushroom ring around the sleeping rare
      { kind: 'mushrooms', x: 2480, y: 1720 }, { kind: 'mushrooms', x: 2600, y: 1700 },
      { kind: 'mushrooms', x: 2620, y: 1780 }, { kind: 'mushrooms', x: 2500, y: 1800 },
      { kind: 'mushrooms', x: 2550, y: 1660 },
      { kind: 'stump', x: 2350, y: 1100 }, { kind: 'log', x: 280, y: 550 },
      { kind: 'tallgrass', x: 2700, y: 1500 }, { kind: 'mushrooms', x: 2800, y: 900 },
    ],
    interactables: [
      { kind: 'campfire', id: 'forest', x: 1500, y: 520 },
    ],
    gates: [
      { id: 'pass', x: 2880, y: 600, boss: { species: 'voltling', name: 'Storm Alpha', resist: 3.6, scale: 2, lvl: 10 }, needsQuest: 'q5' },
    ],
    pockets: [
      { x: 550, y: 1000, r: 160, species: ['voltling', 'dewdrip'], n: 2, lvl: [5, 6], respawn: 30 },
      { x: 1200, y: 1050, r: 170, species: ['dewdrip', 'gustling', 'voltling'], n: 3, lvl: [6, 7], respawn: 30 },
      { x: 1750, y: 1350, r: 160, species: ['voltling', 'voltling', 'dewdrip'], n: 2, lvl: [7, 8], respawn: 30 },
      { x: 2200, y: 1100, r: 160, species: ['dewdrip', 'gustling'], n: 2, lvl: [8, 9], respawn: 35 },
      { x: 1850, y: 700, r: 150, species: ['gustling', 'voltling'], n: 2, lvl: [6, 8], respawn: 32 },
      { x: 900, y: 1650, r: 150, species: ['sproutle', 'dewdrip'], n: 2, lvl: [6, 7], respawn: 32 },
    ],
    rare: { species: 'mycelisk', x: 2550, y: 1740, lvl: 9, respawn: 180 },
    caches: [
      { x: 2850, y: 1950, n: 3 },  // behind the shrine
      { x: 150, y: 250, n: 2 },    // the north-west thicket
    ],
  },

  // ========================================================= FROSTPEAK SLOPES
  frost: {
    name: 'Frostpeak Slopes', pal: 2, w: 3000, h: 2100, tile: 'snow',
    areas: [
      { name: 'the Icefang Lake', x: 2100, y: 500, rx: 500, ry: 380 },
      { name: 'the Crystal Fields', x: 2300, y: 1400, rx: 500, ry: 400 },
      { name: 'the Old Watch', x: 700, y: 600, rx: 400, ry: 350 },
      { name: 'the Switchbacks', x: 1200, y: 1500, rx: 550, ry: 450 },
    ],
    exits: [
      { x: 30, y: 1800, r: 64, to: 'forest', at: { x: 2860, y: 600 } },
      { x: 2970, y: 300, r: 64, to: 'summit', at: { x: 110, y: 780 } },
    ],
    obstacles: [
      // the Old Watch: a watchtower lost to the storm
      { kind: 'ruin', x: 650, y: 550, r: 24 }, { kind: 'ruin', x: 750, y: 620, r: 24 },
      { kind: 'stone', x: 580, y: 650, r: 20 }, { kind: 'stone', x: 820, y: 520, r: 20 },
      { kind: 'pine', x: 400, y: 400, r: 28 }, { kind: 'pine', x: 950, y: 350, r: 28 },
      // pines thinning as you climb
      { kind: 'pine', x: 300, y: 1100, r: 28 }, { kind: 'pine', x: 700, y: 1300, r: 28 },
      { kind: 'pine', x: 500, y: 1700, r: 28 }, { kind: 'pine', x: 900, y: 1900, r: 28 },
      { kind: 'pine', x: 1400, y: 300, r: 28 },
      // switchback boulders
      { kind: 'rock', x: 1100, y: 1300, r: 26 }, { kind: 'rock', x: 1350, y: 1550, r: 26 },
      { kind: 'rock', x: 1000, y: 1650, r: 26 }, { kind: 'rock', x: 1500, y: 1750, r: 26 },
      { kind: 'rock', x: 1700, y: 1100, r: 26 }, { kind: 'rock', x: 2000, y: 900, r: 26 },
      // the Crystal Fields + the Aurora Spire
      { kind: 'crystal', x: 2100, y: 1300, r: 20 }, { kind: 'crystal', x: 2350, y: 1250, r: 20 },
      { kind: 'crystal', x: 2500, y: 1450, r: 20 }, { kind: 'crystal', x: 2200, y: 1550, r: 20 },
      { kind: 'crystal', x: 2300, y: 1400, r: 34, big: true },
      { kind: 'crystal', x: 2700, y: 1200, r: 20 }, { kind: 'crystal', x: 2600, y: 1700, r: 20 },
      // the Icefang Lake (invisible water colliders)
      { kind: 'water', x: 2000, y: 480, r: 85 }, { kind: 'water', x: 2170, y: 500, r: 85 },
      { kind: 'stone', x: 1850, y: 650, r: 20 }, { kind: 'stone', x: 2350, y: 380, r: 20 },
      { kind: 'sign', x: 170, y: 1740, r: 12 },
    ],
    paths: [
      // the climb: pass → switchbacks → campfire → the summit road
      { pts: [[30, 1800], [450, 1750], [800, 1600], [1050, 1400], [1350, 1350], [1500, 1150], [1500, 1000], [1750, 850], [2100, 750], [2450, 550], [2700, 420], [2970, 300]], w: 52 },
      { pts: [[1500, 1000], [1480, 960]], w: 40 },
    ],
    waters: [{ x: 2080, y: 490, rx: 185, ry: 92, frozen: true }],
    decor: [
      { kind: 'drift', x: 600, y: 900 }, { kind: 'drift', x: 1000, y: 1100 },
      { kind: 'drift', x: 1450, y: 600 }, { kind: 'drift', x: 400, y: 1400 },
      { kind: 'drift', x: 1800, y: 1500 }, { kind: 'drift', x: 1150, y: 1850 },
      { kind: 'drift', x: 2600, y: 800 }, { kind: 'drift', x: 2850, y: 1500 },
      { kind: 'crystal', x: 1600, y: 450 }, { kind: 'tallgrass', x: 850, y: 1500 },
      { kind: 'stump', x: 450, y: 800 }, { kind: 'drift', x: 2400, y: 250 },
    ],
    interactables: [
      { kind: 'campfire', id: 'frost', x: 1480, y: 940 },
    ],
    gates: [],
    pockets: [
      { x: 700, y: 900, r: 160, species: ['frostnip', 'dewdrip'], n: 2, lvl: [10, 11], respawn: 32 },
      { x: 1250, y: 700, r: 170, species: ['frostnip', 'voltling', 'frostnip'], n: 3, lvl: [11, 12], respawn: 32 },
      { x: 1900, y: 1250, r: 160, species: ['frostnip', 'frostnip'], n: 2, lvl: [12, 13], respawn: 35 },
      { x: 1000, y: 1750, r: 160, species: ['dewdrip', 'frostnip'], n: 2, lvl: [11, 12], respawn: 35 },
      { x: 2450, y: 950, r: 150, species: ['frostnip', 'voltling'], n: 2, lvl: [12, 13], respawn: 34 },
    ],
    rare: { species: 'brinemaw', x: 2080, y: 700, lvl: 12, respawn: 180 },
    caches: [
      { x: 2850, y: 1950, n: 3 },  // deep in the Crystal Fields
      { x: 200, y: 250, n: 2 },    // above the Old Watch
    ],
  },

  // ================================================================= SUMMIT
  summit: {
    name: 'The Summit', pal: 2, w: 1400, h: 1100, tile: 'snow',
    areas: [
      { name: 'the Storm Ring', x: 800, y: 480, rx: 320, ry: 280 },
    ],
    exits: [
      { x: 30, y: 780, r: 64, to: 'frost', at: { x: 2860, y: 300 } },
      { x: 1370, y: 500, r: 64, to: 'stormwrack', at: { x: 110, y: 900 }, needsEnd: true },
    ],
    obstacles: [
      { kind: 'rock', x: 250, y: 350, r: 26 }, { kind: 'rock', x: 1100, y: 900, r: 26 },
      { kind: 'rock', x: 180, y: 950, r: 26 }, { kind: 'pine', x: 1150, y: 250, r: 28 },
      // the monolith ring where the storm sleeps
      { kind: 'stone', x: 800, y: 280, r: 20 }, { kind: 'stone', x: 980, y: 360, r: 20 },
      { kind: 'stone', x: 1030, y: 540, r: 20 }, { kind: 'stone', x: 900, y: 680, r: 20 },
      { kind: 'stone', x: 690, y: 660, r: 20 }, { kind: 'stone', x: 590, y: 470, r: 20 },
      { kind: 'stone', x: 650, y: 330, r: 20 },
      { kind: 'crystal', x: 380, y: 600, r: 20 }, { kind: 'crystal', x: 1120, y: 700, r: 20 },
    ],
    paths: [
      { pts: [[30, 780], [300, 780], [520, 640], [700, 520]], w: 48 },
      { pts: [[1000, 480], [1370, 500]], w: 44 },
    ],
    decor: [
      { kind: 'drift', x: 300, y: 480 }, { kind: 'drift', x: 850, y: 900 },
      { kind: 'drift', x: 600, y: 180 }, { kind: 'crystal', x: 650, y: 800 },
      { kind: 'drift', x: 1250, y: 600 },
    ],
    interactables: [
      { kind: 'campfire', id: 'summit', x: 330, y: 820 },
    ],
    gates: [
      { id: 'aurorix', x: 800, y: 470, boss: { species: 'frostnip', name: 'AURORIX', resist: 5.0, scale: 2, lvl: 16, legendary: true } },
    ],
    pockets: [],
    caches: [{ x: 1250, y: 150, n: 3 }],
  },

  // ===================================================== STORMWRACK (post-game)
  stormwrack: {
    name: 'Stormwrack Moor', pal: 3, w: 2400, h: 1600, tile: 'dusk',
    areas: [
      { name: 'the Shattered Field', x: 700, y: 700, rx: 500, ry: 450 },
      { name: 'the Thunder Fens', x: 1700, y: 1100, rx: 500, ry: 400 },
    ],
    exits: [
      { x: 30, y: 900, r: 64, to: 'summit', at: { x: 1260, y: 500 } },
      { x: 2370, y: 700, r: 64, to: 'rest', at: { x: 110, y: 700 } },
    ],
    obstacles: [
      // a land the storm chewed and spat out
      { kind: 'ruin', x: 500, y: 500, r: 24 }, { kind: 'ruin', x: 900, y: 800, r: 24 },
      { kind: 'ruin', x: 700, y: 1100, r: 24 }, { kind: 'stone', x: 600, y: 750, r: 20 },
      { kind: 'stone', x: 1100, y: 500, r: 20 }, { kind: 'stone', x: 1400, y: 900, r: 20 },
      { kind: 'rock', x: 300, y: 400, r: 26 }, { kind: 'rock', x: 1250, y: 1250, r: 26 },
      { kind: 'rock', x: 1900, y: 500, r: 26 }, { kind: 'rock', x: 2100, y: 1300, r: 26 },
      { kind: 'crystal', x: 1600, y: 700, r: 20 }, { kind: 'crystal', x: 2000, y: 900, r: 20 },
      { kind: 'pine', x: 400, y: 1400, r: 28 }, { kind: 'pine', x: 1500, y: 1450, r: 28 },
      { kind: 'log', x: 1000, y: 1350, r: 30 }, { kind: 'stump', x: 1750, y: 350, r: 18 },
      { kind: 'water', x: 1650, y: 1150, r: 80 }, { kind: 'water', x: 1800, y: 1180, r: 80 },
    ],
    paths: [
      { pts: [[30, 900], [400, 850], [800, 700], [1200, 650], [1600, 600], [2000, 650], [2370, 700]], w: 50 },
    ],
    waters: [{ x: 1720, y: 1165, rx: 170, ry: 85 }],
    decor: [
      { kind: 'tallgrass', x: 550, y: 900 }, { kind: 'tallgrass', x: 900, y: 600 },
      { kind: 'tallgrass', x: 1300, y: 1100 }, { kind: 'tallgrass', x: 1850, y: 800 },
      { kind: 'mushrooms', x: 800, y: 950 }, { kind: 'mushrooms', x: 1550, y: 1300 },
      { kind: 'drift', x: 350, y: 700 }, { kind: 'crystal', x: 1150, y: 850 },
      { kind: 'lily', x: 1650, y: 1120 }, { kind: 'flowers2', x: 2200, y: 600 },
    ],
    interactables: [
      { kind: 'campfire', id: 'stormwrack', x: 1200, y: 600 },
    ],
    gates: [],
    pockets: [
      { x: 650, y: 650, r: 160, species: ['voltling', 'gustling', 'cinder'], n: 3, lvl: [14, 15], respawn: 30 },
      { x: 1200, y: 1150, r: 160, species: ['frostnip', 'dewdrip'], n: 2, lvl: [15, 16], respawn: 32 },
      { x: 1950, y: 850, r: 160, species: ['voltling', 'frostnip', 'gustling'], n: 3, lvl: [15, 16], respawn: 32 },
    ],
    rare: null,
    caches: [{ x: 2250, y: 200, n: 4 }, { x: 200, y: 1450, n: 3 }],
  },

  // ================================================= WANDERER'S REST (post-game)
  rest: {
    name: 'The Wanderer’s Rest', pal: 3, w: 1400, h: 1000, tile: 'dusk',
    areas: [
      { name: 'the Long View', x: 900, y: 300, rx: 420, ry: 260 },
    ],
    exits: [
      { x: 30, y: 700, r: 64, to: 'stormwrack', at: { x: 2260, y: 700 } },
    ],
    obstacles: [
      { kind: 'stone', x: 700, y: 300, r: 20 }, { kind: 'stone', x: 850, y: 250, r: 20 },
      { kind: 'stone', x: 1000, y: 280, r: 20 }, { kind: 'stone', x: 1130, y: 350, r: 20 },
      { kind: 'tree', x: 350, y: 400, r: 30 }, { kind: 'tree', x: 1250, y: 800, r: 30 },
      { kind: 'rock', x: 200, y: 550, r: 26 }, { kind: 'well', x: 550, y: 500, r: 32 },
      { kind: 'fence', x: 700, y: 800, r: 26 }, { kind: 'fence', x: 810, y: 800, r: 26 },
    ],
    paths: [
      { pts: [[30, 700], [350, 650], [600, 550], [850, 450], [900, 380]], w: 48 },
    ],
    decor: [
      { kind: 'flowers', x: 750, y: 500 }, { kind: 'flowers2', x: 950, y: 550 },
      { kind: 'flowers', x: 600, y: 650 }, { kind: 'tallgrass', x: 400, y: 750 },
      { kind: 'tallgrass', x: 1100, y: 600 }, { kind: 'mushrooms', x: 250, y: 300 },
      { kind: 'haybale', x: 760, y: 740 }, { kind: 'lily', x: 480, y: 850 },
      { kind: 'flowers2', x: 880, y: 320 }, { kind: 'flowers', x: 1050, y: 400 },
    ],
    interactables: [
      { kind: 'campfire', id: 'rest', x: 900, y: 480 },
    ],
    gates: [],
    pockets: [],
    rare: null,
    caches: [{ x: 1300, y: 150, n: 4 }],
  },
};

// Stylised map-screen layout: screen-space rects on the 540×960 map overlay,
// following the journey chain up the mountain and beyond the storm.
export const MAP_LAYOUT = {
  village: { x: 60, y: 790, w: 140, h: 110 },
  meadow: { x: 230, y: 700, w: 250, h: 170 },
  forest: { x: 90, y: 470, w: 260, h: 170 },
  frost: { x: 210, y: 250, w: 260, h: 170 },
  summit: { x: 80, y: 90, w: 150, h: 120 },
  stormwrack: { x: 270, y: 70, w: 190, h: 130 },
  rest: { x: 470, y: 100, w: 60, h: 80 },
};

// which zone borders which (for the ribbons on the map)
export const MAP_LINKS = [
  ['village', 'meadow'], ['meadow', 'forest'], ['forest', 'frost'], ['frost', 'summit'],
  ['summit', 'stormwrack'], ['stormwrack', 'rest'],
];
