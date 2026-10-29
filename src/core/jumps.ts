// The jumps (Boss, 29 Oct 2026, from the supercross jump chart): each jump type is a row of
// peaks along its section, and the ways a rider can take it are hops from one spot to another.
// A tabletop is cleared, or landed on short of the end and ridden off; a triple is tripled, or
// doubled then singled; a quad is a quad, a double-double or single-double-single; a dragon's
// back is skipped top to top, or doubled, then launched off its last hump. The race view flies
// each wheel along the same hops (trackSurface.ts flightY), so a bike leaves the lip the moment
// its front wheel passes it, tangent to the face it rode up, and lands where the hop says.
//
// Shapes are in u (0 to 1 along the section) and heights as a share of the section's height.

/** One hump of a jump: it rises from a to b, stays up (a deck) from b to c, and falls from c to d. */
export interface Peak {
  a: number;
  b: number;
  c: number;
  d: number;
  /** Its height as a share of the section's. */
  h: number;
}

/** A way of riding a jump: hops from a take-off u to a landing u, in order; none is rolling it. */
export interface Way {
  name: string;
  hops: [number, number][];
  /**
   * How likely it is, from a rider's jumping (0 to 1): the weight at 0 and at 1, straight between.
   * Every way is possible for everyone, just less or more likely.
   */
  w: [number, number];
  /** The way a jump comes up short on a mistake: a hard landing on the face. */
  short?: boolean;
}

export interface JumpDef {
  peaks: Peak[];
  ways: Way[];
}

/** Default jump face and hill heights in metres, when a section doesn't set one. */
export const DEFAULT_HEIGHTS: Record<string, number> = {
  tabletop: 2.5,
  double: 3.5,
  step_up: 3,
  triple: 3.5,
  quad: 3.5,
  step_down: 3,
  step_on: 2,
  on_off: 2.2,
  single_over_table: 2.8,
  table_over_single: 2.8,
  wall_jump: 2.6,
  ski_jump: 3,
  rhythm: 1.5,
  whoops: 0.6,
  rollers: 0.9,
  dragon_back: 2.2,
  uphill: 6,
  downhill: 6,
};

const peak = (a: number, b: number, c: number, d: number, h = 1): Peak => ({ a, b, c, d, h });

/**
 * The jumps. Hops start at a lip (a peak's b) and land on a deck, the back of a hump, or, coming
 * up short, its face. Weights lean towards the big way for a good jumper and the safe way for a
 * poor one.
 */
export const JUMPS: Record<string, JumpDef> = {
  tabletop: {
    peaks: [peak(0.16, 0.3, 0.62, 0.84)],
    ways: [
      { name: 'clear', hops: [[0.3, 0.75]], w: [0.3, 1] },
      { name: 'short', hops: [[0.3, 0.56]], w: [0.8, 0.2] },
      { name: 'roll', hops: [], w: [0.3, 0] },
      { name: 'case', hops: [[0.3, 0.66]], w: [0, 0], short: true },
    ],
  },
  double: {
    peaks: [peak(0.16, 0.3, 0.3, 0.37), peak(0.58, 0.68, 0.68, 0.86, 0.95)],
    ways: [
      { name: 'clear', hops: [[0.3, 0.76]], w: [0.3, 1] },
      { name: 'singles', hops: [[0.3, 0.42], [0.68, 0.8]], w: [0.8, 0.1] },
      { name: 'case', hops: [[0.3, 0.64]], w: [0.15, 0], short: true },
    ],
  },
  step_up: {
    peaks: [peak(0.16, 0.3, 0.3, 0.36, 0.55), peak(0.58, 0.68, 0.86, 0.98)],
    ways: [
      { name: 'clear', hops: [[0.3, 0.78]], w: [0.3, 1] },
      { name: 'single, ride up, hop off', hops: [[0.3, 0.42], [0.86, 0.95]], w: [0.8, 0.1] },
      { name: 'case', hops: [[0.3, 0.65]], w: [0.15, 0], short: true },
    ],
  },
  triple: {
    peaks: [peak(0.16, 0.3, 0.3, 0.4), peak(0.44, 0.5, 0.5, 0.6), peak(0.62, 0.68, 0.68, 0.86)],
    ways: [
      { name: 'triple', hops: [[0.3, 0.77]], w: [0.1, 1] },
      { name: 'double single', hops: [[0.3, 0.61], [0.68, 0.78]], w: [0.5, 0.4] },
      { name: 'single double', hops: [[0.3, 0.42], [0.5, 0.77]], w: [0.4, 0.3] },
      { name: 'singles', hops: [[0.3, 0.42], [0.5, 0.61], [0.68, 0.78]], w: [0.8, 0.05] },
      { name: 'case', hops: [[0.3, 0.66]], w: [0.1, 0], short: true },
    ],
  },
  quad: {
    peaks: [peak(0.1, 0.2, 0.2, 0.28), peak(0.3, 0.4, 0.4, 0.48), peak(0.5, 0.6, 0.6, 0.68), peak(0.7, 0.8, 0.8, 0.96)],
    ways: [
      { name: 'quad', hops: [[0.2, 0.9]], w: [0, 1] },
      { name: 'double double', hops: [[0.2, 0.49], [0.6, 0.9]], w: [0.4, 0.6] },
      { name: 'single double single', hops: [[0.2, 0.29], [0.4, 0.69], [0.8, 0.9]], w: [0.6, 0.3] },
      { name: 'triple single', hops: [[0.2, 0.69], [0.8, 0.9]], w: [0.1, 0.5] },
      { name: 'singles', hops: [[0.2, 0.29], [0.4, 0.49], [0.6, 0.69], [0.8, 0.9]], w: [0.8, 0.05] },
      { name: 'case', hops: [[0.2, 0.76]], w: [0.05, 0], short: true },
    ],
  },
  step_down: {
    peaks: [peak(0.16, 0.3, 0.5, 0.58), peak(0.62, 0.7, 0.7, 0.9, 0.4)],
    ways: [
      { name: 'clear', hops: [[0.3, 0.78]], w: [0.3, 1] },
      { name: 'drop', hops: [[0.5, 0.78]], w: [0.8, 0.2] },
      { name: 'case', hops: [[0.3, 0.66]], w: [0.1, 0], short: true },
    ],
  },
  step_on: {
    peaks: [peak(0.16, 0.3, 0.62, 0.84)],
    ways: [
      { name: 'on and off', hops: [[0.2, 0.38], [0.6, 0.76]], w: [0.6, 1] },
      { name: 'on and roll', hops: [[0.2, 0.38]], w: [0.8, 0.2] },
      { name: 'roll', hops: [], w: [0.3, 0] },
    ],
  },
  on_off: {
    peaks: [peak(0.12, 0.24, 0.42, 0.5), peak(0.62, 0.72, 0.72, 0.9, 0.9)],
    ways: [
      { name: 'on and over', hops: [[0.16, 0.32], [0.42, 0.8]], w: [0.2, 1] },
      { name: 'on, off, single', hops: [[0.16, 0.32], [0.42, 0.56], [0.72, 0.82]], w: [0.7, 0.3] },
      { name: 'roll on, single', hops: [[0.72, 0.82]], w: [0.6, 0] },
      { name: 'case', hops: [[0.42, 0.68]], w: [0.1, 0], short: true },
    ],
  },
  single_over_table: {
    peaks: [peak(0.1, 0.22, 0.22, 0.3, 0.8), peak(0.4, 0.5, 0.72, 0.86)],
    ways: [
      { name: 'over the table', hops: [[0.22, 0.79]], w: [0.1, 1] },
      { name: 'onto the table', hops: [[0.22, 0.6]], w: [0.6, 0.4] },
      { name: 'single, roll the table', hops: [[0.22, 0.34]], w: [0.8, 0.05] },
      { name: 'case', hops: [[0.22, 0.47]], w: [0.1, 0], short: true },
    ],
  },
  table_over_single: {
    peaks: [peak(0.12, 0.24, 0.46, 0.56), peak(0.66, 0.74, 0.74, 0.88, 0.8)],
    ways: [
      { name: 'table over the single', hops: [[0.24, 0.81]], w: [0.1, 1] },
      { name: 'table, then the single', hops: [[0.24, 0.6], [0.74, 0.82]], w: [0.6, 0.4] },
      { name: 'short, then the single', hops: [[0.24, 0.42], [0.74, 0.82]], w: [0.7, 0.1] },
      { name: 'case', hops: [[0.24, 0.71]], w: [0.1, 0], short: true },
    ],
  },
  wall_jump: {
    peaks: [peak(0.28, 0.42, 0.42, 0.46)],
    ways: [
      { name: 'long', hops: [[0.42, 0.8]], w: [0.2, 1] },
      { name: 'short', hops: [[0.42, 0.62]], w: [0.8, 0.3] },
    ],
  },
  ski_jump: {
    // A long ramp to a lip the ground drops away from, then a long sloping landing.
    peaks: [peak(0.06, 0.46, 0.46, 0.6), peak(0.5, 0.58, 0.6, 0.96, 0.45)],
    ways: [
      { name: 'fly away', hops: [[0.46, 0.84]], w: [0.2, 1] },
      { name: 'short', hops: [[0.46, 0.66]], w: [0.8, 0.3] },
    ],
  },
  rhythm: {
    peaks: [peak(0.05, 0.15, 0.15, 0.26), peak(0.38, 0.48, 0.48, 0.59), peak(0.71, 0.81, 0.81, 0.93)],
    ways: [
      { name: 'double single', hops: [[0.15, 0.6], [0.81, 0.92]], w: [0.2, 1] },
      { name: 'single double', hops: [[0.15, 0.27], [0.48, 0.92]], w: [0.2, 0.8] },
      { name: 'singles', hops: [[0.15, 0.27], [0.48, 0.6], [0.81, 0.92]], w: [1, 0.1] },
      { name: 'case', hops: [[0.15, 0.45]], w: [0.1, 0], short: true },
    ],
  },
  dragon_back: {
    // Four humps, each bigger than the last, building up to the big final mound and the launch off its top.
    peaks: [peak(0.05, 0.12, 0.12, 0.18, 0.18), peak(0.23, 0.3, 0.3, 0.36, 0.32), peak(0.41, 0.48, 0.48, 0.54, 0.55), peak(0.58, 0.72, 0.74, 0.88, 1)],
    ways: [
      { name: 'skip the tops', hops: [[0.12, 0.3], [0.3, 0.48], [0.48, 0.72], [0.74, 0.93]], w: [0.3, 1] },
      { name: 'double double', hops: [[0.12, 0.48], [0.48, 0.93]], w: [0, 0.6] },
      { name: 'ride up, jump off', hops: [[0.74, 0.9]], w: [1, 0.1] },
    ],
  },
};

/** The section types that are jumps with hops (JUMPS), for the referee's mistakes and the editor. */
export const HOP_JUMPS = new Set(Object.keys(JUMPS));
/** The big single-arc jumps (a deck a tunnel can run through, the editor's tunnel kit). */
export const BIG_JUMPS = new Set(['tabletop', 'double', 'step_up', 'triple', 'quad', 'step_down', 'single_over_table', 'table_over_single', 'on_off', 'wall_jump', 'ski_jump']);
/** Bumpy ground the bike skims rather than jumps. */
export const SKIM = new Set(['whoops', 'rollers', 'braking_bumps']);

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const ramp = (u: number, a: number, b: number) => smooth((u - a) / (b - a));

/** The jump's centre-line shape at u, from 0 to 1 of its height: the tallest peak there. */
export function jumpShape(type: string, u: number): number {
  const def = JUMPS[type];
  if (!def) return 0;
  let h = 0;
  for (const p of def.peaks) h = Math.max(h, p.h * ramp(u, p.a, p.b) * (1 - ramp(u, p.c, p.d)));
  return h;
}

/**
 * Which way a rider takes a jump: drawn from `r` (0 to 1, seeded per rider, lap and section) by
 * the ways' weights at the rider's jumping (0 to 1). A mistake takes the way that comes up short.
 */
export function pickWay(type: string, jumping: number, r: number, mistake = false): Way | null {
  const def = JUMPS[type];
  if (!def) return null;
  if (mistake) {
    const short = def.ways.find((w) => w.short);
    if (short) return short;
  }
  const j = Math.max(0, Math.min(1, jumping));
  const ws = def.ways.map((w) => (w.short ? 0 : Math.max(0, w.w[0] + (w.w[1] - w.w[0]) * j)));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return def.ways[0];
  let x = (r - Math.floor(r)) * total;
  for (let i = 0; i < ws.length; i++) {
    x -= ws[i];
    if (x < 0) return def.ways[i];
  }
  return def.ways[ws.length - 1];
}

/** Where a mistake on a jump happens: on the last landing of the way taken, else part way through. */
export function landingOf(way: Way | null): number | null {
  if (!way || !way.hops.length) return null;
  return way.hops[way.hops.length - 1][1];
}

/**
 * A finish-line jump (a section with `finish`): where along it the finish arch stands, as a share
 * of the section, and how high its banner's underside is above the surface there. The tabletop's
 * arch stands over the middle of its deck, the double's just over its landing, where every way
 * over the jump has come down near the surface; the clearance leaves room for a rider still in
 * the air there (the arch test checks it against every way).
 */
export const ARCH_AT: Record<string, number> = { tabletop: 0.46, double: 0.72 };
export const ARCH_CLEAR = 4.6;
