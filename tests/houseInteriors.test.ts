import { describe, expect, it } from 'vitest';
import { loadMaps } from './helpers';
import areasJson from '../public/data/areas.json';

// Upgraded house interiors (Boss, 1 Nov 2026: "Work on house reskins and upgraded interiors… as we need
// this for each area"): from Area 3 each house has its own inside, bigger as the house costs more,
// with the wardrobe and chest every house has.
const maps = loadMaps();
const houses = areasJson.areas.filter((a) => a.n >= 3 && a.house);

describe('house interiors for Areas 3 to 8 (Boss, 1 Nov 2026)', () => {
  it('gives each house its own inside, with the wardrobe and chest', () => {
    const terrace = maps.get('int-home-starter-terrace')!;
    for (const a of houses) {
      const m = maps.get(`int-a${a.n}-rented-room`)!;
      expect(m.title, m.id).toBe(`${a.house!.name} (${a.name})`);
      expect(m.width * m.height, m.id).toBeGreaterThan(terrace.width * terrace.height);
      const acts = m.objects.filter((o) => o.type === 'interact').map((o) => o.props.action).sort();
      expect(acts, m.id).toEqual(['outfit', 'storage.parts']);
      expect(m.objects.filter((o) => o.type === 'exit').map((o) => o.props.interior)).toEqual([`int.a${a.n}.rented_room`]);
    }
  });

  it('grows with the price of the house', () => {
    const size = (n: number) => { const m = maps.get(`int-a${n}-rented-room`)!; return m.width * m.height; };
    const sorted = [...houses].sort((x, y) => x.house!.price - y.house!.price);
    for (let i = 1; i < sorted.length; i++) expect(size(sorted[i].n)).toBeGreaterThan(size(sorted[i - 1].n));
  });
});
