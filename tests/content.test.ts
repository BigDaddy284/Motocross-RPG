import { describe, expect, it } from 'vitest';
import { checkContent, npcsOnMap } from '../src/core/content';
import { formatError } from '../src/core/validate';
import { loadManifest, loadMaps, publicFileExists, readPublic } from './helpers';

const manifest = loadManifest();
const maps = loadMaps();
const raw = () => ({ npcs: readPublic('data/npcs.json'), dialogue: readPublic('data/dialogue.json') });

describe('content files', () => {
  it('pass every check', () => {
    const { errors } = checkContent(raw(), manifest, maps);
    expect(errors.map(formatError)).toEqual([]);
  });

  it('every image the maps and characters use exists', () => {
    const missing: string[] = [];
    for (const m of maps.values()) for (const img of m.images) if (!publicFileExists(`assets/${img}`)) missing.push(`${m.id}: ${img}`);
    for (const s of Object.values(manifest.characters.sheets)) for (const img of [s.walk, s.act]) if (!publicFileExists(`assets/${img}`)) missing.push(img);
    expect(missing).toEqual([]);
  });

  it('a broken file is rejected with a message naming the file and field', () => {
    const r = raw() as { npcs: { npcs: Record<string, unknown>[] }; dialogue: unknown };
    r.npcs.npcs[1].facing = 'sideways';
    delete r.npcs.npcs[2].name;
    const { content, errors } = checkContent(r, manifest, maps);
    expect(content).toBeNull();
    expect(errors.map(formatError)).toEqual([
      'data/npcs.json: npcs[1].facing: "sideways" must be one of down, left, right, up',
      'data/npcs.json: npcs[2].name: is missing',
    ]);
  });

  it('catches references to things that do not exist', () => {
    const r = raw() as { npcs: { npcs: Record<string, unknown>[] }; dialogue: unknown };
    r.npcs.npcs[0].sprite = 'npc-99-nobody';
    r.npcs.npcs[0].tile = [0, 0];
    const { errors } = checkContent(r, manifest, maps);
    expect(errors.map((e) => e.field)).toEqual(['npcs[0].sprite', 'npcs[0].tile']);
  });

  it('places map-spot NPCs and tile-placed NPCs', () => {
    const { content } = checkContent(raw(), manifest, maps);
    const town = npcsOnMap(content!, maps.get('area1-home-town')!);
    expect(town.map((p) => p.npc.id)).toContain('npc.local_racer');
    const garage = npcsOnMap(content!, maps.get('int-home-local-garage')!);
    expect(garage.map((p) => p.npc.id)).toEqual(['npc.garage_mechanic']);
  });
});
