import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { BANNER_FILE, BANNER_SIZES, bannerNames, bannerPath, PICTURE_ITEMS } from '../src/core/banners';

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
});
