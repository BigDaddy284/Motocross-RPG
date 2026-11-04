import { describe, expect, it } from 'vitest';
import { checkContent, npcsOnMap, type Content } from '../src/core/content';
import { Grid } from '../src/core/grid';
import { applyMapState } from '../src/core/mapState';
import { objectTile, objectTiles, type BakedMap, type MapObject, type Tile } from '../src/core/mapTypes';
import { reachable } from '../src/core/pathfinding';
import { routeArrival, routeFor, routePlaces } from '../src/core/guides';
import { ROUTE, Travel, interiorMapId } from '../src/core/travel';
import { DriveMap, footprint, inwardHeading, placeNear, planDrive } from '../src/core/vehicles';
import { loadManifest, loadMaps, rawContent } from './helpers';

// Area 3, Beach Town, end to end (Boss, 3 Nov 2026: "please build Area 3 check all doors and road
// routes work as should"): every door in and out of every building, and every road in and out of town,
// on foot and in the motor.
const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content as Content;
const world = content.world;
const TOWN = 'area3-beach-town';
const town = maps.get(TOWN)!;
const travel = new Travel(maps, world.locks);
// Everything open: Area 3 and its neighbours, the tracks, the roads, the house bought.
const FLAGS: Record<string, boolean> = new Proxy({}, { get: () => true, has: () => true });
const key = (t: Tile) => `${t.x},${t.y}`;

function walk(map: BakedMap): Grid {
  const grid = Grid.fromMap(map);
  applyMapState(map, grid, FLAGS);
  return grid;
}
/** A door or exit is reached by stepping on one of its tiles. */
const reaches = (seen: Set<string>, map: BakedMap, o: MapObject) => objectTiles(o, map.tileSize).some((t) => seen.has(key(t)));

describe('Beach Town (Area 3): doors (Boss, 3 Nov 2026)', () => {
  const doors = town.objects.filter((o) => o.type === 'door');
  const grid = walk(town);
  const spawns = town.objects.filter((o) => o.type === 'spawn');
  const fromSpawn = reachable(grid, objectTile(spawns[0], town.tileSize));

  it('has a door for every building with an inside, the house locked until bought', () => {
    const insides = new Set(doors.map((d) => d.props.interior));
    expect([...insides].sort()).toEqual(['int.a3.bike_shop', 'int.a3.local_garage', 'int.a3.neighbour', 'int.a3.rented_room', 'int.a3.tool_shop', 'int.a3.tyre_shop', 'int.a3.van_office']);
    const house = doors.find((d) => d.props.interior === 'int.a3.rented_room')!;
    expect(travel.resolve(town, house, {})?.kind).toBe('blocked');
    expect(travel.resolve(town, house, { 'house.3': true })?.kind).toBe('travel');
  });

  it('every town spawn reaches every other one and every door on foot', () => {
    for (const s of spawns) expect(fromSpawn.has(key(objectTile(s, town.tileSize))), s.name).toBe(true);
    for (const d of doors) expect(reaches(fromSpawn, town, d), `${d.name} at ${key(objectTile(d, town.tileSize))}`).toBe(true);
  });

  for (const d of doors) {
    const at = key(objectTile(d, town.tileSize));
    it(`${d.name} (${at}${d.props.spawn ? `, ${d.props.spawn}` : ''}): in, round the inside, and back out onto the street`, () => {
      const r = travel.resolve(town, d, FLAGS)!;
      expect(r.kind, r.kind === 'blocked' ? r.message : '').toBe('travel');
      if (r.kind !== 'travel') return;
      const inside = maps.get(r.to.map)!;
      expect(inside.id).toBe(interiorMapId(String(d.props.interior)));
      expect(inside.kind).toBe('interior');
      const ig = walk(inside);
      expect(ig.isBlocked(r.to.tile.x, r.to.tile.y), 'arrival tile').toBe(false);
      const seen = reachable(ig, r.to.tile);
      // Every usable thing inside can be reached, and every NPC stands on a free tile.
      for (const o of inside.objects.filter((o) => o.type === 'interact')) {
        const near = objectTiles(o, inside.tileSize).some((t) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key({ x: t.x + dx, y: t.y + dy }))));
        expect(near, `${inside.id}: ${o.name} (${o.props.action})`).toBe(true);
      }
      for (const n of npcsOnMap(content, inside)) expect(seen.has(key(n)), `${inside.id}: ${n.npc.name} at ${n.x},${n.y}`).toBe(true);
      // Out again: the exit matching the way in returns to its own spot on the street.
      const exits = inside.objects.filter((o) => o.type === 'exit');
      expect(exits.length).toBeGreaterThan(0);
      for (const e of exits) {
        expect(reaches(seen, inside, e), `${inside.id}: exit at ${key(objectTile(e, inside.tileSize))}`).toBe(true);
        const back = travel.resolve(inside, e, FLAGS)!;
        expect(back.kind).toBe('travel');
        if (back.kind !== 'travel') continue;
        expect(back.to.map).toBe(TOWN);
        expect(grid.isBlocked(back.to.tile.x, back.to.tile.y), `${inside.id} comes out on a blocked tile ${key(back.to.tile)}`).toBe(false);
        expect(fromSpawn.has(key(back.to.tile)), `${inside.id} comes out at ${key(back.to.tile)}, cut off from the town`).toBe(true);
        // Coming out never lands back on a door (which would walk straight back in).
        expect(doors.some((o) => objectTiles(o, town.tileSize).some((t) => key(t) === key(back.to.tile))), `${inside.id} comes out on a door`).toBe(false);
      }
      // A building with a second door (Phoenix MX's side door) has its own way in and out.
      if (typeof d.props.spawn === 'string') {
        expect(inside.objects.some((o) => o.type === 'exit' && o.props.return === d.props.spawn)).toBe(true);
        expect(town.objects.some((o) => o.type === 'return' && o.name === d.props.spawn && o.props.building === d.props.building)).toBe(true);
      }
    });
  }
});

describe('Beach Town (Area 3): roads (Boss, 3 Nov 2026)', () => {
  const exits = town.objects.filter((o) => o.type === 'exit');
  const names = [...new Set(exits.map((e) => e.name))].sort();
  const exitOf = (name: string) => exits.find((e) => e.name === name)!;
  const grid = walk(town);
  const dm = (length: number) => {
    const d = new DriveMap(town, walk(town), content.vehicles);
    d.setNpcTiles(npcsOnMap(content, town).map((p) => ({ x: p.x, y: p.y })));
    d.setVanLength(length);
    return d;
  };

  it('has three roads out, each a route the road menu knows', () => {
    expect(names).toEqual(['East road', 'South road', 'West road']);
    for (const n of names) {
      expect(exitOf(n).props.to).toBe(ROUTE);
      const route = routeFor(world, town, exitOf(n));
      expect(route, n).toBeDefined();
      expect(routePlaces(world, maps, route!, FLAGS).filter((p) => !p.mods).length, n).toBe(route!.to.filter((t) => t !== 'mod-tracks').length);
    }
  });

  it('the West road goes to Forest Town and the East road to Mountain Town, each coming in on the road back', () => {
    for (const [name, to, back] of [['West road', 'area4-forest-town', 'area3-beach-town'], ['East road', 'area2-mountain-town', 'area3-beach-town']] as const) {
      const r = routeArrival(town, exitOf(name), world, maps, null, FLAGS);
      expect(typeof r, `${name}: ${String(r)}`).not.toBe('string');
      if (typeof r === 'string') continue;
      expect(r.map).toBe(to);
      expect(r.others).toEqual([]);
      const there = maps.get(to)!;
      expect(walk(there).isBlocked(r.tile.x, r.tile.y)).toBe(false);
      // And the neighbour's road back arrives in Beach Town by this same exit.
      const home = world.routes.find((x) => x.map === to && x.to[0] === back)!;
      expect(home, `${to} has a road straight back`).toBeDefined();
      const exitThere = there.objects.find((o) => o.type === 'exit' && o.name === home.exit)!;
      const r2 = routeArrival(there, exitThere, world, maps, null, FLAGS);
      if (typeof r2 === 'string') throw new Error(r2);
      expect(r2.map).toBe(TOWN);
      const e = objectTile(exitOf(name), town.tileSize);
      expect(Math.hypot(r2.tile.x - e.x, r2.tile.y - e.y), `${to} -> Beach Town lands by the ${name}`).toBeLessThanOrEqual(6);
      expect(grid.isBlocked(r2.tile.x, r2.tile.y)).toBe(false);
    }
  });

  it('the South road and every venue lane lead to the six venues and back into town', () => {
    const r = routeArrival(town, exitOf('South road'), world, maps, null, FLAGS);
    if (typeof r === 'string') throw new Error(r);
    expect([r.place, ...r.others].map((p) => p.map).sort()).toEqual(['mod-tracks', 'venue-motocross', 'venue-supercross', 'venue-enduro', 'venue-enduro-sprint', 'venue-endurocross', 'venue-no-turn'].sort());
    for (const v of ['venue-motocross', 'venue-supercross', 'venue-enduro', 'venue-enduro-sprint', 'venue-endurocross', 'venue-no-turn']) {
      const venue = maps.get(v)!;
      const lane = world.routes.find((x) => x.map === v && x.to.includes(TOWN))!;
      expect(lane, `${v} lists Beach Town`).toBeDefined();
      const exit = venue.objects.find((o) => o.type === 'exit' && o.name === lane.exit)!;
      const back = routeArrival(venue, exit, world, maps, TOWN, FLAGS);
      if (typeof back === 'string') throw new Error(back);
      expect(back.map).toBe(TOWN);
      expect(grid.isBlocked(back.tile.x, back.tile.y)).toBe(false);
    }
  });

  it('every way in arrives where the whole town and every road out can be walked to', () => {
    const arrivals: Tile[] = [];
    for (const r of world.routes.filter((x) => x.to.includes(TOWN))) {
      const m = maps.get(r.map)!;
      const exit = m.objects.find((o) => o.type === 'exit' && o.name === r.exit)!;
      const a = routeArrival(m, exit, world, maps, TOWN, FLAGS);
      if (typeof a === 'string') throw new Error(`${r.map} ${r.exit}: ${a}`);
      expect(a.map, `${r.map} ${r.exit}`).toBe(TOWN);
      arrivals.push(a.tile);
    }
    expect(arrivals.length).toBeGreaterThanOrEqual(5);
    for (const a of arrivals) {
      const seen = reachable(grid, a);
      for (const n of names) expect(reaches(seen, town, exitOf(n)), `from ${key(a)} to the ${n}`).toBe(true);
    }
  });

  it('the motor drives from every way in to every road out (the roads out need the motor; Boss, 2 Nov 2026)', () => {
    // Area 3's motor and the ones before it, and Jedrick's next ones that fit a town road.
    for (const design of content.vehicles.designs.filter((d) => d.length <= 3)) {
      const d = dm(design.length);
      for (const r of world.routes.filter((x) => x.to.includes(TOWN))) {
        const m = maps.get(r.map)!;
        const exit = m.objects.find((o) => o.type === 'exit' && o.name === r.exit)!;
        const a = routeArrival(m, exit, world, maps, TOWN, FLAGS);
        if (typeof a === 'string') throw new Error(a);
        const start = placeNear(d, a.tile, design.length, inwardHeading(town, a.tile));
        expect(start, `${design.id} parks on arrival from ${r.map} at ${key(a.tile)}`).not.toBeNull();
        for (const n of names) {
          const goal = objectTiles(exitOf(n), town.tileSize);
          const plan = planDrive(d, start!, design.length, goal);
          expect(plan, `${design.id}: from ${r.map} (${key(a.tile)}) to the ${n}`).not.toBeNull();
          const end = plan!.length ? plan![plan!.length - 1].to : start!;
          expect(footprint(end, design.length).some((t) => goal.some((g) => key(g) === key(t)))).toBe(true);
        }
      }
    }
  });
});
