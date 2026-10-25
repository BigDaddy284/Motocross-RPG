import type { PlaceDef, RouteDef, WorldData } from './career';
import type { NpcDef } from './content';
import { objectTile, type BakedMap, type MapObject } from './mapTypes';
import { ROUTE, spawnTile, type Arrival, type Travel } from './travel';

// Route marshals: NPCs (npcs.json, guide: true) who stand by an area's way out and give
// directions instead of a world map screen. What they say is read from the map they stand on:
// each of its exits, where it goes (another map, or a route with a choice of places from
// data/world.json), and whether it is open yet. So they can't promise a road that isn't there,
// and a new area only needs its exits, its routes and a marshal in npcs.json.
// Picking a place only chooses which way to go: you still walk (or drive) out by the exit.

export interface Way {
  exit: MapObject;
  /** Which edge of the map it is on, for directions. */
  side: string;
  /** The map it goes straight to, for a plain exit. */
  to?: { map: string; title: string };
  /** The route and its places, for an exit with a choice of places. */
  route?: RouteDef;
  places: PlaceDef[];
  /** Why it can't be used yet, if it can't. */
  shut: string | null;
}

/** Which edge of the map an exit is on. */
export function sideOf(map: BakedMap, o: MapObject): string {
  const t = objectTile(o, map.tileSize);
  if (t.x <= 1) return 'west';
  if (t.x >= map.width - 2) return 'east';
  if (t.y >= map.height - 2) return 'south';
  if (t.y <= 1) return 'north';
  return 'over there';
}

/** The places a route really leads to: listed in places, on a map that exists, with the spawn to arrive on. */
export function routePlaces(world: WorldData, maps: Map<string, BakedMap>, route: RouteDef): PlaceDef[] {
  return route.to.flatMap((id) => {
    const place = world.places.find((p) => p.map === id);
    const m = place && maps.get(place.map);
    return place && m && spawnTile(m, place.spawn) && place.map !== route.map ? [place] : [];
  });
}

export function routeFor(world: WorldData, map: BakedMap, exit: MapObject): RouteDef | undefined {
  return world.routes.find((r) => r.map === map.id && r.exit === exit.name);
}

/** Every way out of a map, one per exit name, as a marshal would describe it. */
export function waysOut(map: BakedMap, world: WorldData, maps: Map<string, BakedMap>, travel: Travel, flags: Record<string, boolean>): Way[] {
  const ways: Way[] = [];
  for (const exit of map.objects) {
    if (exit.type !== 'exit' || ways.some((w) => w.exit.name === exit.name)) continue;
    const shut = travel.shut(map, exit, flags);
    const side = sideOf(map, exit);
    if (exit.props.to === ROUTE) {
      const route = routeFor(world, map, exit);
      ways.push({ exit, side, route, places: route ? routePlaces(world, maps, route) : [], shut });
    } else if (typeof exit.props.to === 'string') {
      const m = maps.get(exit.props.to);
      ways.push({ exit, side, to: m ? { map: m.id, title: m.title } : undefined, places: [], shut });
    }
  }
  return ways;
}

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** What a marshal says: each way out, where it goes, and anything shut. */
export function directions(ways: Way[]): string[] {
  const lines: string[] = [];
  for (const w of ways) {
    const Side = w.side === 'over there' ? 'Over there' : `Out to the ${w.side}`;
    if (w.to) lines.push(`${Side}, that road takes you to ${w.to.title}.${w.shut ? ` It's shut for you just now: ${w.shut}` : ''}`);
    else if (w.route && w.places.length) {
      lines.push(`${Side}, ${w.route.road} goes to ${list(w.places.map((p) => p.name))}.${w.shut ? ` It's shut for you just now: ${w.shut}` : ''}`);
      if (!w.shut) for (const p of w.places) lines.push(`${p.name}: ${p.note}`);
    } else lines.push(`${Side}, that road doesn't go anywhere yet.`);
  }
  if (!lines.length) lines.push("There's no road out of here.");
  return lines;
}

/** The marshals on a map. */
export function guidesOn(npcs: NpcDef[], map: BakedMap): NpcDef[] {
  return npcs.filter((n) => n.guide && n.map === map.id);
}

/**
 * Where a route exit takes you: the place picked with the marshal, or the only place it goes.
 * A string is why it can't take you anywhere (ask the marshal which way first).
 */
export function routeArrival(map: BakedMap, exit: MapObject, world: WorldData, maps: Map<string, BakedMap>, pick: string | null, guide: string | null): Arrival | string {
  const route = routeFor(world, map, exit);
  const places = route ? routePlaces(world, maps, route) : [];
  if (!places.length) return "This road doesn't go anywhere yet.";
  const place = places.find((p) => p.map === pick) ?? (places.length === 1 ? places[0] : null);
  if (!place) return `${guide ?? 'The route marshal'}: which way are you heading? Have a word with me first, I'll point you right.`;
  return { map: place.map, tile: spawnTile(maps.get(place.map)!, place.spawn)! };
}
