import { describe, expect, it } from 'vitest';
import { checkFluidity } from './fluidity';
import { race } from './raceHelpers';
import { content } from './raceHelpers';

// Fluid racing (Boss, 4 Nov 2026): no stutters, no instant slowdowns or stops unless the rider has
// crashed. tools/sim/fluidity.ts runs this over every track and hundreds of seeds; here a few races.

describe('fluid racing', () => {
  it('riders speed up and slow down within limits, hold their speed in the air, and never stand still unless down', () => {
    for (const [trackId, seed] of [['farmland', 4], ['farmland', 9], ['arena-supercross', 2]] as const) {
      const track = content.tracks.tracks.find((t) => t.id === trackId)!;
      const { sim, dir, traces } = race(trackId, seed);
      const report = checkFluidity(sim, dir, traces, (dir as any).metres);
      expect(report.samples).toBeGreaterThan(1000);
      expect(report.faults.slice(0, 5)).toEqual([]);
      expect(report.maxWarp).toBeLessThan(1.25);
      expect(track).toBeTruthy();
    }
  });
});
