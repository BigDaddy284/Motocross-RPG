import type { Bike, BikesData, CareerState } from './career';
import type { BakedMap } from './mapTypes';
import type { Travel } from './travel';
import type { ContentError, Schema } from './validate';

// The world map (Boss, 28 Oct 2026): Boss's layout of the areas, how they join up and what is in
// each, with one marker: the rider's biggest bike, standing in the middle of the zone they are in.
// It shows where you are; travel is still by the roads out (route marshals). The art is drawn by
// tools/art/world-map.py; data/world.json worldMap says which maps make up each zone and where its
// marker goes. Pure rules with no graphics.

export interface WorldMapZone {
  id: string;
  name: string;
  /** The area maps in this zone. A building's inside is in the zone of the map its door is on. */
  maps: string[];
  /** Where the bike stands, in the map image's pixels. */
  at: [number, number];
  /** The map image with this zone's own picture left off, for the bike to stand in its place. */
  image?: string;
}

export interface WorldMapData {
  image: string;
  /** The image's size in pixels, so the screen can lay it out before it loads. */
  size: [number, number];
  /** Folder of the map bikes, one image per class and brand: <class>-<brand>.png. */
  bikes: string;
  zones: WorldMapZone[];
}

/** The zone a map is in: an area map's own, or for a building's inside, the zone of the map its door is on. */
export function zoneFor(wm: WorldMapData, maps: Map<string, BakedMap>, travel: Travel, mapId: string): WorldMapZone | null {
  const direct = wm.zones.find((z) => z.maps.includes(mapId));
  if (direct) return direct;
  const map = maps.get(mapId);
  if (map?.kind !== 'interior') return null;
  const exit = map.objects.find((o) => o.type === 'exit' && typeof o.props.interior === 'string');
  const back = exit && travel.returnFor(String(exit.props.interior));
  return back ? (wm.zones.find((z) => z.maps.includes(back.map)) ?? null) : null;
}

/** The rider's biggest bike, by class: the one shown on the map. */
export function biggestBike(bikes: BikesData, career: CareerState): Bike {
  // One bike for now; a shed of them later (Spec 15.2) adds to this list.
  const owned = [career.bike];
  const size = (b: Bike) => bikes.classes.find((c) => c.id === b.class)?.ceiling ?? 0;
  return owned.reduce((a, b) => (size(b) > size(a) ? b : a));
}

/** The texture key for a world map image. */
export const worldMapTexture = (image: string) => `wmap:${image}`;

/** The map bike's image for a bike. */
export const bikeImage = (wm: WorldMapData, bike: Bike, bikes?: BikesData) => `${wm.bikes}/${bikes?.classes.find((c) => c.id === bike.class)?.mapImage ?? bike.class}-${bike.brand}.png`;

const ID = /^[a-z0-9_.-]+$/;
const PX = { type: 'number', integer: true, min: 0 } as const;

export const WORLD_MAP_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    image: { type: 'string', nonEmpty: true },
    size: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', integer: true, min: 1 } },
    bikes: { type: 'string', nonEmpty: true },
    zones: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        optional: ['image'],
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          maps: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } },
          at: { type: 'array', minItems: 2, maxItems: 2, items: PX },
          image: { type: 'string', nonEmpty: true },
        },
      },
    },
  },
};

/** Every zone map exists and is an area map in one zone only, and every marker is on the image. */
export function checkWorldMap(file: string, wm: WorldMapData, maps: Map<string, BakedMap>): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const seen = new Map<string, string>();
  wm.zones.forEach((z, i) => {
    const at = (f: string) => `worldMap.zones[${i}].${f}`;
    if (wm.zones.findIndex((o) => o.id === z.id) !== i) err(at('id'), `"${z.id}" is used twice`);
    z.maps.forEach((m, j) => {
      if (!maps.has(m)) err(at(`maps[${j}]`), `no map "${m}"`);
      else if (maps.get(m)!.kind !== 'area') err(at(`maps[${j}]`), `"${m}" is a building's inside: it goes in the zone of the map its door is on`);
      if (seen.has(m)) err(at(`maps[${j}]`), `"${m}" is in zone "${seen.get(m)}" too`);
      seen.set(m, z.id);
    });
    if (z.at[0] > wm.size[0] || z.at[1] > wm.size[1]) err(at('at'), 'is off the map image');
  });
  return errors;
}
