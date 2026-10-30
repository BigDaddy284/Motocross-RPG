import { describe, expect, it } from 'vitest';
import { assignCrews, boardOut, boardText, flagState } from '../src/core/finishCrew';

const r = (id: string, dist: number, state: 'riding' | 'retired' = 'riding') => ({ id, dist, state });

describe('the flag man', () => {
  const spot = -0.02; // just before the finish line
  const ap = 0.15;
  it('holds nothing until the leader comes up to start the last lap', () => {
    expect(flagState(spot, ap, 5, [r('a', 3.5), r('b', 3.2)])).toBe('none');
    expect(flagState(spot, ap, 5, [r('a', 3.84), r('b', 3.2)])).toBe('white');
  });
  it('holds the white flag through the last lap until the leader comes round again', () => {
    expect(flagState(spot, ap, 5, [r('a', 4.5), r('b', 4.1)])).toBe('white');
    expect(flagState(spot, ap, 5, [r('a', 4.84), r('b', 4.3)])).toBe('chequered');
  });
  it('holds the chequered flag until the last rider still racing has passed him', () => {
    expect(flagState(spot, ap, 5, [r('a', 5.1), r('b', 4.9)])).toBe('chequered');
    expect(flagState(spot, ap, 5, [r('a', 5.2), r('b', 4.99), r('c', 2.0, 'retired')])).toBe('none');
  });
  it('shows no white flag in a one-lap race, and nothing with no laps (practice)', () => {
    expect(flagState(spot, ap, 1, [r('a', 0.5)])).toBe('none');
    expect(flagState(spot, ap, 1, [r('a', 0.9)])).toBe('chequered');
    expect(flagState(spot, ap, undefined, [r('a', 4.9)])).toBe('none');
  });
});

describe('the pit crew', () => {
  const spot = 0.02; // just after the finish line
  it('hold the board out as their rider comes up and until just after they pass', () => {
    expect(boardOut(spot, 0.15, 0.02, 5, 1.5, 'riding')).toBe(false);
    expect(boardOut(spot, 0.15, 0.02, 5, 1.9, 'riding')).toBe(true);
    expect(boardOut(spot, 0.15, 0.02, 5, 2.03, 'riding')).toBe(true);
    expect(boardOut(spot, 0.15, 0.02, 5, 2.06, 'riding')).toBe(false);
  });
  it('not on the start straight, for a retired rider or as the rider comes round to finish', () => {
    expect(boardOut(spot, 0.15, 0.02, 5, -0.05, 'riding')).toBe(false);
    expect(boardOut(spot, 0.15, 0.02, 5, 1.95, 'retired')).toBe(false);
    expect(boardOut(spot, 0.15, 0.02, 5, 4.01, 'riding')).toBe(true);
    expect(boardOut(spot, 0.15, 0.02, 5, 4.9, 'riding')).toBe(false);
    expect(boardOut(spot, 0.15, 0.02, 5, 5.01, 'riding')).toBe(false);
  });
  it('show the place and the laps to go, LAST for the last lap', () => {
    expect(boardText(3, 5, spot, 0.15, 2.9)).toEqual(['P3', '2 L']);
    expect(boardText(1, 5, spot, 0.15, 3.95)).toEqual(['P1', 'LAST']);
    expect(boardText(1, 5, spot, 0.15, 4.01)).toEqual(['P1', 'LAST']);
  });
  it('are given CPU riders, the same each time, different while there are enough', () => {
    const ids = ['player', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const picks = assignCrews(3, ids, 'player', 4);
    expect(picks).toEqual(assignCrews(3, ids, 'player', 4));
    expect(picks).not.toContain('player');
    expect(new Set(picks).size).toBe(3);
  });
});
