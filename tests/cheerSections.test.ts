import { describe, expect, it } from 'vitest';
import { CHEER_HOLD, CHEER_RANGE, cheerAtRest, cheerStep, type CheerState, livePart, SUPPORTER_RIDERS, supporterFavourites } from '../src/core/modModels';

// Stands and crowds (Boss, 2 Nov 2026): "No more mexican wave, each seated section gets a random rider each lap
// and only that section stands up to cheer as their rider goes past", and "have random people form different
// sections cheers for the same rider".
describe('cheering sections and supporters', () => {
  const at = { x: 0, z: 0 };
  const any = (count: number) => count - 1; // always the last rider

  it('are live parts by name', () => {
    expect(livePart('Cheer.003')).toBe('Cheer');
    expect(livePart('Supporter012')).toBe('Supporter');
  });

  it("stands only for its own rider, a moment after they've gone, then takes a new one", () => {
    const far = { x: 100, z: 0 };
    const close = { x: CHEER_RANGE - 1, z: 0 };
    // Its rider is the second; the first coming by doesn't stand it up.
    let s: CheerState & { up?: boolean } = cheerStep(cheerAtRest(), 0.1, at, [close, far], any);
    expect(s.rider).toBe(1);
    expect(s.up).toBe(false);
    s = cheerStep(s, 0.1, at, [far, close], () => 0);
    expect(s.up).toBe(true);
    // Gone by: still up for CHEER_HOLD, then down with a new rider picked.
    s = cheerStep(s, CHEER_HOLD / 2, at, [far, far], () => 0);
    expect(s.up).toBe(true);
    s = cheerStep(s, CHEER_HOLD, at, [far, far], () => 0);
    expect(s.up).toBe(false);
    expect(s.rider).toBe(0);
    expect(s.near).toBe(false);
  });

  it('sits with no riders, and takes a new rider if theirs is gone', () => {
    expect(cheerStep(cheerAtRest(), 0.1, at, [], any).up).toBe(false);
    const s = cheerStep({ rider: 5, near: true, hold: 1 }, 0.1, at, [{ x: 50, z: 0 }], any);
    expect(s.rider).toBe(0);
  });

  it("gives an item's supporters a few favourite riders, all different", () => {
    let k = 0;
    const rnd = () => ((k += 0.37) % 1);
    const fav = supporterFavourites(20, rnd);
    expect(fav).toHaveLength(SUPPORTER_RIDERS);
    expect(new Set(fav).size).toBe(SUPPORTER_RIDERS);
    expect(fav.every((i) => i >= 0 && i < 20)).toBe(true);
    expect(supporterFavourites(2, rnd).sort()).toEqual([0, 1]);
  });
});
