// Raised jumps and hills take longer to ride (Boss, 2 Nov 2026: "If i raise a tabletop like stupidly
// high for testing. The much longer face of the jump don't affect the riders in any way, so they get
// up the hill in speeds like it's not there. It should be calculated in to a length of a section if
// possible."). A jump face or hill set taller than its type's usual height (DEFAULT_HEIGHTS) is
// ridden as a longer section: the face's extra slope length, plus CLIMB_COST metres of flat track for
// every extra metre climbed, since the bike loses speed going up. At or under the usual height
// nothing changes, so the game's own tracks race as they were balanced.

import { DEFAULT_HEIGHTS, HOP_JUMPS, SKIM } from './jumps';
import { HILLS, sectionShape } from './trackSurface';

/** Metres of flat track each extra metre of climb costs. */
export const CLIMB_COST = 2;

/** Where the climb ends: the first u at which the section's centre line reaches its top. */
function faceEnd(type: string): number {
  let best = 0;
  let at = 0;
  for (let k = 1; k <= 200; k++) {
    const u = k / 200;
    const y = sectionShape(type, u);
    if (y > best + 1e-6) {
      best = y;
      at = u;
    } else if (y < best - 0.02) break;
  }
  return at;
}
const FACES = new Map<string, number>();

/** The extra metres a section rides as, for a jump face or hill set taller than usual; 0 otherwise. */
export function climbExtra(sec: { type: string; length: number; height?: number }): number {
  if (sec.height === undefined || SKIM.has(sec.type) || sec.type === 'downhill') return 0;
  if (!HOP_JUMPS.has(sec.type) && !HILLS.has(sec.type)) return 0;
  const usual = DEFAULT_HEIGHTS[sec.type];
  if (usual === undefined || sec.height <= usual) return 0;
  if (!FACES.has(sec.type)) FACES.set(sec.type, faceEnd(sec.type));
  const run = Math.max(0.5, FACES.get(sec.type)! * sec.length);
  const slope = Math.hypot(run, sec.height) - Math.hypot(run, usual);
  return slope + CLIMB_COST * (sec.height - usual);
}

/** How much longer than its length a section takes to ride: 1 for most, more for a raised jump or hill. */
export function climbFactor(sec: { type: string; length: number; height?: number }): number {
  return 1 + climbExtra(sec) / Math.max(1, sec.length);
}
