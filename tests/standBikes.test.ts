import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SceneryDef } from '../src/core/trackParts';
import { paddockParts, type StandBike } from '../src/world/paddock';

// Bikes on stands are tagged in the meshes they are built from, so the race view can swap each for
// Boss's paddock stand and race bike (RaceView.standBikes; Boss, 1 Nov 2026).
const scenery: SceneryDef[] = JSON.parse(readFileSync('public/data/trackParts.json', 'utf8')).scenery;
const def = (id: string) => scenery.find((s) => s.id === id)!;
const tags = (parts: { userData: { standBike?: StandBike } }[]) => new Set(parts.map((p) => p.userData.standBike).filter(Boolean));

describe('bikes on stands for the paddock stand model', () => {
  it('tags every mesh of a bike on a stand item, so swapping it leaves nothing else to draw', () => {
    // The race view must not merge an empty list then: it threw on load before (Boss's game, 1 Nov 2026).
    for (const variant of ['adult', 'youth', 'mini', 'pitbike', 'enduro', 'twinshock']) {
      const parts = paddockParts(def('bike_stand'), { type: 'bike_stand', x: 0, y: 0, variant, color: '#3b86da' }, 0);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.every((p) => p.userData.standBike)).toBe(true);
      const [tag] = [...tags(parts)] as StandBike[];
      expect(tags(parts).size).toBe(1);
      expect(tag).toMatchObject({ x: 0, z: 0, colour: 0x3b86da, design: variant, ry: 0 });
    }
  });

  it("tags each bike under a van's awning apart, and leaves the van itself untagged", () => {
    const parts = paddockParts(def('mx_van'), { type: 'mx_van', x: 0, y: 0, action: 'awning_bikes' }, 0);
    expect(tags(parts).size).toBe(2);
    expect(parts.some((p) => !p.userData.standBike)).toBe(true);
  });
});
