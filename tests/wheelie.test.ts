import { describe, expect, it } from 'vitest';
import { WHEELIE_MAX, WHEELIE_MIN, wheelieAt, type WheelieInput } from '../src/core/wheelie';
import { race } from './raceHelpers';

// Subtle wheelies (Boss, 2 Nov 2026): "not big 12 o'clock but subtle but variable height at time out
// of corners, on long straights ect."
describe('wheelies', () => {
  const at = (w: Partial<WheelieInput>) => wheelieAt({ seed: 0.4, style: 0.6, lap: 1, si: 3, type: 'straight', prev: 'berm', u: 0.1, metres: 80, ...w });
  const peak = (w: Partial<WheelieInput>) => Math.max(...Array.from({ length: 200 }, (_, k) => at({ ...w, u: (k + 0.5) / 200 })));

  it('stay small, never a 12 o’clock, and come and go smoothly', () => {
    for (let seed = 0; seed < 1; seed += 0.013) {
      let last = 0;
      for (let k = 0; k <= 400; k++) {
        const lift = at({ seed, u: k / 400 });
        expect(lift).toBeGreaterThanOrEqual(0);
        expect(lift).toBeLessThanOrEqual(WHEELIE_MAX);
        expect(Math.abs(lift - last)).toBeLessThan(0.03);
        last = lift;
      }
      expect(last).toBe(0);
    }
  });

  it('happen out of corners and down long straights, more for hard riders, never in a corner or on a jump', () => {
    const count = (w: Partial<WheelieInput>) => Array.from({ length: 300 }, (_, k) => peak({ seed: k / 300, ...w })).filter((x) => x > 0).length;
    expect(count({ type: 'berm' })).toBe(0);
    expect(count({ type: 'tabletop' })).toBe(0);
    const calm = count({ style: 0, metres: 30 });
    const hard = count({ style: 1, metres: 30 });
    expect(calm).toBeGreaterThan(30);
    expect(hard).toBeGreaterThan(calm * 1.5);
    // A short straight after a straight has none; a long one sometimes does.
    expect(count({ prev: 'straight', metres: 30 })).toBe(0);
    expect(count({ prev: 'straight', metres: 90 })).toBeGreaterThan(30);
  });

  it('vary in height, and replay the same', () => {
    const peaks = Array.from({ length: 300 }, (_, k) => peak({ seed: k / 300 })).filter((x) => x > 0);
    expect(Math.min(...peaks)).toBeLessThan(WHEELIE_MIN * 2);
    expect(Math.max(...peaks)).toBeGreaterThan(WHEELIE_MAX * 0.7);
    expect(at({ seed: 0.31, u: 0.05 })).toBe(at({ seed: 0.31, u: 0.05 }));
  });

  it('show in a race only while riding on the ground', () => {
    const { dir } = race('farmland', 4);
    let seen = 0;
    for (let t = 0; t < 120; t += 0.1) {
      for (const p of dir.poses(t)) {
        if (!p.wheelie) continue;
        seen++;
        expect(p.state).toBe('riding');
        expect(p.flight).toBeNull();
        expect(p.wheelie).toBeLessThanOrEqual(WHEELIE_MAX);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});
