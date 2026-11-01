# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Motocross RPG: The Road to Legend is a single-player, offline browser game (TypeScript, Phaser 3, three.js, Vite, Vitest). The README is long and doubles as the player guide, changelog and design log; its "How the project is laid out", "Races on screen" and "Before release" sections are the most useful for code work.

## Commands

```
npm install
npm run dev                      # Vite dev server, http://localhost:5173 (toolkit at /tools/)
npm test                         # vitest run: all tests/**/*.test.ts (~45 s)
npx vitest run tests/race.test.ts          # one file
npx vitest run -t "start procedure"        # tests whose name matches
npm run typecheck                # tsc --noEmit (covers src and tests)
npm run build                    # typecheck, then production build into dist/
npm run import-art -- /path/to/art         # re-import art and re-bake maps (default /mnt/project-files/art)
npm run import-art -- --vehicles /path/to/art   # van sheets only
npm run import-art -- --maps area2-mountain-town   # bake only these maps, keep every other map and image
node tools/gen-area.mjs [--plan]          # re-stamp the placeholder towns (skips drawn maps)
node tools/export-tmj.mjs [--maps id,id]  # write the game's maps back to the art folder as Tiled maps
npx vite-node tools/sim/balance.ts [days] [riderLevel]   # race balance simulation
```

There is no linter. CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test` and `npm run build` on every push and PR, and publishes `main` to GitHub Pages, with one preview branch (`PREVIEW_BRANCH`) built into a subfolder whose saves are kept apart by `VITE_STORE_NAMESPACE`.

Dev URL params (handled in `src/scenes/BootScene.ts`): `?testtrack=<track id>` jumps straight into a race day on that track with a fresh rider; `?editview` is the track editor's embedded race view. `window.game` exposes the Phaser game for console debugging and automated playtests.

## Architecture

**Layers.** `src/core/` is pure game logic with no Phaser or DOM imports, and it is what the tests cover. `src/scenes/` holds the Phaser scenes, `src/world/` draws things (maps, characters, the van, and the three.js race view `RaceView.ts`), and `src/ui/` holds shared widgets, theme and file import/export. Keep rules in `core/` so they stay testable; scenes and views should only call into them.

**Content is data.** Nearly all game content (NPCs, dialogue, bikes, items, shops, tracks, riders, championships, skills, training, errands, world map, locks) lives in `public/data/*.json`. `src/core/content.ts` lists the files in `CONTENT_FILES`, validates each against a schema (`src/core/validate.ts` plus per-module `*_SCHEMA` / `check*` functions), then cross-checks them against each other and the baked maps (missing sprites, dialogue, NPCs on blocked tiles…). `BootScene` refuses to start the game and shows the errors if any check fails, and `tests/content.test.ts` runs the same checks, so a bad content edit fails the tests. When adding a content field, update the TypeScript type, the schema and any cross-check together.

**Maps are baked.** Art and maps come from Tiled sources in the shared art folder (outside this repo). `tools/import-art.mjs` copies images into `public/assets/art/` and bakes each `.tmj` into one JSON in `public/assets/maps/` (collision, buildings, doors, data objects resolved), listed in `public/assets/manifest.json`. The game never reads `.tmj`/`.tsj`. Prefer re-running the import over editing `public/assets/` by hand. Small fixes are sometimes made straight in a baked map (Home Town's lamp, the rented room's doormat wall) or with the map editor (`tools/map-editor.html`, which can save into the game under `npm run dev`); note them in the commit, because a fresh import from the Tiled sources would undo them.

**Placeholder towns (Areas 2 to 8 maps, Piece 0; Boss, 31 Oct 2026).** `tools/gen-area.mjs` stamps each Area 2 to 8 town and its insides from the Home Town bake until the town is drawn. It never stamps a drawn map: one baked by import-art (`tools/art-maps.mjs` `AREA_MAPS`, where a drawn town's `.tmj` is added) or with a `.tmj` in the art folder's town or interiors folder (`tests/genArea.test.ts`). A full `npm run import-art` rebuilds `public/assets/maps/`, re-stamps the placeholders at the end, and only adds or replaces images (an unchanged picture is left alone, since the shared folder re-saves PNGs). `--maps` bakes only the named maps and copies only images the game lacks.

**Maps edited in the game go back to the art folder (Boss, 31 Oct 2026).** The art folder was brought up to date with the game on 31 Oct 2026 (`tools/sync-art-folder.mjs`; the replaced files are in the project's `archive/art-before-sync-2026-10-31/`). The game's maps are now Tiled maps there, each with its own tileset in `area-map/tiled/exported/`, written by `tools/export-tmj.mjs`, and `tests/exportTmj.test.ts` checks that exporting and baking again gives every map back byte for byte. After editing a map in the game (map editor, hand fix), run `node tools/export-tmj.mjs --maps <id>` so the next full import keeps the edit.

**Shared state.** `src/services.ts` is the global holding loaded content, maps, the save manager, settings and mod tracks; Boot fills it in. Scene flow: Boot → Menu / NewCareer → World, which launches Hud as an overlay and launches Race for race days and practice. `careerFlow.ts` handles starting or loading a career.

**Saves.** `src/core/saves.ts` stores JSON through the `KeyValueStore` interface (`src/core/storage.ts`: `LocalStore` in the browser, `MemoryStore` in tests). Saves carry `SAVE_VERSION`; changing the save shape means bumping it and adding a step to `MIGRATIONS` (`MIGRATIONS[n]` upgrades version n to n + 1). Exported save files go through the same `parseSave`, so old exports must keep loading.

**Racing.** Results are decided by the simulation in `src/core/race.ts`; everything random comes from a seed (`seededRng`, `mixSeed`), so the same seed replays exactly and tests depend on that determinism. `src/core/raceDay.ts` runs a race day (motos, field, entry fee, prize money, XP, wear) and `championship.ts` runs multi-round championships. The rider AI (`riderAI.ts`, `riderProfile.ts`) only acts out what the simulation decided, reaching each section when the sim says. The track is a solid surface (`trackSurface.ts`, `trackGeom.ts`, `jumps.ts`, `elevation.ts`); the start procedure and official are planned per track (`startOfficial.ts`, `trackClearance.ts`) and a track with no clear room fails its checks. The slow start-procedure tests are split one file per track (`tests/startProcedure.*.test.ts`) to avoid vitest worker timeouts. The per-track rider AI and track surface tests are split the same way by area group (`tests/trackGroups.ts`, `tests/riderAI.<group>.test.ts`, `tests/trackSurface.<group>.test.ts`): a test file that runs much past a minute of synchronous work fails the whole run with `Timeout calling "onTaskUpdate"`, so keep adding groups as tracks are added.

**Tracks and mods.** The game's tracks live in `public/data/tracks.json`. Player-made mod tracks are `public/mods/tracks/<name>.track.json`, checked by `src/core/modTracks.ts` with the same rules. A plugin in `vite.config.ts` serves the folder's `index.json` live in dev, writes it into `dist/` on build, and accepts `POST /__mods/tracks/<name>.track.json` from the track editor in dev.

**Toolkit.** `tools/*.html` (track editor, map editor, outfit and character designers) are standalone HTML pages, not part of the Vite app's module graph. The build copies the pages listed in `TOOLKIT_PAGES` in `vite.config.ts` into `dist/tools/`, so a new tool page must be added there and to `tools/index.html`. Usage docs are in `docs/TOOLKIT_INSTRUCTIONS.md`; asset and track how-tos in `docs/ADDING_ASSETS_AND_TRACKS.md` and `docs/MAP_EDITOR_TILE_GUIDE.md`. `tools/art/*.py` are scripts that generated placeholder art.

## Conventions

- Comments and README notes record design decisions with who agreed and when, e.g. `(Boss, 29 Oct 2026)`, and tests cite the design document as `GDD x.y`. Keep that style, and don't reverse a dated decision without being asked.
- The README is updated alongside features (what the build offers, controls, project status). Update the relevant section when behaviour players see changes.
- Testing aids to remove before final release are listed under "Before release" in the README (currently `testPayMultiplier` in `public/data/world.json`, and the "TEST: Always win" setting, which MUST be removed before the final merge to `main`).
- Version strings: `package.json` `version` and `BUILD_LABEL` in `src/services.ts`.

## Branches (Boss, 30 Oct 2026)

- `main` is the released game (Alpha v1.1). Nothing goes to `main` until Boss explicitly says "Merge to Main".
- `test/v1.5` is the test branch for v1.5, being wrapped up for release in December. Fixes for v1.5 open PRs against `test/v1.5`, not `main`; a bare "merge" no longer means `test/v1.5` (see the next point).
- `test/v2.0` (Boss, 1 Nov 2026): v1.5 is being wrapped up for release in December, so the 3D model work (scenery colours, words and pictures on models, the Blender upgrades) goes into `test/v2.0`, made from `test/v1.5` at 129549f. Open those PRs against `test/v2.0`; fixes for v1.5 still go to `test/v1.5` and are merged forward into `test/v2.0`. If Boss says "merge" to `test/v1.5` now, stop and check with him first that he means v1.5 and not v2.0, before merging anything (Boss, 1 Nov 2026). The model work is gathered into one big merge into `test/v2.0` when he says. Boss's `.glb` models stay on his PC until the models are finished (a few weeks from 1 Nov 2026); he will then upload them to a folder on GitHub, and Claude moves them into `public/mods/models/` for v2.0.
- Test plays are the Pages build of `test/v1.5` at `/test-v1.5/` (`PREVIEW_BRANCH` and `PREVIEW_PATH` in `.github/workflows/ci.yml`). When a new test version starts, ask Boss before pointing the preview at it; he wants to be asked each time.
