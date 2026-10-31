import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The game's maps go back into the art folder as Tiled maps (tools/export-tmj.mjs; Boss, 31 Oct 2026:
// "Can you do it so the latest art work is where it needs to be"), and baking them again gives the
// game's maps exactly, so a full import never undoes an edit made in the game.
const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
const LATER = ['venue-enduro-sprint', 'venue-endurocross', 'venue-no-turn'];
const ids = [...manifest.maps.map((m: { id: string }) => m.id), ...LATER].filter((id: string) => !/^(area[2-8]-|int-a[2-8]-)/.test(id));

describe('the map export round trip (tools/export-tmj.mjs, tools/import-art.mjs)', () => {
  it('bakes every exported map back to the game map it came from', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tmj-'));
    const art = path.join(tmp, 'art');
    const out = path.join(tmp, 'out');
    fs.mkdirSync(path.join(art, 'buildings/data'), { recursive: true });
    fs.writeFileSync(path.join(art, 'buildings/data/area1-buildings-v3.json'), '{"buildings":[]}');
    fs.mkdirSync(path.join(out, 'maps'), { recursive: true });
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ maps: [] }));
    execFileSync(process.execPath, ['tools/export-tmj.mjs', art, '--images'], { encoding: 'utf8' });
    // The bike on its stand is drawn from the vehicles thread's picture (import-art OVERRIDES).
    fs.mkdirSync(path.join(art, 'vehicles/sheets/furniture'), { recursive: true });
    fs.copyFileSync('public/assets/art/buildings/tiled/tiles/interior-furniture/bike_on_stand+shadow.png', path.join(art, 'vehicles/sheets/furniture/bike_on_stand+shadow.png'));
    execFileSync(process.execPath, ['tools/import-art.mjs', '--maps', ids.join(','), art], { encoding: 'utf8', env: { ...process.env, IMPORT_OUT: out } });
    expect(ids.length).toBeGreaterThanOrEqual(21);
    for (const id of ids) {
      const game = fs.readFileSync(path.join('public/assets/maps', `${id}.json`), 'utf8').trim();
      const baked = fs.readFileSync(path.join(out, 'maps', `${id}.json`), 'utf8').trim();
      expect(baked, id).toBe(game);
    }
    // The later venue maps are baked but not listed, so the game does not load them yet.
    const listed = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).maps.map((m: { id: string }) => m.id);
    for (const id of LATER) expect(listed).not.toContain(id);
  }, 120_000);
});
