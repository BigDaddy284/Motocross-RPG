import type { SceneryItem, TrackDef } from './race';
import type { TrackPartsData } from './trackParts';
import { pointAt, START_PAD, startGeom, startHalfWidth, startPointAt } from './trackGeom';
import { LIP_AT, LIP_H, TrackSurface } from './trackSurface';

// How far things are from where bikes go: the racing surface (the lap, the start straight and the
// pad behind its gate), the raised lip along its edges and the slope down from it, and the scenery
// around. Shared by the track checks (content and the editor) and the race view, which places the
// start official with it.

/**
 * A point on the middle of the track: the half width of its racing surface there, and how far
 * out the track reaches in all, with its raised lip and the slope down from it (wider by a jump,
 * which stands taller), in grid units.
 */
export interface SurfacePoint {
  x: number;
  y: number;
  hw: number;
  reach: number;
}

/** The middle of the track every quarter grid unit: the lap, then the start straight and its pad. */
export function surfacePoints(track: TrackDef): SurfacePoint[] {
  const s = new TrackSurface(track);
  const g = s.g;
  const hw = s.hw;
  const n = Math.max(200, Math.ceil(g.total / 0.25));
  const pts: SurfacePoint[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const p = pointAt(g, f);
    pts.push({ x: p.x, y: p.y, hw, reach: hw * (LIP_AT + Math.max(s.skirt(f, -1), s.skirt(f, 1))) });
  }
  const start = startGeom(track, g);
  if (start.total > 0) {
    for (let u = -START_PAD; u <= start.total; u += 0.25) {
      const p = startPointAt(start, u);
      const shw = startHalfWidth(start, u, hw);
      pts.push({ x: p.x, y: p.y, hw: shw, reach: shw * LIP_AT + Math.max(0.35, LIP_H * 0.9) });
    }
  }
  return pts;
}

/** How far out SurfaceIndex looks, in grid units: anything further from the track counts as this far. */
export const FAR = 4;

/** Track points bucketed by grid cell, so a lookup only looks at the ones nearby. */
export class SurfaceIndex {
  private readonly cells = new Map<number, SurfacePoint[]>();
  private readonly cellsOut: number;
  private readonly maxSize: number;
  constructor(readonly pts: SurfacePoint[]) {
    for (const p of pts) {
      const k = key(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
      const list = this.cells.get(k);
      if (list) list.push(p);
      else this.cells.set(k, [p]);
    }
    this.maxSize = Math.max(0, ...pts.map((p) => p.reach));
    this.cellsOut = Math.ceil((FAR + this.maxSize) / CELL) + 1;
  }

  /** How far outside the racing surface a point is, in grid units (negative on it), up to upTo (at most FAR). */
  offSurface(x: number, y: number, upTo = FAR): number {
    return this.nearest(x, y, (p) => p.hw, upTo);
  }

  /** How far outside the whole track a point is, raised lip and the slope down from it included (negative inside), up to upTo (at most FAR). */
  offTrack(x: number, y: number, upTo = FAR): number {
    return this.nearest(x, y, (p) => p.reach, upTo);
  }

  /** The nearest distance, or upTo (at most FAR) when nothing is nearer: a caller that only needs to know "at least this far" says so and saves the looking. */
  private nearest(x: number, y: number, size: (p: SurfacePoint) => number, upTo: number): number {
    let best = Math.min(upTo, FAR);
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    // Ring by ring outwards, until no point further out could be nearer.
    for (let r = 0; r <= this.cellsOut; r++) {
      if ((r - 1) * CELL - this.maxSize > best) break;
      for (let i = cx - r; i <= cx + r; i++) {
        for (let j = cy - r; j <= cy + r; j++) {
          if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== r) continue;
          for (const p of this.cells.get(key(i, j)) ?? []) {
            const d = Math.hypot(p.x - x, p.y - y) - size(p);
            if (d < best) best = d;
          }
        }
      }
    }
    return best;
  }
}

const CELL = 2;
const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

/** A scenery item's footprint: centre, size and turn (radians, the editor's clockwise degrees). */
export interface Footprint {
  i: number;
  type: string;
  x: number;
  y: number;
  w: number;
  d: number;
  a: number;
}

export function footprints(parts: TrackPartsData, track: TrackDef): Footprint[] {
  return (track.scenery ?? []).map((it: SceneryItem, i) => {
    const def = parts.scenery.find((s) => s.id === it.type);
    return { i, type: it.type, x: it.x, y: it.y, w: it.w ?? def?.w ?? 2, d: it.h ?? def?.h ?? 2, a: ((it.rot ?? 0) * Math.PI) / 180 };
  });
}

/** Distance from a point to a footprint's turned rectangle (0 inside it). */
export function toFootprint(f: Footprint, x: number, y: number): number {
  const dx = x - f.x;
  const dy = y - f.y;
  const u = dx * Math.cos(f.a) + dy * Math.sin(f.a);
  const v = -dx * Math.sin(f.a) + dy * Math.cos(f.a);
  const ou = Math.max(0, Math.abs(u) - f.w / 2);
  const ov = Math.max(0, Math.abs(v) - f.d / 2);
  return Math.hypot(ou, ov);
}

/** The corners of a footprint, and points along its edges every `step` grid units, for testing against the track. */
export function footprintOutline(f: Footprint, step = 0.25): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const nu = Math.max(1, Math.ceil(f.w / step));
  const nv = Math.max(1, Math.ceil(f.d / step));
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      if (i > 0 && i < nu && j > 0 && j < nv) continue;
      const u = (i / nu - 0.5) * f.w;
      const v = (j / nv - 0.5) * f.d;
      out.push({ x: f.x + u * Math.cos(f.a) - v * Math.sin(f.a), y: f.y + u * Math.sin(f.a) + v * Math.cos(f.a) });
    }
  }
  // The middle too, for an item bigger than the track is wide.
  out.push({ x: f.x, y: f.y });
  return out;
}

/** Half a bike's width, in grid units: a rider on the very edge of the racing surface reaches this far past it. */
export const BIKE_HALF_WIDTH = 0.25;

/** A problem with a scenery item: an error the game refuses, or a warning to look at. */
export interface SceneryIssue {
  /** The item's index in the track's scenery. */
  i: number;
  level: 'error' | 'warning';
  message: string;
}

/** Solid things that look wrong standing inside each other (a crowd in front of a stand, or tape across a post, is fine). */
const SOLID = new Set(['hay_bale', 'tyre_wall', 'tuff_block', 'van', 'pit_tent', 'stand', 'light_tower', 'skip', 'barrels', 'tyre_stack', 'hedge', 'banner', 'sponsor_board']);

/**
 * What of an item stands at riding height, as the race view builds it: a tree's trunk (its canopy
 * is overhead), a floodlight's or marshal post's pole, a banner's or tape's thin line, a finish
 * arch's two posts, nothing of a start gate (built to be ridden over); everything else, its whole
 * footprint.
 */
export function colliders(f: Footprint): Footprint[] {
  const along = (off: number, w: number, d: number) => ({ ...f, x: f.x + off * Math.cos(f.a), y: f.y + off * Math.sin(f.a), w, d });
  switch (f.type) {
    case 'start_gate':
    // The start official (startOfficial.ts) is a person who walks off; their own checks keep them clear.
    case 'start_official':
      return [];
    case 'finish_arch':
      return [along(-(f.w / 2 - 0.25), 0.5, 0.5), along(f.w / 2 - 0.25, 0.5, 0.5)];
    case 'tree':
      return [along(0, 0.35, 0.35)];
    case 'light_tower':
      return [along(0, 0.25, 0.25)];
    case 'flag_post':
      return [along(0, 0.1, 0.1)];
    case 'banner':
    case 'sponsor_board':
      return [{ ...f, d: 0.1 }];
    case 'tape':
      return [{ ...f, d: 0.06 }];
    case 'tuff_block':
      return [{ ...f, d: f.d * 0.8 }];
    case 'bush':
      return [{ ...f, w: Math.min(f.w, f.d) * 0.9, d: Math.min(f.w, f.d) * 0.9 }];
    case 'hedge':
      return [{ ...f, d: f.d * 0.6 }];
    default:
      return [f];
  }
}

/** True when two turned rectangles overlap (separating axis test). */
export function footprintsOverlap(p: Footprint, q: Footprint): boolean {
  const corners = (f: Footprint) =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([u, v]) => ({ x: f.x + (u * f.w * Math.cos(f.a)) / 2 - (v * f.d * Math.sin(f.a)) / 2, y: f.y + (u * f.w * Math.sin(f.a)) / 2 + (v * f.d * Math.cos(f.a)) / 2 }));
  const a = corners(p);
  const b = corners(q);
  for (const ang of [p.a, p.a + Math.PI / 2, q.a, q.a + Math.PI / 2]) {
    const ax = Math.cos(ang);
    const ay = Math.sin(ang);
    const span = (pts: { x: number; y: number }[]) => {
      const d = pts.map((c) => c.x * ax + c.y * ay);
      return [Math.min(...d), Math.max(...d)];
    };
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
  }
  return true;
}

/**
 * Scenery checks for a track, with each item's rotated collider (what of it stands at riding
 * height; see colliders):
 * - error: on the racing surface (lap, start straight or pad), where riders would ride through it.
 *   Start gates are built to be ridden over, and a finish arch only stands on its two posts.
 * - warning: within half a bike's width of the racing surface's edge, where a rider right on the
 *   edge would touch it (tuff blocks lining a supercross track do this on purpose).
 * - warning: two solid items standing inside each other.
 * Nothing here changes the track.
 */
export function sceneryIssues(parts: TrackPartsData, track: TrackDef, index = new SurfaceIndex(surfacePoints(track))): SceneryIssue[] {
  const out: SceneryIssue[] = [];
  const items = footprints(parts, track);
  const name = (f: Footprint) => `the ${(parts.scenery.find((s) => s.id === f.type)?.name ?? f.type).toLowerCase()} at ${f.x}, ${f.y}`;
  for (const f of items) {
    if (!parts.scenery.some((s) => s.id === f.type) || f.type === 'start_official') continue;
    // How far inside the racing surface's edge the item comes, at its deepest (0 or less: clear of it).
    let into = -Infinity;
    for (const c of colliders(f)) for (const p of footprintOutline(c)) into = Math.max(into, -index.offSurface(p.x, p.y));
    if (into > 1e-6) out.push({ i: f.i, level: 'error', message: `${name(f)} is on the racing surface, where riders would ride through it` });
    else if (into > -BIKE_HALF_WIDTH) out.push({ i: f.i, level: 'warning', message: `${name(f)} is ${(-into).toFixed(2)} from the edge of the racing surface, so a rider right on the edge would touch it` });
  }
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (SOLID.has(items[a].type) && SOLID.has(items[b].type) && colliders(items[a]).some((p) => colliders(items[b]).some((q) => footprintsOverlap(p, q)))) {
        out.push({ i: items[b].i, level: 'warning', message: `${name(items[b])} stands inside ${name(items[a])}` });
      }
    }
  }
  return out;
}
