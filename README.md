# LUMEN — Hold the Light

A browser tower defense game. Keep the **Beacon**, the last light in a world swallowed by night, burning through **thirty nights** of ever-growing shadow.

Everything is procedural: the art is Canvas2D vector drawing with dynamic lighting, all sound and music are synthesized live with WebAudio, and every run gets a freshly generated map. There are no asset files.

## How to play

- Shadows pour out of **rifts** at the edges of the map and hunt the Beacon in the centre. More rifts tear open as the nights go on.
- Build in the open field. Shadows always walk the shortest open path, shown as a pink trail. Use **Bulwarks** and your towers to force them through a long killing maze. You can never seal the path completely.
- **Brutes** and the **Gloom Colossus** smash through walls instead of going around. **Wraiths** and the **Night Wyrm** fly over everything.
- **Harvesters** on crystal veins pay out aether every night you survive.
- **Ascend the Beacon** to unlock new tiers of structures. Each structure has three upgrade levels.
- Call the next night early for bonus aether, and use the Beacon's **Nova** when things get close.
- Every 10th night brings a boss. Night 30 is the Eclipse. Survive it to see the dawn, then keep going in endless mode if you dare.

### Structures

| Tier | Structure | Role |
| --- | --- | --- |
| 1 | Bulwark | Cheap wall for mazing |
| 1 | Arbalest | Fast bolts, ground and air |
| 1 | Thornfield | Walkable spike trap, pierces armour |
| 1 | Harvester | Economy; must sit on a crystal vein |
| 2 | Ember Mortar | Long-range splash, ground only |
| 2 | Frost Pylon | Slowing aura, hits air too |
| 2 | Tar Mire | Walkable pool that heavily slows |
| 3 | Tesla Coil | Chain lightning for swarms |
| 3 | Pyre | Flame cone that sets targets burning |
| 3 | Mender Shrine | Repairs nearby structures and the Beacon |
| 4 | Prism Lance | Beam that ramps up on a single target |
| 4 | Skyhunter | Homing missile battery, prioritises flyers |
| 5 | Sun Obelisk | Pillar of sunfire on the strongest foe |

### Controls

Desktop:
- <kbd>1</kbd>…<kbd>=</kbd> pick a structure. Click to build, and drag to paint walls and traps.
- Right-click or <kbd>Esc</kbd> cancels.
- <kbd>U</kbd> upgrade · <kbd>X</kbd> sell · <kbd>T</kbd> targeting · <kbd>V</kbd> Nova · <kbd>B</kbd> Beacon · <kbd>N</kbd> call night · <kbd>Space</kbd> pause · <kbd>F</kbd> speed · <kbd>M</kbd> mute
- The mouse wheel zooms, and right- or middle-drag pans.

Touch: tap a tile, then tap it again to build. Drag to pan, and pinch to zoom.

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

The build is fully static, with relative asset paths, so `dist/` can be hosted anywhere, e.g. GitHub Pages.

### Balance simulation

Game logic is independent of rendering, so it runs headless. `npm run sim` plays many seeded games with a heuristic bot and reports how far it gets:

```bash
npm run sim -- 16 normal 0 0.7      # runs, difficulty, bot mazing (0/1), bot skill
MAXW=100 npm run sim -- 16 casual   # raise the wave cap to probe endless mode
```

### Browser smoke test

`scripts/shot.mjs` drives Chromium through playwright-core. It covers the title, placement, selection, waves, menus and mobile layouts, saves screenshots to `shots/`, and reports console errors:

```bash
npm run dev &
CHROMIUM=$(which chromium) node scripts/shot.mjs http://localhost:5173/
```

Debug URL parameters: `?autostart=normal&seed=123&ff=300&bot=1` starts a game directly, fast-forwards 300 seconds with the bot playing, and keeps the bot on.

### Layout

```
src/
  game/      pure simulation: config & balance, grid + flow-field pathing, waves, game state, bot
  render/    camera, renderer (lighting, effects), particles, procedural sprites
  audio/     WebAudio synthesized SFX + generative music
  ui/        DOM HUD, panels, screens, input (mouse/touch/keyboard)
scripts/     balance sim, browser screenshot test
```
