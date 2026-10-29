import { describe, expect, it } from 'vitest';
import { JUMPS, jumpShape, landingOf, pickWay } from '../src/core/jumps';
import type { TrackDef } from '../src/core/race';
import { BIKE_LENGTH, TrackSurface } from '../src/core/trackSurface';

// A straight test track: one long straight with the jump in the middle of it.
function trackWith(type: string, length = 16): TrackDef {
  return {
    id: 'jump-test',
    name: 'Jump test',
    kind: 'outdoor',
    path: [[10, 10], [90, 10], [90, 50], [10, 50]],
    sections: [{ type: 'straight', length: 40, passing: 0.5 }, { type, length, passing: 0.5 }, { type: 'straight', length: 60, passing: 0.5 }],
  } as unknown as TrackDef;
}

describe('jumps', () => {
  it('describes every jump as humps in order with ways whose hops run forwards along them', () => {
    for (const [type, def] of Object.entries(JUMPS)) {
      expect(def.peaks.length, type).toBeGreaterThan(0);
      for (const p of def.peaks) expect(p.a < p.b && p.b <= p.c && p.c < p.d && p.d <= 1, `${type} peak`).toBe(true);
      expect(def.ways.length, type).toBeGreaterThan(0);
      for (const w of def.ways) {
        let last = 0;
        for (const [a, b] of w.hops) {
          expect(a >= last && b > a && b < 1, `${type} ${w.name}`).toBe(true);
          // A hop takes off on a hump (its face or deck), never from flat ground.
          expect(jumpShape(type, a), `${type} ${w.name} takes off at ${a}`).toBeGreaterThan(0.1);
          last = b;
        }
      }
      // The top of the tallest hump is the section's full height.
      let top = 0;
      for (let u = 0; u <= 1; u += 0.005) top = Math.max(top, jumpShape(type, u));
      expect(top, type).toBeCloseTo(1, 2);
    }
  });

  it('gives a poor jumper the safe way and a good one the big way, and a mistake the short one', () => {
    const quadLow = [0.1, 0.3, 0.5, 0.7, 0.9].map((r) => pickWay('quad', 0, r)!.name);
    const quadHigh = [0.1, 0.3, 0.5, 0.7, 0.9].map((r) => pickWay('quad', 1, r)!.name);
    expect(quadLow).not.toContain('quad');
    expect(quadHigh).toContain('quad');
    expect(quadHigh).not.toContain('singles');
    expect(pickWay('tabletop', 0.5, 0.3, true)!.short).toBe(true);
    expect(landingOf(pickWay('tabletop', 1, 0.1))).toBeGreaterThan(0.5);
    expect(pickWay('straight', 1, 0.5)).toBeNull();
  });

  it('flies each wheel from the lip along the face, clear of the ground, and lands where the hop says', () => {
    for (const type of ['tabletop', 'triple', 'quad', 'dragon_back', 'ski_jump']) {
      const track = trackWith(type);
      const s = new TrackSurface(track);
      const f0 = s.bounds[1];
      const span = s.bounds[2] - f0;
      for (const way of JUMPS[type].ways) {
        if (!way.hops.length) continue;
        const flight = { hops: way.hops.map(([a, b]) => [f0 + a * span, f0 + b * span] as [number, number]), launch: 0.8 };
        for (const [a, b] of flight.hops) {
          // Off the lip the wheel rises above the ground at once, and it meets the ground again at the landing.
          const lip = s.height(a, 0);
          const just = s.wheel(a + (b - a) * 0.04, 0, flight);
          expect(just, `${type} ${way.name} leaves the lip`).toBeGreaterThan(lip + 0.02);
          expect(s.wheel(b - 1e-6, 0, flight), `${type} ${way.name} lands`).toBeCloseTo(s.height(b, 0), 1);
          for (let t = 0.05; t < 1; t += 0.05) {
            const f = a + (b - a) * t;
            expect(s.wheel(f, 0, flight), `${type} ${way.name} clears the ground`).toBeGreaterThanOrEqual(s.height(f, 0) + 0.1);
          }
        }
        // Both wheels move smoothly: no step in the bike's height from one frame to the next.
        let last: number | null = null;
        for (let f = f0 - 0.01; f < f0 + span + 0.01; f += 0.0004) {
          const [back, front] = s.wheels(f, 0, flight);
          const y = (back.y + front.y) / 2;
          if (last !== null) expect(Math.abs(y - last), `${type} ${way.name} at ${f.toFixed(4)}`).toBeLessThan(0.3);
          last = y;
        }
      }
      expect(BIKE_LENGTH).toBeGreaterThan(0);
    }
  });
});

describe('finish-line jumps', () => {
  it('keeps the finish arch banner above every rider still in the air where it stands', async () => {
    const { ARCH_AT, ARCH_CLEAR } = await import('../src/core/jumps');
    // A rider and bike stand about 2 m above the wheels.
    const RIDER = 2.0;
    for (const type of Object.keys(ARCH_AT)) {
      const track = trackWith(type, type === 'tabletop' ? 16 : 14);
      const s = new TrackSurface(track);
      const f0 = s.bounds[1];
      const span = s.bounds[2] - f0;
      const fa = f0 + ARCH_AT[type] * span;
      const banner = s.height(fa, 0) + ARCH_CLEAR;
      for (const way of JUMPS[type].ways) {
        const flight = { hops: way.hops.map(([a, b]) => [f0 + a * span, f0 + b * span] as [number, number]), launch: 1 };
        // Under the banner's thickness and a little either side of it.
        for (const df of [-0.02, 0, 0.02]) for (const lane of [-0.8, 0, 0.8]) {
          const [back, front] = s.wheels(fa + df * span, lane, flight);
          expect(Math.max(back.y, front.y) + RIDER, `${type} ${way.name} lane ${lane} at ${df}`).toBeLessThan(banner);
        }
      }
    }
  });
});
