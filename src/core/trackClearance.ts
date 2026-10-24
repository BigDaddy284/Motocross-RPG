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
  constructor(readonly pts: SurfacePoint[]) {
    for (const p of pts) {
      const k = key(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
      const list = this.cells.get(k);
      if (list) list.push(p);
      else this.cells.set(k, [p]);
    }
    this.cellsOut = Math.ceil((FAR + Math.max(0, ...pts.map((p) => p.reach))) / CELL);
  }

  /** How far outside the racing surface a point is, in grid units (negative on it), up to FAR. */
  offSurface(x: number, y: number): number {
    return this.nearest(x, y, (p) => p.hw);
  }

  /** How far outside the whole track a point is, raised lip and the slope down from it included, up to FAR (negative inside). */
  offTrack(x: number, y: number): number {
    return this.nearest(x, y, (p) => p.reach);
  }

  private nearest(x: number, y: number, size: (p: SurfacePoint) => number): number {
    let best = FAR;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let i = cx - this.cellsOut; i <= cx + this.cellsOut; i++) {
      for (let j = cy - this.cellsOut; j <= cy + this.cellsOut; j++) {
        for (const p of this.cells.get(key(i, j)) ?? []) {
          const d = Math.hypot(p.x - x, p.y - y) - size(p);
          if (d < best) best = d;
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
