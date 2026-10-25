import type { Tile } from './mapTypes';

// The line a van's cab drives along, and where its body is on that line (Boss, 25 Oct 2026:
// "driving needs more fluid movement"). The grid decides where a van may go and where it rests;
// this draws the trip between grid poses. The cab follows a smooth line through the tiles, and
// the back of the van follows the same line a van's length behind, like the trailer of a lorry,
// so a long van cuts across the inside of a corner instead of spinning on the spot.
//
// Positions are in tile units, with tile corners on whole numbers; the cab point is the middle of
// the front tile. Angles are screen angles: degrees anticlockwise from east, with north up.

type Heading = 'north' | 'south' | 'east' | 'west';
export interface Pose {
  x: number;
  y: number;
  heading: Heading;
}
export type MoveKind = 'forward' | 'reverse' | 'turn' | 'uturn' | 'backturn';

export interface Pt {
  x: number;
  y: number;
}

/** Where the middle of the van is, the way it points, and how far apart its ends are drawn. */
export interface Place extends Pt {
  angle: number;
}

const STEP: Record<Heading, Pt> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
const DIR_ANGLE: Record<Heading, number> = { east: 0, north: 90, west: 180, south: 270 };

export const headingAngle = (h: Heading) => DIR_ANGLE[h];

/** The screen angle of a direction in tile space. */
export function angleOf(dx: number, dy: number): number {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** The smallest difference between two angles, in degrees. */
export function angleGap(a: number, b: number): number {
  return Math.abs(((((b - a) % 360) + 540) % 360) - 180);
}

export function lerpAngle(a: number, b: number, f: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * f) % 360) + 360) % 360;
}

export const cabOf = (p: Pose): Pt => ({ x: p.x + 0.5, y: p.y + 0.5 });

const OPPOSITE: Record<Heading, Heading> = { north: 'south', south: 'north', east: 'west', west: 'east' };

/**
 * The same footprint seen from its back: the back tile, facing the other way. Backing up is
 * driving the flipped van forward, the back leading and the cab following it round.
 */
export function flipPose<P extends Pose>(p: P, length: number): P {
  const d = STEP[p.heading];
  return { ...p, x: p.x - d.x * (length - 1), y: p.y - d.y * (length - 1), heading: OPPOSITE[p.heading] };
}

/** The length of a line of points. */
export function lineLength(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

/** The middle of a pose's footprint and its angle: where a van at rest is drawn. */
export function restPlace(p: Pose, length: number): Place {
  const d = STEP[p.heading];
  const c = cabOf(p);
  const back = (length - 1) / 2;
  return { x: c.x - d.x * back, y: c.y - d.y * back, angle: DIR_ANGLE[p.heading] };
}

/** How sharply the cab's line bends: the handle length of a turn's curve, in tiles. */
const TURN_HANDLE = 1.4;

/**
 * The cab's line for one move, from the cab of `from` to the cab of `to`, as points every tenth of
 * a tile or so. A turn leaves along the old heading and arrives along the new one. Backing up
 * isn't drawn here: it is the flipped van (flipPose) driving forward.
 */
export function cabLine(from: Pose, kind: MoveKind, to: Pose): Pt[] {
  const a = cabOf(from);
  const b = cabOf(to);
  if (kind === 'reverse' || kind === 'backturn') throw new Error(`${kind} is drawn as the flipped van driving forward`);
  if (kind === 'forward') return [a, b];
  if (kind === 'uturn') return uturnLine(from, a, b);
  const ha = STEP[from.heading];
  const hb = STEP[to.heading];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const k = Math.min(TURN_HANDLE, Math.max(0.5, chord * 0.5));
  const p1 = { x: a.x + ha.x * k, y: a.y + ha.y * k };
  const p2 = { x: b.x - hb.x * k, y: b.y - hb.y * k };
  const n = Math.max(12, Math.ceil(chord * 12));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
    });
  }
  return out;
}

/**
 * A U-turn: on to the turn (where the cab ends, if that's further on), half a circle across into
 * the new lane, and straight back along it to the end, so the back of the van comes round behind.
 */
function uturnLine(from: Pose, a: Pt, b: Pt): Pt[] {
  const d = STEP[from.heading];
  const along = (b.x - a.x) * d.x + (b.y - a.y) * d.y;
  const t = Math.max(0, along);
  const m0 = { x: a.x + d.x * t, y: a.y + d.y * t };
  const m1 = { x: b.x + d.x * (t - along), y: b.y + d.y * (t - along) };
  // Half a circle from one cubic: handles 4/3 of the radius long.
  const k = (Math.hypot(m1.x - m0.x, m1.y - m0.y) / 2) * (4 / 3);
  const p1 = { x: m0.x + d.x * k, y: m0.y + d.y * k };
  const p2 = { x: m1.x + d.x * k, y: m1.y + d.y * k };
  const out: Pt[] = [a];
  for (let i = 0; i <= 16; i++) {
    const f = i / 16;
    const u = 1 - f;
    out.push({
      x: u * u * u * m0.x + 3 * u * u * f * p1.x + 3 * u * f * f * p2.x + f * f * f * m1.x,
      y: u * u * u * m0.y + 3 * u * u * f * p1.y + 3 * u * f * f * p2.y + f * f * f * m1.y,
    });
  }
  out.push(b);
  return out;
}

/** A line of points with the distance along it, which the cab and the back of the van run on. */
export class Track {
  private pts: Pt[] = [];
  private cum: number[] = [];
  /** Distance along the line of its first point (the line forgets what's far behind the van). */
  private base = 0;

  /** Distance along the line of the cab when the van was put on it: the end of the line then. */
  readonly start: number;

  /** A straight line behind a van at rest, long enough for its back end; or a given line, the cab at its end. */
  constructor(
    p: Pose | Pt[],
    private readonly length: number,
  ) {
    if (Array.isArray(p)) {
      this.pts = [p[0]];
      this.cum = [0];
      this.extendFrom(0, p.slice(1));
    } else {
      const c = cabOf(p);
      const d = STEP[p.heading];
      const back = length + 2;
      this.pts = [{ x: c.x - d.x * back, y: c.y - d.y * back }, c];
      this.cum = [0, back];
    }
    this.start = this.end;
  }

  /**
   * The same van turned end for end, with its cab at `s` on this line: a line whose end is the
   * back of the van now, running back past the cab. Its van is drawn pointing the other way.
   */
  flipped(s: number): Track {
    const pts: Pt[] = [];
    const behind = s - (this.length - 1);
    for (let u = s + this.length + 2; u > behind; u -= 0.1) pts.push(this.at(u));
    pts.push(this.at(behind));
    return new Track(pts, this.length);
  }

  get end(): number {
    return this.base + this.cum[this.cum.length - 1];
  }

  /** Drops the line beyond distance `s` and carries on from there through `pts`. */
  extendFrom(s: number, pts: Pt[]): void {
    if (this.cum.length > 1) this.cutAt(s);
    let last = this.pts[this.pts.length - 1];
    for (const p of pts) {
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      if (d < 1e-6) continue;
      this.pts.push(p);
      this.cum.push(this.cum[this.cum.length - 1] + d);
      last = p;
    }
  }

  /** The point a distance along the line (straight on past either end). */
  at(s: number): Pt {
    const r = s - this.base;
    const n = this.pts.length;
    let i = 1;
    if (r <= 0) i = 1;
    else if (r >= this.cum[n - 1]) i = n - 1;
    else while (this.cum[i] < r) i++;
    const p = this.pts[i - 1];
    const q = this.pts[i];
    const f = (r - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
  }

  /** The van with its cab at distance `s`: the middle between cab and back, pointing from back to cab. */
  body(s: number): Place & { chord: number } {
    const cab = this.at(s);
    const rear = this.at(s - (this.length - 1));
    const dx = cab.x - rear.x;
    const dy = cab.y - rear.y;
    const chord = Math.hypot(dx, dy);
    const along = this.length > 1 && chord > 1e-6 ? angleOf(dx, dy) : angleOf(...this.tangent(s));
    return { x: (cab.x + rear.x) / 2, y: (cab.y + rear.y) / 2, angle: along, chord };
  }

  /** Forgets the line far behind distance `s`. */
  trimBefore(s: number): void {
    while (this.pts.length > 2 && this.base + this.cum[1] < s - this.length - 2) {
      const d = this.cum[1];
      this.pts.shift();
      this.cum.shift();
      for (let i = 0; i < this.cum.length; i++) this.cum[i] -= d;
      this.base += d;
    }
  }

  private cutAt(s: number): void {
    const r = s - this.base;
    while (this.cum.length > 2 && this.cum[this.cum.length - 2] >= r) {
      this.pts.pop();
      this.cum.pop();
    }
    const n = this.pts.length;
    if (this.cum[n - 1] > r) {
      const p = this.at(s);
      this.pts[n - 1] = p;
      this.cum[n - 1] = r;
    }
  }

  private tangent(s: number): [number, number] {
    const a = this.at(s - 0.05);
    const b = this.at(s + 0.05);
    return [b.x - a.x, b.y - a.y];
  }
}

/**
 * Drives one move from a van at rest on a straight line and reports how it goes: whether any
 * part of the body passes over a solid tile (`solid`), whether it would have to fold up (a lorry
 * can't turn round inside its own length), and how far from the move's end pose it is drawn when
 * the cab arrives (the van eases the rest of the way as it pulls up; too far, and it isn't clear).
 */
/** The ends of a van never come closer than this share of its length: it can't fold up. */
export const FOLD = 0.6;
/** How far (tiles, plus a tile per 45°) a van may be from its parked pose when the cab arrives. */
const MAX_SETTLE = 0.6;

export function sweep(from: Pose, kind: MoveKind, to: Pose, length: number, solid: (t: Tile) => boolean): { clear: boolean; settle: number } {
  const track = new Track(from, length);
  const s0 = track.start;
  track.extendFrom(s0, cabLine(from, kind, to));
  const s1 = track.end;
  let clear = true;
  for (let s = s0; s <= s1 + 0.1 && clear; s += 0.1) {
    const b = track.body(Math.min(s, s1));
    if (length > 1 && b.chord < (length - 1) * FOLD) clear = false;
    else if (bodyTiles(b, length).some(solid)) clear = false;
  }
  const end = track.body(s1);
  const rest = restPlace(to, length);
  const settle = Math.hypot(end.x - rest.x, end.y - rest.y) + angleGap(end.angle, rest.angle) / 45;
  return { clear: clear && settle <= MAX_SETTLE, settle };
}

/** Tiles under a drawn body: points along and across it, just inside its edges (3 px at 64 px a tile). */
export function bodyTiles(b: Place, length: number): Tile[] {
  const a = (b.angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = -Math.sin(a);
  const hl = length / 2 - 0.05;
  const hw = 0.36 - 0.05;
  const n = Math.max(2, length);
  const out: Tile[] = [];
  for (let i = -n; i <= n; i++) {
    for (const j of [-1, 0, 1]) {
      const x = b.x + ux * hl * (i / n) - uy * hw * j;
      const y = b.y + uy * hl * (i / n) + ux * hw * j;
      out.push({ x: Math.floor(x), y: Math.floor(y) });
    }
  }
  return out;
}
