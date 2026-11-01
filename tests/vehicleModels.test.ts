import { describe, expect, it } from 'vitest';
import { FACTORY_TEAM, HAULER_BRANDS, haulerWords, showsInSetup } from '../src/core/paddock';
import { rawContent } from './helpers';

// Vehicle models (Boss, 1 Nov 2026): the hauler's words follow its colour, and a model's parts show in the set-ups named on them.
const raw = rawContent() as { bikes: { brands: { name: string }[] }; trackParts: { scenery: { id: string; colours?: string[] }[] } };

describe('vehicle models', () => {
  it('names the factory team by the hauler colour, a bike brand in its colour, else a plain factory team', () => {
    expect(haulerWords('#2a4a90')).toBe('YAMAMOTO FACTORY RACING');
    expect(haulerWords('#C82828')).toBe('HONDMOTO FACTORY RACING');
    expect(haulerWords('#e07020')).toBe(FACTORY_TEAM);
    const hauler = raw.trackParts.scenery.find((s) => s.id === 'hauler')!;
    const brands = raw.bikes.brands.map((b) => b.name);
    for (const [colour, brand] of Object.entries(HAULER_BRANDS)) {
      expect(hauler.colours).toContain(colour);
      expect(brands).toContain(brand);
    }
    // Every brand has its hauler colour.
    expect(new Set(Object.values(HAULER_BRANDS))).toEqual(new Set(brands));
  });

  it('shows a part only in the set-ups named on it, and a part with none always', () => {
    expect(showsInSetup(undefined, 'closed')).toBe(true);
    expect(showsInSetup('awning, awning_bikes', 'awning_bikes')).toBe(true);
    expect(showsInSetup('awning,awning_bikes', 'closed')).toBe(false);
    expect(showsInSetup('closed', undefined)).toBe(false);
  });
});
