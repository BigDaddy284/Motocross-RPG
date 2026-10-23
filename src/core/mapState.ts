import type { Grid } from './grid';
import { objectTiles, type BakedMap, type MapSprite } from './mapTypes';

// Story changes to a map that the save decides, such as roadworks cleared at the end of the
// opening chain. A blocker object names the flag that clears it (cleared_by); once set, its tiles
// open, the barriers, cones and signs standing on or next to it are no longer drawn, and its
// cleared tile (cleared_img, such as a fresh tarmac patch) covers the dug-up ground detail.

export function clearedBlockers(map: BakedMap, flags: Record<string, boolean>) {
  return map.objects.filter((o) => o.type === 'blocker' && typeof o.props.cleared_by === 'string' && flags[o.props.cleared_by]);
}

/** Opens the tiles under cleared blockers and under the props cleared with them. */
export function applyMapState(map: BakedMap, grid: Grid, flags: Record<string, boolean>): void {
  for (const b of clearedBlockers(map, flags)) for (const t of objectTiles(b, map.tileSize)) grid.unblock(t.x, t.y);
  for (const s of hiddenSprites(map, flags)) grid.unblock(...spriteTile(s, map.tileSize));
}

/** The tile a prop stands on: the middle of its bottom row. */
function spriteTile(s: MapSprite, ts: number): [number, number] {
  return [Math.floor((s.x + s.w / 2) / ts), Math.floor((s.y + s.h - 1) / ts)];
}

/** Sprites that stand on a cleared blocker or the ring of tiles around it, judged by their bottom row. */
export function hiddenSprites(map: BakedMap, flags: Record<string, boolean>): Set<MapSprite> {
  const out = new Set<MapSprite>();
  const ts = map.tileSize;
  for (const b of clearedBlockers(map, flags)) {
    const x0 = Math.floor(b.x / ts) - 1;
    const y0 = Math.floor(b.y / ts) - 1;
    const x1 = Math.floor(b.x / ts) + Math.round(b.w / ts);
    const y1 = Math.floor(b.y / ts) + Math.round(b.h / ts);
    for (const s of map.sprites) {
      const [tx, ty] = spriteTile(s, ts);
      if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1 && s.w <= 2 * ts) out.add(s);
    }
  }
  return out;
}

/** Where to draw cleared tiles: every blocker tile that has ground detail (above the base layer) under it. */
export function clearedPatches(map: BakedMap, flags: Record<string, boolean>): { img: number; x: number; y: number }[] {
  const out = [];
  for (const b of clearedBlockers(map, flags)) {
    const img = b.props.cleared_img;
    if (typeof img !== 'number') continue;
    for (const t of objectTiles(b, map.tileSize)) {
      if (map.ground.slice(1).some((l) => l.cells[t.y * map.width + t.x] >= 0)) out.push({ img, x: t.x, y: t.y });
    }
  }
  return out;
}
