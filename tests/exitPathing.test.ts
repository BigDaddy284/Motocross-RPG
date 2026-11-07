import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import type { BakedMap, Tile } from '../src/core/mapTypes';
import { objectTiles } from '../src/core/mapTypes';
import { findPathToAny, findPathTowards } from '../src/core/pathfinding';
import { stepTriggerAt, triggerTilesToAvoid } from '../src/core/travel';

const load = (id: string): BakedMap => JSON.parse(fs.readFileSync(`public/assets/maps/${id}.json`, 'utf8'));

/** The walk WorldScene.clickAt plans: to the nearest tile of a clicked way out, keeping off other doors and exits. */
function walk(map: BakedMap, from: Tile, click: Tile): Tile[] {
  const grid = Grid.fromMap(map);
  const via = stepTriggerAt(map, click);
  const ways = via ? objectTiles(via, map.tileSize) : [click];
  const plan = () => (via && findPathToAny(grid, from, ways)) || findPathTowards(grid, from, click);
  const kept = grid.avoiding(triggerTilesToAvoid(map, [...ways, from]), plan);
  return kept.length ? kept : plan();
}

/** Steps taken until the walk first lands on the exit (where the player leaves). */
function stepsToLeave(map: BakedMap, path: Tile[], exitName: string): number {
  return path.findIndex((t) => stepTriggerAt(map, t)?.name === exitName) + 1;
}

// Boss, 7 Nov 2026: clicking the way out to the Industrial Zone walked the rider up onto the pavement,
// along it and back down, because every tile of the two-tile exit but the one clicked was kept off.
describe('walking to a way out', () => {
  const cases: [string, string][] = [
    ['area1-home-town', 'To the Industrial Zone'],
    ['area1-industrial-zone', 'To Home Town'],
  ];
  for (const [id, name] of cases) {
    it(`${id}: a click on any tile of "${name}" walks straight on and leaves at its nearest tile`, () => {
      const map = load(id);
      const exit = map.objects.find((o) => o.name === name)!;
      const tiles = objectTiles(exit, map.tileSize);
      const grid = Grid.fromMap(map);
      // Every free tile three columns in from the exit, in line with it: the road the rider walks along.
      const inward = tiles[0].x === 0 ? 3 : -3;
      const edgeX = tiles[0].x === 0 ? Math.min(...tiles.map((t) => t.x)) : Math.max(...tiles.map((t) => t.x));
      for (const row of new Set(tiles.map((t) => t.y))) {
        const from = { x: edgeX + inward, y: row };
        if (!grid.isFree(from.x, from.y)) continue;
        const nearest = Math.min(...tiles.filter((t) => grid.isFree(t.x, t.y)).map((t) => Math.abs(t.x - from.x) + Math.abs(t.y - from.y)));
        for (const click of tiles) {
          const path = walk(map, from, click);
          expect(stepsToLeave(map, path, name)).toBe(nearest);
          // A walk re-planned to the clicked tile itself (something stepped in the way) takes no detour either.
          const kept = grid.avoiding(triggerTilesToAvoid(map, [click, from]), () => findPathTowards(grid, from, click));
          expect(kept).toHaveLength(Math.abs(click.x - from.x) + Math.abs(click.y - from.y));
        }
      }
    });
  }

  it('still keeps off a door that is not the one aimed for', () => {
    const map: BakedMap = {
      ...load('area1-home-town'),
      objects: [
        { type: 'door', name: 'Shop', x: 2 * 64, y: 0, w: 64, h: 64, props: {} },
        { type: 'exit', name: 'Out', x: 4 * 64, y: 0, w: 128, h: 128, props: {} },
      ],
    } as BakedMap;
    const avoid = triggerTilesToAvoid(map, [{ x: 5, y: 1 }]);
    expect(avoid).toEqual([{ x: 2, y: 0 }]);
  });
});
