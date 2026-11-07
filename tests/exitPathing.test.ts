import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import type { BakedMap, Tile } from '../src/core/mapTypes';
import { objectTiles } from '../src/core/mapTypes';
import { findPathToAny, findPathTowards } from '../src/core/pathfinding';
import { edgeClickWayOut, stepTriggerAt, triggerTilesToAvoid, wayOutTiles } from '../src/core/travel';
import { DriveMap, driveLeavesBy, footprint, planDrive, type VanPose, type VehiclesData } from '../src/core/vehicles';
import type { MapObject } from '../src/core/mapTypes';

const load = (id: string): BakedMap => JSON.parse(fs.readFileSync(`public/assets/maps/${id}.json`, 'utf8'));

/** The walk WorldScene.clickAt plans: to the nearest tile of a clicked way out, keeping off other doors and exits. */
function walk(map: BakedMap, from: Tile, click: Tile): Tile[] {
  const grid = Grid.fromMap(map);
  const via = stepTriggerAt(map, click);
  const ways = via ? wayOutTiles(map, via) : [click];
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

// Boss, 7 Nov 2026: the walking fix above must not bring back the 4 Nov bug, where a van turning round
// over a road out on the way somewhere else drove off through it. These drives, found by searching
// every pose near the Area 1 exits, each swing the van's footprint onto an exit it wasn't sent to.
describe('a van turning round over a way out', () => {
  const rules: VehiclesData = JSON.parse(fs.readFileSync('public/data/vehicles.json', 'utf8'));
  const designLength = (id: string) => rules.designs.find((d) => d.id === id)!.length;
  /** The exits a drive's moves land on, as WorldScene.checkVanTrigger sees them: newly covered tiles only. */
  function exitsCrossed(map: BakedMap, start: VanPose, len: number, plan: { to: VanPose }[]): MapObject[] {
    const out: MapObject[] = [];
    let before = footprint(start, len);
    for (const m of plan) {
      const now = footprint(m.to, len);
      for (const t of now.filter((t) => !before.some((b) => b.x === t.x && b.y === t.y))) {
        const via = stepTriggerAt(map, t);
        if (via?.type === 'exit' && !out.includes(via)) out.push(via);
      }
      before = now;
    }
    return out;
  }
  const cases: { map: string; design: string; start: VanPose; click: Tile; exit: string }[] = [
    { map: 'area1-home-town', design: 'motor-2', start: { x: 44, y: 11, heading: 'north' }, click: { x: 38, y: 14 }, exit: 'To the Industrial Zone' },
    { map: 'area1-home-town', design: 'motor-4', start: { x: 44, y: 11, heading: 'north' }, click: { x: 38, y: 17 }, exit: 'To the Industrial Zone' },
    { map: 'area1-home-town', design: 'motor-4', start: { x: 44, y: 12, heading: 'north' }, click: { x: 32, y: 12 }, exit: 'To the Industrial Zone' },
    { map: 'area1-industrial-zone', design: 'motor-4', start: { x: 3, y: 14, heading: 'south' }, click: { x: 12, y: 14 }, exit: 'To Home Town' },
    { map: 'area1-industrial-zone', design: 'motor-4', start: { x: 3, y: 14, heading: 'south' }, click: { x: 15, y: 14 }, exit: 'To Home Town' },
  ];
  for (const c of cases) {
    it(`${c.map}: ${c.design} from ${c.start.x},${c.start.y} ${c.start.heading} to ${c.click.x},${c.click.y} stays in town`, () => {
      const map = load(c.map);
      const len = designLength(c.design);
      const dm = new DriveMap(map, Grid.fromMap(map), rules);
      dm.setVanLength(len);
      const plan = planDrive(dm, c.start, len, c.click)!;
      expect(plan).not.toBeNull();
      const crossed = exitsCrossed(map, c.start, len, plan);
      // The drive really does swing over the exit…
      expect(crossed.map((o) => o.name)).toEqual([c.exit]);
      // …and a drive clicked somewhere else doesn't leave by it.
      expect(crossed.some((via) => driveLeavesBy(null, via))).toBe(false);
    });
  }

  it('still leaves by the exit that was clicked, and by any road out while steering with the keys', () => {
    const map = load('area1-industrial-zone');
    const exit = map.objects.find((o) => o.name === 'To Home Town')!;
    const len = designLength('motor-4');
    const start: VanPose = { x: 8, y: 13, heading: 'west' };
    const dm = new DriveMap(map, Grid.fromMap(map), rules);
    dm.setVanLength(len);
    const plan = planDrive(dm, start, len, objectTiles(exit, map.tileSize))!;
    const crossed = exitsCrossed(map, start, len, plan);
    expect(crossed).toEqual([exit]);
    expect(driveLeavesBy(exit, exit)).toBe(true);
    expect(driveLeavesBy({ ...exit }, exit)).toBe(true);
    expect(driveLeavesBy('any', exit)).toBe(true);
  });
});

// Boss, 7 Nov 2026: Phoenix MX's front exit is two "Exit" objects side by side. A click on one kept the
// walk off the other, so from the left of the room it went up and round to reach the tile clicked.
describe('a way out drawn as several objects', () => {
  const map = load('int-home-local-garage');

  it('counts as one way out, apart from a side door that goes somewhere else', () => {
    const front = stepTriggerAt(map, { x: 4, y: 6 })!;
    expect(wayOutTiles(map, front)).toEqual([{ x: 3, y: 6 }, { x: 4, y: 6 }]);
    expect(wayOutTiles(map, stepTriggerAt(map, { x: 8, y: 6 })!)).toEqual([{ x: 8, y: 6 }]);
  });

  it('a click on the far tile from the left of the room leaves by the near one, straight along the wall', () => {
    const path = walk(map, { x: 1, y: 6 }, { x: 4, y: 6 });
    expect(path).toEqual([{ x: 2, y: 6 }, { x: 3, y: 6 }]);
  });

  it('a click on the side door still keeps off the front exit', () => {
    const path = walk(map, { x: 2, y: 6 }, { x: 8, y: 6 });
    expect(path.at(-1)).toEqual({ x: 8, y: 6 });
    expect(path.some((t) => t.y === 6 && (t.x === 3 || t.x === 4))).toBe(false);
  });
});

// Boss, 7 Nov 2026: "clicking outside the door way, which I expect most players would do to leave",
// walked into the wall beside the door and stopped. Every interior's exits sit on the floor just inside
// its bottom wall; a click on that wall or in the dark below it, near an exit, now leaves.
describe('a click past the doorway of a building', () => {
  const interiors = fs.readdirSync('public/assets/maps').filter((f) => f.startsWith('int-')).map((f) => f.replace(/\.json$/, ''));

  it('finds the interiors', () => expect(interiors.length).toBeGreaterThan(50));

  for (const id of interiors) {
    it(`${id}: a click on the wall or off the map below an exit walks out by it`, () => {
      const map = load(id);
      const grid = Grid.fromMap(map);
      const spawn = map.objects.find((o) => o.type === 'spawn')!;
      const from = { x: Math.floor(spawn.x / map.tileSize), y: Math.floor(spawn.y / map.tileSize) - 1 };
      const start = grid.isFree(from.x, from.y) ? from : { x: from.x, y: from.y + 1 };
      const exits = map.objects.filter((o) => o.type === 'exit').flatMap((o) => objectTiles(o, map.tileSize));
      expect(exits.length).toBeGreaterThan(0);
      for (const e of exits) {
        for (const click of [{ x: e.x, y: e.y + 1 }, { x: e.x, y: e.y + 3 }, { x: e.x - 1, y: e.y + 1 }, { x: e.x + 1, y: e.y + 2 }]) {
          const way = edgeClickWayOut(map, grid, click);
          expect(way, `click ${click.x},${click.y}`).not.toBeNull();
          // Directly below an exit always means that exit.
          if (click.x === e.x) expect(way).toEqual(e);
          const path = walk(map, start, way!);
          expect(stepTriggerAt(map, path.at(-1) ?? start)?.type, `walk to ${way!.x},${way!.y}`).toBe('exit');
        }
      }
    });
  }

  it('leaves a click on the floor, or on a wall far from any exit, alone', () => {
    const map = load('int-home-local-garage');
    const grid = Grid.fromMap(map);
    expect(edgeClickWayOut(map, grid, { x: 3, y: 5 })).toBeNull();
    expect(edgeClickWayOut(map, grid, { x: 3, y: 0 })).toBeNull();
    expect(edgeClickWayOut(map, grid, { x: 0, y: 3 })).toBeNull();
    expect(edgeClickWayOut(map, grid, { x: 6, y: 7 })).toBeNull();
  });

  it('only in buildings: a town edge is left to the usual walk', () => {
    const map = load('area1-home-town');
    expect(edgeClickWayOut(map, Grid.fromMap(map), { x: 47, y: 11 })).toBeNull();
  });
});
