import type { BakedMap } from '../core/mapTypes';

// Where a standing character's feet go on a pavement tile (NPCs, and the player as they walk). A character's feet are drawn at the bottom
// of its tile, but on Home Town's one-tile pavements the paving is a band across the middle of
// the tile, with the kerb and road (or a grass verge) below it, so an NPC standing there looked
// as if they were in the road. These lifts, in pixels, put the feet a few pixels inside the
// bottom of the paved band. Measured from the tiles' art (the paved colour down the middle column):
// a tile paved to its bottom edge needs none.
const STAND_LIFT: Record<string, number> = {
  'street-00001000': 32, // pavement above the road (paved rows 10 to 35)
  'street-00001010': 32,
  'street-00101000': 32,
  'street-00000001': 24, // paved rows 2 to 43
  'street-01000000': 24,
  'street-10000000': 14, // pavement below the road, grass verge under it (paved rows 28 to 53)
};

/** How far up from its tile's bottom edge a character standing on this tile is drawn. */
export function standLift(map: BakedMap, x: number, y: number): number {
  let lift = 0;
  for (const layer of map.ground) {
    const img = map.images[layer.cells[y * map.width + x]];
    if (!img) continue;
    lift = Math.max(lift, STAND_LIFT[img.slice(img.lastIndexOf('/') + 1).replace(/\.png$/, '')] ?? 0);
  }
  return lift;
}
