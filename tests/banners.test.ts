import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { BANNER_FILE, BANNER_SIZES, bannerNames, bannerPath, PICTURE_ITEMS } from '../src/core/banners';
import type { SceneryDef } from '../src/core/trackParts';
import { tracksideParts } from '../src/world/trackside';

// Banner pictures: a PNG from public/mods/banners/ on a banner or sponsor board instead of its words (Boss, 1 Nov 2026).
describe('banner pictures', () => {
  it('finds a picture by its name, and nothing for a bad one', () => {
    expect(bannerPath('acme_oils')).toBe('mods/banners/acme_oils.png');
    expect(bannerPath(undefined)).toBeNull();
    expect(bannerPath('../secret')).toBeNull();
    expect(bannerPath('Acme Oils')).toBeNull();
  });

  it('lists only the PNGs the folder accepts, by name', () => {
    expect(bannerNames(['b.png', 'a.png', 'index.json', 'Bad Name.png', 'x.jpg', 3])).toEqual(['a', 'b']);
    expect(bannerNames(null)).toEqual([]);
  });

  it('gives the banner and sponsor board a size each, and ships an example of each', () => {
    expect([...PICTURE_ITEMS].sort()).toEqual(Object.keys(BANNER_SIZES).sort());
    expect(BANNER_SIZES.banner).toEqual([2000, 200]);
    const files = existsSync('public/mods/banners') ? readdirSync('public/mods/banners') : [];
    for (const f of ['example_banner.png', 'example_sponsor_board.png']) {
      expect(files).toContain(f);
      expect(BANNER_FILE.test(f)).toBe(true);
    }
  });

  // Every item with its own words can show a picture (Boss, 2 Nov 2026: "do the same for sponsor banner and flags ect").
  const scenery = (JSON.parse(readFileSync('public/data/trackParts.json', 'utf8')) as { scenery: SceneryDef[] }).scenery;
  it('lets every item with its own words show a picture, but not the start board or the lighting truss', () => {
    const worded = scenery.filter((d) => d.text !== undefined && d.id !== 'start_official' && d.id !== 'truss_arch').map((d) => d.id).sort();
    expect([...PICTURE_ITEMS].sort()).toEqual(worded);
    expect(PICTURE_ITEMS.has('feather_flags')).toBe(true);
    expect(BANNER_SIZES.feather_flags[1]).toBeGreaterThan(BANNER_SIZES.feather_flags[0]);
  });

  it('gives the track editor the same items and sizes', () => {
    const html = readFileSync('tools/track-editor.html', 'utf8');
    const block = /const PICTURE_SIZES = (\{[\s\S]*?\});/.exec(html)?.[1] ?? '';
    const sizes = Function(`return ${block}`)() as Record<string, [number, number]>;
    expect(sizes).toEqual(BANNER_SIZES);
  });

  it("marks the item's own words on the game's own items, where its picture goes", () => {
    for (const d of scenery.filter((x) => PICTURE_ITEMS.has(x.id))) {
      for (const variant of d.variants?.map(([v]) => v) ?? [undefined]) {
        const built = tracksideParts(d, { type: d.id, x: 0, y: 0, variant }, 1);
        if (!built) continue; // the game's own model (public/assets/models), its words on its Text faces
        expect(built.labels.some((l) => l.picture && l.text === (d.text ?? '')), `${d.id} ${variant ?? ''}`).toBe(true);
        expect(built.labels.filter((l) => l.picture).every((l) => l.text === (d.text ?? ''))).toBe(true);
      }
    }
  });
});
