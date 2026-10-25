import { describe, expect, it } from 'vitest';
import { npcsOnMap, checkContent, type Content } from '../src/core/content';
import { Grid } from '../src/core/grid';
import { applyMapState } from '../src/core/mapState';
import type { BakedMap } from '../src/core/mapTypes';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { Travel, spawnTile, stepTriggerAt } from '../src/core/travel';
import {
  DriveMap, HEADINGS, OPPOSITE, centre, ensureVan, exitTile, footprint, forward, inwardHeading, placeNear, planDrive, reverse, steer, turn,
  type Heading, type Move, type VanPose, type VehiclesData,
} from '../src/core/vehicles';
import { loadManifest, loadMaps, publicFileExists, rawContent } from './helpers';

const manifest = loadManifest();
const maps = loadMaps();
const content = checkContent(rawContent(), manifest, maps).content as Content;
const data = content.vehicles;
const HOME = 'area1-home-town';
const ALL_FLAGS = { van_owned: true, van_loaded: true, tutorial_done: true, first_race_done: true };

/** The drivable map as the world builds it: story changes applied, NPCs standing in the road. */
function driveMap(id: string, flags: Record<string, boolean> = {}): DriveMap {
  const map = maps.get(id)!;
  const grid = Grid.fromMap(map);
  applyMapState(map, grid, flags);
  const dm = new DriveMap(map, grid, data.drivable);
  dm.setNpcTiles(npcsOnMap(content, map).map((p) => ({ x: p.x, y: p.y })));
  return dm;
}

/** Plays moves the way the world does, checking each one still fits. */
function play(dm: DriveMap, start: VanPose, length: number, moves: Move[]): VanPose {
  let p = start;
  for (const m of moves) {
    expect(dm.fits(m.to, length)).toBe(true);
    p = m.to;
  }
  return p;
}

describe('van sheets and footprints', () => {
  it('every design has a sheet with all four headings, closed and rear open', () => {
    for (const d of data.designs) {
      const sheet = manifest.vehicles?.[d.id];
      expect(sheet, d.id).toBeDefined();
      expect(publicFileExists(`assets/${sheet!.image}`), sheet!.image).toBe(true);
      for (const h of HEADINGS) {
        const v = sheet!.views[h];
        expect(v.closed[2]).toBe(v.open[2]);
        expect(v.closed[3]).toBe(v.open[3]);
      }
      // Opposite headings share a cell size and anchor, so turning round never makes the van jump.
      expect(sheet!.views.east.anchor).toEqual(sheet!.views.west.anchor);
      expect(sheet!.views.north.anchor).toEqual(sheet!.views.south.anchor);
      expect(sheet!.views.east.closed.slice(2)).toEqual(sheet!.views.west.closed.slice(2));
    }
  });

  it('the footprint follows the real length at 28 px per metre, so longer vans take more tiles', () => {
    for (const d of data.designs) expect(d.length, d.id).toBe(Math.round((d.lengthM * 28) / 64));
    const byLength = [...data.designs].sort((a, b) => a.lengthM - b.lengthM);
    for (let i = 1; i < byLength.length; i++) expect(byLength[i].length).toBeGreaterThanOrEqual(byLength[i - 1].length);
    expect(data.designs.find((d) => d.id === 'van-7')!.length).toBe(9);
  });

  it('a footprint is one tile wide, front first, and its centre is the middle of its tiles', () => {
    expect(footprint({ x: 5, y: 3, heading: 'east' }, 3)).toEqual([{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }]);
    expect(footprint({ x: 5, y: 3, heading: 'north' }, 2)).toEqual([{ x: 5, y: 3 }, { x: 5, y: 4 }]);
    expect(centre({ x: 5, y: 3, heading: 'west' }, 2)).toEqual({ x: 6, y: 3.5 });
  });

  it('the starter van is Van 1 and fits its spot behind the van seller', () => {
    expect(data.starter.design).toBe('van-1');
    expect(driveMap(HOME).fits(data.starter, 2)).toBe(true);
  });
});

describe('driving', () => {
  it('drives both ways along the main road, in either lane', () => {
    const dm = driveMap(HOME);
    for (const lane of [20, 21]) {
      for (const heading of ['east', 'west'] as Heading[]) {
        let p: VanPose = { x: 30, y: lane, heading };
        for (let i = 0; i < 8; i++) {
          const m = forward(dm, p);
          expect(m, `${heading} in row ${lane}`).not.toBeNull();
          p = m!.to;
        }
        expect(p.y).toBe(lane);
        expect(p.x).toBe(heading === 'east' ? 38 : 22);
      }
    }
  });

  it('reverses, and turns round into the other lane', () => {
    const dm = driveMap(HOME);
    const p: VanPose = { x: 20, y: 21, heading: 'east' };
    expect(reverse(dm, p, 2)!.to).toEqual({ x: 19, y: 21, heading: 'east' });
    const u = steer(dm, p, 2, 'west')!;
    expect(u.kind).toBe('uturn');
    expect(u.to.heading).toBe('west');
    expect(dm.fits(u.to, 2)).toBe(true);
  });

  it('turns at the junction into the side road, for every van', () => {
    const dm = driveMap(HOME);
    for (const d of data.designs) {
      const p: VanPose = { x: 30, y: 21, heading: 'east' };
      const t = turn(dm, p, d.length, 'south');
      expect(t, d.id).not.toBeNull();
      expect(t!.to.heading).toBe('south');
    }
  });

  it('drives anywhere on the town roads by click, for every van', () => {
    const dm = driveMap(HOME, ALL_FLAGS);
    const goals = [{ x: 58, y: 20 }, { x: 31, y: 32 }, { x: 10, y: 35 }, { x: 43, y: 26 }];
    for (const d of data.designs) {
      // The world moves a longer design (the dev swap) to the nearest spot it fits, as here.
      const start = placeNear(dm, data.starter, d.length, data.starter.heading)!;
      for (const g of goals) {
        const plan = planDrive(dm, start, d.length, g);
        expect(plan, `${d.id} to ${g.x},${g.y}`).not.toBeNull();
        const end = play(dm, start, d.length, plan!);
        expect(footprint(end, d.length).some((t) => t.x === g.x && t.y === g.y)).toBe(true);
      }
    }
  });

  it('never leaves the road: grass, buildings and doors are off limits', () => {
    const dm = driveMap(HOME);
    const map = maps.get(HOME)!;
    expect(dm.isDrivable(5, 18)).toBe(false); // the rented room's door
    expect(dm.isDrivable(10, 23)).toBe(false); // grass verge
    expect(dm.isDrivable(6, 16)).toBe(false); // a building
    expect(map.objects.some((o) => o.type === 'door' && dm.isDrivable(Math.floor(o.x / 64), Math.floor(o.y / 64)))).toBe(false);
  });
});

describe('NPCs and the van', () => {
  it('a van cannot drive into an NPC, but the rider still walks through them', () => {
    const dm = driveMap(HOME);
    const p: VanPose = { x: 20, y: 21, heading: 'east' };
    dm.setNpcTiles([{ x: 21, y: 21 }]);
    expect(forward(dm, p)).toBeNull();
    expect(steer(dm, p, 2, 'east')).toBeNull();
    expect(dm.fits({ x: 22, y: 21, heading: 'east' }, 2)).toBe(false);
    // Walking: NPCs are not occupants of the walking grid.
    expect(dm.grid.canStep({ x: 20, y: 21 }, { x: 21, y: 21 })).toBe(true);
  });

  it('click-driving goes round an NPC standing in the lane', () => {
    const dm = driveMap(HOME);
    dm.setNpcTiles([{ x: 25, y: 21 }]);
    const start: VanPose = { x: 20, y: 21, heading: 'east' };
    const plan = planDrive(dm, start, 2, { x: 30, y: 21 })!;
    expect(plan).not.toBeNull();
    for (const m of plan) expect(footprint(m.to, 2).some((t) => t.x === 25 && t.y === 21)).toBe(false);
  });

  it('every NPC on the area maps stands where the van cannot go', () => {
    for (const m of maps.values()) {
      if (m.kind !== 'area') continue;
      const dm = driveMap(m.id);
      for (const p of npcsOnMap(content, m)) expect(dm.isFree(p.x, p.y), `${p.npc.id} on ${m.id}`).toBe(false);
    }
  });
});

describe('map changes with the van', () => {
  const travel = new Travel(maps, content.world.locks);
  const arrivals: { from: string; map: BakedMap; tile: { x: number; y: number } }[] = [];
  for (const m of maps.values()) {
    if (m.kind !== 'area') continue;
    for (const o of m.objects) {
      if (o.type !== 'exit') continue;
      const r = travel.resolve(m, o, ALL_FLAGS);
      if (r?.kind === 'travel') arrivals.push({ from: `${m.id} ${o.name}`, map: maps.get(r.to.map)!, tile: r.to.tile });
    }
  }
  for (const d of content.world.worldMap) arrivals.push({ from: `world map to ${d.name}`, map: maps.get(d.map)!, tile: spawnTile(maps.get(d.map)!, d.spawn)! });

  it('every van has room at every arrival point, pointing into the map and clear of exits', () => {
    expect(arrivals.length).toBeGreaterThan(4);
    for (const a of arrivals) {
      const dm = driveMap(a.map.id, ALL_FLAGS);
      for (const d of data.designs) {
        const pose = placeNear(dm, a.tile, d.length, inwardHeading(a.map, a.tile), 12, (t) => !!stepTriggerAt(a.map, t));
        expect(pose, `${d.id}: ${a.from}`).not.toBeNull();
        expect(dm.fits(pose!, d.length)).toBe(true);
        expect(footprint(pose!, d.length).some((t) => stepTriggerAt(a.map, t))).toBe(false);
      }
    }
  });

  it('a van arriving from the industrial zone points into Home Town and can drive away', () => {
    const map = maps.get(HOME)!;
    const spawn = spawnTile(map, 'from_industrial_zone')!;
    const dm = driveMap(HOME);
    const pose = placeNear(dm, spawn, 2, inwardHeading(map, spawn), 12, (t) => !!stepTriggerAt(map, t))!;
    expect(pose.heading).toBe('west');
    expect(forward(dm, pose)).not.toBeNull();
  });
});

describe('getting in and out', () => {
  it('the rider steps out on the driver\'s side when it is clear', () => {
    const grid = Grid.fromMap(maps.get(HOME)!);
    const p: VanPose = { x: 20, y: 21, heading: 'east' };
    for (const t of footprint(p, 2)) grid.setOccupied(t, true);
    // Heading east, the driver (right-hand drive) is on the south side.
    expect(exitTile(grid, p, 2)).toEqual({ x: 20, y: 22 });
    expect(exitTile(grid, { x: 20, y: 21, heading: 'west' }, 2)).toEqual({ x: 20, y: 20 });
  });

  it('a parked van is solid to walkers', () => {
    const grid = Grid.fromMap(maps.get(HOME)!);
    for (const t of footprint(data.starter, 2)) grid.setOccupied(t, true);
    const t = footprint(data.starter, 2)[0];
    expect(grid.canStep({ x: t.x - 1, y: t.y }, t)).toBe(false);
  });
});

describe('the one van in the save', () => {
  const base = { flags: {} as Record<string, boolean>, van: null as ReturnType<typeof ensureVan> };

  it('there is no van until the story sells one, then it is the starter van at the starter spot', () => {
    const s = structuredClone(base);
    expect(ensureVan(s, data)).toBeNull();
    s.flags.van_owned = true;
    expect(ensureVan(s, data)).toEqual({ ...data.starter });
  });

  it('a parked van stays where it was left: loading never moves it or adds another', () => {
    const s = { flags: { van_owned: true }, van: { design: 'van-1', map: 'area1-industrial-zone', x: 10, y: 17, heading: 'west' as Heading } };
    const before = structuredClone(s.van);
    ensureVan(s, data);
    ensureVan(s, data);
    expect(s.van).toEqual(before);
  });

  it('the dev option swaps the design but keeps the spot', () => {
    const s = { flags: { van_owned: true }, van: { ...data.starter } };
    ensureVan(s, data, 'van-7');
    expect(s.van).toMatchObject({ design: 'van-7', map: data.starter.map, x: data.starter.x, y: data.starter.y });
    ensureVan(s, data, 'van-99');
    expect(s.van.design).toBe('van-7');
  });

  const v3 = {
    version: 3,
    savedAt: '2026-10-24T10:00:00.000Z',
    rider: { name: 'R', look: 'player-m-start-a' },
    position: { map: HOME, x: 5, y: 19, facing: 'down' },
    flags: { van_owned: true },
    stats: { playSeconds: 10 },
    career: { money: 0, bike: { brand: 'hondmoto', class: '50cc', parts: {} }, bag: [], story: { step: 9, used: [] }, counters: {}, skills: { xp: {}, bonus: {} } },
  };

  it('a test build 3 save loads with no van record yet, so the bought van turns up at the starter spot', () => {
    const s = parseSave(JSON.stringify(v3))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.van).toBeNull();
    expect(s.driving).toBe(false);
    expect(ensureVan(s, data)?.design).toBe('van-1');
  });

  it('keeps the van\'s map, tile and heading through a save and load', () => {
    const van = { design: 'van-4', map: 'area1-venue-farmland', x: 20, y: 16, heading: 'north' };
    const s = parseSave(JSON.stringify({ ...v3, version: SAVE_VERSION, van, driving: true }))!;
    expect(s.van).toEqual(van);
    expect(s.driving).toBe(true);
    expect(parseSave(JSON.stringify({ ...v3, version: SAVE_VERSION, van: { ...van, heading: 'up' }, driving: false }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...v3, version: SAVE_VERSION, van, driving: 'yes' }))).toBeNull();
  });

  it('vehicles.json problems are caught by name', () => {
    const r = rawContent() as ReturnType<typeof rawContent> & { vehicles: VehiclesData };
    r.vehicles.starter = { ...r.vehicles.starter, x: 5, y: 16 };
    r.vehicles.designs[1].id = 'van-1';
    const { errors } = checkContent(r, manifest, maps);
    expect(errors.map((e) => `${e.file}: ${e.field}`)).toEqual(expect.arrayContaining(['data/vehicles.json: designs[1].id', 'data/vehicles.json: starter']));
  });

  it('every heading has an opposite', () => {
    for (const h of HEADINGS) expect(OPPOSITE[OPPOSITE[h]]).toBe(h);
  });
});
