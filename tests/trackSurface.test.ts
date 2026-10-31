import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The 3D track surface (acceptance tests 2 and 5) is tested per track in trackSurface.<group>.test.ts
// (trackSurfaceTrack.ts); the bike setups test stays here.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;


describe('bike setups (acceptance test 4)', () => {
  it('a better bike is faster for the same rider, and a worn one slower', () => {
    const track = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    const base = content.riders.riders.find((r) => r.id === 'cpu.r03')!;
    const mean: Record<string, number> = { worn: 0, stock: 0, good: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const mk = (id: string, grade: number, condition: number, gate: number) => {
        const e = cpuEntrant(content, { ...base, id, bike: { ...base.bike, grade, condition } }, '50cc', gate);
        e.tactic = { message: 'steady' };
        return e;
      };
      const field = [mk('worn', 1, 0.35, 0), mk('stock', 1, 0.9, 1), mk('good', 3, 0.95, 2)];
      const sim = new MotoSim(content.racing, content.bikes, track, '50cc', field, { laps: 4, motoIndex: 0, seed });
      sim.runToEnd();
      for (const r of sim.riders) mean[r.e.id] += r.lapTimes.reduce((a, b) => a + b, 0) / r.lapTimes.length / 30;
    }
    expect(mean.good).toBeLessThan(mean.stock);
    expect(mean.stock).toBeLessThan(mean.worn);
  });
});
