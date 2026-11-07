import { describe, expect, it } from 'vitest';
import { levelForXp, levelStatus, xpForLevel } from '../src/core/skills';

// The Skills tab's hover and tap box: current XP and the XP the next level starts at (Boss, 31 Oct 2026).
describe('skill level status', () => {
  it('gives the XP the next level starts at and how much is left', () => {
    expect(levelStatus(0)).toEqual({ level: 1, xp: 0, next: xpForLevel(2), toGo: xpForLevel(2) });
    const xp = xpForLevel(9) + 10;
    const s = levelStatus(xp);
    expect(s.level).toBe(9);
    expect(s.next).toBe(xpForLevel(10));
    expect(s.toGo).toBe(xpForLevel(10) - xp);
    expect(levelForXp(s.next!)).toBe(10);
  });

  it('scales the next level by a lead skill’s multiplier', () => {
    const s = levelStatus(412, 7);
    expect(s.level).toBe(levelForXp(412, 7));
    expect(s.next).toBe(Math.ceil(xpForLevel(s.level + 1) * 7));
    expect(levelForXp(s.next!, 7)).toBe(s.level + 1);
  });

  it('has no next level at the top', () => {
    expect(levelStatus(xpForLevel(99) + 5)).toEqual({ level: 99, xp: xpForLevel(99) + 5, next: null, toGo: 0 });
  });
});
