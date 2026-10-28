import { describe, expect, it } from 'vitest';
import { checkContent, npcsOnMap, type RawContent } from '../src/core/content';
import { directions, guidesOn, routeArrival, routePlaces, waysOut } from '../src/core/guides';
import { Grid } from '../src/core/grid';
import { ROUTE, spawnTile, stepTriggerAt, Travel } from '../src/core/travel';
import { loadManifest, loadMaps, rawContent } from './helpers';
import { standLift } from '../src/world/standLift';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const { world, npcs } = content;
const travel = new Travel(maps, world.locks);
const OPEN = { roadworks_done: true, van_owned: true, van_loaded: true };
const map = (id: string) => maps.get(id)!;
const exitOn = (id: string, name: string) => map(id).objects.find((o) => o.type === 'exit' && o.name === name)!;
const errorsWith = (change: (raw: Record<string, any>) => void) => {
  const raw = structuredClone(rawContent()) as RawContent & Record<string, any>;
  change(raw);
  return checkContent(raw, loadManifest(), maps).errors.map((e) => `${e.file}: ${e.field}: ${e.message}`);
};

describe('route marshals', () => {
  it('stand by the way out of every area, off the exits, where you can walk', () => {
    for (const m of maps.values()) {
      if (m.kind !== 'area') continue;
      const g = guidesOn(npcs, m);
      expect(g.length, m.id).toBe(1);
      const t = { x: g[0].tile![0], y: g[0].tile![1] };
      expect(Grid.fromMap(m).isFree(t.x, t.y), m.id).toBe(true);
      expect(stepTriggerAt(m, t), m.id).toBeUndefined();
      // Within a few tiles of an exit.
      const near = m.objects.filter((o) => o.type === 'exit').some((o) => Math.hypot(o.x / 64 - t.x, o.y / 64 - t.y) < 6);
      expect(near, m.id).toBe(true);
    }
  });

  it('in Home Town, name both ways out: the venue road and the Industrial Zone', () => {
    const lines = directions(waysOut(map('area1-home-town'), world, maps, travel, OPEN));
    expect(lines).toEqual([
      'Out to the west, the venue road goes to Farmland MX, Riverside Arena, Longmoor Enduro and Mod Track.',
      "Farmland MX: Hard-pack local track. The local racer's favourite.",
      'Riverside Arena: Supercross in the arena by the river: tight turns and tuff blocks.',
      'Longmoor Enduro: A long loop under the trees.',
      'Mod Track: Race a player-made track: pick one from the list and go straight to the gate.',
      'Out to the east, that road takes you to Industrial Zone.',
    ]);
  });

  it("say the venue road is shut, and why, until it's open", () => {
    const lines = directions(waysOut(map('area1-home-town'), world, maps, travel, {}));
    expect(lines[0]).toBe("Out to the west, the venue road goes to Farmland MX, Riverside Arena, Longmoor Enduro and Mod Track. It's shut for you just now: You'll need a van, loaded with your bike, to get to the tracks.");
    expect(lines).toHaveLength(2);
  });

  it('in the Industrial Zone (one way out), name the road back to Home Town', () => {
    expect(directions(waysOut(map('area1-industrial-zone'), world, maps, travel, {}))).toEqual(['Out to the west, that road takes you to Home Town.']);
  });

  it('at each venue, offer the other places the lane goes to, never the venue itself', () => {
    for (const id of ['area1-venue-farmland', 'area1-venue-riverside', 'area1-venue-longmoor']) {
      const ways = waysOut(map(id), world, maps, travel, {});
      expect(ways).toHaveLength(1);
      expect(ways[0].side).toBe('south');
      const names = ways[0].places.map((p) => p.map);
      expect(names).toHaveLength(4);
      expect(names).toContain('area1-home-town');
      expect(names).toContain('mod-tracks');
      expect(names).not.toContain(id);
    }
  });

  it('only list places that exist: a missing map or spawn is left out, not promised', () => {
    const w = structuredClone(world);
    w.places.push({ map: 'area1-nowhere', spawn: 'x', name: 'Nowhere', note: '' });
    w.routes[0].to.push('area1-nowhere');
    expect(routePlaces(w, maps, w.routes[0]).map((p) => p.name)).toEqual(['Farmland MX', 'Riverside Arena', 'Longmoor Enduro', 'Mod Track']);
    w.routes[0].to = ['area1-nowhere'];
    expect(directions(waysOut(map('area1-home-town'), w, maps, travel, OPEN))[0]).toBe("Out to the west, that road doesn't go anywhere yet.");
  });
});

describe('leaving by a route', () => {
  const home = map('area1-home-town');
  const road = exitOn('area1-home-town', 'To the venue route');

  it('goes to the place picked with the marshal, through the exit', () => {
    for (const id of ['area1-venue-farmland', 'area1-venue-riverside', 'area1-venue-longmoor']) {
      const to = routeArrival(home, road, world, maps, id);
      expect(typeof to).not.toBe('string');
      if (typeof to === 'string') continue;
      expect({ map: to.map, tile: to.tile }).toEqual({ map: id, tile: spawnTile(map(id), 'from_world_map') });
    }
  });

  it("doesn't need the marshal: without a pick it takes the road's first place, and says where else it goes", () => {
    for (const pick of [null, 'area1-industrial-zone']) {
      const to = routeArrival(home, road, world, maps, pick);
      expect(typeof to).not.toBe('string');
      if (typeof to === 'string') continue;
      expect(to.map).toBe('area1-venue-farmland');
      expect(to.others.map((p) => p.map)).toEqual(['area1-venue-riverside', 'area1-venue-longmoor', 'mod-tracks']);
    }
  });

  it('goes straight there when a route has only one place', () => {
    const w = structuredClone(world);
    w.routes[0].to = ['area1-venue-farmland'];
    expect(routeArrival(home, road, w, maps, null)).toMatchObject({ map: 'area1-venue-farmland', tile: spawnTile(map('area1-venue-farmland'), 'from_world_map') });
  });

  it('every way out of every area leads somewhere real', () => {
    for (const m of maps.values()) {
      if (m.kind !== 'area') continue;
      for (const w of waysOut(m, world, maps, travel, OPEN)) {
        if (w.exit.props.to === ROUTE) expect(w.places.length, `${m.id} ${w.exit.name}`).toBeGreaterThan(0);
        else expect(w.to, `${m.id} ${w.exit.name}`).toBeDefined();
        expect(w.shut, `${m.id} ${w.exit.name}`).toBeNull();
      }
    }
  });
});

describe('route checks', () => {
  it('refuse a route exit with no route, a route to a place that isn’t listed, or one back to itself', () => {
    expect(errorsWith((r) => { r.world.routes = r.world.routes.slice(1); })).toEqual([expect.stringMatching(/the exit "To the venue route" on area1-home-town leads to a choice of places, but no route lists them/)]);
    expect(errorsWith((r) => { r.world.routes[0].to.push('area1-industrial-zone'); })).toEqual([expect.stringMatching(/routes\[0\]\.to\[4\]: "area1-industrial-zone" isn't one of the places/)]);
    expect(errorsWith((r) => { r.world.routes[1].to.push('area1-venue-farmland'); })).toEqual([expect.stringMatching(/routes\[1\]\.to\[4\]: leads back to area1-venue-farmland/)]);
    expect(errorsWith((r) => { r.world.routes[0].exit = 'To the Industrial Zone'; })).toEqual(expect.arrayContaining([expect.stringMatching(/goes straight to area1-industrial-zone, not to a choice of places/)]));
  });

  it('refuse a marshal standing on an exit', () => {
    expect(errorsWith((r) => { r.npcs.npcs.find((n: { id: string }) => n.id === 'npc.marshal_industrial').tile = [0, 13]; })).toEqual([expect.stringMatching(/npcs\[\d+\]\.tile: 0,13 is on a door or exit/)]);
  });
});

describe('road exits and the local racer (Alpha v1)', () => {
  it('make every road out of an area a 2×2 trigger, with the arrival spot just inside it', () => {
    for (const m of maps.values()) {
      if (m.kind !== 'area') continue;
      for (const o of m.objects.filter((x) => x.type === 'exit')) {
        expect([o.w / m.tileSize, o.h / m.tileSize], `${m.id} ${o.name}`).toEqual([2, 2]);
        for (const s of m.objects.filter((x) => x.type === 'spawn')) expect(stepTriggerAt(m, { x: s.x / m.tileSize, y: s.y / m.tileSize }), `${m.id} ${s.name}`).toBeUndefined();
      }
    }
  });

  it('stands the local racer on the pavement outside the local garage', () => {
    const home = map('area1-home-town');
    const racer = home.objects.find((o) => o.type === 'npc' && o.props.npc === 'npc.local_racer')!;
    const garage = home.objects.find((o) => o.type === 'building' && o.name === 'Local garage')!;
    const t = { x: racer.x / 64, y: racer.y / 64 };
    expect(t.y).toBe((garage.y + garage.h) / 64);
    expect(t.x).toBeGreaterThanOrEqual(garage.x / 64);
    expect(t.x).toBeLessThan((garage.x + garage.w) / 64);
    expect(Grid.fromMap(home).isFree(t.x, t.y)).toBe(true);
    expect(stepTriggerAt(home, t)).toBeUndefined();
    const ground = home.ground[0].cells as number[];
    expect(home.images[ground[t.y * home.width + t.x]]).toMatch(/street/);
  });
});

describe('NPCs stand on the path, not in the road', () => {
  it('puts every NPC on an area map off the road, and lifts them onto the paving on a one-tile pavement', () => {
    for (const m of maps.values()) {
      if (m.kind !== 'area') continue;
      for (const p of npcsOnMap(content, m)) {
        const imgs = m.ground.map((l) => m.images[(l.cells as number[])[p.y * m.width + p.x]] ?? '');
        expect(imgs.some((i) => /\/road-\d/.test(i)), `${p.npc.id} on ${m.id}`).toBe(false);
        // On a pavement drawn across the middle of its tile (road or verge below), the feet go up onto it.
        if (imgs.some((i) => /street-(00001000|10000000)\.png$/.test(i))) expect(standLift(m, p.x, p.y), `${p.npc.id} on ${m.id}`).toBeGreaterThan(0);
      }
    }
  });
});
