import { describe, expect, it } from 'vitest';
import { speedShape } from '../src/core/riderAI';
import { race } from './raceHelpers';

// Smooth riding (Boss, 2 Nov 2026): no slowing at the end of a section then a burst of speed into
// the next. Speed carries across every section edge, and each rider still reaches every timing
// point exactly when the simulation says.

describe('smooth riding', () => {
  it('a section’s speed shape starts and ends on the speeds asked for and always covers the section in its time', () => {
    for (const [e0, e1, c] of [[0, 1, 0], [1.6, 0.4, -0.3], [0.5, 1.9, 0.3], [2, 2, -0.25], [3, 0.1, 0]]) {
      const s = speedShape(e0, e1, c);
      expect(s.speed(0)).toBeCloseTo(e0);
      expect(s.speed(1)).toBeCloseTo(e1);
      expect(s.at(0)).toBeCloseTo(0);
      expect(s.at(1)).toBeCloseTo(1);
      // Never backwards.
      for (let x = 0; x <= 1; x += 0.01) expect(s.speed(x)).toBeGreaterThan(-1e-9);
    }
  });

  it('riders carry their speed across section edges instead of slowing and then bursting off', () => {
    const { dir, traces, sim } = race('farmland', 4);
    let edges = 0;
    let jumps = 0;
    for (const tr of traces) {
      for (const [id, times] of Object.entries(tr.times)) {
        if (sim.riders.find((r) => r.e.id === id)?.retired) continue;
        for (let i = 1; i < times.length - 1; i++) {
          const t = times[i];
          const before = dir.poses(t - 0.02).find((p) => p.id === id)!;
          const after = dir.poses(t + 0.02).find((p) => p.id === id)!;
          if (before.state !== 'riding' && before.state !== 'air') continue;
          if (after.state !== 'riding' && after.state !== 'air') continue;
          edges++;
          if (Math.abs(after.speed - before.speed) > 0.15 * Math.max(before.speed, after.speed, 1)) jumps++;
          // Exactly at the timing point when the simulation says.
          expect(dir.poses(t).find((p) => p.id === id)!.dist).toBeCloseTo(tr.marks[i], 6);
        }
      }
    }
    expect(edges).toBeGreaterThan(500);
    expect(jumps / edges).toBeLessThan(0.02);
  });
});
