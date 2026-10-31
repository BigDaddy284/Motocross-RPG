import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The safety rail on the town stamp (Areas 2 to 8 maps, Piece 0; Boss, 31 Oct 2026): tools/gen-area.mjs
// must never overwrite a drawn map with Home Town's copy. A map is drawn when import-art bakes it
// (tools/art-maps.mjs AREA_MAPS) or the art folder has a .tmj for it.
type Step = { n: number; map: string; stamp: string[]; skip: string[] };
const plan = (art: string): Step[] => {
  const out = execFileSync(process.execPath, ['tools/gen-area.mjs', art, '--plan'], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop()!);
};
const artFolder = (files: string[]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-area-art-'));
  for (const f of files) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), '{}');
  }
  return dir;
};
const AREA_MAPS = fs.readFileSync('tools/art-maps.mjs', 'utf8').match(/area-map\/tiled\/maps\/[a-z0-9-]+\.tmj/g)!.map((f) => path.basename(f, '.tmj'));

describe('the town stamp skips drawn maps (tools/gen-area.mjs)', () => {
  it('stamps no map that import-art bakes from Tiled', () => {
    const steps = plan(artFolder([]));
    expect(steps.map((s) => s.n)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (const s of steps) {
      expect(s.stamp.length + s.skip.length, `area ${s.n}`).toBe(8);
      for (const id of s.stamp) expect(AREA_MAPS, id).not.toContain(id);
      for (const id of s.skip) expect(AREA_MAPS, id).toContain(id);
    }
  });

  it('leaves a town alone once its .tmj is in the art folder, but still stamps its insides', () => {
    const steps = plan(artFolder(['area-map/tiled/maps/area3-beach-town.tmj']));
    const a3 = steps.find((s) => s.n === 3)!;
    expect(a3.skip).toEqual(['area3-beach-town']);
    expect(a3.stamp).toContain('int-a3-local-garage');
    expect(a3.stamp).not.toContain('area3-beach-town');
    for (const s of steps.filter((x) => x.n !== 3 && !AREA_MAPS.includes(x.map))) expect(s.stamp).toContain(s.map);
  });

  it('leaves a drawn inside alone and stamps the rest of its town', () => {
    const steps = plan(artFolder(['buildings/tiled/maps/interiors/int-a8-tool-shop.tmj']));
    const a8 = steps.find((s) => s.n === 8)!;
    expect(a8.skip).toEqual(['int-a8-tool-shop']);
    expect(a8.stamp).toContain('int-a8-rented-room');
  });

  it('writes nothing when asked for the plan', () => {
    const before = fs.readFileSync('public/assets/manifest.json', 'utf8');
    plan(artFolder(['area-map/tiled/maps/area2-mountain-town.tmj']));
    expect(fs.readFileSync('public/assets/manifest.json', 'utf8')).toBe(before);
  });
});
