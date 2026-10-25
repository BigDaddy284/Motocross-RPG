import { describe, expect, it } from 'vitest';
import { BRAND_COLOURS, bikeColours, CPU_GEAR, GEAR_SETS, type RaceLook } from '../src/world/raceBike';
import { readPublic } from './helpers';

describe('race-day bike colours (Race day bike colours.png)', () => {
  const look = (brand: string, gear = 'player-default'): RaceLook => ({ brand, gear: GEAR_SETS[gear] });

  it('every brand in bikes.json has its colours, and the plastics, frame and plate wear them', () => {
    const { brands } = readPublic<{ brands: { id: string }[] }>('data/bikes.json');
    for (const b of brands) {
      const brand = BRAND_COLOURS[b.id];
      expect(brand, b.id).toBeDefined();
      const c = bikeColours(0, false, look(b.id));
      expect([c.plastics, c.frame, c.plate]).toEqual([brand.body, brand.frame, brand.plate]);
    }
  });

  it('the rider wears their own gear colours', () => {
    const g = GEAR_SETS['cpu-pink'];
    const c = bikeColours(0, false, look('yamamoto', 'cpu-pink'));
    expect([c.helmet, c.visor, c.torso, c.arms, c.legs]).toEqual([g.helmet, g.visor, g.jersey, g.jersey, g.pants]);
    for (const id of CPU_GEAR) expect(GEAR_SETS[id], id).toBeDefined();
  });

  it('without a look the old single-colour scheme is unchanged', () => {
    expect(bikeColours(0x3366cc, true)).toEqual({ plastics: 0x3366cc, frame: 0x9a9aa0, plate: 0xf4f4f4, legs: 0x264d99, torso: 0x3366cc, arms: 0x264d99, helmet: 0xffffff, visor: 0x1c1c22 });
  });
});
