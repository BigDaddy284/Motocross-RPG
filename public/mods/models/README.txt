Your own 3D models
==================

Put .glb files here (Blender: File > Export > glTF 2.0, Format: glTF Binary) and reload the game.

  <scenery id>.glb      replaces that scenery item, e.g. hay_bale.glb or tree.glb
  race_bike.glb         replaces the race bike (race_bike_youth.glb for 85cc and under)
  race_rider.glb        replaces the rider on every race bike
  sidecar.glb           every outfit in a sidecar race (chair on the left, +Y in Blender)
  sidecar_crew.glb      the sidecar's rider and passenger: objects Rider and Passenger, origins at the hips
  stand_pallet.glb      the marshal's and flag man's pallet stand (deck top 1.0 m); also stand_tower.glb
                        (roofed tower, roof edge 3.3 m), stand_bales.glb (hay bales) and pit_wall.glb
                        (pit crew); materials Team and TeamDark take the item's colour
  paddock_stand.glb     the stand under a bike on a stand: the game sets race_bike.glb on it
                        (the youth bike for small designs) where an empty named Bike is
  any other name        a new scenery item in the track editor, e.g. round_bale.glb
  marshal.glb, flagger.glb, pit_crew.glb, cheer.glb, start_official.glb
                        a moving figure: objects named for its parts (Body, Arm, LegL...)
                        swap in, origins on their joints, and the game still moves them

Scenery models can carry their own animation (exported with Animation on): it plays on a loop.

Models are in metres, standing on the ground (Blender Z = 0), front facing -Y, bikes along +X.
The Models page (the toolkit's Models card, or the game with ?models) exports the game's own
objects to start from, and lists every file here with what it does or why it isn't used.
The full rules for each type are in docs/MODELS.md.
