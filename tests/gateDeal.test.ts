import { describe, expect, it } from 'vitest';
import { dealGates, gateBonus, seenGates } from '../src/core/race';

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

describe('reading the gates (Boss, 4 Nov 2026)', () => {
  // "More gates become visible as you level up, no specific gates, it's random and if the gate is
  // already taken, unlucky. So the higher level you are the more beneficial it is."
  const curve = { gates: [6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0, -0.5, -1, -1.5] };
  const slots = [...Array(16).keys()];

  it('shows none at Starts 1, every gate at the top level, and more as the level rises', () => {
    expect(seenGates(curve, slots, 1, 99).size).toBe(0);
    expect(seenGates(curve, slots, 99, 99).size).toBe(16);
    let last = -1;
    for (let lv = 1; lv <= 99; lv++) {
      const n = seenGates(curve, slots, lv, 99).size;
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(seenGates(curve, slots, 50, 99).size).toBe(8);
  });

  it('picks random gates, the same for the same moto, and different ones for another deal', () => {
    const a = dealGates(curve, 1, 16);
    const b = dealGates(curve, 2, 16);
    expect([...seenGates(a, slots, 50, 99)]).toEqual([...seenGates(a, slots, 50, 99)]);
    expect([...seenGates(a, slots, 50, 99)].sort()).not.toEqual([...seenGates(b, slots, 50, 99)].sort());
    // A higher level sees what a lower one saw, and more.
    for (const g of seenGates(a, slots, 30, 99)) expect(seenGates(a, slots, 60, 99).has(g)).toBe(true);
  });

  it('only reads the gates in use (sidecars: the even gates)', () => {
    const even = slots.filter((g) => g % 2 === 0);
    for (const g of seenGates(curve, even, 99, 99)) expect(g % 2).toBe(0);
  });
});
