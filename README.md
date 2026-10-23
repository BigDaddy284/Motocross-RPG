# Motocross RPG: The Road to Legend

A single-player, offline motocross career RPG. Start as an unknown rider with a broken 50cc and work your way up to legend.

This is **test build 0.2**: the opening of a career. Name your rider, pick one of four starter 50cc bikes, then follow the garage mechanic's tutorial from a broken top end all the way to buying the van and driving out to the local tracks. All art is placeholder art in the agreed style, imported from the project's art threads.

## Play it

- **In a browser:** once GitHub Pages is switched on (Settings > Pages > Source: GitHub Actions), every push to `main` publishes the game to this repo's Pages site.
- **On your own computer:** install [Node.js](https://nodejs.org) (LTS), then:

  ```
  npm install
  npm run dev
  ```

  and open the address it prints (usually http://localhost:5173).

### Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Walk | WASD or arrow keys, or click where you want to go | Tap where you want to go |
| Talk to an NPC or use an object | Click it, or face it and press E or Space | Tap it |
| Next line of dialogue | Click, E, Space or Enter | Tap the box |
| Zoom (50% to 200%) | Mouse wheel, + and -, or the Zoom button's slider | Zoom button, then drag the slider |
| Bike, bag and current task | Tab, I or B | Bike button |
| Pause menu (save, settings) | Esc | ☰ button |

## What's in this build

### New in test build 0.2: the starter career slice

Checked against the "Starter career slice" part of the Systems Specification checklist (section 22), up to the van:

- Character creation: pick a rider, type a rider name (it can't be changed later), and choose one of four starter 50cc bikes: Yamamoto, Kwakmoto, Sukimoto or Hondmoto. Each leans a different way with the same overall total.
- Money and a bike: you start with £150 and a second-hand bike whose Grade 1 parts are at 50–80% condition, with the top end at 0%. The Bike panel shows the six bike stats, every part's grade and condition, your bag and your current task. The task also shows on screen under your money.
- The opening chain, run by the garage mechanic. You get a used top end, pay £90 to fit it on the garage bench, and earn £120 for it. Then come errands to the bike shop, tyre shop and engine rebuilder, two customer bike services, and a visit to the van seller. It can't be skipped, and it pays out so you reach the van £80 short.
- Until the chain is done, roadworks block the west road and the NPCs outside it don't acknowledge you. When it ends, the roadworks are cleared away and a fresh tarmac patch is left behind.
- Repeatable shifts at the fabrication shop (20 brackets at 75p) and the engine rebuilder (16 pistons at £1.25). Each part is a pass through three stations: click the highlighted station, wait for it, and move on. You're paid per part, even if you stop early.
- The used van for £600. A final task loads your bike and spares from your rented room, which opens the venue route and the world map. You can drive to Farmland MX, Quarry MX and Woodland MX and look around. The local racer points you to Farmland MX. Race days come in test build 3.
- Saves are now version 2. A test build 0.1 save upgrades on load and starts the opening chain with a Hondmoto. Autosave also runs after every task step and every finished batch.
- New content files, all checked at start-up: `bikes.json` (stats, part slots, brands), `items.json`, `story.json` (the opening chain, step by step) and `world.json` (locks, world map, shift jobs).

### From test build 0.1

Checked against the first-build checklist in the Systems Specification, section 22:

- Main menu that opens straight away: New career, Continue, Load, Settings, Archive, Info, Exit.
- Settings that apply at once, save automatically and have Restore Defaults.
- Home Town, the Industrial Zone and all 12 interiors, built from the art threads' Tiled maps with the finished buildings.
- WASD and click-to-move. Clicking a blocked tile walks to the nearest reachable tile; clicking an NPC walks to a free tile beside them and opens dialogue.
- Doors load the interior, and leaving returns you to the tile outside that building.
- Map caching: a map's images and ground are kept after the first visit, so going back is near-instant.
- Content checks: every data file is checked when the game starts, and a broken file stops the game with the file and field named.
- Versioned saves with 5 rotating backups. A damaged save is kept and the newest good backup is offered.
- Autosave every 5 minutes, plus Save now in the pause menu.

## How the project is laid out

| Path | What it holds |
| --- | --- |
| `src/core/` | Game rules with no graphics: pathfinding, saves, settings, content checks, doors and exits, money, bikes and the opening chain (`career.ts`), and story changes to maps (`mapState.ts`). Covered by tests. |
| `src/scenes/` | Phaser screens: boot, menus, settings, the world and the on-screen HUD. |
| `src/world/` | Drawing maps and characters. |
| `public/data/` | Game content as JSON: NPCs, dialogue, bikes, items, the opening chain (`story.json`) and the world map, locks and shift jobs (`world.json`). Every file is checked when the game starts. |
| `public/assets/` | Art and baked maps, written by the import tool. Don't edit by hand. |
| `tools/import-art.mjs` | Copies the art from the shared art folder and bakes each Tiled map into one game-ready file. |
| `tools/map-editor.html` | Standalone map and tile editor for the game maps and the Tiled sources. |
| `tests/` | Unit tests, plus checks that every door, exit and NPC on the real maps works. |

### Technology

TypeScript, [Phaser 3](https://phaser.io) and [Vite](https://vitejs.dev), with [Vitest](https://vitest.dev) for tests. Saves are JSON in the browser's storage; a desktop app wrapper (Tauri) with saves as files comes in a later build. None of the Adventure Land code is used.

### Updating the art

When the art threads change a map or sprite, run the import tool against the shared art folder and commit the result:

```
npm run import-art -- /path/to/art
npm test
```

### Editing maps

`tools/map-editor.html` is a map and tile editor for this game. It is one file with no build step: open it in Chrome or Edge (double-click it), click **Open folder…** and pick either:

- `public/assets` to edit the **game maps** exactly as the game loads them, or
- the shared `art` folder to edit the **Tiled source maps** (`.tmj`).

It paints tiles on every ground layer, edits collision, moves, copies, clears and swaps regions (buildings move with their doors), places and moves props, and checks that doors, spawns and exits sit on free tiles. In Chrome and Edge, Save writes straight back into the folder; other browsers download the file instead. An unchanged map saves back byte for byte.

`npm run import-art` rebuilds every game map from the Tiled sources, so edits made only to a game map are lost the next time the art is imported. For changes that should last, edit the `.tmj` map, then run the import. After saving, run `npm test`.

### Checks

```
npm test          # unit tests and map checks
npm run build     # type check and production build into dist/
```
