#!/usr/bin/env node
// Imports the art threads' Tiled maps and sprites into the game.
//
// Reads from the shared art folder (default /mnt/project-files/art, or ART_SRC / first argument),
// copies every image a map or character uses into public/assets/art/, and bakes each Tiled map
// into one game-ready JSON file in public/assets/maps/. The game never reads .tmj or .tsj files
// directly: Phaser cannot load image-collection tilesets, and baking also resolves building
// sprites, collision, edge walls and data objects once instead of on every load.
//
//   node tools/import-art.mjs [/path/to/art]
//   node tools/import-art.mjs --vehicles [/path/to/art]   only the van sheets, leaving the maps as they are
//   node tools/import-art.mjs --maps area2-mountain-town[,int-a2-local-garage] [/path/to/art]
//
// --maps bakes only the named maps (a town .tmj in area-map/tiled/maps/ or an inside in the interiors
// folder), copies only images the game does not have yet, and leaves every other map, image and the
// rest of the manifest as they are (Areas 2 to 8 maps, Piece 0; Boss, 31 Oct 2026).
//
// A full import rebuilds public/assets/maps/ and adds or replaces images, never removing one, and
// leaves an image alone when the art folder's copy is the same picture. On 31 Oct 2026 the art folder
// was brought up to date with the game (tools/sync-art-folder.mjs, tools/export-tmj.mjs: the game's
// maps, NPC sprites, building sheet and track official went back into it), so a full import now gives
// the game it has. A map edited in the game (map editor, hand fix) goes back with
// `node tools/export-tmj.mjs --maps <id>` before the next full import, or that import undoes it.
//
// The bake replaces public/assets/maps/ whole, so it ends by re-stamping the towns not yet drawn
// (tools/gen-area.mjs, which skips every drawn map; Boss, 31 Oct 2026). The maps it bakes are
// listed in tools/art-maps.mjs: add a drawn town's .tmj there.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { AREA_MAPS, DEFAULT_ART, INTERIOR_DIR, LATER_MAPS, TOWN_DIR } from './art-maps.mjs';
import { stampAreas } from './gen-area.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const VEHICLES_ONLY = ARGS.includes('--vehicles');
const mapsAt = ARGS.indexOf('--maps');
/** --maps a,b: bake only these map ids (see the header). */
const ONLY_MAPS = mapsAt >= 0 ? (ARGS[mapsAt + 1] ?? '').split(',').filter(Boolean) : null;
const ART = path.resolve(ARGS.find((a, i) => !a.startsWith('--') && (mapsAt < 0 || i !== mapsAt + 1)) ?? process.env.ART_SRC ?? DEFAULT_ART);
// IMPORT_OUT bakes somewhere other than the game's public/assets (tests/exportTmj.test.ts).
const OUT = process.env.IMPORT_OUT ? path.resolve(process.env.IMPORT_OUT) : path.join(ROOT, 'public/assets');
const OUT_ART = path.join(OUT, 'art');
const OUT_MAPS = path.join(OUT, 'maps');
const TILE = 64;
const GID_MASK = 0x1fffffff; // strips Tiled's flip flags

const BUILDINGS_DATA = 'buildings/data/area1-buildings-v3.json';


/**
 * Images another thread redraws in place of a map's own art, keyed by the path the maps use.
 * The in-world bike on its paddock stand is the vehicles thread's (Boss's brief, 24 Oct 2026:
 * "Update or revert in world bike models.png"), drawn to the same canvas so placements don't move.
 */
const OVERRIDES = {
  'buildings/tiled/tiles/interior-furniture/bike_on_stand+shadow.png': 'vehicles/sheets/furniture/bike_on_stand+shadow.png',
};

/**
 * Prop folders copied whole, whether or not a map uses them yet, so the map editor's palette offers
 * them: the parked vehicles and bikes on stands (vehgen/paddockbuild.py, Boss's brief of 27 Oct 2026).
 * The ground folders go whole too, for the track editor's ground tiles (trackParts.json ground):
 * every corner set, and the mixed tiles of tools/art/ground-mix.py.
 */
const PALETTE_DIRS = ['area-map/tiled/tiles/vehicle-props', 'area-map/tiled/tiles/bike-props', 'area-map/tiled/tiles/ground-edges', 'area-map/tiled/tiles/terrain-common', 'area-map/tiled/tiles/ground-mix'];

const copied = new Set();
let added = 0; // images a --maps bake copied in because the game lacked them

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The RGBA pixels of an 8-bit, non-interlaced RGB or RGBA PNG (what the art threads write), or null
 * for anything else. The shared project folder re-saves PNGs (same pixels, different bytes; seen
 * 31 Oct 2026), so images are compared by pixels to keep a re-import from rewriting unchanged files.
 */
function pngPixels(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8;
  let w = 0, h = 0, type = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
      if (data[8] !== 8 || (type !== 2 && type !== 6) || data[12] !== 0) return null;
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = (line[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      line.copy(out, o, x * bpp, x * bpp + bpp);
      if (bpp === 3) out[o + 3] = 255;
    }
    prev = line;
  }
  // Fully transparent pixels may keep any colour: count them as one.
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] === 0) out.writeUInt32BE(0, i);
  return { w, h, data: out };
}

/** True when two image files are the same picture, byte for byte or pixel for pixel. */
function sameImage(fileA, fileB) {
  const a = fs.readFileSync(fileA);
  const b = fs.readFileSync(fileB);
  if (Buffer.compare(a, b) === 0) return true;
  try {
    const pa = pngPixels(a), pb = pngPixels(b);
    return !!pa && !!pb && pa.w === pb.w && pa.h === pb.h && Buffer.compare(pa.data, pb.data) === 0;
  } catch {
    return false;
  }
}

/** Copies an art file into public/assets/art and returns its path relative to public/assets. */
function useImage(absPath) {
  const rel = path.relative(ART, absPath).split(path.sep).join('/');
  if (rel.startsWith('..')) throw new Error(`Image outside the art folder: ${absPath}`);
  if (!copied.has(rel)) {
    const dest = path.join(OUT_ART, rel);
    // A partial bake keeps the game's own copy of any image it already has.
    if (ONLY_MAPS && fs.existsSync(dest)) {
      copied.add(rel);
      return `art/${rel}`;
    }
    const src = OVERRIDES[rel] ? path.join(ART, OVERRIDES[rel]) : absPath;
    copied.add(rel);
    // The same picture already in the game is left as it is (no churn from re-saved files).
    if (fs.existsSync(dest) && sameImage(src, dest)) return `art/${rel}`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    added++;
  }
  return `art/${rel}`;
}

/** Tiled properties as a plain object. An empty object reference stands for null (tools/export-tmj.mjs). */
function props(list) {
  const out = {};
  for (const p of list ?? []) out[p.name] = p.type === 'object' && !p.value ? null : p.value;
  return out;
}

/** Loads a map's external tilesets and returns a gid lookup. */
function loadTilesets(mapFile, map) {
  const lookup = new Map();
  /** Images a tileset asks to bake first, in its tile order (keep_images: the first n tiles; tools/export-tmj.mjs). */
  lookup.keep = [];
  for (const ts of map.tilesets) {
    if (!ts.source) throw new Error(`${mapFile}: embedded tilesets are not supported`);
    const tsFile = path.resolve(path.dirname(mapFile), ts.source);
    const tileset = readJson(tsFile);
    const align = tileset.objectalignment ?? 'bottomleft';
    const keep = props(tileset.properties).keep_images ?? 0;
    for (const tile of (tileset.tiles ?? []).slice(0, keep)) lookup.keep.push(path.resolve(path.dirname(tsFile), tile.image));
    for (const tile of tileset.tiles ?? []) {
      lookup.set(ts.firstgid + tile.id, {
        firstgid: ts.firstgid,
        imageAbs: path.resolve(path.dirname(tsFile), tile.image),
        w: tile.imagewidth,
        h: tile.imageheight,
        align,
        props: props(tile.properties),
        animation: tile.animation ?? null,
        // A sub-rectangle of the image (Tiled 1.9+), baked as the sprite's crop.
        crop: tile.width ? [tile.x ?? 0, tile.y ?? 0, tile.width, tile.height] : null,
      });
    }
  }
  return lookup;
}

function bakeMap(mapFile, kind, buildings) {
  const map = readJson(mapFile);
  const gids = loadTilesets(mapFile, map);
  const mapProps = props(map.properties);
  // The map's title when it differs from its props (tools/export-tmj.mjs), not kept as a prop.
  const gameTitle = mapProps.game_title;
  delete mapProps.game_title;
  const id = path.basename(mapFile, '.tmj');
  const { width, height } = map;
  if (map.tilewidth !== TILE || map.tileheight !== TILE) throw new Error(`${id}: tiles must be ${TILE} px`);

  const images = [];
  const imageIndex = new Map();
  const img = (abs) => {
    const p = useImage(abs);
    if (!imageIndex.has(p)) {
      imageIndex.set(p, images.length);
      images.push(p);
    }
    return imageIndex.get(p);
  };

  for (const abs of gids.keep) img(abs);
  const ground = [];
  const sprites = [];
  const blocked = Array.from({ length: height }, () => Array(width).fill('.'));
  const edgeWalls = [];
  const objects = [];

  for (const layer of map.layers) {
    if (layer.type === 'tilelayer') {
      if (layer.name === 'Collision') {
        layer.data.forEach((gid, i) => {
          if (gid & GID_MASK) blocked[Math.floor(i / width)][i % width] = '#';
        });
        continue;
      }
      // Ground-style layers: each cell holds one tile image, drawn bottom-left on its cell.
      const cells = layer.data.map((raw) => {
        const gid = raw & GID_MASK;
        if (!gid) return -1;
        const t = gids.get(gid);
        if (!t) throw new Error(`${id}: layer ${layer.name} uses unknown gid ${gid}`);
        return img(t.imageAbs);
      });
      ground.push({ name: layer.name, cells });
      continue;
    }
    if (layer.type !== 'objectgroup') continue;

    const overhead = layer.name === 'Overhead';
    for (const o of layer.objects) {
      const p = props(o.properties);
      if (layer.name === 'Partitions' && o.polyline) {
        for (let i = 1; i < o.polyline.length; i++) {
          const a = o.polyline[i - 1];
          const b = o.polyline[i];
          edgeWalls.push([
            Math.round((o.x + a.x) / TILE),
            Math.round((o.y + a.y) / TILE),
            Math.round((o.x + b.x) / TILE),
            Math.round((o.y + b.y) / TILE),
          ]);
        }
        continue;
      }
      // A building whose picture is its own tile object (tools/export-tmj.mjs): keep it as it is.
      if (o.type === 'building' && !o.gid && p.drawn_separately) {
        delete p.drawn_separately;
        objects.push({ type: 'building', name: o.name, x: o.x, y: o.y, w: o.width, h: o.height, props: p });
        continue;
      }
      if (o.type === 'building' && !o.gid) {
        const b = buildings.get(p.blueprint);
        if (!b) throw new Error(`${id}: building ${p.blueprint} is not in ${BUILDINGS_DATA}`);
        const s = b.sprite;
        sprites.push({
          img: img(path.join(ART, 'buildings', s.sheet)),
          crop: [s.x, s.y, s.w, s.h],
          x: o.x,
          y: o.y,
          w: s.w,
          h: s.h,
          depth: o.y + b.size[1] * TILE,
          overhead,
        });
        objects.push({ type: 'building', name: o.name, x: o.x, y: o.y, w: o.width, h: o.height, props: { ...p, npc: b.npc } });
        continue;
      }
      if (o.gid) {
        const t = gids.get(o.gid & GID_MASK);
        if (!t) throw new Error(`${id}: object ${o.name} uses unknown gid ${o.gid}`);
        const w = o.width || t.w;
        const h = o.height || t.h;
        let left = o.x;
        let top = o.y - h;
        if (t.align === 'bottom') left = o.x - w / 2;
        else if (t.align === 'topleft') top = o.y;
        else if (t.align === 'center') { left = o.x - w / 2; top = o.y - h / 2; }
        const frames = t.animation?.map((f) => ({ img: img(gids.get(t.firstgid + f.tileid).imageAbs), ms: f.duration }));
        sprites.push({
          img: img(t.imageAbs),
          ...(t.crop ? { crop: t.crop } : {}),
          x: left,
          y: top,
          w,
          h,
          // A depth property overrides the sprite's foot line (a sprite drawn in front of or behind its footprint).
          depth: typeof p.depth === 'number' ? p.depth : top + h,
          overhead,
          ...(frames ? { frames } : {}),
        });
        continue;
      }
      // A blocker's cleared look (cleared_tile, a tile name) is baked as an image the game draws
      // over the blocker's ground detail once the story clears it.
      if (o.type === 'blocker' && typeof p.cleared_tile === 'string') {
        const t = [...gids.values()].find((g) => g.props.name === p.cleared_tile);
        if (!t) throw new Error(`${id}: blocker ${o.name} names unknown cleared_tile ${p.cleared_tile}`);
        p.cleared_img = img(t.imageAbs);
      }
      objects.push({
        type: o.type,
        name: o.name,
        x: o.x,
        y: o.y,
        w: o.width,
        h: o.height,
        ...(o.point ? { point: true } : {}),
        props: p,
      });
    }
  }

  return {
    id,
    title: gameTitle ?? mapProps.title ?? mapProps.name ?? id,
    kind,
    width,
    height,
    tileSize: TILE,
    props: mapProps,
    images,
    ground,
    sprites,
    blocked: blocked.map((row) => row.join('')),
    edgeWalls,
    objects,
  };
}

function copyCharacters() {
  const chars = readJson(path.join(ART, 'characters/characters.json'));
  const out = { frame: chars.frame, anchor: chars.anchor, rows: chars.rows, walk: chars.walk, act: chars.act, sheets: {} };
  for (const n of chars.npcs) {
    out.sheets[n.id] = { name: n.name, walk: useImage(path.join(ART, 'characters', n.walk)), act: useImage(path.join(ART, 'characters', n.act)) };
  }
  for (const pid of chars.players) {
    out.sheets[pid] = {
      name: pid,
      walk: useImage(path.join(ART, 'characters/player', `${pid}.png`)),
      act: useImage(path.join(ART, 'characters/player', `${pid}.act.png`)),
      // The push-up frames for the Fitness drill (up, down), when the art has them.
      ...(fs.existsSync(path.join(ART, 'characters/player', `${pid}.fit.png`)) ? { fit: useImage(path.join(ART, 'characters/player', `${pid}.fit.png`)) } : {}),
    };
  }
  return out;
}

/**
 * The player's van sheets (vehicles thread, Boss's brief of 24 Oct 2026): one sheet per design in
 * public/data/vehicles.json, with each heading's closed and rear-open cells, the anchor (ground
 * under the footprint centre) and the driver window.
 */
function copyVehicles() {
  const data = readJson(path.join(ROOT, 'public/data/vehicles.json'));
  const out = {};
  for (const d of data.designs) {
    // A design drawn with another's sheets until it has its own (artOf; the sports car, Task 11) gets no entry.
    if (d.artOf) continue;
    const dir = path.join(ART, 'vehicles/sheets/map');
    // The sheets keep their van names (art), the designs are motors (Boss, 28 Oct 2026).
    const art = d.art ?? d.id;
    const sheet = readJson(path.join(dir, `map-${art}.json`));
    if (sheet.footprintTiles[0] !== d.length) throw new Error(`map-${art}.json: footprint ${sheet.footprintTiles[0]} tiles, but vehicles.json says ${d.length}`);
    out[d.id] = { image: useImage(path.join(dir, `map-${art}.png`)), views: sheet.views };
    // The turning frames (vehgen/vanrot.py), when drawn.
    const turnJson = path.join(dir, `map-${art}-turn.json`);
    if (fs.existsSync(turnJson)) out[d.id].turn = { image: useImage(path.join(dir, `map-${art}-turn.png`)), frames: readJson(turnJson).frames };
  }
  return out;
}

function copyPaletteDirs() {
  for (const d of PALETTE_DIRS) {
    const dir = path.join(ART, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) useImage(path.join(dir, f));
  }
}

/** The .tmj for a map id: a listed town or venue, a town in the towns folder, or an inside. */
function sourceOf(id) {
  const listed = [...AREA_MAPS, ...LATER_MAPS].find((f) => path.basename(f, '.tmj') === id);
  const town = path.join(ART, TOWN_DIR, `${id}.tmj`);
  const inside = path.join(ART, INTERIOR_DIR, `${id}.tmj`);
  if (listed) return { file: path.join(ART, listed), kind: 'area' };
  if (fs.existsSync(inside)) return { file: inside, kind: 'interior' };
  if (fs.existsSync(town)) return { file: town, kind: 'area' };
  throw new Error(`No Tiled source for map "${id}" in ${ART}`);
}

/** --maps: bakes the named maps only, updating their manifest entries and nothing else. */
function bakeOnly(ids) {
  if (!ids.length) throw new Error('--maps needs a comma-separated list of map ids');
  const bdata = readJson(path.join(ART, BUILDINGS_DATA));
  const buildings = new Map(bdata.buildings.map((b) => [b.id, b]));
  const file = path.join(OUT, 'manifest.json');
  const manifest = readJson(file);
  for (const id of ids) {
    const { file: src, kind } = sourceOf(id);
    const baked = bakeMap(src, kind, buildings);
    if (baked.id !== id) throw new Error(`${src} bakes as "${baked.id}", not "${id}"`);
    fs.writeFileSync(path.join(OUT_MAPS, `${baked.id}.json`), JSON.stringify(baked));
    const entry = { id: baked.id, title: baked.title, kind };
    if (LATER_MAPS.some((f) => path.basename(f, '.tmj') === id)) continue;
    const at = manifest.maps.findIndex((m) => m.id === id);
    if (at >= 0) manifest.maps[at] = entry;
    else manifest.maps.push(entry);
    console.log(`baked ${baked.id} (${baked.width}x${baked.height}, ${baked.sprites.length} sprites, ${baked.objects.length} objects)`);
  }
  fs.writeFileSync(file, JSON.stringify(manifest));
  console.log(`copied ${added} image(s) the game did not have`);
}

function main() {
  if (VEHICLES_ONLY) {
    const file = path.join(OUT, 'manifest.json');
    const manifest = readJson(file);
    manifest.vehicles = copyVehicles();
    fs.writeFileSync(file, JSON.stringify(manifest, null, 1));
    console.log(`copied ${copied.size} van sheets`);
    return;
  }
  if (!fs.existsSync(ART)) throw new Error(`Art folder not found: ${ART}`);
  if (ONLY_MAPS) return bakeOnly(ONLY_MAPS);
  // Images are only added or replaced, never removed: the game's own art (tools/art/*.py: the world
  // map, badges) is not in the art folder, and the map editor offers every tile it finds (31 Oct 2026).
  fs.rmSync(OUT_MAPS, { recursive: true, force: true });
  fs.mkdirSync(OUT_MAPS, { recursive: true });

  const bdata = readJson(path.join(ART, BUILDINGS_DATA));
  const buildings = new Map(bdata.buildings.map((b) => [b.id, b]));

  const files = [
    ...AREA_MAPS.map((f) => ({ file: path.join(ART, f), kind: 'area' })),
    ...LATER_MAPS.map((f) => ({ file: path.join(ART, f), kind: 'area', later: true })),
    ...fs
      .readdirSync(path.join(ART, INTERIOR_DIR))
      .filter((f) => f.endsWith('.tmj'))
      .sort()
      .map((f) => ({ file: path.join(ART, INTERIOR_DIR, f), kind: 'interior' })),
  ];

  const manifest = { generated: new Date().toISOString().slice(0, 10), source: 'art/ (shared project folder)', maps: [] };
  for (const { file, kind, later } of files) {
    const baked = bakeMap(file, kind, buildings);
    fs.writeFileSync(path.join(OUT_MAPS, `${baked.id}.json`), JSON.stringify(baked));
    if (!later) manifest.maps.push({ id: baked.id, title: baked.title, kind });
    console.log(`baked ${baked.id} (${baked.width}x${baked.height}, ${baked.sprites.length} sprites, ${baked.objects.length} objects)`);
  }
  manifest.characters = copyCharacters();
  manifest.vehicles = copyVehicles();
  copyPaletteDirs();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`copied ${added} new or changed image(s); ${copied.size - added} already in the game`);
  // The placeholder towns live only in the bake folder, which was just cleared: stamp them again.
  stampAreas({ art: ART });
}

main();
