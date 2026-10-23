import type { WorldData } from './career';
import { objectTile, objectTiles, type BakedMap, type MapObject, type Tile } from './mapTypes';

// Doors, exits and spawns between maps, all read from the maps' Data layers:
// - an area map door names an interior; stepping on it enters at the interior's spawn tile;
// - an interior exit returns to the area map whose door leads in, on that building's return tile;
// - an area exit names another area map and a spawn point there.

export interface Arrival {
  map: string;
  tile: Tile;
}

export type StepResult =
  | { kind: 'travel'; to: Arrival; via: MapObject }
  | { kind: 'worldMap'; via: MapObject }
  | { kind: 'blocked'; message: string; via: MapObject }
  | null;

/** int.home.rented_room → int-home-rented-room (the baked map's file id). */
export function interiorMapId(interiorId: string): string {
  return interiorId.replace(/[._]/g, '-');
}

const STEP_TYPES = new Set(['door', 'exit']);

/** The door or exit on a tile, if any. */
export function stepTriggerAt(map: BakedMap, t: Tile): MapObject | undefined {
  return map.objects.find((o) => STEP_TYPES.has(o.type) && objectTiles(o, map.tileSize).some((c) => c.x === t.x && c.y === t.y));
}

export function spawnTile(map: BakedMap, name?: string): Tile | null {
  const spawns = map.objects.filter((o) => o.type === 'spawn');
  const s = name ? spawns.find((o) => o.name === name) : spawns[0];
  return s ? objectTile(s, map.tileSize) : null;
}

export const WORLD_MAP = 'world_map';

export class Travel {
  constructor(
    private readonly maps: Map<string, BakedMap>,
    private readonly locks: WorldData['locks'] = [],
  ) {}

  /** The story lock on an object that is still shut, if any. */
  lockFor(map: BakedMap, via: MapObject, flags: Record<string, boolean>): WorldData['locks'][number] | null {
    return this.locks.find((l) => l.map === map.id && l.object === via.name && !flags[l.flag]) ?? null;
  }

  /** Where stepping onto a door or exit leads, or why it can't be used yet. */
  resolve(map: BakedMap, via: MapObject, flags: Record<string, boolean> = {}): StepResult {
    const p = via.props;
    const lock = this.lockFor(map, via, flags);
    if (lock) return { kind: 'blocked', message: lock.message, via };
    // A map lock opens with a story lock above or the flag named by its unlock property.
    const storyOpened = this.locks.some((l) => l.map === map.id && l.object === via.name);
    if (p.locked && !storyOpened && !(typeof p.unlock === 'string' && flags[p.unlock])) return { kind: 'blocked', message: `${via.name} is locked for now.`, via };
    if (p.to === WORLD_MAP) return { kind: 'worldMap', via };

    if (via.type === 'door' && typeof p.interior === 'string') {
      const target = this.maps.get(interiorMapId(p.interior));
      const tile = target && spawnTile(target);
      if (!target || !tile) return { kind: 'blocked', message: `${via.name} isn't open in this build.`, via };
      return { kind: 'travel', to: { map: target.id, tile }, via };
    }

    if (via.type === 'exit' && map.kind === 'interior') {
      const back = this.returnFor(String(p.interior));
      return back ? { kind: 'travel', to: back, via } : { kind: 'blocked', message: 'This door leads nowhere yet.', via };
    }

    if (via.type === 'exit' && typeof p.to === 'string') {
      const target = this.maps.get(p.to);
      const tile = target && spawnTile(target, typeof p.spawn === 'string' ? p.spawn : undefined);
      if (!target || !tile) return { kind: 'blocked', message: `The way to ${p.to.replace(/_/g, ' ')} opens in a later build.`, via };
      return { kind: 'travel', to: { map: target.id, tile }, via };
    }
    return null;
  }

  /** The return tile outside the building whose door leads into this interior. */
  returnFor(interiorId: string): Arrival | null {
    for (const m of this.maps.values()) {
      if (m.kind !== 'area') continue;
      const door = m.objects.find((o) => o.type === 'door' && o.props.interior === interiorId);
      if (!door) continue;
      const ret = m.objects.find((o) => o.type === 'return' && o.props.building === door.props.building);
      const tile = ret ? objectTile(ret, m.tileSize) : { ...objectTile(door, m.tileSize), y: objectTile(door, m.tileSize).y + 1 };
      return { map: m.id, tile };
    }
    return null;
  }
}
