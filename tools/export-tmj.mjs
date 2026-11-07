#!/usr/bin/env node
// Writes the game's baked maps back into the shared art folder as Tiled maps, so the art folder
// holds the maps as they are in the game (Boss, 31 Oct 2026: "Can you do it so the latest art work
// is where it needs to be"). Maps had been edited in the game (map editor, hand fixes) since their
// Tiled sources were made, so a full import undid those edits. After an export, a full
// `npm run import-art` bakes the same maps the game has (tests/exportTmj.test.ts checks the round trip).
//
//     node tools/export-tmj.mjs [/path/to/art] [--maps id,id] [--images]
//
// Every map import-art bakes is exported (tools/art-maps.mjs), unless --maps names some; the stamped
// Area 2 to 8 placeholders never are. Each map gets its own tileset, area-map/tiled/exported/<id>.tsj,
// listing exactly the images it uses (a building cut from its sheet is a tile with a sub-rectangle).
// Layers: the ground layers by name, the sprites in "Objects" / "Overhead" runs in the game's order,
// "Collision" (one blocked tile per blocked cell), "Partitions" (edge walls) and "Data" (every object,
// buildings marked drawn_separately because their picture is already a tile object).
// --images also copies into the art folder every image a map uses that the art folder lacks
// (existing files are kept as they are).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_MAPS, DEFAULT_ART, INTERIOR_DIR, LATER_MAPS, TOWN_DIR } from './art-maps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAPS = path.join(ROOT, 'public/assets/maps');
const TILE = 64;
export const EXPORT_DIR = 'area-map/tiled/exported';
const BLOCKED_IMG = 'art/area-map/tiled/tiles/editor/blocked.png';

const rel = (from, to) => path.relative(path.dirname(from), to).split(path.sep).join('/');

/** A Tiled property for a plain value; null is an empty object reference (import-art reads it back). */
function prop(name, value) {
  if (value === null) return { name, type: 'object', value: 0 };
  if (typeof value === 'boolean') return { name, type: 'bool', value };
  if (typeof value === 'number') return { name, type: Number.isInteger(value) ? 'int' : 'float', value };
  if (typeof value === 'string') return { name, type: 'string', value };
  throw new Error(`property ${name}: cannot export ${JSON.stringify(value)}`);
}
const propList = (o) => Object.entries(o ?? {}).map(([k, v]) => prop(k, v));

/** Where a map's .tmj lives in the art folder. */
export function sourcePath(art, m) {
  const listed = [...AREA_MAPS, ...LATER_MAPS].find((f) => path.basename(f, '.tmj') === m.id);
  if (listed) return path.join(art, listed);
  return path.join(art, m.kind === 'interior' ? INTERIOR_DIR : TOWN_DIR, `${m.id}.tmj`);
}

/** The ids export-tmj writes: every baked map that is not a stamped placeholder. */
export function exportedIds(manifest) {
  const later = LATER_MAPS.map((f) => path.basename(f, '.tmj'));
  return [...manifest.maps.map((m) => m.id), ...later].filter((id) => !/^(area[2-8]-|int-a[2-8]-)/.test(id));
}

export function exportMap(m, art) {
  const mapFile = sourcePath(art, m);
  const tsFile = path.join(art, EXPORT_DIR, `${m.id}.tsj`);
  const artPath = (p) => path.join(art, p.replace(/^art\//, ''));

  // Tiles: one per distinct (image, crop, animation, cleared-name) use.
  const tiles = [];
  const tileKey = new Map();
  const tile = (imgPath, extra = {}) => {
    const key = JSON.stringify([imgPath, extra.crop ?? null, extra.frames ?? null, extra.name ?? null]);
    if (tileKey.has(key)) return tileKey.get(key);
    const id = tiles.length;
    tileKey.set(key, id);
    const t = { id, image: rel(tsFile, artPath(imgPath)) };
    tiles.push(t);
    if (extra.crop) Object.assign(t, { x: extra.crop[0], y: extra.crop[1], width: extra.crop[2], height: extra.crop[3] });
    if (extra.name) t.properties = [prop('name', extra.name)];
    if (extra.frames) t.animation = extra.frames.map((f) => ({ tileid: tile(m.images[f.img]), duration: f.ms }));
    return id;
  };
  const gid = (id) => id + 1;
  // Every image the game lists for the map, in its order, first: import-art bakes them in this order
  // (the tileset's keep_images), so the bake matches the game's to the byte, unused images included.
  for (const p of m.images) tile(p);

  const layers = [];
  let layerId = 1;
  let objectId = 1;
  for (const g of m.ground) {
    layers.push({ id: layerId++, name: g.name, type: 'tilelayer', x: 0, y: 0, width: m.width, height: m.height, opacity: 1, visible: true, data: g.cells.map((c) => (c < 0 ? 0 : gid(tile(m.images[c])))) });
  }
  // Sprites, in runs of the same layer so the bake keeps their order.
  let run = null;
  for (const s of m.sprites) {
    const name = s.overhead ? 'Overhead' : 'Objects';
    if (!run || run.name !== name) {
      run = { id: layerId++, name, type: 'objectgroup', draworder: 'index', x: 0, y: 0, opacity: 1, visible: true, objects: [] };
      layers.push(run);
    }
    const t = tile(m.images[s.img], { crop: s.crop, frames: s.frames });
    const o = { id: objectId++, gid: gid(t), name: '', type: '', x: s.x, y: s.y, width: s.w, height: s.h, rotation: 0, visible: true };
    if (s.depth !== s.y + s.h) o.properties = [prop('depth', s.depth)];
    run.objects.push(o);
  }
  const blockedTile = gid(tile(BLOCKED_IMG));
  layers.push({ id: layerId++, name: 'Collision', type: 'tilelayer', x: 0, y: 0, width: m.width, height: m.height, opacity: 0.4, visible: true, data: m.blocked.flatMap((row) => [...row].map((c) => (c === '#' ? blockedTile : 0))) });
  if (m.edgeWalls.length) {
    layers.push({
      id: layerId++, name: 'Partitions', type: 'objectgroup', draworder: 'index', x: 0, y: 0, opacity: 1, visible: true,
      objects: m.edgeWalls.map(([x1, y1, x2, y2]) => ({ id: objectId++, name: '', type: '', x: x1 * TILE, y: y1 * TILE, width: 0, height: 0, rotation: 0, visible: true, polyline: [{ x: 0, y: 0 }, { x: (x2 - x1) * TILE, y: (y2 - y1) * TILE }] })),
    });
  }
  const data = m.objects.map((o) => {
    const p = { ...o.props };
    if (o.type === 'building') p.drawn_separately = true;
    // A blocker's cleared look goes back as a named tile (import-art turns the name into cleared_img).
    if (typeof p.cleared_img === 'number') {
      tile(m.images[p.cleared_img], { name: p.cleared_tile });
      delete p.cleared_img;
    }
    return { id: objectId++, name: o.name, type: o.type, x: o.x, y: o.y, width: o.w, height: o.h, rotation: 0, visible: true, ...(o.point ? { point: true } : {}), properties: propList(p) };
  });
  layers.push({ id: layerId++, name: 'Data', type: 'objectgroup', draworder: 'index', x: 0, y: 0, opacity: 1, visible: true, objects: data });

  const tileset = {
    type: 'tileset', version: '1.10', tiledversion: '1.11.2', name: `${m.id} (from the game)`, tilewidth: TILE, tileheight: TILE,
    tilecount: tiles.length, columns: 0, margin: 0, spacing: 0, objectalignment: 'topleft', grid: { orientation: 'orthogonal', width: 1, height: 1 },
    properties: [prop('keep_images', m.images.length)],
    tiles: tiles.map((t) => {
      const file = path.resolve(path.dirname(tsFile), t.image);
      // The collision tile is the art folder's editor tile, 64 px square; the game never draws it.
      const size = !fs.existsSync(file) && file === artPath(BLOCKED_IMG) ? [TILE, TILE] : imageSize(file);
      return { ...t, imagewidth: size[0], imageheight: size[1] };
    }),
  };
  const tmj = {
    type: 'map', version: '1.10', tiledversion: '1.11.2', orientation: 'orthogonal', renderorder: 'right-down',
    width: m.width, height: m.height, tilewidth: TILE, tileheight: TILE, infinite: false, compressionlevel: -1,
    // A title changed in the game without its props goes back as game_title (import-art reads it first).
    nextlayerid: layerId, nextobjectid: objectId, layers, properties: propList(m.title === (m.props.title ?? m.props.name ?? m.id) ? m.props : { ...m.props, game_title: m.title }),
    tilesets: [{ firstgid: 1, source: rel(mapFile, tsFile) }],
  };
  return { mapFile, tsFile, tmj, tileset, images: [...new Set(tiles.map((t) => path.resolve(path.dirname(tsFile), t.image)))] };
}

/** Width and height of a PNG, read from its header. */
function imageSize(file) {
  const buf = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, 24, 0); } finally { fs.closeSync(fd); }
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--maps');
  const art = path.resolve(args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1)) ?? process.env.ART_SRC ?? DEFAULT_ART);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'));
  const ids = at >= 0 ? args[at + 1].split(',') : exportedIds(manifest);
  for (const id of ids) {
    const m = JSON.parse(fs.readFileSync(path.join(MAPS, `${id}.json`), 'utf8'));
    if (args.includes('--images')) {
      for (const p of m.images) {
        const dest = path.join(art, p.replace(/^art\//, ''));
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(path.join(ROOT, 'public/assets', p), dest);
          console.log(`copied ${p}`);
        }
      }
    }
    const out = exportMap(m, art);
    fs.mkdirSync(path.dirname(out.tsFile), { recursive: true });
    fs.mkdirSync(path.dirname(out.mapFile), { recursive: true });
    fs.writeFileSync(out.tsFile, JSON.stringify(out.tileset, null, 1));
    fs.writeFileSync(out.mapFile, JSON.stringify(out.tmj, null, 1));
    console.log(`exported ${id} -> ${path.relative(art, out.mapFile)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
