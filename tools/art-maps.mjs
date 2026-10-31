// The Tiled maps tools/import-art.mjs bakes, shared with tools/gen-area.mjs so the stamp never
// overwrites a drawn map (Areas 2 to 8 maps, Piece 0; Boss, 31 Oct 2026).
import fs from 'node:fs';
import path from 'node:path';

/** Default art folder: the first non-flag argument, ART_SRC, or the shared project folder. */
export const DEFAULT_ART = '/mnt/project-files/art';

/** Town and venue maps, relative to the art folder. A drawn town is added here to be baked. */
export const AREA_MAPS = [
  'area-map/tiled/maps/area1-home-town.tmj',
  'area-map/tiled/maps/area1-industrial-zone.tmj',
  'area-map/tiled/maps/venue-motocross.tmj',
  'area-map/tiled/maps/venue-enduro.tmj',
  'area-map/tiled/maps/venue-supercross.tmj',
  // Drawn towns (Areas 2 to 8 maps): never stamped again by tools/gen-area.mjs.
  'area-map/tiled/maps/area2-mountain-town.tmj',
  'area-map/tiled/maps/area3-beach-town.tmj',
  'area-map/tiled/maps/area4-forest-town.tmj',
  'area-map/tiled/maps/area5-northern-works.tmj',
  'area-map/tiled/maps/area6-highlands.tmj',
  'area-map/tiled/maps/area7-the-city.tmj',
];
/**
 * Venue maps kept for later, not on any road (one venue per race type; Boss, 30 Oct 2026): baked
 * into public/assets/maps/ but not listed in the manifest, so the game does not load them yet.
 */
export const LATER_MAPS = [
  'area-map/tiled/maps/venue-enduro-sprint.tmj',
  'area-map/tiled/maps/venue-endurocross.tmj',
  'area-map/tiled/maps/venue-no-turn.tmj',
];
/** Every .tmj in this folder is baked as an inside. */
export const INTERIOR_DIR = 'buildings/tiled/maps/interiors';
export const TOWN_DIR = 'area-map/tiled/maps';

const idOf = (f) => path.basename(f, '.tmj');

/**
 * The map ids that are drawn, so must never be stamped: every map import-art bakes from its list,
 * plus any .tmj in the art folder's town and interior folders (drawn but not yet listed).
 */
export function drawnMapIds(art) {
  const ids = new Set([...AREA_MAPS, ...LATER_MAPS].map(idOf));
  for (const dir of [TOWN_DIR, INTERIOR_DIR]) {
    const full = path.join(art, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (f.endsWith('.tmj')) ids.add(idOf(f));
  }
  return ids;
}
