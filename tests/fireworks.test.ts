import { describe, expect, it } from 'vitest';
import { FIREWORK_KINDS, FIREWORKS_LEAD, fireworkShow, fireworksDue, SHOW_SECONDS } from '../src/core/fireworks';

const r = (dist: number, speed = 10, state: 'riding' | 'retired' = 'riding') => ({ dist, speed, state });

describe('finish arch fireworks (Boss, 30 Oct 2026)', () => {
  it('go off on Supercross, EnduroCross and No-Turn Takedown tracks only', () => {
    expect([...FIREWORK_KINDS].sort()).toEqual(['endurocross', 'no_turn', 'stadium']);
    expect(FIREWORK_KINDS.has('outdoor')).toBe(false);
  });
  it('start a little before the winner crosses the line', () => {
    const lap = 400;
    // 10 m/s for FIREWORKS_LEAD seconds is 12 m, 0.03 of the lap.
    const lead = (10 * FIREWORKS_LEAD) / lap;
    expect(fireworksDue(5, [r(5 - lead - 0.01), r(4.5)], lap)).toBe(false);
    expect(fireworksDue(5, [r(5 - lead + 0.001), r(4.5)], lap)).toBe(true);
    expect(fireworksDue(5, [r(5.2), r(4.9)], lap)).toBe(true);
  });
  it("don't go off without a race distance, or for a retired rider", () => {
    expect(fireworksDue(undefined, [r(5)], 400)).toBe(false);
    expect(fireworksDue(5, [r(5, 10, 'retired'), r(3)], 400)).toBe(false);
  });
  it('send shells up from every post through the show, the same each time', () => {
    const show = fireworkShow(2, 42);
    expect(show).toEqual(fireworkShow(2, 42));
    expect(new Set(show.map((s) => s.post))).toEqual(new Set([0, 1]));
    expect(show.every((s) => s.at >= 0 && s.at < SHOW_SECONDS)).toBe(true);
    expect(show.length).toBeGreaterThan(10);
  });
});
