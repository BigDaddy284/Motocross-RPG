#!/usr/bin/env node
// Stamps the town and its buildings' insides for every area in
// public/data/areas.json that has a `town` entry, from the baked Area 1 maps (Areas 2 to 8 plan;
// Boss, 31 Oct 2026: "Create the Area map art for all areas 2-8" as placeholders until each town is
// drawn in Tiled). The Area 1 maps are not touched. Run it again after editing areas.json:
//
//     node tools/gen-area.mjs
//
// What each area gets, all read from the Home Town bake (public/assets/maps/area1-home-town.json):
// - area<N>-<slug>.json: the town. The rented room is the area's house (door locked until bought,
//   unlock house.<N>); the neighbour's house an empty town house; Phoenix MX, Moto78, Lee's T's & Wheels
//   and Nicholls Used Motors keep their places with their own insides; the tool shop becomes the
//   area's batch facility; the practice track becomes the rider drill yard and the running track
//   the fitness venue; the roadworks are gone; the two road ends are "West road" and "East road",
//   both route exits (world.json routes say where they go, matching the world map's roads).
// - int-a<N>-local-garage/bike-shop/tyre-shop/van-office/rented-room/tool-shop.json: the insides
//   (the house in the rented room's slot, the batch facility in the tool shop's).
// The area's tracks have no maps of their own: they race at the venue maps, one per track type
// (Boss, 30 Oct 2026; tracks.json venues, core/guides.ts VENUE_MAPS).
// - public/assets/manifest.json: the new maps listed (old entries for them replaced).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAPS = path.join(ROOT, 'public/assets/maps');
const read = (f) => JSON.parse(fs.readFileSync(path.join(MAPS, `${f}.json`), 'utf8'));
const write = (m) => fs.writeFileSync(path.join(MAPS, `${m.id}.json`), JSON.stringify(m));
const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/areas.json'), 'utf8')).areas;
const manifestFile = path.join(ROOT, 'public/assets/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

// Keyed as the Home Town blueprints' interiors are (int.home.<key>), so a stamped building's inside
// is int.a<N>.<key>: the house is the rented room's slot with the Starter terrace inside, the
// batch facility the tool shop's slot with the fabrication shop inside (core/buildings.ts).
const INTERIORS = {
  local_garage: 'int-home-local-garage',
  bike_shop: 'int-home-bike-shop',
  tyre_shop: 'int-home-tyre-shop',
  van_office: 'int-home-van-office',
  rented_room: 'int-home-starter-terrace',
  neighbour: 'int-home-neighbour',
  tool_shop: 'int-iz-fabrication-shop',
};

function listMap(id, title, kind) {
  manifest.maps = manifest.maps.filter((m) => m.id !== id);
  manifest.maps.push({ id, title, kind });
}

/** The tile a sprite stands on (core/mapState.ts spriteTile). */
const spriteTile = (s, ts) => [Math.floor((s.x + s.w / 2) / ts), Math.floor((s.y + s.h - 1) / ts)];

function town(a) {
  const n = a.n;
  const p = `a${n}`;
  const m = read('area1-home-town');
  const ts = m.tileSize;
  const t = a.town;
  m.id = a.map;
  m.title = a.name;
  m.props = { ...m.props, title: a.name };
  const interior = (key) => `int.${p}.${key}`;
  const out = [];
  // The roadworks: cleared for good, as the game clears them (core/mapState.ts).
  for (const b of m.objects.filter((o) => o.type === 'blocker')) {
    const x0 = Math.floor(b.x / ts), y0 = Math.floor(b.y / ts), w = Math.round(b.w / ts), h = Math.round(b.h / ts);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      m.blocked[y] = m.blocked[y].slice(0, x) + '.' + m.blocked[y].slice(x + 1);
      for (const layer of m.ground.slice(1)) if (layer.cells[y * m.width + x] >= 0 && typeof b.props.cleared_img === 'number') layer.cells[y * m.width + x] = b.props.cleared_img;
    }
    m.sprites = m.sprites.filter((s) => {
      const [sx, sy] = spriteTile(s, ts);
      const inRing = sx >= x0 - 1 && sx <= x0 + w && sy >= y0 - 1 && sy <= y0 + h;
      if (inRing) m.blocked[sy] = m.blocked[sy].slice(0, sx) + '.' + m.blocked[sy].slice(sx + 1);
      return !inRing;
    });
  }
  const rename = { "Neighbour's house": 'Town house', 'Rented room': a.house?.name ?? 'House', 'Tool shop': t.works, 'Tyres and wheels': "Lee's T's & Wheels", 'Running track pavilion': t.fitness, 'Practice track kiosk': `${t.yard} kiosk` };
  const interiorOf = { "Neighbour's house": interior('neighbour'), 'Rented room': interior('rented_room'), 'Phoenix MX': interior('local_garage'), 'Moto78': interior('bike_shop'), 'Tyres and wheels': interior('tyre_shop'), 'Nicholls Used Motors': interior('van_office'), 'Tool shop': interior('tool_shop') };
  const npcOf = { "Neighbour's house": null, 'Tool shop': t.worksBoss, 'Tyres and wheels': 'Lee Stocky', 'Running track pavilion': t.fitnessCoach ?? null, 'Practice track kiosk': null, 'Rented room': null };
  for (const o of m.objects) {
    const name = o.name;
    if (o.type === 'blocker' || o.type === 'gate' || o.type === 'travel') continue;
    if (o.type === 'spawn') {
      if (name === 'new_game') continue;
      o.name = { from_world_map: 'from_west', from_industrial_zone: 'from_east' }[name] ?? name;
      out.push(o);
      continue;
    }
    if (o.type === 'exit') {
      o.name = name === 'To the venue route' ? 'West road' : 'East road';
      o.props = { to: 'world_map' };
      out.push(o);
      continue;
    }
    if (o.type === 'building') {
      if (interiorOf[name]) o.props = { ...o.props, interior: interiorOf[name] };
      if (name in npcOf) o.props = { ...o.props, npc: npcOf[name] };
      if (rename[name]) o.name = rename[name];
      out.push(o);
      continue;
    }
    if (o.type === 'door' || o.type === 'return' || o.type === 'click') {
      if (o.type === 'door' && interiorOf[name]) o.props = { ...o.props, interior: interiorOf[name] };
      if (o.type === 'door' && name === 'Rented room') o.props = { ...o.props, locked: true, unlock: `house.${n}` };
      if (rename[name]) o.name = rename[name];
      out.push(o);
      continue;
    }
    if (o.type === 'venue') {
      if (name === 'Practice track') { o.name = t.yard; o.props = { venue: `yard-${p}` }; }
      if (name === 'Running track') { o.name = t.fitness; o.props = { venue: `fitness-${p}` }; }
      out.push(o);
      continue;
    }
    if (o.type === 'npc') {
      if (name === 'Local racer') { o.name = 'Local champion'; o.props = { npc: `npc.${p}.local_champion` }; }
      out.push(o);
      continue;
    }
    out.push(o);
  }
  m.objects = out;
  write(m);
  listMap(m.id, m.title, 'area');
  // The insides.
  const titles = { neighbour: 'Town house', local_garage: 'Phoenix MX', bike_shop: 'Moto78', tyre_shop: "Lee's T's & Wheels", van_office: 'Nicholls Used Motors', rented_room: a.house?.name ?? 'House', tool_shop: t.works };
  for (const [key, src] of Object.entries(INTERIORS)) {
    const im = read(src);
    const from = im.props.interior;
    im.id = `int-${p}-${key.replace(/_/g, '-')}`;
    im.title = `${titles[key]} (${a.name})`;
    im.props = { ...im.props, interior: interior(key), name: titles[key] };
    for (const o of im.objects) if (o.props?.interior === from) o.props = { ...o.props, interior: interior(key) };
    write(im);
    listMap(im.id, im.title, 'interior');
  }
}

for (const a of areas) if (a.town) town(a);
manifest.maps.sort((x, y) => (x.kind === y.kind ? x.id.localeCompare(y.id) : x.kind === 'area' ? -1 : 1));
fs.writeFileSync(manifestFile, JSON.stringify(manifest));
console.log(`Stamped ${areas.filter((a) => a.town).length} area(s).`);
