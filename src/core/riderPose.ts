/**
 * The solo rider's body on the bike (Boss, 3 Nov 2026: "I want something similar [to the sidecar
 * crew's poses] but for the solo riders. Study images and video refs of solo motocross riders over
 * jumps, bumps, fast corners slow corners"). race_rider.glb carries a shape key for each pose below
 * on top of its seated rest pose, built in Blender from real riding references; the race view
 * blends them from what the rider is doing, at most two at once, eased so the rider moves rather
 * than snaps. A rider model without the keys stays seated, as before.
 */

/** The rider model's shape keys, by name. */
export const RIDER_POSES = ['Stand', 'CornerLeft', 'CornerRight', 'BermLeft', 'BermRight', 'Brake', 'Accelerate', 'Takeoff', 'Air', 'Land', 'Start', 'Wheelie'] as const;
export type RiderPoseName = (typeof RIDER_POSES)[number];
export type PoseWeights = Partial<Record<RiderPoseName, number>>;

/** Sections ridden stood up in the attack position: rough ground the legs soak up. */
export const STAND_SECTIONS: ReadonlySet<string> = new Set(['whoops', 'rollers', 'braking_bumps', 'rhythm', 'dragon_back', 'mud', 'sand', 'downhill', 'surface_change']);
/** Banked corners, ridden stood up and leaning in with the bike. */
export const BERM_SECTIONS: ReadonlySet<string> = new Set(['berm', 'fast_sweeper', 'first_corner']);
/** Above this speed (m/s) a corner that isn't a berm is ridden as one, stood up and leaning; below it, sat down with the inside leg out. */
export const STAND_CORNER_SPEED = 13;
/** How hard a turn (the view's lean, radians) is a full corner pose. */
export const FULL_TURN = 0.4;
/** How long a landing is soaked up, in seconds. */
export const LAND_TIME = 0.35;
/** How far before a jump's lip (metres) the rider compresses into the face. */
export const TAKEOFF_REACH = 4;
/** How fast poses blend, a second (quicker for the jumps, which come and go in a moment). */
export const POSE_RATE = 5;
export const JUMP_POSE_RATE = 12;

export interface PoseInput {
  /** The view's lean into the turn, radians: positive to the right. */
  turn: number;
  /** Metres a second. */
  speed: number;
  /** Change of speed, metres a second a second: negative braking. */
  accel: number;
  /** The section type underfoot, or null (the start straight). */
  section: string | null;
  /** Where the rider is over a jump, if anywhere. */
  jump: 'takeoff' | 'air' | 'land' | null;
  /** Waiting at the gate. */
  gate: boolean;
  /** The front wheel lifted, radians. */
  wheelie: number;
  /** Off the bike, crashed or remounting: no pose. */
  off: boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The poses a rider is in for what they are doing, each 0 to 1: the strongest two, adding up to
 * at most 1 (the rest is the seated rest pose).
 */
export function poseTargets(i: PoseInput): PoseWeights {
  if (i.off) return {};
  if (i.gate) return { Start: 1 };
  if (i.jump === 'air') return { Air: 1 };
  if (i.jump === 'land') return { Land: 1 };
  if (i.jump === 'takeoff') return { Takeoff: 1 };
  if (i.wheelie > 0.03) return { Wheelie: clamp(i.wheelie / 0.3) };
  const w: PoseWeights = {};
  const turn = clamp(Math.abs(i.turn) / FULL_TURN);
  const right = i.turn > 0;
  if (turn > 0.05) {
    const berm = (i.section !== null && BERM_SECTIONS.has(i.section)) || i.speed > STAND_CORNER_SPEED;
    w[berm ? (right ? 'BermRight' : 'BermLeft') : right ? 'CornerRight' : 'CornerLeft'] = turn;
  }
  if (i.accel < -2) w.Brake = clamp((-i.accel - 2) / 4);
  else if (i.accel > 1.5 && i.speed < 18) w.Accelerate = clamp((i.accel - 1.5) / 3) * (1 - 0.5 * turn);
  if (i.section !== null && STAND_SECTIONS.has(i.section)) w.Stand = 1;
  else if (i.speed > 16 && turn < 0.2) w.Stand = 0.6;
  // The strongest two, scaled down together if they add up past a full pose.
  const top = (Object.entries(w) as [RiderPoseName, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const sum = top.reduce((s, [, v]) => s + v, 0);
  const k = sum > 1 ? 1 / sum : 1;
  return Object.fromEntries(top.map(([n, v]) => [n, v * k])) as PoseWeights;
}

/** Eases every pose from `now` towards `want` (missing poses ease to 0) over dt seconds. */
export function easePoses(now: PoseWeights, want: PoseWeights, dt: number, rate = POSE_RATE): PoseWeights {
  const e = 1 - Math.exp(-Math.max(0, dt) * rate);
  const out: PoseWeights = {};
  for (const n of RIDER_POSES) {
    const v = (now[n] ?? 0) + ((want[n] ?? 0) - (now[n] ?? 0)) * e;
    if (v > 0.001) out[n] = v;
  }
  return out;
}
