import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BIKE_LENGTH } from '../src/core/trackSurface';
import { BIKE_MODELS, BRAND_COLOURS, bikeColours, CPU_GEAR, GEAR_SETS, MODELS, modelFor, raceBikeParts, type RaceLook } from '../src/world/raceBike';
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
/** Where one wheel's tyre meets the ground: the middle of the lowest points near that end of the bike. */
const tyreBottom = (parts: THREE.Mesh[], x: number) => {
  const pts: THREE.Vector3[] = [];
  for (const p of parts) {
    p.updateMatrixWorld(true);
    const pos = p.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(p.matrixWorld);
      if (Math.abs(v.x - x) < 0.25) pts.push(v);
    }
  }
  const low = Math.min(...pts.map((v) => v.y));
  const bottom = pts.filter((v) => v.y < low + 0.003);
  return bottom.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(bottom.length);
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
    expect(['50cc', '65cc', '85cc', '125cc', '250cc', 'open'].map(modelFor)).toEqual(['youth', 'youth', 'youth', 'adult', 'adult', 'adult']);
  });

  it('the scenery models (mini, pit bike, enduro, twin-shock) build to their own wheelbase and never ride in a race', () => {
    expect(BIKE_MODELS.map(([id]) => id)).toEqual(['adult', 'youth', 'mini', 'pitbike', 'enduro', 'twinshock']);
    for (const [id] of BIKE_MODELS) {
      const wb = (MODELS[id].wb / 1.46) * BIKE_LENGTH;
      const parts = raceBikeParts(look('hondmoto', '250cc'), wb, { rider: false, model: id });
      expect(parts.length).toBeGreaterThan(20);
      for (const x of [-wb / 2, wb / 2]) {
        const t = tyreBottom(parts, x);
        expect(t.y).toBeCloseTo(0, 2);
        expect(t.x).toBeCloseTo(x, 2);
      }
    }
    expect(MODELS.mini.wb).toBeLessThan(MODELS.pitbike.wb);
    expect(colours(raceBikeParts(look('hondmoto', '250cc'), BIKE_LENGTH, { rider: false, model: 'enduro' })).has(0xfff6c0)).toBe(true);
    // Races only ever pick the youth or adult model from the class.
    expect(new Set(['50cc', '65cc', '85cc', '125cc', '250cc', 'open'].map(modelFor))).toEqual(new Set(['youth', 'adult']));
  });

  it('the tyres touch the ground exactly where the old bike\'s wheels did, so riders go round the track the same', () => {
    for (const cls of ['50cc', '250cc']) {
      const parts = raceBikeParts(look('hondmoto', cls), BIKE_LENGTH);
      for (const x of [-BIKE_LENGTH / 2, BIKE_LENGTH / 2]) {
        const t = tyreBottom(parts, x);
        expect(t.y).toBeCloseTo(0, 2);
        expect(t.x).toBeCloseTo(x, 2);
        expect(t.z).toBeCloseTo(0, 2);
      }
      const b = bounds(parts);
      expect(b.min.y).toBeGreaterThan(-0.005);
      // Under the player marker, which floats 1.75 above the bike.
      expect(b.max.y).toBeLessThan(1.7);
    }
  });

  it('without a look the old single-colour scheme is unchanged', () => {
    expect(bikeColours(0x3366cc, true)).toEqual({ plastics: 0x3366cc, frame: 0x9a9aa0, plate: 0xf4f4f4, legs: 0x264d99, torso: 0x3366cc, arms: 0x264d99, helmet: 0xffffff, visor: 0x1c1c22 });
  });
});
