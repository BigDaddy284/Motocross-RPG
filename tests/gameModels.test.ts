import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCH_MODELS, modelEntry, RACE_BIKE, RACE_BIKE_YOUTH, RACE_RIDER, SIDECAR_CREW, SIDECAR_MODEL } from '../src/core/modModels';
import type { SceneryDef } from '../src/core/trackParts';
import { isTrackside } from '../src/world/trackside';

// The game's own models (Boss, 2 Nov 2026: "I want the models you made to become the built in
// models"): Boss's .glb files ship in public/assets/models as how every item looks, and the old
// box-built items they replaced are gone. The models folder (public/mods/models) is left for
// anyone's own models.
const DIR = 'public/assets/models';
const scenery: SceneryDef[] = JSON.parse(readFileSync('public/data/trackParts.json', 'utf8')).scenery;
const files = readdirSync(DIR).filter((f) => f.endsWith('.glb'));
const ids = new Set(files.map((f) => f.slice(0, -4)));
/** The items still built in code: a start gate and sprint start fitted to the track, the skip (Boss kept the game's own), and a bike on a stand in each of its designs. */
const BUILT_IN_CODE = ['bike_stand', 'skip', 'sprint_start', 'start_gate'];

describe("the game's own models", () => {
  it('are all usable, each replacing one of the game items', () => {
    expect(files.length).toBeGreaterThan(80);
    for (const f of files) {
      const e = modelEntry(f, new Uint8Array(readFileSync(`${DIR}/${f}`)), scenery);
      expect(e.problems, f).toEqual([]);
      expect(e.role, f).not.toBe('new');
    }
  });

  it('cover every scenery item but the few still built in code, and the bikes, riders and arches', () => {
    const missing = scenery.map((d) => d.id).filter((id) => id !== 'finish_arch' && !ids.has(id));
    expect(missing.sort()).toEqual(BUILT_IN_CODE);
    for (const id of [RACE_BIKE, RACE_BIKE_YOUTH, RACE_RIDER, SIDECAR_MODEL, SIDECAR_CREW, ARCH_MODELS.mx, ARCH_MODELS.sx]) expect(ids.has(id), id).toBe(true);
  });

  it('replace the old box-built items, which are gone', () => {
    expect(scenery.filter((d) => isTrackside(d.id)).map((d) => d.id)).toEqual(['sprint_start']);
  });

  it('leave the models folder for anyone\'s own', () => {
    expect(readdirSync('public/mods/models').filter((f) => f.endsWith('.glb'))).toEqual([]);
  });
});
