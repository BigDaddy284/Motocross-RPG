// The fluidity check (Boss, 4 Nov 2026: "fluid racing, no stutters, no instant slowdowns or stops
// unless that rider has crashed"): every rider's ride through a race, sampled twenty times a
// second, speeds up no faster than ACCEL, brakes no harder than BRAKE, holds their speed in the
// air, never stands still unless down after a crash, and never goes backwards. Speed is taken
// from where the rider is drawn (the change in distance), not the speed the pose reports.
import { ACCEL, BRAKE } from '../src/core/ridePlan';
import type { RaceDirector } from '../src/core/riderAI';
import type { MotoSim, LapTrace } from '../src/core/race';

export interface Fault {
  rider: string;
  t: number;
  dist: number;
  what: string;
}

export interface FluidityReport {
  samples: number;
  faults: Fault[];
  /** The hardest acceleration and braking seen on the ground, in m/s². */
  maxAccel: number;
  maxBrake: number;
  /** The slowest a rider was seen going on the ground, not down, in m/s. */
  minSpeed: number;
  /** The most a lap's planned times were stretched. */
  maxWarp: number;
}

const DT = 0.05;

export function checkFluidity(sim: MotoSim, dir: RaceDirector, traces: LapTrace[], metres: number): FluidityReport {
  const faults: Fault[] = [];
  const end = Math.max(...traces.flatMap((tr) => Object.values(tr.times).map((t) => t[t.length - 1])));
  const start = -dir.prestart;
  type Last = { t: number; dist: number; v: number; state: string; air: number; up: number; fly: boolean; flyBefore: boolean };
  const last = new Map<string, Last>();
  let samples = 0;
  let maxAccel = 0;
  let maxBrake = 0;
  let minSpeed = Infinity;
  const retired = new Set(sim.results().filter((r) => r.retired).map((r) => r.id));
  for (let t = start; t <= end; t += DT) {
    for (const p of dir.poses(t)) {
      const l = last.get(p.id);
      const v = l ? ((p.dist - l.dist) * metres) / DT : 0;
      // When the rider last got going again after a crash: they start from nothing then.
      const up = p.state === 'crashed' || p.state === 'remount' ? t : (l?.up ?? -Infinity);
      const racing = p.state === 'riding' || p.state === 'air' || p.state === 'wobble';
      if (l && !retired.has(p.id)) {
        const was = l.state === 'riding' || l.state === 'air' || l.state === 'wobble';
        if (racing && was && p.dist < l.dist - 1e-9) faults.push({ rider: p.id, t, dist: p.dist, what: `went backwards ${((l.dist - p.dist) * metres).toFixed(2)} m` });
        if (racing && was && p.dist > dir.start.join && l.dist > dir.start.join) {
          samples++;
          const a = (v - l.v) / DT;
          const f = p.dist - Math.floor(p.dist);
          const flying = !!p.flight && p.flight.hops.some(([a, b]) => f > a + 1e-6 && f < b - 1e-6);
          if (flying && l.fly && l.flyBefore) {
            if (Math.abs(a) > 1.5) faults.push({ rider: p.id, t, dist: p.dist, what: `speed changed in the air ${a.toFixed(1)} m/s²` });
          } else {
            maxAccel = Math.max(maxAccel, a);
            maxBrake = Math.max(maxBrake, -a);
            if (a > ACCEL * 1.3 + 0.5) faults.push({ rider: p.id, t, dist: p.dist, what: `sped up ${a.toFixed(1)} m/s² (${l.v.toFixed(1)} to ${v.toFixed(1)})` });
            if (a < -(BRAKE * 1.3 + 0.5)) faults.push({ rider: p.id, t, dist: p.dist, what: `braked ${(-a).toFixed(1)} m/s² (${l.v.toFixed(1)} to ${v.toFixed(1)})` });
          }
          minSpeed = Math.min(minSpeed, v);
          if (v < 0.3 && t - up > 1.5) faults.push({ rider: p.id, t, dist: p.dist, what: `stood still (${v.toFixed(2)} m/s, ${p.state})` });
        }
      }
      const f = p.dist - Math.floor(p.dist);
      const fly = !!p.flight && p.flight.hops.some(([a, b]) => f > a + 1e-6 && f < b - 1e-6);
      last.set(p.id, { t, dist: p.dist, v, state: p.state, air: p.air, up, fly, flyBefore: l?.fly ?? false });
    }
  }
  return { samples, faults, maxAccel, maxBrake, minSpeed, maxWarp: Math.max(1, ...dir.warps) };
}
