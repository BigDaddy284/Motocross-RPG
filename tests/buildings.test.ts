import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkBuildings, footprintCells, footprintSize, type BuildingDef, type BuildingsData } from '../src/core/buildings';
import type { BakedMap } from '../src/core/mapTypes';
import { loadMaps, publicFileExists, readPublic } from './helpers';

const lib = readPublic<BuildingsData>('data/buildings.json');
const maps = loadMaps();
const T = 64;

/** The Home Town map file as it was before the building library was added. */
const HOME_TOWN_SHA256 = '2a7ebdbc10b2bf2d7acfca8f028141cce1b855b32aba17ef606898e4dc1ede8c';

function pngSize(rel: string): [number, number] {
  const b = fs.readFileSync(`public/assets/${rel}`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const problems = (l: BuildingsData, m: Map<string, BakedMap> = maps) => checkBuildings(l, m).map((e) => `${e.file}: ${e.field}: ${e.message}`);
const withMap = (id: string, change: (m: BakedMap) => void) => {
  const m = structuredClone(maps.get(id)!);
  change(m);
  return new Map(maps).set(id, m);
};
const withLib = (change: (b: BuildingDef[]) => void) => {
  const l = structuredClone(lib);
  change(l.buildings);
  return l;
};
const setTile = (m: BakedMap, x: number, y: number, c: '#' | '.') => {
  m.blocked[y] = m.blocked[y].slice(0, x) + c + m.blocked[y].slice(x + 1);
};

describe('building library', () => {
  it('matches every building on every map, and passes its own checks', () => {
    expect(problems(lib)).toEqual([]);
    const placed = [...maps.values()].flatMap((m) => m.objects.filter((o) => o.type === 'building').map((o) => String(o.props.blueprint)));
    expect(placed.length).toBe(16);
    for (const id of placed) expect(lib.buildings.some((b) => b.id === id), id).toBe(true);
  });

  it('leaves the Home Town map exactly as it was', () => {
    const sha = createHash('sha256').update(fs.readFileSync('public/assets/maps/area1-home-town.json')).digest('hex');
    expect(sha, 'Home Town changed: if that was deliberate, update HOME_TOWN_SHA256').toBe(HOME_TOWN_SHA256);
  });

  it('draws every building from pictures that are there', () => {
    for (const b of lib.buildings) {
      for (const p of b.parts) {
        expect(publicFileExists(`assets/${p.sheet}`), `${b.id} ${p.sheet}`).toBe(true);
        const [w, h] = pngSize(p.sheet);
        expect(p.crop[0] + p.crop[2] <= w && p.crop[1] + p.crop[3] <= h, `${b.id} crop ${p.crop.join(',')} inside ${w}×${h}`).toBe(true);
      }
    }
  });

  it('takes its size and shape from the footprint, not the picture', () => {
    const get = (id: string) => lib.buildings.find((b) => b.id === id)!;
    expect(footprintSize(get('bld.example.security_hut'))).toEqual({ w: 2, h: 2 });
    expect(footprintSize(get('bld.example.town_block'))).toEqual({ w: 35, h: 18 });
    const l = get('bld.iz.engine_rebuilder_lockup');
    expect(footprintSize(l)).toEqual({ w: 12, h: 5 });
    // An L: the lock-up's corner above it isn't part of the building.
    expect(footprintCells(l).length).toBe(12 * 5 - 3);
    expect(footprintCells(l).some((c) => c.x === 10 && c.y === 0)).toBe(false);
    // The pictures are a tile wider than the footprints (their shadows); the footprint is what's solid.
    const garage = get('bld.home.local_garage');
    expect(garage.parts[0].crop[2] / T).toBe(footprintSize(garage).w + 1);
    expect(footprintCells(garage).filter((c) => !c.solid).map((c) => [c.x, c.y])).toEqual([[1, 3], [2, 3], [3, 3], [4, 3]]);
  });
});

describe('building checks', () => {
  it('refuses overlapping buildings on a map', () => {
    const m = withMap('area1-industrial-zone', (m) => {
      const unit = m.objects.find((o) => o.type === 'building' && o.props.blueprint === 'bld.iz.filler_unit')!;
      unit.x = 30 * T; // onto the modifier unit (27..32, 12..15)
    });
    expect(problems(lib, m).join('\n')).toMatch(/overlaps Modifier machine unit at 30,12/);
  });

  it('refuses a map whose tiles disagree with a footprint', () => {
    const m = withMap('area1-industrial-zone', (m) => setTile(m, 15, 12, '.'));
    expect(problems(lib, m)).toEqual([expect.stringMatching(/Engine rebuilder" at 14,11: tile 15,12 is free on the map but solid/)]);
    const door = withMap('area1-industrial-zone', (m) => setTile(m, 20, 15, '#'));
    expect(problems(lib, door).join('\n')).toMatch(/tile 20,15 is blocked on the map but walkable/);
  });

  it('refuses a door that leads to a missing interior, or sits on a solid tile', () => {
    const missing = withLib((b) => {
      b.find((x) => x.id === 'bld.iz.engine_rebuilder_lockup')!.draft = false;
    });
    expect(problems(missing).join('\n')).toMatch(/doors\[0\]\.interior: no interior map int-iz-engine-rebuilder-lockup/);
    const solid = withLib((b) => {
      b.find((x) => x.id === 'bld.example.security_hut')!.doors.push({ tile: [0, 1], interior: 'int.iz.lockup' });
    });
    expect(problems(solid).join('\n')).toMatch(/0,1 is a solid tile; a door goes on a walkable/);
  });

  it("refuses a building that leads into another building's interior", () => {
    const l = withLib((b) => {
      const c = b.find((x) => x.id === 'bld.iz.engine_rebuilder_lockup')!;
      c.draft = false;
      c.doors[0].interior = 'int.iz.engine_rebuilder';
    });
    expect(problems(l).join('\n')).toMatch(/int\.iz\.engine_rebuilder is already bld\.iz\.engine_rebuilder's interior/);
  });

  it("refuses a building with no way back out, or one the interior's exit can't find", () => {
    const none = withLib((b) => {
      b.find((x) => x.id === 'bld.iz.modifier_unit')!.returns = [];
    });
    expect(problems(none).join('\n')).toMatch(/a building with doors needs a return tile/);
    const named = withLib((b) => {
      b.find((x) => x.id === 'bld.home.local_garage')!.returns = [{ tile: [1, 4] }];
    });
    expect(problems(named).join('\n')).toMatch(/comes out on the return named "side_door", which Local garage doesn't have/);
  });

  it('refuses a door or return moved on the map but not in the library', () => {
    const m = withMap('area1-industrial-zone', (m) => {
      m.objects.find((o) => o.type === 'door' && o.props.building === 'bld.iz.engine_rebuilder')!.x += T;
    });
    expect(problems(lib, m).join('\n')).toMatch(/has doors \[21,15 int\.iz\.engine_rebuilder\] but bld\.iz\.engine_rebuilder has \[20,15/);
  });

  it('keeps unfinished buildings off the maps, but lets them be incomplete in the library', () => {
    // The draft's interior doesn't exist yet: fine while it is a draft.
    expect(lib.buildings.find((b) => b.id === 'bld.iz.engine_rebuilder_lockup')?.draft).toBe(true);
    const m = withMap('area1-industrial-zone', (m) => {
      m.objects.push({ type: 'building', name: 'Lock-up', x: 2 * T, y: 26 * T, w: 12 * T, h: 5 * T, props: { blueprint: 'bld.iz.engine_rebuilder_lockup', interior: 'int.iz.engine_rebuilder_lockup', npc: null } });
    });
    expect(problems(lib, m).join('\n')).toMatch(/Engine rebuilder with lock-up is unfinished \(draft\)/);
  });

  it('refuses a footprint with uneven rows or unknown tiles', () => {
    const l = withLib((b) => {
      b.find((x) => x.id === 'bld.example.security_hut')!.footprint = ['##', '#', 'x#'];
    });
    expect(problems(l)).toEqual([
      expect.stringMatching(/footprint\[1\]: is 1 tiles wide; every row must be 2/),
      expect.stringMatching(/footprint\[2\]: "x" isn't a footprint tile/),
    ]);
  });
});
