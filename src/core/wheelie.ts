// Wheelies (Boss, 2 Nov 2026: "Wheelies, not big 12 o'clock but subtle but variable height at time
// out of corners, on long straights ect."). Only how the race looks: the simulation decides the
// result, and a rider's wheelies never change when they reach a section's end. Each is a small lift
// of the front wheel, the bike pivoting on its back wheel, at most WHEELIE_MAX, picked from the
// rider's seed, the lap and the section, so a race replays the same.

/** The biggest front-wheel lift, in radians (about 13°: a power wheelie, never a 12 o'clock). */
export const WHEELIE_MAX = 0.23;
/** The smallest worth showing, in radians (about 3°). */
export const WHEELIE_MIN = 0.05;
/** A straight at least this long, in metres, may have a wheelie along it. */
export const WHEELIE_STRAIGHT = 40;

const CORNERS = new Set(['first_corner', 'flat_corner', 'berm', 'rutted_corner', 'hairpin', 'fast_sweeper', 'concrete_corner']);
const STRAIGHTS = new Set(['straight', 'concrete_straight', 'start_gate', 'surface_change']);

/** A number in [0, 1) from a few others, the same every time. */
function hash(...xs: number[]): number {
  let h = 0;
  for (const [i, x] of xs.entries()) h += x * (12.9898 + i * 78.233);
  const s = Math.sin(h) * 43758.5453;
  return s - Math.floor(s);
}

export interface WheelieInput {
  /** The rider's seed (0 to 1) and how hard they ride (0 to 1: aggression). */
  seed: number;
  style: number;
  lap: number;
  si: number;
  type: string;
  /** The section before, or null at the start. */
  prev: string | null;
  /** How far through the section, 0 to 1, and its length in metres. */
  u: number;
  metres: number;
}

/**
 * The front wheel's lift at this point, in radians, 0 for none: out of a corner onto a straight the
 * rider may lift the front as they drive out (more often the harder they ride), and down a long
 * straight they may hold one for a stretch. Each comes up and down smoothly and differs in height.
 */
export function wheelieAt(w: WheelieInput): number {
  if (!STRAIGHTS.has(w.type) || w.u <= 0 || w.u >= 1) return 0;
  const style = Math.max(0, Math.min(1, w.style));
  const size = (k: number) => WHEELIE_MIN + (WHEELIE_MAX - WHEELIE_MIN) * hash(w.seed, w.lap, w.si, k) * (0.45 + 0.55 * style);
  let lift = 0;
  // Driving out of a corner: the front lifts as the power goes down, then settles, within the first
  // 10 to 25 metres.
  if (w.prev && CORNERS.has(w.prev) && hash(w.seed, w.lap, w.si, 1) < 0.3 + 0.5 * style) {
    const end = Math.min(0.6, (10 + 15 * hash(w.seed, w.lap, w.si, 2)) / Math.max(1, w.metres));
    if (w.u < end) lift = Math.max(lift, size(3) * Math.sin((Math.PI * w.u) / end));
  }
  // Down a long straight: a stretch of 12 to 30 metres somewhere along it.
  if (w.metres >= WHEELIE_STRAIGHT && hash(w.seed, w.lap, w.si, 4) < 0.2 + 0.4 * style) {
    const span = Math.min(0.5, (12 + 18 * hash(w.seed, w.lap, w.si, 5)) / w.metres);
    const from = 0.25 + (0.7 - span - 0.25) * hash(w.seed, w.lap, w.si, 6);
    const k = (w.u - from) / span;
    if (k > 0 && k < 1) lift = Math.max(lift, size(7) * 0.8 * Math.sin(Math.PI * k) ** 0.6);
  }
  return Math.min(WHEELIE_MAX, lift);
}
