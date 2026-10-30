# Change log: before Alpha v1.1

What each earlier build added, moved here from the README. Alpha v1.1 is described in the [README](../README.md).

## Alpha v1: three race venues

- **Riverside Arena and Longmoor Enduro are open.** The two tracks that were editor test tracks are now race venues in the game, on the maps that were Quarry MX and Woodland MX (the map and venue ids stay `area1-venue-quarry` / `venue-quarry` and `area1-venue-woodland` / `venue-woodland`, so saves carry over). Each has its own track official by the race office (`npc.track_official_quarry`, `npc.track_official_woodland`), the same 16-rider field, and the same prices as Farmland MX: £20 entry, practice at 25% of entry, and the first race day of a career free.
- **The start official** stands on the start straight at all three tracks and walks off it before the drop, placed in each track's data (a `start_official` scenery item with its route).
- **A natural line-up.** CPU riders pick gates they like (most want the inside, but each has a favourite spot), and riders roll up to the gate in pick order, front row first, so the start fills unevenly.
- **Mod Track: race player-made tracks.** "Mod Track" is on the venue road and every venue lane (the route marshal lists it too, and it needs the van like the venues). Picking it opens a list of mod tracks by name, with the file name under each; picking one goes straight to a race day and its gate pick, with no area to walk round. A mod race day is the same as Farmland MX: £20 entry (no free first race), the 16-rider local 50cc field, 2 motos, prize money, XP and parts wear. Race day only, no practice.
  - **Installing:** put the `.track.json` files the track editor's **Export** button makes in `public/mods/tracks/` (`mods/tracks/` beside the built game). The build (and `npm run dev`, on every load) writes an `index.json` of that folder for the game to read. `farmland-example.track.json` is there as an example.
  - **Importing:** "Import track file" in the list loads a `.track.json` from your device and keeps it in that browser; an imported track can be removed again from its race office.
  - **Checks:** every mod track gets the game's own track checks (schema, sections, start straight, the start official's spot and walk, and only the game's own surfaces, ground and scenery). One that fails stays in the list and says why when picked; a failed import isn't kept. Mod tracks use the game's own art for now. See `src/core/modTracks.ts`.
- **Shift pay is 5× while testing** (10× before Alpha v1.1) (`testPayMultiplier` in `public/data/world.json`; review before Final v1).

## Added to test build 0.3: your van on the map

Following Boss's brief "Seven Vans, Vehicle Gameplay Integration and Bike Model Updates" (24 Oct 2026). Art and the full audit are in the shared art folder under `art/vehicles/`.

- **The van you buy is on the map.** The £600 used van from the opening chain is the Old Rusty Truck Short, parked in the car park behind the van seller's office. You own one van at a time; a new one will always be a part exchange, so the save keeps one van and one parked spot.
- **Get in:** click the van, or face it and press E or Space, then pick **Drive**. **Open the back** opens the rear and shows your bag; **Not now** leaves it.
- **Drive** with WASD or the arrow keys: ahead drives on, a side turns at the next gap, and back turns round across the road (or reverses where there is no room). Or click or tap the road and the van drives there, round corners and through junctions; a long van that can't turn round in the road backs into a side road and pulls out the other way, like a three-point turn.
- **Smooth driving** (Boss, 25 Oct 2026: "driving needs more fluid movement"): the van speeds up, holds cruising speed while a key is held, slows for corners and brakes to a stop exactly on a tile. It turns through 32 angles, the back following the cab round the corner like a lorry's, so a long van swings wide instead of spinning on the spot, and a turn is only made if no part of the van passes over a building, wall or person. Vans stay on roads, pavements, car parks, gravel and concrete, never grass, buildings or doors. **Get out** with E, Space, the **Get out** button or a click on the van: you step out on the driver's side, and the van stays exactly where it is.
- **Collision:** a van is a solid footprint one tile wide and as long as the real vehicle (2 to 9 tiles). It can't drive into NPCs, though on foot you still walk through them, and you can't walk through a parked van.
- **Map changes:** drive through an exit (Home Town to the Industrial Zone and back) or onto the venue route, and the van comes with you, parked at the arrival point facing into the map. Walk out instead and it stays where you left it; nothing brings it to you. It is saved with its map, tile and facing, so it is still there after a reload. Saves go to version 4; an older save with a bought van gets it at the starter spot.
- **Seven designs** (`public/data/vehicles.json`), drawn from Boss's reference photos and named after them: Old Rusty Truck Short, Old Rusty Van, MX Van Short, MX Van Medium, MX Sports Motorhome Medium, MX Sports Motorhome Long and Factory Hauler. For playtesting, add `?van=van-7` (any of `van-1` to `van-7`) to the address to swap your van's design.

## Added to test build 0.3: parts shops and repairs

Following GDD 8.3 to 8.5 and Spec 7.4 and 14.4 to 14.6. Shops open once the opening chain is done; talk to the shopkeeper or click their counter.

- **Moto78 (the general bike shop, Bill Rothon's; Boss, 29 Oct 2026):** top end, bottom end, intake and exhaust, drivetrain, forks, shock, and bodywork and controls. **Tyres and wheels:** wheels and tyres, and brakes. Both stock Grades 1 to 3 for 50cc and 65cc (Spec 14.5a). Grade 1 is always on the shelf; Grade 2 and 3 parts come and go, and each one sells out until the stock changes. Stock changes after 3 race days or 10 other activities (finished shift batches and practice sessions), Spec 14.6. Frames aren't sold: they come from your sponsor or the class dealer.
- **Prices** follow Spec 14.4: each grade costs 2× the one below. A Grade 1 top end is £35, tyres £25, forks £120. New parts are at 100% with no modifiers. The buy box shows how each bike stat would change.
- **Buy and fit** (the shop fits it free) or **buy as a spare**. A part you take off goes in your bag; a broken one goes straight to the dump. You can carry 20 spares.
- **Sell** spares at either shop: price × (20% + 40% × condition) × demand (0.9 to 1.1, new at each stock change), and half that at the shop that doesn't specialise in the part. Broken parts can't be sold.
- **The garage** (talk to the mechanic, or use the counter or the workbench): **repairs** bring a Grade 2 or higher part back to 100%, one grade down, for 70% of a new part at that grade (Spec 7.4). Grade 1 and broken parts can't be repaired, only replaced. **Fit a spare** from your bag on the bench for £5.
- **Bag:** spares show their grade and condition, with a Dump button.
- New content file `shops.json` (prices, shop stock, repair and resale numbers), checked at start-up. Saves stay at version 3; the stock state is added on your first shop visit.

## New in test build 0.3: XP, practice and the first race day

Checked against the rest of the "Starter career slice" checklist (Systems Specification section 22), apart from the Local Champion championship, which comes next:

- **Skills and XP.** All three lead skills and their 19 child skills (GDD 6.1) on the OSRS XP table, with the lead skills at 5× (Rider Ability, Mechanical Engineer) and 4× (Fitness). Rider Ability XP gives Mechanical Engineer a 5% cross-skill bonus, and so on round the triangle (GDD 6.2). A Skills tab shows every level and the progress to the next one, and results show level-ups.
- **The race simulation** (Spec 10). Each lap is worked out section by section from your skills and your bike's stats: start gates with a bonus curve, clean air and traffic after the first corner, noise that Consistency narrows, mistakes and rare crashes that damage the parts the section puts at risk, passing within a second of the rider ahead, and ruts that deepen moto by moto. The same engine runs live and auto-complete, and a test checks that a held message gives exactly the same result both ways.
- **Wear** by distance on every part (Spec 7.3): youth classes at ×0.8, faster wear below 20%, knock-on from worn and broken parts, and a small chance of a random breakage. A broken engine part ends your moto; 4 broken parts retire you.
- **Farmland MX race day.** Talk to Joseph Halden, the track owner, at the race office. The first time, he introduces himself. The first race day is free, then entry is £20. 16 riders including the Local Champion, 2 motos of 5 laps (Longmoor's endurance races are 8 laps, and so is each moto of a championship round at Farmland or Longmoor). Laps by track kind are `kindLaps` in `racing.json`. Pick your gate (moto 1 in random order, moto 2 in moto 1 finishing order), pick a starting message, then Race or Auto-complete (Bike check sits beside them). Leaving before moto 2 counts as a DNF.
- **The race screen.** The track with every rider on it (you are orange), the running order with gaps, your position, the gaps ahead and behind, your broken parts, and a feed of passes and mistakes. **Details** has two tabs: **Bike**, each part's condition, what its wear costs and LOW or BROKEN warnings, plus the bike's stats against new, updated each time you cross the line; and **Section times** for your last lap. Play it at 1×, 2× (the default), 4× or 8×, or pause.
- **Auto-complete** plays the same race out on screen at the speed you pick, with no pit board, holding your starting message; wear, laps and results are the same as a Race.
- **The pit board** comes out as you cross the finish line (your own crossing, not the leader's) when your message runs out: STEADY, PUSH or SAVE BIKE, 3 changes per moto, shown for 1, 2 or 3 laps or to the flag (keeping a message is free), plus "It's over, bike blown" to retire. While a message runs, the race carries on through the line without stopping. The board also shows your bike: each part's condition bar, its loss and LOW or BROKEN warnings, and your stats now against new. A change counts from the lap you are starting: the simulation runs that lap again for you, and riders who crossed the line before you ride it exactly as they already were, because each rider draws their own random numbers each lap.
- **The pen** in the race bar (and on the pit board) holds your message changes as ink: a marker with a clear barrel split into one section per change, emptying left to right as you use them. The number of sections comes from `ink` in `racing.json`, so the widget (`penMeter` in `src/ui/widgets.ts`) takes 4 or 5 without changes.
- **Start straights.** Every track starts from a gate on its own start straight, apart from the lap, that runs onto the circuit. Lap 1 is the start straight and then the lap from where it joins to the finish line; every later lap is the full loop.
- **Official results.** A rider's place is fixed the moment they cross the finish line on the last lap, and the running order shows their gap at the flag; riders still racing show live gaps.
- **Results.** Each moto shows positions, gaps, best laps, points, prize money (3× entry to the winner, paid to 10th) and XP. The day shows the overall order, the podium bonus, your money, XP by skill and what wore on your bike.
- **Backyard practice.** Click the dirt loop behind your rented room. Ride laps on your own until you stop: free, practice XP at a tenth of the race rate, and real wear. Farmland MX also has free practice for £5.
- **Testing only:** shift pay is boosted (`testPayMultiplier` in `world.json`, 5× for Alpha v1.1). Set it back to 1 before Final v1.
- Saves are now version 3; a test build 0.2 save upgrades with every skill at level 1.
- New content files, all checked at start-up: `skills.json`, `racing.json` (every race rule and tuning number), `tracks.json` (track sections and venues) and `riders.json` (the CPU riders and the local field). `npx vite-node tools/sim/balance.ts 300 1` runs 300 race days and prints the spread of results, crashes, money, XP and wear, for tuning.
- Which areas each CPU rider races in is their `areas` list in `riders.json`: a field (such as `area1.local`) names its area, and its pool is every rider with that area. Neal Gizard, the pro, races only in Area 8.

## New in test build 0.2: the starter career slice

Checked against the "Starter career slice" part of the Systems Specification checklist (section 22), up to the van:

- Character creation: pick a rider, type a rider name (it can't be changed later), and choose one of four starter 50cc bikes: Yamamoto, Kwakmoto, Sukimoto or Hondmoto. Each leans a different way with the same overall total.
- Money and a bike: you start with £150 and a second-hand bike whose Grade 1 parts are at 50–80% condition, with the top end at 0%. The Bike panel shows the six bike stats, every part's grade and condition, your bag and your current task. The task also shows on screen under your money.
- The opening chain, run by Paul Phoenix, the mechanic at Phoenix MX (the garage on the high street). You get a used top end, pay £90 to fit it on the garage bench, and earn £120 for it. Then come errands to the bike shop, tyre shop and engine rebuilder, two customer bike services, and a visit to the van seller. It can't be skipped, and it pays out so you reach the van £80 short.
- Until the chain is done, roadworks block the west road and the NPCs outside it don't acknowledge you. When it ends, the roadworks are cleared away and a fresh tarmac patch is left behind.
- Repeatable shifts at the fabrication shop (20 brackets at 75p) and the engine rebuilder (16 pistons at £1.25). Each part is a pass through three stations: click the highlighted station, wait for it, and move on. You're paid per part, even if you stop early.
- The used van for £600. A final task loads your bike and spares from your rented room, which opens the venue route and the world map. You can drive to Farmland MX, Quarry MX and Woodland MX and look around. The local racer points you to Farmland MX.
- Saves are now version 2. A test build 0.1 save upgrades on load and starts the opening chain with a Hondmoto. Autosave also runs after every task step and every finished batch.
- New content files, all checked at start-up: `bikes.json` (stats, part slots, brands), `items.json`, `story.json` (the opening chain, step by step) and `world.json` (locks, world map, shift jobs).

## From test build 0.1

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
