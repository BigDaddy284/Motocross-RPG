import { Grid } from './grid';
import { objectTiles, type BakedMap, type Facing, type Tile } from './mapTypes';
import { FOLD, flipPose, sweep } from './vanPath';
import { validate, type ContentError, type Schema } from './validate';

// The player's van on the area maps (Boss, 24 Oct 2026): one van at a time, driven on the same
// 64 px tile grid the rider walks on.
//
// A van is a rigid footprint `length` tiles long and one tile wide, given by its front tile and
// heading. It drives forward and back along its heading, turns where the swung footprint fits,
// and makes U-turns into the next lane. It can only use drivable ground (roads, pavements, car
// parks, gravel and concrete), never blocked tiles, edge walls, doors or tiles with an NPC on them.
// When the rider gets out, the van stays exactly where it is: its map, front tile and heading are
// the save's `van` record, so it is still there after walking to other maps or reloading.

export type Heading = 'north' | 'south' | 'east' | 'west';
export const HEADINGS: Heading[] = ['north', 'east', 'south', 'west'];

export const STEP: Record<Heading, Tile> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

export const OPPOSITE: Record<Heading, Heading> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const RIGHT_OF: Record<Heading, Heading> = { north: 'east', east: 'south', south: 'west', west: 'north' };
export const FACING_OF: Record<Heading, Facing> = { north: 'up', south: 'down', east: 'right', west: 'left' };
export const HEADING_OF: Record<Facing, Heading> = { up: 'north', down: 'south', right: 'east', left: 'west' };

/** Where the player's van is: the save's record, and the only vehicle state the game keeps. */
export interface VanState {
  /** Design id in vehicles.json, such as van-2. */
  design: string;
  map: string;
  /** The front tile of the footprint. */
  x: number;
  y: number;
  heading: Heading;
}

export interface VanPose {
  x: number;
  y: number;
  heading: Heading;
}

export interface VanDesign {
  id: string;
  name: string;
  /** The reference image this design is drawn from. */
  reference: string;
  /** Footprint in tiles along the heading (always one tile wide). */
  length: number;
  lengthM: number;
  /** Milliseconds per tile when driving. */
  stepMs: number;
}

/** One heading of a van sheet: cell rects in the sheet, the ground anchor and the driver window in the cell. */
export interface VanSheetView {
  closed: [number, number, number, number];
  open: [number, number, number, number];
  anchor: [number, number];
  driver?: [number, number, number, number] | null;
}

/** A van's area-map sheet, as listed in the manifest. */
export interface VanSheet {
  image: string;
  views: Record<Heading, VanSheetView>;
  /** The closed van at evenly spaced headings for turning (frame i faces i × 360 / frames.length degrees anticlockwise from east). */
  turn?: { image: string; frames: { cell: [number, number, number, number]; anchor: [number, number]; driver: [number, number, number, number] | null }[] };
}

export interface VehiclesData {
  note?: string;
  /** Ground tiles a van can use, matched against the ground image paths. */
  drivable: string[];
  /** The van the opening chain sells, and where it is parked when bought. */
  starter: { design: string; map: string; x: number; y: number; heading: Heading };
  designs: VanDesign[];
}

const ID = /^[a-z0-9_.-]+$/;
const HEADING_ENUM = { type: 'string', enum: HEADINGS } as const;

export const VEHICLES_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    drivable: { type: 'array', minItems: 1, items: { type: 'string', nonEmpty: true } },
    starter: {
      type: 'object',
      fields: { design: { type: 'string', pattern: ID }, map: { type: 'string', pattern: ID }, x: { type: 'number', integer: true }, y: { type: 'number', integer: true }, heading: HEADING_ENUM },
    },
    designs: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          reference: { type: 'string', nonEmpty: true },
          length: { type: 'number', integer: true, min: 1 },
          lengthM: { type: 'number', min: 1 },
          stepMs: { type: 'number', integer: true, min: 30 },
        },
      },
    },
  },
};

/** Tiles of a footprint, front first. */
export function footprint(p: VanPose, length: number): Tile[] {
  const d = STEP[p.heading];
  const out: Tile[] = [];
  for (let i = 0; i < length; i++) out.push({ x: p.x - d.x * i, y: p.y - d.y * i });
  return out;
}

/** Centre of a footprint in tile units (tile corners are whole numbers). */
export function centre(p: VanPose, length: number): { x: number; y: number } {
  // Halfway from the cab tile to the back tile, (length - 1) tiles behind it.
  const d = STEP[p.heading];
  return { x: p.x + 0.5 - (d.x * (length - 1)) / 2, y: p.y + 0.5 - (d.y * (length - 1)) / 2 };
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Where vans may go on one map. Built from the map's ground art, its blocked tiles and edge walls
 * (after story changes such as cleared roadworks), and its doors. NPC tiles are set separately,
 * as they are the tiles the van must not drive into but the rider can walk through.
 */
export class DriveMap {
  readonly width: number;
  readonly height: number;
  private readonly ok: boolean[];
  private readonly npcs = new Set<string>();

  constructor(
    readonly map: BakedMap,
    readonly grid: Grid,
    drivable: string[],
  ) {
    this.width = map.width;
    this.height = map.height;
    const base = map.ground[0]?.cells ?? [];
    const doors = new Set<string>();
    for (const o of map.objects) if (o.type === 'door') for (const t of objectTiles(o, map.tileSize)) doors.add(key(t.x, t.y));
    this.ok = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const img = map.images[base[y * map.width + x]] ?? '';
        const surface = drivable.some((d) => img.includes(d));
        this.ok.push(surface && !grid.isBlocked(x, y) && !doors.has(key(x, y)));
      }
    }
  }

  setNpcTiles(tiles: Tile[]): void {
    this.npcs.clear();
    for (const t of tiles) this.npcs.add(key(t.x, t.y));
  }

  isNpc(x: number, y: number): boolean {
    return this.npcs.has(key(x, y));
  }

  /** Ground a van can stand on, ignoring NPCs. */
  isDrivable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.ok[y * this.width + x];
  }

  /** Somewhere no part of a van may pass over, even cutting a corner: buildings, walls, solid objects, people, off the map. */
  isSolid(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= this.width || y >= this.height || this.grid.isBlocked(x, y) || (this.npcs.size > 0 && this.npcs.has(key(x, y)));
  }

  private readonly sweeps = new Map<string, boolean>();

  /** True when the van's body can swing through a turn without passing over anything solid (remembered per map). */
  sweepClear(from: VanPose, m: Move, length: number): boolean {
    if (m.kind === 'forward' || m.kind === 'reverse') return true;
    const k = `${length}:${from.x},${from.y},${from.heading}>${m.to.x},${m.to.y},${m.to.heading}:${[...this.npcs].join(';')}`;
    let ok = this.sweeps.get(k);
    if (ok === undefined) {
      ok = sweep(from, m.kind, m.to, length, (t) => this.isSolid(t.x, t.y)).clear;
      this.sweeps.set(k, ok);
    }
    return ok;
  }

  /** Free for the van right now: drivable and no NPC standing there. */
  isFree(x: number, y: number): boolean {
    return this.isDrivable(x, y) && !this.npcs.has(key(x, y));
  }

  /** True when the whole footprint stands on free ground with no wall running through it. */
  fits(p: VanPose, length: number): boolean {
    const t = footprint(p, length);
    if (!t.every((c) => this.isFree(c.x, c.y))) return false;
    for (let i = 1; i < t.length; i++) if (!this.grid.edgeOpen(t[i - 1], t[i])) return false;
    return true;
  }
}

export type Move = { kind: 'forward' | 'reverse' | 'turn' | 'uturn' | 'backturn'; to: VanPose };

/** One tile ahead along the heading. */
export function forward(dm: DriveMap, p: VanPose): Move | null {
  const d = STEP[p.heading];
  const to = { x: p.x + d.x, y: p.y + d.y, heading: p.heading };
  if (!dm.isFree(to.x, to.y) || !dm.grid.edgeOpen(p, to)) return null;
  return { kind: 'forward', to };
}

/** One tile back, the rear leading. */
export function reverse(dm: DriveMap, p: VanPose, length: number): Move | null {
  const d = STEP[p.heading];
  const rear = footprint(p, length).at(-1)!;
  const behind = { x: rear.x - d.x, y: rear.y - d.y };
  if (!dm.isFree(behind.x, behind.y) || !dm.grid.edgeOpen(rear, behind)) return null;
  return { kind: 'reverse', to: { x: p.x - d.x, y: p.y - d.y, heading: p.heading } };
}

/**
 * Every place the van can swing to when turning onto a new heading: footprints on the new
 * heading that take in the tile beside the cab (or the cab tile itself, or the tile diagonally
 * ahead), so the van pulls round into the side road, lane or bay it is turning into.
 */
export function turnOptions(dm: DriveMap, p: VanPose, length: number, to: Heading, limit = Infinity): Move[] {
  // Only swings the whole body can make without passing over anything solid.
  const out: Move[] = [];
  for (const m of turnCandidates(dm, p, length, to)) {
    if (out.length >= limit) break;
    if (dm.sweepClear(p, m, length)) out.push(m);
  }
  return out;
}

/** The places turnOptions tries, best first, before checking the swing clears everything solid. */
function turnCandidates(dm: DriveMap, p: VanPose, length: number, to: Heading): Move[] {
  if (to === p.heading) return [];
  const d = STEP[p.heading];
  const kind: Move['kind'] = to === OPPOSITE[p.heading] ? 'uturn' : 'turn';
  const nd = STEP[to];
  const found: { m: Move; pull: number; shift: number }[] = [];
  const seen = new Set<string>();
  const c0 = centre(p, length);
  const add = (pose: VanPose, pull: number) => {
    const k = key(pose.x, pose.y);
    if (seen.has(k) || !dm.fits(pose, length)) return;
    seen.add(k);
    const c = centre(pose, length);
    found.push({ m: { kind, to: pose }, pull, shift: Math.hypot(c.x - c0.x, c.y - c0.y) });
  };
  if (kind === 'turn') {
    const s = STEP[to];
    for (const seed of [{ x: p.x + s.x, y: p.y + s.y }, { x: p.x + d.x + s.x, y: p.y + d.y + s.y }, { x: p.x, y: p.y }]) {
      if (!dm.isFree(seed.x, seed.y) || !dm.grid.edgeOpen(p, seed)) continue;
      // How far short the van stops of pulling its whole length round: the back follows the cab
      // (vanPath.ts), so a swing that ends with the tail at the corner comes to rest straight.
      for (let i = 0; i < length; i++) add({ x: seed.x + nd.x * i, y: seed.y + nd.y * i, heading: to }, length - 1 - i);
    }
  } else {
    // Round into a lane far enough over for the van not to fold up (vanPath.ts), or the one after,
    // the cab coming back past the turn by up to a van's length: a whole length back, and the van
    // comes out of the turn straight. A long van needs a wide road; otherwise it backs up.
    const lane0 = uturnLanes(length);
    for (const side of [RIGHT_OF[p.heading], OPPOSITE[RIGHT_OF[p.heading]]]) {
      const s = STEP[side];
      if (!dm.isFree(p.x + s.x, p.y + s.y) || !dm.grid.edgeOpen(p, { x: p.x + s.x, y: p.y + s.y })) continue;
      for (const lane of [lane0, lane0 + 1]) {
        for (let j = 1 - length; j <= 1; j++) add({ x: p.x + s.x * lane + d.x * j, y: p.y + s.y * lane + d.y * j, heading: to }, Math.abs(j + length - 1) + (lane - lane0) * 0.5);
      }
    }
  }
  found.sort((a, b) => a.pull - b.pull || a.shift - b.shift);
  return found.map((f) => f.m);
}

/**
 * The fewest lanes over a van can turn round in. The cab drives half a circle as wide as the
 * lanes; the back follows it, and the two ends mustn't come closer than FOLD of the van's length.
 */
export function uturnLanes(length: number): number {
  for (let lane = 1; ; lane++) {
    const r = lane / 2;
    const closest = length - 1 > Math.PI * r ? lane : 2 * r * Math.sin((length - 1) / (2 * r));
    if (closest >= (length - 1) * FOLD) return lane;
  }
}

/**
 * Backing round a corner onto the side `to` (the first half of a three-point turn): the back
 * leads into the side road, so the van ends up facing out of it. It is the flipped van
 * (vanPath.ts) turning forward, so it has the same swings and the same checks.
 */
export function backTurnOptions(dm: DriveMap, p: VanPose, length: number, to: Heading, limit = Infinity): Move[] {
  if (to === p.heading || to === OPPOSITE[p.heading]) return [];
  return turnOptions(dm, flipPose(p, length), length, to, limit).map((m) => ({ kind: 'backturn', to: flipPose(m.to, length) }));
}

function backTurnCandidates(dm: DriveMap, p: VanPose, length: number, to: Heading): Move[] {
  if (to === p.heading || to === OPPOSITE[p.heading]) return [];
  return turnCandidates(dm, flipPose(p, length), length, to).map((m) => ({ kind: 'backturn', to: flipPose(m.to, length) }));
}

/** Whether a move's swing clears everything solid (straight moves always do). */
function swingClear(dm: DriveMap, from: VanPose, m: Move, length: number): boolean {
  if (m.kind === 'backturn') return dm.sweepClear(flipPose(from, length), { kind: 'turn', to: flipPose(m.to, length) }, length);
  return dm.sweepClear(from, m, length);
}

/** The smoothest turn: the swing that moves the van least. */
export function turn(dm: DriveMap, p: VanPose, length: number, to: Heading): Move | null {
  return turnOptions(dm, p, length, to, 1)[0] ?? null;
}

/**
 * What a held direction key does: ahead drives forward, a side turns, and back makes a U-turn
 * into the next lane, or reverses when there is no room to turn round.
 */
export function steer(dm: DriveMap, p: VanPose, length: number, want: Heading): Move | null {
  if (want === p.heading) return forward(dm, p);
  if (want === OPPOSITE[p.heading]) return turn(dm, p, length, want) ?? reverse(dm, p, length);
  return turn(dm, p, length, want);
}

/**
 * Drives to a clicked or tapped tile (or any of several, such as the tiles of an exit): the
 * cheapest sequence of moves that brings the footprint onto one, or next to it when it is not
 * drivable. Null when there is no way.
 */
export function planDrive(dm: DriveMap, start: VanPose, length: number, goal: Tile | Tile[], maxNodes = 60000): Move[] | null {
  const goals = (Array.isArray(goal) ? goal : [goal]).map((g) => ({ ...g, reach: dm.isDrivable(g.x, g.y) ? 0 : 1 }));
  const near = (p: VanPose) => {
    // The footprint is a line of tiles back from the cab: the nearest of them to each goal.
    const d = STEP[p.heading];
    let n = Infinity;
    for (const g of goals) {
      const i = Math.max(0, Math.min(length - 1, -((g.x - p.x) * d.x + (g.y - p.y) * d.y)));
      n = Math.min(n, Math.max(0, Math.abs(p.x - d.x * i - g.x) + Math.abs(p.y - d.y * i - g.y) - g.reach));
    }
    return n;
  };
  const touches = (p: VanPose) => near(p) === 0;
  if (touches(start)) return [];
  const id = (p: VanPose) => `${p.x},${p.y},${p.heading}`;
  // Searched nearest-first (A*): cost so far plus the footprint's distance from the goal (a tile
  // nearer costs about a tile's drive). Small whole costs, so a bucket queue keeps it fast. A
  // turn's swing is only checked when the search gets to it, as most are never needed.
  interface Step {
    p: VanPose;
    cost: number;
    from: Step | null;
    move: Move | null;
  }
  const done = new Set<string>();
  /** The cheapest straight drive found to each pose: a turn costing more can't help. */
  const best = new Map<string, number>([[id(start), 0]]);
  const buckets: Step[][] = [];
  buckets[near(start)] = [{ p: start, cost: 0, from: null, move: null }];
  let nodes = 0;
  for (let f = 0; f < buckets.length; f++) {
    const list = buckets[f];
    if (!list) continue;
    for (let li = 0; li < list.length; li++) {
      const st = list[li];
      const { p, cost: c } = st;
      const k0 = id(p);
      if (done.has(k0)) continue;
      if (st.move && st.from && !swingClear(dm, st.from.p, st.move, length)) continue;
      done.add(k0);
      if (touches(p)) {
        const moves: Move[] = [];
        for (let s: Step | null = st; s?.move; s = s.from) moves.push(s.move);
        return moves.reverse();
      }
      if (++nodes > maxNodes) return null;
      const straight: [Move | null, number][] = [[forward(dm, p), 1], [reverse(dm, p, length), 3]];
      const swings: [Move, number][] = [];
      // Turns cost well over a tile's drive, so a route lines up early and doesn't wiggle at the end.
      const swing = (m: Move) => Math.round(Math.hypot(centre(m.to, length).x - centre(p, length).x, centre(m.to, length).y - centre(p, length).y));
      for (const h of HEADINGS) for (const m of turnCandidates(dm, p, length, h)) swings.push([m, 6 + swing(m)]);
      // Backing round a corner costs a little more, so it's for turning round where a U-turn won't fit.
      for (const h of HEADINGS) for (const m of backTurnCandidates(dm, p, length, h)) swings.push([m, 8 + swing(m)]);
      for (const [m, cost] of [...straight, ...swings]) {
        if (!m) continue;
        const k = id(m.to);
        const nc = c + cost;
        if (done.has(k) || nc >= (best.get(k) ?? Infinity)) continue;
        if (m.kind === 'forward' || m.kind === 'reverse') best.set(k, nc);
        (buckets[Math.max(f, nc + near(m.to))] ??= []).push({ p: m.to, cost: nc, from: st, move: m });
      }
    }
  }
  return null;
}

/**
 * Where to put the van on arriving at a spawn point: the free footprint nearest the spawn,
 * preferring the given heading (pointing into the map), then any other heading.
 */
export function placeNear(dm: DriveMap, spawn: Tile, length: number, prefer: Heading, maxRadius = 12, avoid: (t: Tile) => boolean = () => false): VanPose | null {
  const order = [prefer, ...HEADINGS.filter((h) => h !== prefer)];
  for (let r = 0; r <= maxRadius; r++) {
    let found: VanPose | null = null;
    let bestScore = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        order.forEach((h, hi) => {
          // The footprint should cover the spawn tile's ring, with the front leading away from it.
          const s = STEP[h];
          for (let i = 0; i < length; i++) {
            const pose = { x: spawn.x + dx + s.x * i, y: spawn.y + dy + s.y * i, heading: h };
            if (!dm.fits(pose, length) || footprint(pose, length).some(avoid)) continue;
            const score = hi * 100 + i;
            if (score < bestScore) {
              bestScore = score;
              found = pose;
            }
          }
        });
      }
    }
    if (found) return found;
  }
  return null;
}

/** The heading that points into the map from the nearest edge, for vans arriving at a spawn. */
export function inwardHeading(map: BakedMap, t: Tile): Heading {
  const d = { west: t.x, east: map.width - 1 - t.x, north: t.y, south: map.height - 1 - t.y };
  const edge = (Object.keys(d) as Heading[]).reduce((a, b) => (d[b] < d[a] ? b : a));
  return OPPOSITE[edge];
}

/**
 * Where the rider steps out: a free tile beside the van, the driver's side (right, as in the UK)
 * first, then the passenger side, then in front and behind.
 */
export function exitTile(grid: Grid, p: VanPose, length: number, blocked: (t: Tile) => boolean = () => false): Tile | null {
  const tiles = footprint(p, length);
  const right = STEP[RIGHT_OF[p.heading]];
  const d = STEP[p.heading];
  const options: [Tile, Tile][] = [];
  for (const side of [right, { x: -right.x, y: -right.y }]) for (const t of tiles) options.push([t, { x: t.x + side.x, y: t.y + side.y }]);
  options.push([tiles[0], { x: tiles[0].x + d.x, y: tiles[0].y + d.y }]);
  const rear = tiles.at(-1)!;
  options.push([rear, { x: rear.x - d.x, y: rear.y - d.y }]);
  for (const [from, to] of options) {
    if (grid.isFree(to.x, to.y) && grid.edgeOpen(from, to) && !blocked(to)) return to;
  }
  return null;
}

/** True when a tile is next to (or under) the van, for getting in. */
export function besideVan(p: VanPose, length: number, t: Tile): boolean {
  return footprint(p, length).some((c) => Math.abs(c.x - t.x) + Math.abs(c.y - t.y) <= 1);
}

/**
 * Gives the save its van once the story has sold it (the van_owned flag): the starter design at
 * the starter spot. `devDesign` (the ?van= address option) swaps the design for playtests.
 * Returns the van, or null when the rider has none.
 */
export function ensureVan(save: { flags: Record<string, boolean>; van: VanState | null }, data: VehiclesData, devDesign: string | null = null): VanState | null {
  const { design, map, x, y, heading } = data.starter;
  const dev = devDesign && data.designs.some((d) => d.id === devDesign) ? devDesign : null;
  if (!save.van && (save.flags.van_owned || dev)) save.van = { design, map, x, y, heading };
  if (save.van && dev) save.van.design = dev;
  return save.van;
}

/** The nearest tile to `t` a walker can stand on (itself if free), searching outwards. */
export function nearestFree(grid: Grid, t: Tile, ok: (t: Tile) => boolean = () => true, maxRadius = 8): Tile | null {
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const c = { x: t.x + dx, y: t.y + dy };
        if (grid.isFree(c.x, c.y) && ok(c)) return c;
      }
    }
  }
  return null;
}

/** Checks vehicles.json against the maps: designs, the starter van and its parking spot. */
export function checkVehicles(file: string, raw: unknown, maps: Map<string, BakedMap>): { data: VehiclesData | null; errors: ContentError[] } {
  const errors = validate(file, raw, VEHICLES_SCHEMA);
  if (errors.length) return { data: null, errors };
  const data = raw as VehiclesData;
  const ids = new Set<string>();
  data.designs.forEach((d, i) => {
    if (ids.has(d.id)) errors.push({ file, field: `designs[${i}].id`, message: `"${d.id}" is used twice` });
    ids.add(d.id);
  });
  const s = data.starter;
  const design = data.designs.find((d) => d.id === s.design);
  if (!design) errors.push({ file, field: 'starter.design', message: `no design "${s.design}"` });
  const m = maps.get(s.map);
  if (!m) errors.push({ file, field: 'starter.map', message: `no map "${s.map}"` });
  else if (design) {
    const dm = new DriveMap(m, Grid.fromMap(m), data.drivable);
    if (!dm.fits(s, design.length)) errors.push({ file, field: 'starter', message: `the ${design.name} doesn't fit at ${s.x},${s.y} heading ${s.heading} on ${s.map}` });
  }
  return { data, errors };
}
