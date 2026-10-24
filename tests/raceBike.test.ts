import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BIKE_LENGTH } from '../src/core/trackSurface';
import { BRAND_COLOURS, CPU_GEAR, GEAR_SETS, modelFor, raceBikeParts, type RaceLook } from '../src/world/raceBike';
import { readPublic } from './helpers';

const colours = (parts: THREE.Mesh[]) => new Set(parts.map((p) => (p.material as THREE.MeshLambertMaterial).color.getHex()));
const bounds = (parts: THREE.Mesh[]) => {
  const box = new THREE.Box3();
  for (const p of parts) {
    p.updateMatrixWorld(true);
    box.expandByObject(p);
  }
  return box;
};

describe('race-day bikes (Race day bike colours.png)', () => {
  const look = (brand: string, cls = '50cc', gear = 'player-default'): RaceLook => ({ brand, cls, gear: GEAR_SETS[gear] });

  it('every brand in bikes.json has its colours, and its plastics wear them', () => {
    const { brands } = readPublic<{ brands: { id: string }[] }>('data/bikes.json');
    for (const b of brands) {
      expect(BRAND_COLOURS[b.id], b.id).toBeDefined();
      expect(colours(raceBikeParts(look(b.id), BIKE_LENGTH)).has(BRAND_COLOURS[b.id].body)).toBe(true);
    }
  });

  it('the rider wears their own gear colours', () => {
    const parts = raceBikeParts(look('yamamoto', '50cc', 'cpu-pink'), BIKE_LENGTH);
    const g = GEAR_SETS['cpu-pink'];
    for (const c of [g.helmet, g.jersey, g.pants, g.boot]) expect(colours(parts).has(c)).toBe(true);
    for (const id of CPU_GEAR) expect(GEAR_SETS[id], id).toBeDefined();
  });

  it('youth classes ride the youth model, bigger classes the adult model', () => {
    expect(modelFor('50cc')).toBe('youth');
    expect(modelFor('65cc')).toBe('youth');
    expect(modelFor('85cc')).toBe('youth');
    expect(modelFor('125cc')).toBe('adult');
    expect(modelFor('open')).toBe('adult');
  });

  it('visual only: every model sits on the ground with the race bike length, so nothing else moves', () => {
    for (const cls of ['50cc', '250cc']) {
      const b = bounds(raceBikeParts(look('hondmoto', cls), BIKE_LENGTH));
      expect(b.min.y).toBeGreaterThanOrEqual(-0.02);
      expect(b.min.y).toBeLessThan(0.02);
      // Wheelbase = BIKE_LENGTH, so tyre to tyre is a little longer.
      expect(b.max.x - b.min.x).toBeGreaterThan(BIKE_LENGTH);
      expect(b.max.x - b.min.x).toBeLessThan(BIKE_LENGTH * 1.6);
      // Under the player marker, which floats 1.75 above the bike.
      expect(b.max.y).toBeLessThan(1.7);
    }
  });
});
