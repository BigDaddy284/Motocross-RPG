import { objectTile, type BakedMap, type MapObject } from './mapTypes';
import { interiorMapId } from './travel';
import type { ContentError, Schema } from './validate';

// The building library (public/data/buildings.json): every building that can stand on an area
// map, as data. A building is its footprint (the tiles it takes up, any size or shape), the
// pictures it is drawn with, and its doors into interiors and the tiles you come back out on.
// The map editor places them (tools/map-editor.html, Buildings) by writing the same things the
// maps already hold: the sprites, a building object, door and return objects, and the blocked
// tiles. So the game's doors and transitions (travel.ts) work on them unchanged, and the checks
// here hold every building on every map to its library entry, so a map can't drift from it.

export interface BuildingPart {
  /** An image under public/assets. */
  sheet: string;
  /** [x, y, w, h] of the sheet, drawn at its own size. */
  crop: [number, number, number, number];
  /** The footprint tile its top-left is drawn on. */
  at: [number, number];
}

export interface BuildingDoor {
  tile: [number, number];
  interior: string;
  /** The interior's spawn to arrive on, when not its first. */
  spawn?: string;
}

export interface BuildingReturn {
  tile: [number, number];
  /** Only for an interior exit that asks for this return by name. */
  name?: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  zone?: string;
  npc?: string;
  /** Still being made: kept, but can't be placed, and only its shape is checked. */
  draft?: boolean;
  parts: BuildingPart[];
  /** One string a row: # solid, . walkable part of the building, space not part of it. */
  footprint: string[];
  doors: BuildingDoor[];
  returns: BuildingReturn[];
}

export interface BuildingsData {
  buildings: BuildingDef[];
}

const ID = { type: 'string', pattern: /^[a-z0-9_.-]+$/ } as const;
const XY = { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', integer: true, min: 0 } } as const;

export const BUILDINGS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    buildings: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['zone', 'npc', 'draft'],
        fields: {
          id: ID,
          name: { type: 'string', nonEmpty: true },
          zone: { type: 'string' },
          npc: { type: 'string' },
          draft: { type: 'boolean' },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              fields: {
                sheet: { type: 'string', pattern: /^(art|custom)\/[A-Za-z0-9_./+-]+\.png$/ },
                crop: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', integer: true, min: 0 } },
                at: XY,
              },
            },
          },
          footprint: { type: 'array', minItems: 1, items: { type: 'string' } },
          // A draft's door can be waiting for its interior (empty); a ready building's can't.
          doors: { type: 'array', items: { type: 'object', optional: ['spawn'], fields: { tile: XY, interior: { type: 'string', pattern: /^[a-z0-9_.-]*$/ }, spawn: { type: 'string', nonEmpty: true } } } },
          returns: { type: 'array', items: { type: 'object', optional: ['name'], fields: { tile: XY, name: { type: 'string', nonEmpty: true } } } },
        },
      },
    },
  },
};

const FILE = 'data/buildings.json';
const mapFile = (id: string) => `assets/maps/${id}.json`;

/** The footprint's width and height in tiles. */
export function footprintSize(b: Pick<BuildingDef, 'footprint'>): { w: number; h: number } {
  return { w: Math.max(0, ...b.footprint.map((r) => r.length)), h: b.footprint.length };
}

/** The footprint's tiles that belong to the building: solid ones and walkable ones. */
export function footprintCells(b: Pick<BuildingDef, 'footprint'>): { x: number; y: number; solid: boolean }[] {
  const out: { x: number; y: number; solid: boolean }[] = [];
  b.footprint.forEach((row, y) => [...row].forEach((c, x) => c !== ' ' && out.push({ x, y, solid: c === '#' })));
  return out;
}

const cellAt = (b: BuildingDef, x: number, y: number) => b.footprint[y]?.[x] ?? ' ';

/** Checks the library on its own, then every building on every area map against it. */
export function checkBuildings(lib: BuildingsData, maps: Map<string, BakedMap>): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, field: string, message: string) => errors.push({ file, field, message });
  const byId = new Map<string, BuildingDef>();
  const interiorOwner = new Map<string, string>();

  lib.buildings.forEach((b, i) => {
    const at = (f: string) => `buildings[${i}].${f}`;
    if (byId.has(b.id)) err(FILE, at('id'), `"${b.id}" is used twice`);
    byId.set(b.id, b);
    const { w } = footprintSize(b);
    b.footprint.forEach((row, y) => {
      if (row.length !== w) err(FILE, at(`footprint[${y}]`), `is ${row.length} tiles wide; every row must be ${w}`);
      const bad = [...row].find((c) => !'#. '.includes(c));
      if (bad) err(FILE, at(`footprint[${y}]`), `"${bad}" isn't a footprint tile (# solid, . walkable, space for none)`);
    });
    if (!footprintCells(b).length) err(FILE, at('footprint'), 'has no tiles');
    b.parts.forEach((p, j) => {
      if (p.crop[2] <= 0 || p.crop[3] <= 0) err(FILE, at(`parts[${j}].crop`), 'is empty');
    });
    b.doors.forEach((d, j) => {
      const c = cellAt(b, d.tile[0], d.tile[1]);
      if (c !== '.') err(FILE, at(`doors[${j}].tile`), `${d.tile.join(',')} is ${c === '#' ? 'a solid tile' : 'outside the footprint'}; a door goes on a walkable (.) tile of the building`);
    });
    b.returns.forEach((r, j) => {
      if (cellAt(b, r.tile[0], r.tile[1]) === '#') err(FILE, at(`returns[${j}].tile`), `${r.tile.join(',')} is a solid tile of the building; the rider would come out inside it`);
    });
    if (b.draft) return;
    // Ready to use: every door's interior is there, leads back out here, and is this building's alone.
    if (b.doors.length && !b.returns.length) err(FILE, at('returns'), 'a building with doors needs a return tile to come back out on');
    for (const [j, d] of b.doors.entries()) {
      if (!d.interior) {
        err(FILE, at(`doors[${j}].interior`), "doesn't lead anywhere yet; pick the interior it opens into");
        continue;
      }
      const owner = interiorOwner.get(d.interior);
      if (owner && owner !== b.id) err(FILE, at(`doors[${j}].interior`), `${d.interior} is already ${owner}'s interior; give this building its own`);
      interiorOwner.set(d.interior, b.id);
      const inside = maps.get(interiorMapId(d.interior));
      if (!inside || inside.kind !== 'interior') {
        err(FILE, at(`doors[${j}].interior`), `no interior map ${interiorMapId(d.interior)} for ${d.interior}`);
        continue;
      }
      const spawns = inside.objects.filter((o) => o.type === 'spawn');
      if (d.spawn ? !spawns.some((o) => o.name === d.spawn) : !spawns.length) err(FILE, at(`doors[${j}]${d.spawn ? '.spawn' : '.interior'}`), `${inside.id} has no ${d.spawn ? `spawn "${d.spawn}"` : 'spawn'} to arrive on`);
      const exits = inside.objects.filter((o) => o.type === 'exit');
      if (!exits.length) err(FILE, at(`doors[${j}].interior`), `${inside.id} has no exit to leave by`);
      for (const x of exits) {
        if (x.props.interior !== d.interior) err(mapFile(inside.id), `exit "${x.name}"`, `leads back out of ${String(x.props.interior)}, not ${d.interior}`);
        const name = typeof x.props.return === 'string' ? x.props.return : undefined;
        if (!b.returns.some((r) => (name ? r.name === name : !r.name))) err(FILE, at('returns'), `${inside.id}'s exit "${x.name}" comes out on ${name ? `the return named "${name}"` : 'an unnamed return'}, which ${b.name} doesn't have`);
      }
    }
  });

  // Every building on every area map, against its entry.
  const placedInterior = new Map<string, string>();
  for (const m of maps.values()) {
    if (m.kind !== 'area') continue;
    const file = mapFile(m.id);
    const T = m.tileSize;
    const taken = new Map<string, string>();
    for (const o of m.objects) {
      if (o.type !== 'building') continue;
      const id = String(o.props.blueprint ?? '');
      const b = byId.get(id);
      const t0 = objectTile(o, T);
      const where = `building "${o.name}" at ${t0.x},${t0.y}`;
      if (!b) {
        err(file, where, `no building "${id}" in ${FILE}`);
        continue;
      }
      if (b.draft) err(file, where, `${b.name} is unfinished (draft) in ${FILE}; mark it ready before placing it`);
      const { w, h } = footprintSize(b);
      if (o.w !== w * T || o.h !== h * T) err(file, where, `is ${o.w / T}×${o.h / T} tiles but ${b.id}'s footprint is ${w}×${h}`);
      for (const c of footprintCells(b)) {
        const x = t0.x + c.x;
        const y = t0.y + c.y;
        const other = taken.get(`${x},${y}`);
        if (other) err(file, where, `overlaps ${other} at ${x},${y}`);
        taken.set(`${x},${y}`, o.name);
        const blocked = m.blocked[y]?.[x] === '#';
        if (blocked !== c.solid) err(file, where, `tile ${x},${y} is ${blocked ? 'blocked' : 'free'} on the map but ${c.solid ? 'solid' : 'walkable'} in ${b.id}'s footprint`);
      }
      // Its doors and returns, where the entry puts them.
      const mine = (type: string) => m.objects.filter((d) => d.type === type && d.props.building === id && near(d, o, w, h, T));
      const doors = mine('door');
      const want = b.doors.map((d) => `${t0.x + d.tile[0]},${t0.y + d.tile[1]} ${d.interior}${d.spawn ? ` ${d.spawn}` : ''}`).sort();
      const have = doors.map((d) => `${tileKey(d, T)} ${String(d.props.interior)}${d.props.spawn ? ` ${String(d.props.spawn)}` : ''}`).sort();
      if (want.join('|') !== have.join('|')) err(file, where, `has doors [${have.join('; ')}] but ${b.id} has [${want.join('; ')}]`);
      const rWant = b.returns.map((r) => `${t0.x + r.tile[0]},${t0.y + r.tile[1]}${r.name ? ` ${r.name}` : ''}`).sort();
      const rHave = mine('return').map((r) => `${tileKey(r, T)}${r.name !== o.name ? ` ${r.name}` : ''}`).sort();
      if (rWant.join('|') !== rHave.join('|')) err(file, where, `has returns [${rHave.join('; ')}] but ${b.id} has [${rWant.join('; ')}]`);
      for (const d of b.doors) {
        const prev = placedInterior.get(d.interior);
        const here = `${m.id} ${t0.x},${t0.y}`;
        if (prev && prev !== here) err(file, where, `leads into ${d.interior}, which the building at ${prev} already leads into`);
        placedInterior.set(d.interior, here);
      }
    }
  }
  return errors;
}

function tileKey(o: MapObject, T: number): string {
  const t = objectTile(o, T);
  return `${t.x},${t.y}`;
}

/** A door or return belongs to the building it is in or just below. */
function near(d: MapObject, b: MapObject, w: number, h: number, T: number): boolean {
  const t = objectTile(d, T);
  const t0 = objectTile(b, T);
  return t.x >= t0.x - 1 && t.x <= t0.x + w && t.y >= t0.y - 1 && t.y <= t0.y + h;
}
