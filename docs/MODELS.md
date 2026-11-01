# Your own 3D models: rules for each type

The race view draws every object from shapes in code. You can swap any of them, add new scenery, or replace the race bike and rider with your own models from Blender (Boss, 31 Oct 2026). The checks are in `src/core/modModels.ts`. A model that breaks a rule is skipped, and the game draws its own object instead: it never stops the game. The **Models** page lists each file in the folder with what it does or what is wrong with it.

## How it works

1. Open **Models** from the toolkit, or with the **Models…** button in the track editor. With `npm run dev` this is http://localhost:5173/?models.
2. Pick an object and click **Export**. You get a `.glb` file at the object's real size.
3. In Blender, use **File › Import › glTF 2.0**. Change the model, then use **File › Export › glTF 2.0** with **Format: glTF Binary (.glb)**.
4. Save the file into `public/mods/models/` and reload the game. The track editor's palette picks up new items when it loads from the dev server.

The file name decides what the model does:

| File name | What it does |
|---|---|
| the id of a scenery item, e.g. `hay_bale.glb` | replaces that item on every track |
| `race_bike.glb` | replaces the race bike for the 250F and up and the vets (the four-strokes), and for every class if there is no youth model |
| `race_bike_youth.glb` | replaces the race bike for 85cc and under, drawn at each class's size (50cc 1.88 m, 65cc 1.95 m, 85cc small wheel 2.03 m, big wheel 2.07 m long) with the rider scaled to match; and, scaled to `race_bike.glb`'s length, for the 125s (two-strokes like it) |
| `sidecar.glb` | every outfit in a sidecar race (Boss, 1 Nov 2026): the motorcycle with its chair on the left (+Y in Blender), the middle of the motorcycle's wheelbase at the origin; never a solo bike. Without it the game draws its own bike with a chair |
| `race_rider.glb` | replaces the rider on every race bike |
| `sidecar_crew.glb` | the rider and passenger on every sidecar (Boss, 1 Nov 2026): objects named **Rider** and **Passenger**, each with its origin at its hips, in the sidecar's frame, at most 8,000 triangles, lowest point 0 to 0.6 m up, rider material names for the team's gear. The game leans the passenger out over the chair in left-handers, across over the bike in right-handers, and tucks both down over the jumps; shape keys named **Left**, **Right** and **Jump** on a figure are blended in for those instead (export with Shape Keys on) |
| `stand_pallet.glb`, `stand_tower.glb`, `stand_bales.glb`, `pit_wall.glb` | the stands for one design each (Boss, 1 Nov 2026): the marshal's and flag man's **pallet stand**, **roofed tower** and **hay bales**, and the pit crew's **pit wall**. Origin where the figure stands, on the ground, front facing the track (−Y). Keep the game's sizes: a pallet stand's or tower's deck top 1.0 m up (the figure stands there), the tower's roof edge 3.3 m up so the raised flag stays under it, the bales in front 0.85 m out, the pit wall 0.75 m out with its top about 0.9 to 1.0 m up (the board's pole rests on it). At most 8,000 triangles, 5 m long and 6 m tall. Materials named **Team** and **TeamDark** take the item's colour and a darker shade of it. A marshal, flag man or pit crew model with its own **Base** keeps that instead |
| any other name, e.g. `round_bale.glb` | a new scenery item called "Round bale" in the track editor's Scenery palette |

## Rules for every model

- **File name:** lower-case letters, digits, `-` and `_`, ending `.glb`. No spaces or capitals. At most 48 characters before `.glb`.
- **File size:** at most 8 MB.
- **Format:** glTF Binary (`.glb`) only. Not `.gltf`, `.blend`, `.fbx` or `.obj`.
- **Units:** metres, so 1 Blender unit is 1 m. The race view scales it for you.
- **Ground:** the lowest point sits on the ground at Blender Z = 0, give or take 5 cm. The rider is the one exception (see below).
- **Facing:** the front faces Blender **−Y** (what you see in Front view, numpad 1). Items such as stands and banners face the track. Bikes point along **+X**.
- **Origin:** the middle of the footprint, at ground level. The item is placed and turned around it.
- **Colours:** materials keep their Base Color and Image Texture. Use simple materials (Principled BSDF). Node effects, lights and cameras are dropped. Animation plays only on scenery (see below).
- **Pivot:** use Apply › All Transforms before you export. The game reads the node transforms either way, but this keeps Blender and the game agreeing.

## Rules for each type

| Type | Triangles | Size limits | Ground | Notes |
|---|---|---|---|---|
| **Scenery, replacing an item** (`tree.glb`, `van.glb`, `bike_stand.glb`…) | 20,000 | longest side 30 m, height 16 m | on the ground | Drawn at its own size when the item is at its default size. When an item is placed longer or deeper (a long tyre wall or line of tape), the model stretches with it, and its height grows only with the smaller stretch. Start from the exported file so it matches the default footprint. |
| **Scenery, new item** (`round_bale.glb`) | 20,000 | longest side 30 m, height 16 m | on the ground | Its footprint in the editor is the model's length (X) by depth (Y), drawn in grey on the 2D map. Resizing it in the editor stretches it the same way. |
| **Scenery bikes** (`bike_stand`, `bike_trailer`, paddock vans and haulers) | 20,000 | as scenery | on the ground | These are plain scenery: one model, one look. They aren't recoloured by brand or rider. |
| **Race bike** (`race_bike.glb`, `race_bike_youth.glb`, `sidecar.glb`) | 6,000 | 1.4 m to 2.6 m long along X, at most 1.6 m tall | wheels on the ground | Points along +X, with the middle of the wheelbase at the origin. Every bike in the race uses it, so keep it light. Name materials **Plastics**, **Frame** and **Plate** to get each rider's brand colours. Other materials keep their own colour. |
| **Race rider** (`race_rider.glb`) | 6,000 | at most 2.4 m long, 2 m tall | boots 0 to 0.6 m up, on the pegs | Sits on the bike in the same space as the exported `race_bike.glb`. Export both and model the rider on the bike. Name materials **Helmet**, **Visor**, **Jersey**, **Pants**, **Boots** and **Gloves** to get each rider's gear colours. The rider leans and moves as one piece. There are no moving arms or legs. |
| **Moving figures** (`marshal`, `flagger`, `pit_crew`, `cheer`, `start_official`) | 8,000 | longest side 8 m, height 8 m | on the ground | Swapped part by part (see *Moving figures* below). A file with none of the figure's part names is listed as not used. |
| **Locked items** | — | — | — | `start_gate`, `finish_arch` and `sprint_start` stretch to fit the track's width, so they can't be replaced. |

Material names ignore case and Blender's `.001` endings, so `plastics.001` counts as Plastics.

## Moving figures (Boss, 31 Oct 2026)

The marshals, flag man, pit crews, fans and start official move with the race. The game turns each of their parts at a joint: a marshal's flag arm goes up when a rider is down, and fans clap and wave as bikes pass. Your model gives each part its look, and the game still moves it.

- Name each part's object in Blender exactly as below. Case and `.001` endings don't matter.
- Put each part's **origin on its joint**: a shoulder for an arm, a hip for a leg, the feet for the body. Use Object › Set Origin › Origin to 3D Cursor. The game turns the part about that point.
- Build it in its **rest pose**. Arms and legs hang down, except a start official's arms, which point straight up holding the board high. The game turns them from there.
- A part you leave out keeps the game's own. Objects with other names are left out.
- The pit board and the start board stay the game's, because the game paints and moves them.
- On a `cheer` model, name materials **Top**, **TopTrim** (a darker shade of the top), **Trousers** and **Skin** so each fan keeps their own colours. Any other material, such as a cap or shoes, is the same on every fan.
- On a `pit_crew` model, name materials **Team** (the shirt and cap) and **TeamTrim** (a darker shade) so each crew wears the team colour of the rider they board that race (their bike's colour). Arms must hang straight down with no turn on the object (the game adds its own lean), and the pole should end about 1.5 m below and 6 cm in front of the Arms origin, where the game hangs its board.
- Start from the figure exported on the Models page. It has every part named, in its rest pose.

| Figure | Parts |
|---|---|
| `marshal` | **Body**, **Arm** (the flag arm, with its flag), **Base** (the stand, if any). For a better wave, also **Forearm** (origin at the elbow, with the hand and pole; Arm is then the upper arm only) and **Flag** (the cloth alone, origin on the pole, with the pole upright in the rest pose). With no Base the marshal stands on the game's stand at its height. Optionally **Mate**, the second marshal with the extinguisher on the pair design (still, origin at the feet), shown only there in place of the game's own. |
| `flagger` | **Body**, **WhiteArm**, **ChequeredArm** (each arm with its flag), **Base** (the stand or tower). For a better wave, also **WhiteForearm**, **WhiteFlag**, **ChequeredForearm** and **ChequeredFlag**, built like the marshal's Forearm and Flag. With no Base he stands on the game's stand at its height. Optionally **Mate**, as on the marshal. |
| `pit_crew` | **Body**, **Arms** (both arms and the pole, as one), **Base**. Optionally **Mate**, the mechanic standing beside him (still, origin at the feet), shown only on the pair design in place of the game's own; their Team materials take the team colour too. Behind a pit wall the game rests the pole out on the wall. |
| `cheer` | **Body** (with the head), **LegL**, **LegR**, **ArmL**, **ArmR** |
| `start_official` | **Body** (with the head), **LegL**, **LegR**, **ArmL**, **ArmR** |

Left and right are the figure's own. It faces −Y, so its left is +X.

## Scenery that moves on its own

A scenery model, either a replacement or a new item, can carry its own animation, such as a flag flapping, a crowd bobbing or a crane swinging. Make it with keyframes or bones in Blender, and export with **Animation** turned on. The game plays every animation in the file on a loop, and each copy starts at its own point so a row of them never moves as one. Animations on the race bike, the rider and the moving figures are ignored.

## Tips

- **Triangles:** check the count in Blender with Overlays › Statistics. Use a **Decimate** modifier to cut it down. A field has 16 bikes and riders, so every bike triangle counts 16 times over.
- **Grey model in Blender:** an exported game object keeps its colours in its materials. If it looks grey, switch the viewport to Material Preview (Z › Material Preview).
- **Textures:** keep images to 1024 × 1024 or smaller and pack them into the `.glb`. The export does this by default.
- **Seeing it:** the Models page shows each file in your folder turning on a 1 m grid, with its size and triangle count. A rejected file shows the reason in red.
- **Sharing:** mod tracks that use a new model item only work where the same `.glb` is in `public/mods/models/`.
- **Folder mode:** the track editor opened from disk (Open folder…) can't measure models, so it doesn't list new model items. Run it through `npm run dev` or Toolkit.cmd.
