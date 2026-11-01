import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The towns join up (Boss, 31 Oct 2026: "everything needs to connect correctly"). The world map is a
 * 3 x 3 grid of towns round the Race Hub, every map 48 x 36 tiles. Where two neighbours share an edge,
 * a road leaving one must arrive on the other on the same rows (an east-west join) or the same
 * columns (a north-south join), as if the maps were laid side by side. The Hub roads of the corner
 * towns leave at one level: the north corners' on the same rows.
 *
 *   Area 4 Forest Town      Area 3 Beach Town      Area 2 Mountain Town
 *   Area 5 Northern Works   Race Hub               Area 1 Home Town  - Industrial Zone
 *   Area 6 Highlands        Area 7 The City        Area 8 Capital
 *
 * Only drawn maps are held to it (a map baked from its Tiled source, tools/art-maps.mjs AREA_MAPS);
 * the placeholder towns stamped from Home Town join up when they are drawn.
 */
type BakedMap = { width: number; height: number; images: string[]; ground: { cells: number[] }[]; objects: { type: string; name: string; x: number; y: number; w: number; h: number }[] };
const artMaps = fs.readFileSync('tools/art-maps.mjs', 'utf8');
const drawn = (id: string) => artMaps.includes(`maps/${id}.tmj`);
const load = (id: string): BakedMap => JSON.parse(fs.readFileSync(`public/assets/maps/${id}.json`, 'utf8'));
const isRoadTile = (m: BakedMap, x: number, y: number) => /terrain-common\/road-\d\.png$/.test(m.images[m.ground[0].cells[y * m.width + x]] ?? '');

/** The tiles a corner town's Hub road leaves by: it heads off the corner towards the Hub, not into
 *  the neighbour (Boss's example, 31 Oct 2026: a road leaving at the south-west corner). */
const HUB_ROADS = ['South-west road', 'South-east road', 'North-west road', 'North-east road'];
function hubTiles(m: BakedMap): Set<string> {
  const out = new Set<string>();
  for (const o of m.objects) {
    if (o.type !== 'exit' || !HUB_ROADS.includes(o.name)) continue;
    for (let y = o.y / 64; y < (o.y + o.h) / 64; y++) for (let x = o.x / 64; x < (o.x + o.w) / 64; x++) out.add(`${x},${y}`);
  }
  return out;
}

/** The rows (west or east edge) or columns (north or south edge) where a road runs off the map
 *  into the neighbour (leaving out a Hub road off the corner). */
function roadAt(id: string, edge: 'W' | 'E' | 'N' | 'S', withHub = false): number[] {
  const m = load(id);
  const hub = withHub ? new Set<string>() : hubTiles(m);
  const isRoad = (mm: BakedMap, x: number, y: number) => !hub.has(`${x},${y}`) && isRoadTile(mm, x, y);
  const out: number[] = [];
  if (edge === 'W' || edge === 'E') {
    const x = edge === 'W' ? 0 : m.width - 1;
    for (let y = 0; y < m.height; y++) if (isRoad(m, x, y)) out.push(y);
  } else {
    const y = edge === 'N' ? 0 : m.height - 1;
    for (let x = 0; x < m.width; x++) if (isRoad(m, x, y)) out.push(x);
  }
  return out;
}

// [west or north town, its edge, east or south town, its edge]
const JOINS: [string, 'E' | 'S', string, 'W' | 'N'][] = [
  ['area4-forest-town', 'E', 'area3-beach-town', 'W'],
  ['area3-beach-town', 'E', 'area2-mountain-town', 'W'],
  ['area2-mountain-town', 'S', 'area1-home-town', 'N'],
  ['area4-forest-town', 'S', 'area5-northern-works', 'N'],
  ['area5-northern-works', 'S', 'area6-highlands', 'N'],
  ['area1-home-town', 'S', 'area8-capital', 'N'],
  ['area6-highlands', 'E', 'area7-the-city', 'W'],
  ['area7-the-city', 'E', 'area8-capital', 'W'],
];

describe('the towns join up at their shared edges (Boss, 31 Oct 2026)', () => {
  for (const [a, ea, b, eb] of JOINS) {
    it(`${a} (${ea}) meets ${b} (${eb})`, () => {
      if (!drawn(a) || !drawn(b)) return;
      const out = roadAt(a, ea);
      expect(out.length, `${a} has no road off its ${ea} edge`).toBeGreaterThan(0);
      expect(roadAt(b, eb), `${b}'s road must arrive where ${a}'s leaves`).toEqual(out);
    });
  }

  it('no town of Areas 2 to 8 is one straight road through (Boss, 31 Oct 2026)', () => {
    // "make the town joins realistic not all in the same place": a road in from one neighbour does not
    // run straight on to the neighbour opposite (e.g. Northern Works' road on to the Highlands leaves
    // well to one side of the Forest road coming in).
    for (const id of ['area2-mountain-town', 'area3-beach-town', 'area4-forest-town', 'area5-northern-works', 'area6-highlands', 'area7-the-city', 'area8-capital']) {
      if (!drawn(id)) continue;
      for (const [p, q] of [['W', 'E'], ['N', 'S']] as const) {
        const near = (u: number[], v: number[]) => u.some((i) => v.some((j) => Math.abs(i - j) < 4));
        expect(near(roadAt(id, p), roadAt(id, q)), `${id}: its ${p} and ${q} roads line up`).toBe(false);
      }
    }
  });

  it('the south corner towns leave for the Hub at one level, as the north ones do', () => {
    // The Highlands' North-east road and Capital's North-west road, a few rows down from the top as
    // the north corners' are a few rows up from the bottom (Areas 2 to 8 maps, 31 Oct 2026).
    if (!drawn('area6-highlands')) return;
    const highlands = roadAt('area6-highlands', 'E', true).filter((y) => !roadAt('area6-highlands', 'E').includes(y));
    expect(highlands.length).toBeGreaterThan(0);
    if (drawn('area8-capital')) expect(roadAt('area8-capital', 'W', true).filter((y) => !roadAt('area8-capital', 'W').includes(y))).toEqual(highlands);
  });

  it('the north corner towns leave for the Hub at one level', () => {
    // Mountain Town's South-west road and Forest Town's South-east road (Boss: "the same level").
    const mountain = roadAt('area2-mountain-town', 'W', true).filter((y) => !roadAt('area2-mountain-town', 'W').includes(y));
    const forest = roadAt('area4-forest-town', 'E', true).filter((y) => !roadAt('area4-forest-town', 'E').includes(y));
    expect(mountain.length).toBeGreaterThan(0);
    expect(forest).toEqual(mountain);
  });
});
