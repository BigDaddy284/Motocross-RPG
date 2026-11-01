import { describe, expect, it } from 'vitest';
import { dealGates, gateBonus } from '../src/core/race';

// Boss, 1 Nov 2026: "Hide the Gate + - affects, we will have start gate training in v1.5 so these will slowly be
// shown as the rider levels up. We should now fully randomise the placement of the effects so the player doesn't
// just chose the in side or out side gates all the time."
describe('gate bonuses dealt at random (Boss, 1 Nov 2026)', () => {
  const track = { gates: [3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, -1, -1, -2] };
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

  it('deals the same bonuses to the gates in use, the same way for the same seed', () => {
    const dealt = dealGates(track, 42, 16);
    expect(sorted(dealt.gates!)).toEqual(sorted(track.gates));
    expect(dealGates(track, 42, 16).gates).toEqual(dealt.gates);
    expect(track.gates[0]).toBe(3);
  });

  it('puts the best gate somewhere different from moto to moto, not always on the inside or outside', () => {
    const best = new Set<number>();
    let inside = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = dealGates(track, seed, 16);
      const top = Math.max(...t.gates!);
      const g = t.gates!.indexOf(top);
      best.add(g);
      if (gateBonus(t, 0) === top) inside++;
    }
    expect(best.size).toBeGreaterThan(10);
    expect(inside).toBeLessThan(60);
  });

  it('only trades the gates in use, so a small field keeps the same bonuses overall', () => {
    const t = dealGates(track, 7, 4);
    expect(sorted(t.gates!.slice(0, 4))).toEqual(sorted(track.gates.slice(0, 4)));
    expect(t.gates!.slice(4)).toEqual(track.gates.slice(4));
  });
});
