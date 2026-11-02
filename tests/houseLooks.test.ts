import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { shownLook } from '../src/core/house';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const manifest = loadManifest();
const content = checkContent(rawContent(), manifest, maps).content!;

describe('a bought house loses its For Sale sign (Boss, 2 Nov 2026)', () => {
  for (const a of content.areas.areas.filter((x) => x.house?.sold)) {
    it(`Area ${a.n}'s ${a.house!.name}: the sold patch exists and sits on the house front`, () => {
      const sold = a.house!.sold!;
      expect(fs.existsSync(path.join('public/assets', sold.image)), sold.image).toBe(true);
      const map = maps.get(a.map)!;
      const b = map.objects.find((o) => o.type === 'building' && o.name === a.house!.door)!;
      const front = map.sprites.find((s) => s.x === b.x && s.y === b.y)!;
      expect(front).toBeTruthy();
      const png = fs.readFileSync(path.join('public/assets', sold.image));
      const w = png.readUInt32BE(16);
      const h = png.readUInt32BE(20);
      expect(sold.at[0] + w).toBeLessThanOrEqual(front.w);
      expect(sold.at[1] + h).toBeLessThanOrEqual(front.h);
    });
  }
});

describe('race kit in the bike brand colours (Boss, 2 Nov 2026)', () => {
  const has = (s: string) => !!manifest.characters.sheets[s];
  it('every bought kit has a sheet in every brand, and own clothes stay as they are', () => {
    for (const o of content.house.outfits.filter((x) => x.id !== 'start' && !x.award)) {
      for (const sheet of Object.values(o.sheets)) for (const b of content.bikes.brands) expect(shownLook(sheet, b.id, has), `${sheet} ${b.id}`).toBe(`${sheet}-${b.id}`);
    }
    expect(shownLook('player-m-start-a', 'yamamoto', has)).toBe('player-m-start-a');
  });
});
