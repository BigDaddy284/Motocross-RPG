Your own 3D models
==================

Put .glb files here (Blender: File > Export > glTF 2.0, Format: glTF Binary) and reload the game.

  <scenery id>.glb      replaces that scenery item, e.g. hay_bale.glb or tree.glb
  race_bike.glb         replaces the race bike for 250F and up (race_bike_youth.glb for 50cc to 125cc; the 125s scale it up to race bike size)
  race_rider.glb        replaces the rider on every race bike
  any other name        a new scenery item in the track editor, e.g. round_bale.glb
  marshal.glb, flagger.glb, pit_crew.glb, cheer.glb, start_official.glb
                        a moving figure: objects named for its parts (Body, Arm, LegL...)
                        swap in, origins on their joints, and the game still moves them

Scenery models can carry their own animation (exported with Animation on): it plays on a loop.

Models are in metres, standing on the ground (Blender Z = 0), front facing -Y, bikes along +X.
The Models page (the toolkit's Models card, or the game with ?models) exports the game's own
objects to start from, and lists every file here with what it does or why it isn't used.
The full rules for each type are in docs/MODELS.md.
