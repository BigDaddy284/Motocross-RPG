import { describe, expect, it } from 'vitest';
import { ON_FOOT, needsMotor } from '../src/core/vehicles';

// Boss, 2 Nov 2026: "the player can't travel to or from an area or venue without his vehicle".
describe('no walking between areas and venues', () => {
  it('a road out needs the motor when it is parked on this map', () => {
    expect(needsMotor({ map: 'area1-home-town' }, 'area1-home-town', false)).toBe(true);
    expect(needsMotor({ map: 'venue-motocross' }, 'venue-motocross', false)).toBe(true);
  });

  it('driving goes, and a rider whose motor is elsewhere or not bought yet is never stranded', () => {
    expect(needsMotor({ map: 'area1-home-town' }, 'area1-home-town', true)).toBe(false);
    expect(needsMotor({ map: 'area1-home-town' }, 'area2-mountain-town', false)).toBe(false);
    expect(needsMotor(null, 'area1-home-town', false)).toBe(false);
  });

  it('the rider says so to themself', () => {
    expect(ON_FOOT).toMatch(/on foot.*motor/i);
  });
});
