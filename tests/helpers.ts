import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from '../src/core/content';
import type { BakedMap } from '../src/core/mapTypes';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export function readPublic<T = unknown>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC, rel), 'utf8'));
}

export function loadManifest(): Manifest {
  return readPublic<Manifest>('assets/manifest.json');
}

export function loadMaps(): Map<string, BakedMap> {
  const maps = new Map<string, BakedMap>();
  for (const m of loadManifest().maps) maps.set(m.id, readPublic<BakedMap>(`assets/maps/${m.id}.json`));
  return maps;
}

export function publicFileExists(rel: string): boolean {
  return fs.existsSync(path.join(PUBLIC, rel));
}
