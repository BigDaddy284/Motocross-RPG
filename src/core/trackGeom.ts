import type { TrackDef } from './race';

// The shape of a lap on the track grid (no graphics), shared by the rider AI and the race view.
// f runs from 0 at the start line to 1 back at it; sections sit on the lap by their share of the
// lap length, as on the race screen.

export interface Point {
  x: number;
  y: number;
}

export interface LapGeom {
  pts: Point[];
  cum: number[];
  /** Length of the drawn lap in grid units. */
  total: number;
}

export function lapGeom(path: [number, number][]): LapGeom {
  const pts = path.map(([x, y]) => ({ x, y }));
  pts.push({ ...pts[0] });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, total: cum[cum.length - 1] || 1 };
}

/** A point on the lap and the riding direction there, in radians. */
export function pointAt(g: LapGeom, f: number): Point & { ang: number } {
  const d = (((f % 1) + 1) % 1) * g.total;
  let lo = 1;
  let hi = g.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const a = g.pts[lo - 1];
  const b = g.pts[lo];
  const t = (d - g.cum[lo - 1]) / Math.max(1e-9, g.cum[lo] - g.cum[lo - 1]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

/**
 * The riding direction with the corners rounded off over `span` grid units, so a bike turns
 * smoothly through a corner point instead of snapping round it.
 */
export function headingAt(g: LapGeom, f: number, span = 1.5): number {
  const df = span / g.total;
  const a = pointAt(g, f - df);
  const b = pointAt(g, f + df);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Section start fractions of the lap, plus 1 at the end. */
export function sectionBounds(track: TrackDef): number[] {
  const len = track.sections.reduce((a, s) => a + s.length, 0) || 1;
  const out = [0];
  let d = 0;
  for (const s of track.sections) {
    d += s.length;
    out.push(d / len);
  }
  return out;
}

export function lapMetres(track: TrackDef): number {
  return track.sections.reduce((a, s) => a + s.length, 0);
}

/**
 * Which way each section turns: 1 right, -1 left, 0 roughly straight (under 25 degrees), as the
 * rider sees it on the screen (y runs down).
 */
export function sectionTurns(track: TrackDef, g: LapGeom): number[] {
  const b = sectionBounds(track);
  return track.sections.map((_, i) => {
    const steps = 24;
    let turn = 0;
    let prev = headingAt(g, b[i]);
    for (let k = 1; k <= steps; k++) {
      const h = headingAt(g, b[i] + ((b[i + 1] - b[i]) * k) / steps);
      let dh = h - prev;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      turn += dh;
      prev = h;
    }
    return Math.abs(turn) < (25 * Math.PI) / 180 ? 0 : Math.sign(turn);
  });
}
