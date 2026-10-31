import type { PlaceDef, RouteDef, WorldData } from './career';
import { objectTile, type BakedMap, type MapObject } from './mapTypes';
import type { VenueDef } from './raceDay';
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
export function routePlaces(world: WorldData, maps: Map<string, BakedMap>, route: RouteDef, flags: Record<string, boolean> = {}): PlaceDef[] {
  return route.to.flatMap((id) => {
    const place = world.places.find((p) => p.map === id);
    // A place with needs (an area not yet open) isn't on the road until its flag is set.
    if (place?.needs && !flags[place.needs]) return [];
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
      ways.push({ exit, side, route, places: route ? routePlaces(world, maps, route, flags) : [], shut });
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
export function routeArrival(map: BakedMap, exit: MapObject, world: WorldData, maps: Map<string, BakedMap>, pick: string | null, flags: Record<string, boolean> = {}): (Arrival & { place: PlaceDef; others: PlaceDef[] }) | string {
  const route = routeFor(world, map, exit);
  const places = route ? routePlaces(world, maps, route, flags) : [];
  const real = places.filter((p) => !p.mods);
  if (!real.length) return "This road doesn't go anywhere yet.";
  const place = real.find((p) => p.map === pick) ?? real[0];
  return { map: place.map, tile: spawnTile(maps.get(place.map)!, place.spawn!)!, place, others: places.filter((p) => p !== place) };
}

// ---- the road menu (Boss, 30 Oct 2026) ----
// Leaving by a route opens one menu: Tracks (by type, then the unlocked tracks of that type, and
// the unlocked championships), Areas (the places that aren't tracks), Mod Tracks and Not now.

/**
 * The track types on the road menu, in order, and the trackParts.json kinds each one lists. A
 * comingSoon type lists nothing and says Coming soon when picked (Boss, 30 Oct 2026).
 */
export const ROAD_TRACK_TYPES: { id: string; name: string; kinds: string[]; comingSoon?: boolean }[] = [
  { id: 'motocross', name: 'Motocross', kinds: ['outdoor'] },
  { id: 'supercross', name: 'Supercross', kinds: ['stadium'] },
  { id: 'enduro_loop', name: 'Enduro Loop', kinds: ['endurance'] },
  { id: 'enduro_sprint', name: 'Enduro Sprint', kinds: ['enduro_sprint'], comingSoon: true },
  { id: 'endurocross', name: 'EnduroCross', kinds: ['endurocross'], comingSoon: true },
  { id: 'no_turn', name: 'No-Turn Takedown', kinds: ['no_turn'], comingSoon: true },
];

/**
 * The venue map for each track type (one venue per track type, Boss, 30 Oct 2026): every track of
 * a type races at its type's venue. The last three are ready for later and not on any road yet.
 */
export const VENUE_MAPS: Record<string, string> = {
  motocross: 'venue-motocross',
  supercross: 'venue-supercross',
  enduro_loop: 'venue-enduro',
  enduro_sprint: 'venue-enduro-sprint',
  endurocross: 'venue-endurocross',
  no_turn: 'venue-no-turn',
};

/** The venue map a track of this kind (trackParts.json) races at, or undefined for a kind with no type. */
export function venueMapFor(kind: string): string | undefined {
  const type = ROAD_TRACK_TYPES.find((t) => t.kinds.includes(kind));
  return type && VENUE_MAPS[type.id];
}

/** A track on the road menu: the venue, on its type's venue map, arriving at that map's place. */
export interface RoadStop extends PlaceDef {
  /** The venue (tracks.json venues) to race at once there. */
  venue: string;
}

export interface RoadMenu {
  /** One per track type, in ROAD_TRACK_TYPES order, with its unlocked tracks. */
  tracks: { id: string; name: string; comingSoon: boolean; places: RoadStop[] }[];
  /** Places on the road that aren't a track: Home Town and the like. */
  areas: PlaceDef[];
  /** True when the road has the mod track list. */
  mods: boolean;
}

/**
 * Sorts a road's places into the road menu. A place is a venue map when a race venue (not a practice
 * loop) is on its map: each venue there is a track on the menu, listed under its type by the venue's
 * name once it is open (not locked, and its needs flag set), and left out until then. One venue map
 * holds every track of its type (Boss, 30 Oct 2026), so a place can list several tracks. `kindOf`
 * is the venue's track kind.
 */
export function roadMenu(
  places: PlaceDef[],
  venues: Pick<VenueDef, 'id' | 'name' | 'map' | 'needs' | 'locked' | 'practiceOnly' | 'track'>[],
  kindOf: (track: string) => string | undefined,
  flags: Record<string, boolean>,
): RoadMenu {
  const tracks = ROAD_TRACK_TYPES.map((t) => ({ id: t.id, name: t.name, comingSoon: !!t.comingSoon, places: [] as RoadStop[] }));
  const areas: PlaceDef[] = [];
  for (const p of places) {
    if (p.mods) continue;
    if (p.needs && !flags[p.needs]) continue;
    const here = venues.filter((v) => v.map === p.map && !v.practiceOnly);
    if (!here.length) {
      areas.push(p);
      continue;
    }
    for (const venue of here) {
      if (venue.locked || (venue.needs && !flags[venue.needs])) continue;
      const kind = (venue.track && kindOf(venue.track)) || 'outdoor';
      const i = ROAD_TRACK_TYPES.findIndex((t) => t.kinds.includes(kind));
      if (i >= 0 && !tracks[i].comingSoon) tracks[i].places.push({ ...p, name: venue.name, venue: venue.id });
    }
  }
  return { tracks, areas, mods: places.some((p) => p.mods) };
}

/**
 * The venue the rider is at on a map that holds several (one venue map per track type, Boss,
 * 30 Oct 2026): the one picked at the road (career.venue) when it is open and on this map, else
 * the first one open to the rider, else the map's first, so a shut venue still says why it is shut.
 */
export function venueHere<V extends Pick<VenueDef, 'id' | 'map' | 'needs' | 'locked' | 'practiceOnly'>>(venues: V[], map: string, flags: Record<string, boolean>, picked?: string): V | undefined {
  const here = venues.filter((v) => v.map === map && !v.practiceOnly);
  const open = here.filter((v) => !v.locked && (!v.needs || flags[v.needs]));
  return open.find((v) => v.id === picked) ?? open[0] ?? here[0];
}
