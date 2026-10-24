import type { TrackDef } from './race';
import { footprints, SurfaceIndex, surfacePoints, toFootprint, type Footprint } from './trackClearance';
import type { TrackPartsData } from './trackParts';
import { startHeadingAt } from './trackGeom';
import { CAM_AZ, LIP_AT, LIP_H, TrackSurface } from './trackSurface';

// Where the start official stands with the 30-second board. From the moment the race screen opens
// they wait at A, beside the start straight near the gate; when the five-second hold begins they
// raise the board and walk to B, further up the straight where the riders and the camera see the
// board (the spot used before this walk was added), and lower it there as the gate is about to
// drop. A, B and the whole walk between them are clear of the track, its lip and the scenery, with
// room for the official and the board turned any way.

/** How big the official is drawn, against the size they were first built (the board too). */
export const OFFICIAL_SCALE = 0.9;
/** Room kept between any part of the official or their board and the track's lip slope or any scenery, in grid units. */
export const OFFICIAL_MARGIN = 0.15;
/** How long the walk from A to B takes: from the start of the hold to one second before the drop. */
export const WALK_FROM = -5;
export const WALK_TO = -1;

/**
 * The official's shape seen from above, as circles in their own frame (x across, z the way they
 * face), at full size: their body and arms, and the board, which is 1.8 × 1.35 and turns every way
 * (raised and lowered, flipped face to back, upright and sideways), held from 0.12 to 0.42 in
 * front, so it sweeps a circle of radius 0.9 about any of those points.
 */
const SHAPE = [
  { x: 0, z: 0, r: 0.32 },
  { x: 0, z: 0.12, r: 0.9 },
  { x: 0, z: 0.27, r: 0.9 },
  { x: 0, z: 0.42, r: 0.9 },
];

export interface OfficialSpot {
  x: number;
  y: number;
}

export interface OfficialPlan {
  a: OfficialSpot;
  b: OfficialSpot;
  /** Which way the official faces (a three.js turn about the vertical, radians), all the way. */
  facing: number;
  /** The least room between any part of the official or board and the track's lip slope, and scenery, at A, B and anywhere on the walk. */
  room: { track: number; scenery: number };
}

/** Which way the official faces at a spot where the start straight heads `ang`: mostly to the camera, a touch back to the riders. */
export function officialFacing(ang: number): number {
  const toRiders = Math.atan2(-Math.cos(ang), -Math.sin(ang));
  let turn = (CAM_AZ * Math.PI) / 180 - toRiders;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return toRiders + turn * 0.85;
}

/** The official's shape at a spot and facing, as circles on the grid, at OFFICIAL_SCALE. */
export function officialCircles(x: number, y: number, facing: number): { x: number; y: number; r: number }[] {
  // three.js turns local (x, z) by facing about the vertical to (x cos + z sin, -x sin + z cos).
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  return SHAPE.map((p) => {
    const lx = p.x * OFFICIAL_SCALE;
    const lz = p.z * OFFICIAL_SCALE;
    return { x: x + lx * c + lz * sn, y: y - lx * sn + lz * c, r: p.r * OFFICIAL_SCALE };
  });
}

/** Room around a point: from the nearest track (lip and its slope included) and the nearest scenery, each up to upTo. */
export function roomAt(pts: SurfaceIndex, items: Footprint[], x: number, y: number, upTo = 4): { track: number; scenery: number } {
  let scenery = Infinity;
  for (const f of items) {
    // Skip anything plainly further off than upTo before measuring it properly.
    if (Math.hypot(f.x - x, f.y - y) - (f.w + f.d) / 2 > Math.min(upTo, scenery)) continue;
    scenery = Math.min(scenery, toFootprint(f, x, y));
  }
  return { track: pts.offTrack(x, y, upTo), scenery: Math.min(scenery, upTo) };
}

/** The least room between the official (every part, board turned any way) and the track's lip slope or scenery, standing at a spot. */
export function officialRoom(pts: SurfaceIndex, items: Footprint[], x: number, y: number, facing: number): { track: number; scenery: number } {
  let track = Infinity;
  let scenery = Infinity;
  for (const c of officialCircles(x, y, facing)) {
    const r = roomAt(pts, items, c.x, c.y, c.r + 1);
    track = Math.min(track, r.track - c.r);
    scenery = Math.min(scenery, r.scenery - c.r);
  }
  return { track, scenery };
}

/**
 * Plans the official's walk for a track with a start straight, or null for one without (practice
 * tracks). Throws if nowhere beside the straight is clear.
 */
export function officialPlan(track: TrackDef, parts: TrackPartsData): OfficialPlan | null {
  const s = new TrackSurface(track);
  const st = s.start;
  if (st.total <= 0) return null;
  // Only the bits of track and scenery anywhere near the start straight matter (and it's quicker).
  const box = st.pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const near = (x: number, y: number, r: number) => x > box.x0 - 12 - r && x < box.x1 + 12 + r && y > box.y0 - 12 - r && y < box.y1 + 12 + r;
  const pts = new SurfaceIndex(surfacePoints(track));
  const edge = s.startHw(0) * (LIP_AT - 1) + Math.max(0.35, LIP_H * 0.9);
  const items = footprints(parts, track).filter((f) => near(f.x, f.y, Math.hypot(f.w, f.d) / 2));
  const ok = (r: { track: number; scenery: number }) => r.track >= OFFICIAL_MARGIN && r.scenery >= OFFICIAL_MARGIN;
  const side = s.joinSide || 1;
  // Out from the start straight's lip slope, at u grid units from the gate, on one side.
  const spotAt = (u: number, sd: number, out: number) => {
    const p = s.startSpot(u, (sd * (s.startHw(u) + edge + out)) / s.startHw(u));
    return { x: p.x, y: p.z, ang: startHeadingAt(st, u) };
  };
  const walkRoom = (a: OfficialSpot, b: OfficialSpot, facing: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
    let track = Infinity;
    let scenery = Infinity;
    for (let i = 0; i <= n; i++) {
      const r = officialRoom(pts, items, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, facing);
      track = Math.min(track, r.track);
      scenery = Math.min(scenery, r.scenery);
    }
    return { track, scenery };
  };
  // B: about 8 grid units up the straight, on the side the lap comes in from if there's room,
  // otherwise the other side, as near the straight as fits. A: back towards the gate on the same
  // side, a walk of 3 to 6 units, facing the same way all along.
  let best: (OfficialPlan & { score: number }) | null = null;
  const us: number[] = [];
  for (let u = 4; u <= st.total - 1; u += 0.5) us.push(u);
  us.sort((a, b) => Math.abs(a - 8) - Math.abs(b - 8));
  for (const u of us) {
    if (best && Math.abs(u - 8) >= best.score) break;
    for (const sd of [side, -side]) {
      for (let out = 0; out <= 3; out += 0.25) {
        const b = spotAt(u, sd, out);
        const facing = officialFacing(b.ang);
        if (!ok(officialRoom(pts, items, b.x, b.y, facing))) continue;
        let found = false;
        for (const back of [4.5, 4, 5, 3.5, 5.5, 3, 6]) {
          for (let outA = Math.max(0, out - 1); outA <= out + 1.5 && !found; outA += 0.25) {
            const a = spotAt(Math.max(-1, u - back), sd, outA);
            if (!ok(officialRoom(pts, items, a.x, a.y, facing))) continue;
            const room = walkRoom(a, b, facing);
            if (!ok(room)) continue;
            const score = Math.abs(u - 8) + (sd === side ? 0 : 3) + out + Math.abs(back - 4.5) * 0.3 + Math.abs(outA - out) * 0.2;
            if (!best || score < best.score) best = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, facing, room, score };
            found = true;
          }
          if (found) break;
        }
        break;
      }
    }
  }
  if (!best) throw new Error(`${track.id}: no clear place beside the start straight for the start official`);
  return { a: best.a, b: best.b, facing: best.facing, room: best.room };
}
