# CUTE FIGHT — monster-catching brawler with Smash-feel (pixel art PWA)

## Context

Mathias wants a new private game: a Pokémon-like fighting & adventure game with homemade pixel art — walk right, fight monsters in real time, level up, learn abilities, catch monsters with unique abilities. Mid-planning he sharpened the vision: **it's a FIGHTING game first — "like Smash Brothers but a light version" for mobile/tablet touch.** A game-research pass (Smash mechanics, Dead Cells mobile postmortem, Archero/Brawl Stars, Streets of Rage 4, Digimon Rumble Arena, mobile-Smash-clone failures) produced the combat frame below.

Decisions locked with Mathias:
- **Combat frame: grounded brawler with Smash's feel layer** — hitpause, knockback, launchers, wall-bounce juggles. NOT a platform fighter (ring-out KOs die on touch and delete the catch mechanic).
- **You ARE the monster** (no trainer); team of 4, swap who you control
- **One long journey** left→right, towns + campfire checkpoints; **medium difficulty with teeth** (wipes sting but are recoverable; no rubber-banding, no free retries)
- **Jump: yes** — a hop for dodging + juggling launched foes mid-air (no platforming levels)
- **Ability = earned gauge** (Digimon Rumble Arena style): fight cleanly to fill a bond gauge, then unleash the signature verb; swapping in a bench monster with a full gauge is a tactic
- **Mostly duels, pairs at peak; bosses are big solo duels** (readable on a phone, catches stay deliberate)
- **The catch IS the finisher**: hits fill a visible **daze meter** (dizzy stars). Dazed band = catchable (throw orb → shrinking-ring timing tap). Overfill = KO, catch lost (species recurs later — no permanent loss). This is Smash's "one more hit!" percent drama inverted into "careful — don't overkill!"
- **Cute classic fantasy**, all pixel art hand-crafted by Claude; **English** names/UI; **15 monsters** incl. evolutions at v1
- **Name: Cute Fight** → `~/cc/cutefight`, GitHub `BordingCode/cutefight`, live at `bordingcode.github.io/cutefight`

## Combat design (the core)

### Touch controls (two thumbs, ≤3 live targets — the research-proven grammar)
- **Left thumb: floating move pad** (spawns under the thumb — Dead Cells mobile: 80% preferred floating). Walk left/right; **flick up = hop** (dodge + aerial juggle hits).
- **Right thumb: ONE attack button**, moveset via Button+Direction (Sakurai's trick):
  - **Tap** = light attack, auto-targets nearest foe (Archero split-control: player owns movement, game owns aim). Repeated taps = light chain.
  - **Hold → release** = charged heavy (big wind-up, biggest hitpause)
  - **Swipe up** = **launcher** (pop the foe up → wall-bounce juggle; foes bounce off screen edge, never fly off-screen — SoR4)
  - **Pad-direction + tap** = advancing hit / spacing poke
- **Context-only buttons** (appear when relevant): **Ability** (lights up when bond gauge full), **Catch orb** (appears when foe is dazed), **team portraits** in top corner for swap (in combat: ~6s cooldown, brief invulnerable tag-in, HP persists).
- HUD in top corners, never under thumbs. **Assist mode toggle (off by default)**: lights auto-connect, heavies auto-time — positioning + catch timing remain the skill.

### Feel layer (Smash's soul, cozy-fied)
- **Hitpause** 50–110 ms scaled by hit weight (≤120 ms cap; reduce-motion no-ops it)
- Knockback = real sim impulse; squash/smear is draw-time only (never move the sim entity for juice)
- Cute feedback: soft "boing" knockback tones, dizzy-star VFX, tumbling animations — bouncy, not violent. Big celebration reserved for catches/evolutions.
- Depth lives in **decisions** (element matchup, when to swap, which verb, when to commit to the catch) — never execution combos.

### Daze & catch
- Hits fill the foe's visible daze meter. **Dazed band** (before the KO line): wobble + stars + chime → orb throw → shrinking ring; inner = caught, middle = struggles (orb lost, one reset), outer = breaks free & recovers. Ring speed scales with rarity.
- Dazed foes take reduced damage so only big verbs risk overkill. Non-damaging setup (Frost slow, Gust push) helps stall near the line.
- **Orbs finite** (towns/path); "sure-grip" orbs = slower ring. Duplicates → Sanctuary, release for essence. Rare colour variants (cosmetic, recurring).

## Elements: 6, two rock-paper-scissors triangles
- Life: **Ember > Leaf > Tide > Ember**; Storm: **Spark > Frost > Gust > Spark**; cross-triangle neutral. ×1.6 / ×0.6 / ×1.0.
- Never numbers: green ▲ / red ▼ chevrons on HP bars, shape+colour badges (colourblind-safe), super-effective hits bigger + brighter + "STRONG!" + distinct chord; weak hits dull thuds. Codex draws the triangles.

## Roster: 6 families, 15 monsters — every ability adds a VERB (bond-gauge signature moves)
| Family | Stages | Signature verb → evolution deepens it |
|---|---|---|
| Ember 🔥 (3) | Cinder → Blazepup → Pyrelion | **Ember Dash** (lunge, i-frames) → fire trail zones → chargeable comet dive |
| Leaf 🌿 (3) | Sproutle → Bramblekin → Thornmaw | **Seed Toss** → placeable thornbush hazard → rooting vines, 2 hazards + heal in foliage |
| Tide 💧 (3) | Dewdrip → Splashling → Tidalore | **Bubble Shot** → Bubble Shield (block a telegraphed hit) → split ×3 + reflect |
| Spark ⚡ (2) | Voltling → Stormjolt | **Blink** (micro-teleport) → static trap + chain-blink |
| Frost ❄️ (2) | Frostnip → Glaciam | **Frost Breath** (slow cone) → **Freeze-interrupt** enemy wind-ups |
| Gust 🌬️ (2) | Breezel → Galewisp | **Glide** (hover/aerials) → **Gust Push** (shove foes into hazards) |

Placed effects persist across swaps (thornbush as Leaf → swap → Gust-push a foe into it). Six earliest catches span melee / zoner / ranged-defense / speed-burst / control / aerial.

## Leveling / evolution
- Cap Lv 10; gentle-linear XP from fights + catches, tuned so path-play keeps pace (no grind). Levels grant ability upgrades; **Lv 5 = a choice of two modifiers**; only small capped HP nudges (no sponge stats). Enemy DAMAGE scales per biome, not HP sponges.
- **Evolution = level threshold + Evolution Spring in towns** (chosen, celebrated; can decline/delay).

## World: 4 biomes, ~50–65 min to credits, teach one idea at a time
1. **Meadow Reach** — tutorial by doing (walk → light chain → hop-dodge a telegraph → launcher → first daze+catch). Town Hearthome: pick starter (Cinder/Sproutle/Dewdrip), heal, orbs. ~10 min.
2. **Bramblewood** — terrain hazards, first soft type-gate, mini-boss Bramble Warden. Town Mosswell: Evolution Spring + Sanctuary. ~13 min.
3. **Thunder Bluffs** — pairs of foes, mid-fight swap lesson, boss Storm Elk (2-phase). Town Voltcrest. ~16 min.
4. **Frostpeak Pass → Summit** — slow/interrupt play; finale legendary you **defeat OR catch** (perfect ring under pressure = true trophy; the ending scene differs). ~18 min.

Campfire checkpoints between towns (partial heal + save). One hidden side-path per biome. Stretch: "Wanderer's Path" second lap.

### Story (simple, not AI-flavoured: concrete nouns, few words)
One-sentence premise: **the storm on the Summit hasn't stopped in a year and the village's fields are drowning — someone has to go up.** Told through the world (drowned crops in biome 1, storm growing as you climb), a recurring Warden with one odd quirk (terrified of the monsters he catalogues), 3–4 short town moments, ~200 words of dialogue total. Ending image depends on defeat-vs-befriend of the legendary.

## Stakes (medium with teeth)
- Monster faints → out for that fight, auto-swap next. Never permadeath.
- **Team wipe → wake at last campfire healed, drop a chunk of essence/orbs, redo the stretch.** Everything lethal telegraphed; ~3–4 misreads faint a monster, bosses ~2 unread telegraphs.

## Pixel art direction
- Monsters/player **24×24**, bosses 48×48, tiles 16×16. One ~28-colour cozy palette, 3-shade ramp per element, desaturated backgrounds.
- ~5–8 drawn cells per monster (idle 2 / walk 2–4 / attack 2; hurt = tint, dazed = idle + shared star overlay); evolutions share family motion skeleton. Total ≈ 110 cells + 4 bosses + ~10 tiles/biome.
- **Authoring: pixel-grid text format** (array of strings, char = palette index) → baked once to offscreen canvases, nearest-neighbour integer scale, blitted per frame; `image-rendering: pixelated`. Art stays editable text, no image files.
- 3 parallax layers tinted per biome.

## Audio (fits Smash-light + cute)
Warm chiptune via procedural WebAudio (reuse starweaver synth): cozy town themes, energetic-but-rounded battle layer that intensifies with the daze meter, soft "boing" hit tones, sparkle fanfare on catch/evolution. Music ducks under catch-ring and boss cues. Mute persisted.

## Technical architecture (reuse, don't rewrite)
Vanilla HTML/CSS/JS, no build step, canvas, PWA. Copy/adapt:
- **Engine**: `/home/mathias/cc/starweaver/js/engine/` loop.js (fixed timestep), canvas.js (DPR letterbox portrait world), input.js (floating joystick base), pool.js, vec.js. Screen router pattern from `/home/mathias/cc/aegis/js/screens/` (title / journey / town / sanctuary / codex).
- **World**: pure-sim convention from `/home/mathias/cc/emberlock/js/game/world.js`; scrolling camera + parallax is new code. Knockback/impulse feel reference: emberlock's shove sim.
- **Juice**: `/home/mathias/cc/starweaver/js/engine/fx.js` (trauma shake, hitStop, floatText, particles, reducedMotion) — hitStop is the hitpause.
- **Audio**: `/home/mathias/cc/starweaver/js/audio.js` synth patterns.
- **Data**: roster factory à la `/home/mathias/cc/warbound/js/data/units.js` + effect-op lists à la `/home/mathias/CC/mournwood-remake/js/data/cards.js`. ~10–12 composable sim verbs (dash, projectile, place-hazard, shield, slow, freeze-interrupt, blink, push, hover, heal-zone, charge, launcher); each ability = a data row.
- **Save**: localStorage `cutefight_save_v1`, defaultSave-merge from `/home/mathias/cc/aegis/js/save.js`; dex shape from `/home/mathias/cc/primordia/js/engine/save.js`.
- **Sprites**: new `js/engine/pixels.js` (pixel-grid text → cached offscreen canvases).
- **PWA verbatim**: starweaver `sw.js` (`CACHE='cutefight-v1'`), `?v=` busting, manifest.json, `.nojekyll`, hub-stats snippet `A="cutefight"`, hexfall boot watchdog, debug global `window.__cf`.

New repo `~/cc/cutefight` under BordingCode, Pages from main. Add to Bording Hub SECTIONS when live. Commit + push after every working change.

## Milestones
**M0 — prove the fight + catch feel (ship first):** one screen; Cinder with light chain / charged heavy / launcher / hop; one wild Sproutle with a telegraphed attack; hitpause + knockback + wall-bounce juggle; daze meter + don't-overkill + timing-ring catch; type chevron; pixel pipeline on ~4 sprites; full touch grammar. **Verdict gate: on a real phone, is hitting satisfying, is dazing tense, is the ring-catch a thrill? If not, redesign before content.**

**M1 — first playable slice:** 3 starters with signature verbs + bond gauge; team-of-4 + swap; Meadow Reach complete (parallax, tutorial pacing); Hearthome (heal/shop/sanctuary stub); XP/leveling; save. 10-minute slice end-to-end.

**Full v1:** 15 monsters + evolutions + Spring; both triangles + live readout; 4 biomes + towns + bosses; cross-swap hazard combos; catch economy; Sanctuary shelf + codex; wipe→campfire recovery; finale legendary + story beats; adaptive audio; accessibility pass (assist mode, reduce-motion no-ops hitpause, shape+colour badges).

## Verification
- Each milestone: **playtester agent** drives it in a real browser at phone viewport (fight, juggle, daze, catch, swap, wipe, reload save) with screenshots; **deploy-verifier** proves the pushed version is live (SW bump + `?v=` + `.nojekyll`).
- Feel checks need a human: Mathias plays M0 on his phone before M1 starts.
- `window.__cf` debug hooks for headless checks (spawn, damage, daze fill, catch roll, save round-trip).
- v1 learning check: does a new player learn fire>leaf>water purely from hit feedback (playtester verdict)? Credits reachable ~1 h without grinding.

## KB debt (write at build time)
New docs for `~/cc/gamedev-kb`: touch-brawler/Smash-feel playbook (research already done, incl. sources + "hitpause ≤120ms in action-cozy, reduce-motion no-ops it" rule reconciliation); pixel-art text-grid sprite pipeline; skill-based timing-ring catch pattern; daze-meter-as-inverted-Smash-percent; placed-effects-persist-across-swap.
