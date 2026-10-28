import type { PlaceDef, RouteDef, WorldData } from './career';
import { objectTile, type BakedMap, type MapObject } from './mapTypes';
import { ROUTE, spawnTile, type Arrival, type Travel } from './travel';

// The roads out of an area: each of its exits, where it goes (another map, or a route with a
// choice of places from data/world.json, picked at the road), and whether it is open yet.
// (Boss, 28 Oct 2026: the route marshals who gave directions are gone from the game.)

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

/**
 * The places a route really leads to: listed in places, on a map that exists, with the spawn to
 * arrive on; or the mod track list, which is raced from the road without going anywhere.
 */
export function routePlaces(world: WorldData, maps: Map<string, BakedMap>, route: RouteDef): PlaceDef[] {
  return route.to.flatMap((id) => {
    const place = world.places.find((p) => p.map === id);
    if (place?.mods) return [place];
    const m = place && maps.get(place.map);
    return place?.spawn && m && spawnTile(m, place.spawn) && place.map !== route.map ? [place] : [];
  });
}

export function routeFor(world: WorldData, map: BakedMap, exit: MapObject): RouteDef | undefined {
  return world.routes.find((r) => r.map === map.id && r.exit === exit.name);
}

/** Every way out of a map, one per exit name. */
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

/**
 * Where a route exit takes you: the place picked (`pick`), or otherwise the first place it goes.
 * A string is why it can't take you anywhere.
 * The mod track list is never where a road takes you by itself: it is picked (WorldScene.routeTo).
 */
export function routeArrival(map: BakedMap, exit: MapObject, world: WorldData, maps: Map<string, BakedMap>, pick: string | null): (Arrival & { place: PlaceDef; others: PlaceDef[] }) | string {
  const route = routeFor(world, map, exit);
  const places = route ? routePlaces(world, maps, route) : [];
  const real = places.filter((p) => !p.mods);
  if (!real.length) return "This road doesn't go anywhere yet.";
  const place = real.find((p) => p.map === pick) ?? real[0];
  return { map: place.map, tile: spawnTile(maps.get(place.map)!, place.spawn!)!, place, others: places.filter((p) => p !== place) };
}
