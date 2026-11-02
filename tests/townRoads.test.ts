import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { placeArrival, routeArrival, routeFor } from '../src/core/guides';
import { objectTile } from '../src/core/mapTypes';
import { stepTriggerAt } from '../src/core/travel';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const world = content.world;

describe('roads between towns flow (Boss, 2 Nov 2026)', () => {
  const townRoads = world.routes.filter((r) => r.map.startsWith('area') && r.to[0]?.startsWith('area'));

  it('every town road to a neighbour has a road back from it', () => {
    for (const r of townRoads) expect(world.routes.some((b) => b.map === r.to[0] && b.to[0] === r.map), `${r.map} ${r.exit}`).toBe(true);
  });

  for (const r of townRoads) {
    it(`${r.map} ${r.exit} comes in on ${r.to[0]}'s road back, not its hub road`, () => {
      const from = maps.get(r.map)!;
      const exit = from.objects.find((o) => o.name === r.exit)!;
      const route = routeFor(world, from, exit)!;
      const place = world.places.find((p) => p.map === r.to[0])!;
      const tile = placeArrival(world, maps, r.map, route, place);
      const target = maps.get(place.map)!;
      const back = world.routes.find((b) => b.map === place.map && b.to[0] === r.map)!;
      const backExit = objectTile(target.objects.find((o) => o.name === back.exit)!, target.tileSize);
      expect(Math.hypot(tile.x - backExit.x, tile.y - backExit.y), `${tile.x},${tile.y} from ${back.exit}`).toBeLessThanOrEqual(10);
      expect(target.blocked[tile.y][tile.x]).not.toBe('#');
      expect(stepTriggerAt(target, tile)).toBeFalsy();
    });
  }

  it('the hub road still comes in at the hub side of town', () => {
    const home = maps.get('area1-home-town')!;
    const hub = home.objects.find((o) => o.name === 'To the venue route')!;
    const place = world.places.find((p) => p.map === 'area2-mountain-town')!;
    const t = placeArrival(world, maps, home.id, routeFor(world, home, hub), place);
    const spawn = objectTile(maps.get(place.map)!.objects.find((o) => o.name === place.spawn)!, 64);
    expect(t).toEqual(spawn);
  });
});

describe('town roads go straight through (Boss, 2 Nov 2026)', () => {
  it('a road between towns takes you to the neighbour with no road menu; venue roads still ask', () => {
    const flags = { 'area.2.open': true, 'area.3.open': true, 'area.8.open': true };
    const home = maps.get('area1-home-town')!;
    const north = routeArrival(home, home.objects.find((o) => o.name === 'North road')!, world, maps, null, flags);
    expect(typeof north).not.toBe('string');
    expect(north).toMatchObject({ map: 'area2-mountain-town', others: [] });
    const hub = routeArrival(home, home.objects.find((o) => o.name === 'To the venue route')!, world, maps, null, flags);
    expect(typeof hub !== 'string' && hub.others.length).toBeGreaterThan(0);
    const mt = maps.get('area2-mountain-town')!;
    expect(routeArrival(mt, mt.objects.find((o) => o.name === 'South road')!, world, maps, null, flags)).toMatchObject({ map: 'area1-home-town', others: [] });
    const sw = routeArrival(mt, mt.objects.find((o) => o.name === 'South-west road')!, world, maps, null, flags);
    expect(typeof sw !== 'string' && sw.others.length).toBeGreaterThan(0);
    // A venue's lane still asks where to.
    const v = maps.get('venue-motocross')!;
    const lane = routeArrival(v, v.objects.find((o) => o.name === 'To the world map')!, world, maps, null, flags);
    expect(typeof lane !== 'string' && lane.others.length).toBeGreaterThan(0);
    // A town not open yet: the road says so.
    expect(routeArrival(home, home.objects.find((o) => o.name === 'North road')!, world, maps, null, {})).toMatch(/isn't open yet/);
  });
});
