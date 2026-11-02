import { describe, expect, it } from 'vitest';
import { CLIMB_COST, climbExtra, climbFactor } from '../src/core/climb';
import { DEFAULT_HEIGHTS } from '../src/core/jumps';
import { content, race } from './raceHelpers';

// Raised jumps (Boss, 2 Nov 2026): "If i raise a tabletop like stupidly high for testing. The much
// longer face of the jump don't affect the riders in any way... It should be calculated in to a
// length of a section if possible."
describe('raised jumps and hills', () => {
  it('ride as a longer section, the taller the longer, and only above the usual height', () => {
    const t = (height?: number) => climbFactor({ type: 'tabletop', length: 29, height });
    expect(t()).toBe(1);
    expect(t(DEFAULT_HEIGHTS.tabletop)).toBe(1);
    expect(t(1)).toBe(1);
    expect(t(5)).toBeGreaterThan(1.1);
    expect(t(20)).toBeGreaterThan(t(10));
    // At least the climb's cost, plus the longer face.
    expect(climbExtra({ type: 'tabletop', length: 29, height: 12.5 })).toBeGreaterThan(CLIMB_COST * 10);
    expect(climbFactor({ type: 'uphill', length: 100, height: 20 })).toBeGreaterThan(1.2);
    // Riding down a hill, or skimming whoops, costs nothing.
    expect(climbFactor({ type: 'downhill', length: 100, height: 20 })).toBe(1);
    expect(climbFactor({ type: 'whoops', length: 40, height: 3 })).toBe(1);
    expect(climbFactor({ type: 'straight', length: 40, height: 3 })).toBe(1);
  });

  it('slow the riders over that section in a race, who still reach every point when the simulation says', () => {
    const base = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    const si = base.sections.findIndex((s) => s.type === 'tabletop');
    expect(si).toBeGreaterThan(-1);
    const raised = { ...base, id: 'farmland-raised', sections: base.sections.map((s, i) => (i === si ? { ...s, height: 15 } : s)) };
    content.tracks.tracks.push(raised);
    try {
      const time = (id: string) => {
        const { traces } = race(id, 5);
        // Every rider's time on the tabletop, over the race.
        let sum = 0;
        for (const tr of traces) for (const times of Object.values(tr.times)) {
          const k = tr.secs.indexOf(si);
          if (k >= 0 && times[k + 1] !== undefined) sum += times[k + 1] - times[k];
        }
        return sum;
      };
      expect(time('farmland-raised')).toBeGreaterThan(1.5 * time('farmland'));
      const { dir, traces } = race('farmland-raised', 5);
      const last = new Map<string, number>();
      for (let t = 0; t <= 200; t += 0.1) for (const p of dir.poses(t)) {
        expect(p.dist).toBeGreaterThanOrEqual((last.get(p.id) ?? -Infinity) - 1e-9);
        last.set(p.id, p.dist);
      }
      for (const tr of traces) for (const [id, times] of Object.entries(tr.times)) {
        for (let i = 1; i < times.length; i++) expect(dir.poses(times[i]).find((q) => q.id === id)!.dist).toBeCloseTo(tr.marks[i], 6);
      }
    } finally {
      content.tracks.tracks.pop();
    }
  });
});
