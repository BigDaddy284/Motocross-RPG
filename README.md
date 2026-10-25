# Motocross RPG: The Road to Legend

A single-player, offline motocross career RPG. Start as an unknown rider with a broken 50cc and work your way up to legend.

This is **test build 0.3**: your first race day, now with shops and repairs. After the garage mechanic's tutorial and the van, sign on at Farmland MX and race two motos against the Local Champion and 14 other riders, or put laps in on the backyard loop. Every lap trains your Rider Ability skills and wears your bike, and now you can buy parts, fit spares and pay for repairs in Home Town. All art is placeholder art in the agreed style, imported from the project's art threads.

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
| Zoom (50% to 200%) | Mouse wheel, + and -, or the on-screen zoom control | The on-screen zoom control: a Zoom button with a slider, or + and − buttons (Settings > Display > Zoom control) |
| Bike, bag and current task | Tab, I or B | Bike button |
| Skills | K, or the Skills tab in the Bike panel | Bike button, then Skills |
| Pause menu (save, settings) | Esc | ☰ button |

### Playing on a phone

Hold the phone sideways: the game is laid out for landscape, and asks you to turn the phone if it is upright. For the most room, use the browser's Add to Home Screen: the game then opens full screen with no browser bars. The game draws at the phone's full screen resolution, and panels shrink to fit a short screen.

## Project status: racing and track editor update

Done on branch `claude/project-thread-ch8ujf` (see the sections below for how each works):

- **Starting grid:** the gate you pick is your slot (1 to 8 front row, 9 to 16 second row) and your place in the arrival order; impossible gates are refused, not swapped.
- **Start official:** waits at A from the start, walks to B with the board through the 5-second hold, lowers it at 1 and stays at B; drawn at 90%; the walk is planned clear of the track and scenery on every track.
- **Farmland stuck riders:** finishers used to stop in one heap on the track 40 m past the line while others raced through; they now ride a slow cool-down in single file down the track edges.
- **Scenery checks:** turned colliders, errors (on the track) and warnings (touching its edge, or overlapping), a Check button, click to find, on load and save.
- **Ground elevation:** the editor's Height mode; heights saved as an optional `elevation` key on a track (no migration needed: tracks without it are unchanged); the race's ground, track, bikes and rider pace follow it.
- **Race view in the editor:** the game's race camera and 3D scene is the track editor's only view (the Map view switch and V key are gone), with every editor tool working on it and the lap map in its corner.
- **Faster race view editing:** marker heights and clicks use a grid of the ground's triangles instead of raycasting every triangle, the ground's elevation blend looks only at nearby track, rebuilds reuse the WebGL renderer, and the view draws only when something changes. On Farmland in the test browser: a still view went from about 3 to 60 frames a second, a rebuild from 1.2–1.9 s to about 0.2 s, a height dab from about 4.5 s to 1.2 s to show, and Layout edits from 10 s to under 0.1 s of marker work. Same pictures and same answers (checked).
- **Section lines:** in Layout, each section is a stripe in its kind's colour down the track and a cream line crosses the track at each boundary, from the section data, following the bends.

Tests: `npm test` (129 tests, the slow start procedure tests now one file a track) and `npm run build` pass. In-game runs through the real UI with Playwright: full races on Farmland (Race 8×), Arena (Auto-complete 8×) and Longmoor (Race 8×) with results in true order and no editor markers in the race; the editor's tools (scenery place, drag, turn; height dabs; layout drag and undo; ground paint; section pick; Preview; save; switching tracks) at 1280 × 720, 1500 × 900 and 1920 × 1080; section lines on all four tracks; save and reload with the lines unchanged; the minimap following edits.

Known limits: the race view needs `npm run dev` (opened from disk the editor shows a plain map). A rebuild still remakes the whole 3D scene (about 0.15–0.25 s on Farmland) at most every 0.3 s, so a brush stroke shows in steps. The tests ran in a software-rendered browser, where any frame that does draw takes about 0.3 s at 1500 × 900, so hovering, panning and zooming ran at 3 to 10 frames a second there; on a real GPU those draws are far cheaper, but that was not measured.

To resume: `npm install`, `npm test`, `npm run dev`, then open `/tools/track-editor.html`.

## What's in this build

### Added to test build 0.3: your van on the map

Following Boss's brief "Seven Vans, Vehicle Gameplay Integration and Bike Model Updates" (24 Oct 2026). Art and the full audit are in the shared art folder under `art/vehicles/`.

- **The van you buy is on the map.** The £600 used van from the opening chain is the Old Rusty Truck Short, parked in the car park behind the van seller's office. You own one van at a time; a new one will always be a part exchange, so the save keeps one van and one parked spot.
- **Get in:** click the van, or face it and press E or Space, then pick **Drive**. **Open the back** opens the rear and shows your bag; **Not now** leaves it.
- **Drive** with WASD or the arrow keys: ahead drives on, a side turns at the next gap, and back turns round into the other lane (or reverses where there is no room). Or click or tap the road and the van drives there, round corners and through junctions. Vans stay on roads, pavements, car parks, gravel and concrete, never grass, buildings or doors. **Get out** with E, Space, the **Get out** button or a click on the van: you step out on the driver's side, and the van stays exactly where it is.
- **Collision:** a van is a solid footprint one tile wide and as long as the real vehicle (2 to 9 tiles). It can't drive into NPCs, though on foot you still walk through them, and you can't walk through a parked van.
- **Map changes:** drive through an exit (Home Town to the Industrial Zone and back) or onto the venue route, and the van comes with you, parked at the arrival point facing into the map. Walk out instead and it stays where you left it; nothing brings it to you. It is saved with its map, tile and facing, so it is still there after a reload. Saves go to version 4; an older save with a bought van gets it at the starter spot.
- **Seven designs** (`public/data/vehicles.json`), drawn from Boss's reference photos and named after them: Old Rusty Truck Short, Old Rusty Van, MX Van Short, MX Van Medium, MX Sports Motorhome Medium, MX Sports Motorhome Long and Factory Hauler. For playtesting, add `?van=van-7` (any of `van-1` to `van-7`) to the address to swap your van's design.

### Added to test build 0.3: parts shops and repairs

Following GDD 8.3 to 8.5 and Spec 7.4 and 14.4 to 14.6. Shops open once the opening chain is done; talk to the shopkeeper or click their counter.

- **General bike shop:** top end, bottom end, intake and exhaust, drivetrain, forks, shock, and bodywork and controls. **Tyres and wheels:** wheels and tyres, and brakes. Both stock Grades 1 to 3 for 50cc and 65cc (Spec 14.5a). Grade 1 is always on the shelf; Grade 2 and 3 parts come and go, and each one sells out until the stock changes. Stock changes after 3 race days or 10 other activities (finished shift batches and practice sessions), Spec 14.6. Frames aren't sold: they come from your sponsor or the class dealer.
- **Prices** follow Spec 14.4: each grade costs 2× the one below. A Grade 1 top end is £35, tyres £25, forks £120. New parts are at 100% with no modifiers. The buy box shows how each bike stat would change.
- **Buy and fit** (the shop fits it free) or **buy as a spare**. A part you take off goes in your bag; a broken one goes straight to the dump. You can carry 20 spares.
- **Sell** spares at either shop: price × (20% + 40% × condition) × demand (0.9 to 1.1, new at each stock change), and half that at the shop that doesn't specialise in the part. Broken parts can't be sold.
- **The garage** (talk to the mechanic, or use the counter or the workbench): **repairs** bring a Grade 2 or higher part back to 100%, one grade down, for 70% of a new part at that grade (Spec 7.4). Grade 1 and broken parts can't be repaired, only replaced. **Fit a spare** from your bag on the bench for £5.
- **Bag:** spares show their grade and condition, with a Dump button.
- New content file `shops.json` (prices, shop stock, repair and resale numbers), checked at start-up. Saves stay at version 3; the stock state is added on your first shop visit.

### New in test build 0.3: XP, practice and the first race day

Checked against the rest of the "Starter career slice" checklist (Systems Specification section 22), apart from the Local Champion championship, which comes next:

- **Skills and XP.** All three lead skills and their 19 child skills (GDD 6.1) on the OSRS XP table, with the lead skills at 5× (Rider Ability, Mechanical Engineer) and 4× (Fitness). Rider Ability XP gives Mechanical Engineer a 5% cross-skill bonus, and so on round the triangle (GDD 6.2). A Skills tab shows every level and the progress to the next one, and results show level-ups.
- **The race simulation** (Spec 10). Each lap is worked out section by section from your skills and your bike's stats: start gates with a bonus curve, clean air and traffic after the first corner, noise that Consistency narrows, mistakes and rare crashes that damage the parts the section puts at risk, passing within a second of the rider ahead, and ruts that deepen moto by moto. The same engine runs live and auto-complete, and a test checks that a held message gives exactly the same result both ways.
- **Wear** by distance on every part (Spec 7.3): youth classes at ×0.8, faster wear below 20%, knock-on from worn and broken parts, and a small chance of a random breakage. A broken engine part ends your moto; 4 broken parts retire you.
- **Farmland MX race day.** Talk to the track official at the race office. The first race day is free, then entry is £20. 16 riders including the Local Champion, 2 motos of 5 laps. Pick your gate (moto 1 in random order, moto 2 in moto 1 finishing order), pick a starting message, then Race or Auto-complete (Bike check sits beside them). Leaving before moto 2 counts as a DNF.
- **The race screen.** The track with every rider on it (you are orange), the running order with gaps, your position, the gaps ahead and behind, your broken parts, and a feed of passes and mistakes. **Details** has two tabs: **Bike**, each part's condition, what its wear costs and LOW or BROKEN warnings, plus the bike's stats against new, updated each time you cross the line; and **Section times** for your last lap. Play it at 1×, 2× (the default), 4× or 8×, or pause.
- **Auto-complete** plays the same race out on screen at the speed you pick, with no pit board, holding your starting message; wear, laps and results are the same as a Race.
- **The pit board** comes out as you cross the finish line (your own crossing, not the leader's) when your message runs out: STEADY, PUSH or SAVE BIKE, 3 changes per moto, shown for 1, 2 or 3 laps or to the flag (keeping a message is free), plus "It's over, bike blown" to retire. While a message runs, the race carries on through the line without stopping. The board also shows your bike: each part's condition bar, its loss and LOW or BROKEN warnings, and your stats now against new. A change counts from the lap you are starting: the simulation runs that lap again for you, and riders who crossed the line before you ride it exactly as they already were, because each rider draws their own random numbers each lap.
- **The pen** in the race bar (and on the pit board) holds your message changes as ink: a marker with a clear barrel split into one section per change, emptying left to right as you use them. The number of sections comes from `ink` in `racing.json`, so the widget (`penMeter` in `src/ui/widgets.ts`) takes 4 or 5 without changes.
- **Start straights.** Every track starts from a gate on its own start straight, apart from the lap, that runs onto the circuit. Lap 1 is the start straight and then the lap from where it joins to the finish line; every later lap is the full loop.
- **Official results.** A rider's place is fixed the moment they cross the finish line on the last lap, and the running order shows their gap at the flag; riders still racing show live gaps.
- **Results.** Each moto shows positions, gaps, best laps, points, prize money (3× entry to the winner, paid to 10th) and XP. The day shows the overall order, the podium bonus, your money, XP by skill and what wore on your bike.
- **Backyard practice.** Click the dirt loop behind your rented room. Ride laps on your own until you stop: free, practice XP at a tenth of the race rate, and real wear. Farmland MX also has free practice for £5.
- **Testing only:** shift pay is tripled (`testPayMultiplier: 3` in `world.json`), so a fabrication bracket pays £2.25 and a piston £3.75. Set it back to 1 before Final v1.
- Saves are now version 3; a test build 0.2 save upgrades with every skill at level 1.
- New content files, all checked at start-up: `skills.json`, `racing.json` (every race rule and tuning number), `tracks.json` (track sections and venues) and `riders.json` (the CPU riders and the local field). `npx vite-node tools/sim/balance.ts 300 1` runs 300 race days and prints the spread of results, crashes, money, XP and wear, for tuning.

### New in test build 0.2: the starter career slice

Checked against the "Starter career slice" part of the Systems Specification checklist (section 22), up to the van:

- Character creation: pick a rider, type a rider name (it can't be changed later), and choose one of four starter 50cc bikes: Yamamoto, Kwakmoto, Sukimoto or Hondmoto. Each leans a different way with the same overall total.
- Money and a bike: you start with £150 and a second-hand bike whose Grade 1 parts are at 50–80% condition, with the top end at 0%. The Bike panel shows the six bike stats, every part's grade and condition, your bag and your current task. The task also shows on screen under your money.
- The opening chain, run by the garage mechanic. You get a used top end, pay £90 to fit it on the garage bench, and earn £120 for it. Then come errands to the bike shop, tyre shop and engine rebuilder, two customer bike services, and a visit to the van seller. It can't be skipped, and it pays out so you reach the van £80 short.
- Until the chain is done, roadworks block the west road and the NPCs outside it don't acknowledge you. When it ends, the roadworks are cleared away and a fresh tarmac patch is left behind.
- Repeatable shifts at the fabrication shop (20 brackets at 75p) and the engine rebuilder (16 pistons at £1.25). Each part is a pass through three stations: click the highlighted station, wait for it, and move on. You're paid per part, even if you stop early.
- The used van for £600. A final task loads your bike and spares from your rented room, which opens the venue route and the world map. You can drive to Farmland MX, Quarry MX and Woodland MX and look around. The local racer points you to Farmland MX.
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
| `src/core/` | Game rules with no graphics: pathfinding, saves, settings, content checks, doors and exits, money, bikes and the opening chain (`career.ts`), story changes to maps (`mapState.ts`), skills and XP (`skills.ts`), the race simulation (`race.ts`), race days, practice and venues (`raceDay.ts`), and shops, repairs and spares (`shops.ts`). Covered by tests. |
| `src/scenes/` | Phaser screens: boot, menus, settings, the world, the on-screen HUD, and the race and practice screen. |
| `src/world/` | Drawing maps, characters and the van (`VanView.ts`). |
| `public/data/` | Game content as JSON: NPCs, dialogue, bikes, items, the opening chain (`story.json`), the world map, locks and shift jobs (`world.json`), shops and repairs (`shops.json`), and the vans (`vehicles.json`). Every file is checked when the game starts. |
| `public/assets/` | Art and baked maps, written by the import tool. Don't edit by hand. |
| `tools/import-art.mjs` | Copies the art from the shared art folder and bakes each Tiled map into one game-ready file. |
| `tools/map-editor.html` | Standalone map and tile editor for the game maps and the Tiled sources. |
| `tools/track-editor.html` | Standalone editor for the race tracks in `public/data/tracks.json`. |
| `tests/` | Unit tests, plus checks that every door, exit and NPC on the real maps works. |

### Technology

TypeScript, [Phaser 3](https://phaser.io) and [Vite](https://vitejs.dev), with [Vitest](https://vitest.dev) for tests. Saves are JSON in the browser's storage; a desktop app wrapper (Tauri) with saves as files comes in a later build. None of the Adventure Land code is used.

### Updating the art

When the art threads change a map or sprite, run the import tool against the shared art folder and commit the result:

```
npm run import-art -- /path/to/art
npm test
```

To update only the van sheets (from `art/vehicles/sheets/map/`) without re-baking the maps: `npm run import-art -- --vehicles /path/to/art`.

### Editing maps

`tools/map-editor.html` is a map and tile editor for this game. It is one file with no build step: open it in Chrome or Edge (double-click it), click **Open folder…** and pick either:

- `public/assets` to edit the **game maps** exactly as the game loads them, or
- the shared `art` folder to edit the **Tiled source maps** (`.tmj`).

It paints tiles on every ground layer, edits collision, moves, copies, clears and swaps regions (buildings move with their doors), places and moves props, and checks that doors, spawns and exits sit on free tiles. In Chrome and Edge, Save writes straight back into the folder; other browsers download the file instead. An unchanged map saves back byte for byte.

`npm run import-art` rebuilds every game map from the Tiled sources, so edits made only to a game map are lost the next time the art is imported. For changes that should last, edit the `.tmj` map, then run the import. After saving, run `npm test`.

### Editing race tracks

`tools/track-editor.html` edits the race tracks in `public/data/tracks.json`, from the racing line to the ground and scenery round it. It is one file with no build step. Run `npm run dev`, open `http://localhost:5173/tools/track-editor.html` in Chrome or Edge, then click **Open folder…** and pick the repo, `public` or `public/data` (or load the tracks from the dev server, and saving downloads the file). You edit in the game's own race camera and 3D scene, the **race view** (below). Opened straight from disk, where the game can't run, the editor shows a plain 2D map instead, with a note saying how to get the race view.

The editor has five modes (keys 1 to 5):

- **Layout:** the drawing is the shape the race screen shows, as points on the 100 × 60 grid starting at the finish line. Drag points, double-click the track to add one, right-click or Del to remove one, and **Round corner** turns a sharp point into a curve. **Finish here**, **Reverse** and **Fit to grid** reshape the whole lap. **Sections** are what the race simulation rides, in order: type (from `racing.json`), length in metres, passing chance, and for the race view a preferred line through corners and a jump or hill height. Each section type has to suit the shape drawn under it (straight, sweeper, corner or hairpin, from the `shapes` list in `racing.json`): one that doesn't is edged in red and fails the checks, because riders would brake on a straight or take a U-turn flat out. **From drawing** replaces the sections with straights and corners that suit the drawing.
- **Start straight:** the blue points. The first is the start gate (drawn as a black bar with the yellow line-up behind it), and the white one is where the straight joins the lap; it stays on the lap when dragged. **+ Start straight** adds one beside the first part of the lap, and new tracks get one. It must be at least 12 grid units long, clear of the lap until it joins, join in the first half of the lap, and meet it at 75° or less.
- **Surface:** mud, sand, water and other patches along the lap, laid by clicking the track.
- **Ground:** paint the ground tiles round the track (grass, dirt, gravel, concrete, arena floor and so on) with a brush, Shift-drag for a rectangle, or **Fill under track**.
- **Height:** raise and lower the ground. Pick **Raise**, **Lower**, **Smooth** or **Flatten** (to the height you click), a radius (3 to 18 grid units) and a strength (0.25, 0.5 or 1 m a dab), then click or drag; right-click does the opposite of Raise or Lower. The brush is soft and round, so hills and dips run smoothly; each stroke is one undo. The map shows raised ground warm and lowered ground blue with a contour every metre, and the height under the pointer. **Flatten all** puts the ground back. The track follows the ground under its middle and stays level across its width, with the ground easing out to it either side; bikes ride it and riders slow up climbs and run quicker down drops. Heights are saved in `tracks.json` as `"elevation": {"step": 2, "points": [[x, y, metres], …]}` (only where not 0); a track without it is flat, as every track was before.
- **Scenery:** banners and sponsor boards with your own text, tuff blocks, hay bales, tyre walls, tape, start gates, grandstands, crowds, floodlights, pit tents, vans, trees and more. Drag to move, Q and E to rotate, Ctrl+D to copy, Del to remove.
- **Track details:** id, name, kind (stadium, outdoor or endurance), track width, size, surface, practice only, and the start gate curve. Renaming an id updates the venues that use it.
- **Checks** run the game's own rules for `tracks.json` and `trackParts.json`, the section shapes and the start straight included, and warn about race tracks without a gate curve and drawings that cross themselves. They run on load, on every change, on Save (the status line gives the count) and with the **Check** button. Scenery is checked by what of it stands at riding height, turned as placed (a tree's trunk, a floodlight's pole, a banner's thin line, a finish arch's two posts): on the racing surface is an **error** (outlined red), within half a bike's width of its edge or two solid items inside each other is a **warning** (dashed yellow). Click a scenery check to select that item. Ground steeper than 45° (a wall) or past 8 m up or down is an error; a track climbing or dropping more than 35% along its length is a warning. Checks never change the track.
- **Race view:** the editor's view is the game's race screen 3D scene and camera, showing the open track as a race draws it: hills, jumps, banking, ground tiles and scenery, with the lap map in its top-right corner. Every mode's tools work in it: click, drag and right-click on the 3D ground and the tool acts on that grid point, with the keys 1 to 5, Q, E, Del, Ctrl+Z, Ctrl+S and so on. Camera: mouse wheel or + and − zoom, W A S D or a middle-button drag (or Space and drag) pans, [ and ] turn the view 45° at a time, 0 resets it. The selection is orange, errors red, warnings dashed yellow, the brush white. In Layout the lap's points show as white rings and the start straight's as blue squares. Each section shows as a stripe down the middle of the track in its kind's colour (the Section colours legend), and a cream line edged dark crosses the track where one section ends and the next begins (the finish line has its own). The lines come from the section lengths, follow the bends, redraw on every edit and stay a readable width at any zoom. No race, riders or race AI run in the view, and the game itself never shows these markers. The view draws only when something changes, so a still view costs almost nothing.
- **Preview** rides a dot round the lap in the race view. **Race it in the game** opens a race day on the track in the game (`/?testtrack=<id>`, with `npm run dev` running and the track saved); with unsaved changes it asks first, because the game races the saved file.
- **Export / Import** save one track as a `.track.json` file and add one back, a first step towards player-made tracks.
- **Undo / Redo** with Ctrl+Z and Ctrl+Y.

The lists of track kinds, surfaces, ground tiles and scenery are in `public/data/trackParts.json`, with tile art from `public/assets/art/area-map/tiled/tiles`. Its `sectionEditor` switch shows the section editing tools while the game is in development; Final v1 turns it off (preview with `?final=1`), leaving the layout, surface, ground and scenery editing. The section data and the race simulation work the same either way.

A new track can be raced from the world once a venue in the `venues` list of `tracks.json` points at it. An unchanged file saves back byte for byte. After saving, run `npm test`.

### Races on screen

The race simulation (`src/core/race.ts`) decides every result. The rider AI (`src/core/riderAI.ts`) then acts the race out: each rider picks a line, brakes into corners and drives out, swings out to pass or tucks in behind, jumps, skims whoops, crashes and remounts, always reaching the end of each section when the simulation says. How each rider rides comes from their skills, their bike and their race message (`src/core/riderProfile.ts`), plus an optional `style` for CPU riders in `riders.json` (`line`, `aggression`, `jumps`). The race view (`src/world/RaceView.ts`) draws it all as an isometric 3D scene with [three.js](https://threejs.org), in the spirit of Super Off Road. The track is a solid surface (`src/core/trackSurface.ts`): jumps have take-off faces, tables and landings, whoops and braking bumps ripple, berms bank up, hills rise out of the ground, and a raised lip and earth bank mark both edges. Each bike's wheels are put on that same surface, so bikes pitch over jumps, lean into corners and land on the track. The camera follows your rider (the orange one with the arrow), or the leader once you are out, and a map in the corner shows the whole lap, the start straight and every rider. Tall scenery such as stands and trees fades when a rider is behind it.

The race opens on the start straight: the field lines up behind the gate on a concrete pad, wider than the track so a row of 8 fits, in two rows of 8 for a full field, and the straight narrows as it runs onto the lap, where the lap's lip and bank open up so the two surfaces merge.

The gate you pick is your slot: gates 1 to 8 are the front row from one end to the other, 9 to 16 the second row behind them, and riders arrive at the line-up in gate order. A gate past the field's size, or one already taken, is refused rather than swapped.

The start procedure is the same for a Race and for Auto-complete. When the race opens, 4 front-row riders are already in their slots (more for a bigger field) and the rest wait scattered just behind the pad. Over about 6 seconds they ride up to their own slots at different moments and speeds, several at once, easing onto their lane line, without touching. A second-row rider only sets off once the front-row rider in their own lane has stopped in their slot, so second-row riders in lanes that are already filled go early while other lanes are still filling. The line-up is drawn from a seed made of the track and the gate order, so each moto lines up differently but the same race always looks the same. An official (drawn at 90% of their first size, board included) waits beside the straight near the gate (A) from the moment the race screen opens, with the START 30 board low and its plain white back out. When everyone is still and the 5-second hold starts they raise it face out and walk up the straight to B, upright at 5 and 4, turned sideways at 3 and 2, and lower it white side out at 1, just before the gate drops; they stay at B with it lowered for the rest of the race. A, B and the whole walk are planned per track (`src/core/startOfficial.ts`) clear of the track, its lip and slope, and the scenery, with room for every turn of the board, and a track with nowhere clear fails the checks. There is no countdown on screen; the board and the riders show it. The procedure runs in real time at any playback speed, and Pause stops it. Practice has no line-up or board.

After the flag each finisher rides a slow cool-down lap down the nearer edge of the track, in single file behind the finisher ahead on that edge, giving way to riders still racing (before, every finisher stopped in one heap on the track about 40 m past the line at Farmland, where riders still racing rode through them).

Riders sit on the race-day bike model from the vehicles thread (Boss, 25 Oct 2026: "use the model from the coloured race day rides"): a youth bike for the 50 to 85 classes and an adult bike above, in the bike's brand colours, with the rider in their gear colours (`src/world/raceBike.ts`). It only changes how a rider looks. The tyres touch the ground exactly where the old bike's wheels did, so every rider takes the same line round every track as before.

Scenery may not stand on the racing surface, the start straight included; the game's checks and the track editor's **Checks** refuse it (see Editing race tracks).

### Checks

```
npm test          # unit tests and map checks
npm run build     # type check and production build into dist/
```
