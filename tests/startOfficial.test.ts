import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { alongRoute, MAX_WALK, OFFICIAL_ITEM, OFFICIAL_MARGIN, officialCircles, officialPlan, officialRoom, placedOfficial, routeLength } from '../src/core/startOfficial';
import type { TrackDef } from '../src/core/race';
import { colliders, footprints, SurfaceIndex, surfacePoints } from '../src/core/trackClearance';
import { TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const parts = JSON.parse(require('fs').readFileSync('public/data/trackParts.json', 'utf8'));

describe('start official', () => {
  for (const track of content.tracks.tracks.filter((t) => !t.scenery?.some((it) => it.type === OFFICIAL_ITEM))) {
    it(`stands and walks clear of the track and scenery on ${track.id}`, () => {
      const plan = officialPlan(track, parts);
      const s = new TrackSurface(track);
      if (s.start.total <= 0) {
        expect(plan).toBeNull();
        return;
      }
      expect(plan).not.toBeNull();
      const p = plan!;
      // Measured again here, independently, every 5 cm along the walk.
      const all = surfacePoints(track);
      const pts = new SurfaceIndex(all);
      const items = footprints(parts, track);
      const n = Math.ceil(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) / 0.05);
      let least = Infinity;
      for (let i = 0; i <= n; i++) {
        const r = officialRoom(pts, items, p.a.x + ((p.b.x - p.a.x) * i) / n, p.a.y + ((p.b.y - p.a.y) * i) / n, p.facing);
        least = Math.min(least, r.track, r.scenery);
      }
      // Every part of the official and the board turned any way, clear of the lip's slope and the scenery.
      expect(least).toBeGreaterThanOrEqual(OFFICIAL_MARGIN - 1e-9);
      // And, as a cross-check, none of those parts on the racing surface itself by a wide margin.
      for (const c of officialCircles(p.b.x, p.b.y, p.facing)) {
        const d = Math.min(...all.map((q) => Math.hypot(q.x - c.x, q.y - c.y) - q.reach));
        expect(d - c.r).toBeGreaterThan(0);
      }
      // A is near the gate, B further up the straight, a walk of 3 to 6 grid units.
      const walk = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
      expect(walk).toBeGreaterThan(2.5);
      expect(walk).toBeLessThan(7);
      console.log(track.id, JSON.stringify({ a: [p.a.x.toFixed(2), p.a.y.toFixed(2)], b: [p.b.x.toFixed(2), p.b.y.toFixed(2)], walk: walk.toFixed(2), least: least.toFixed(2), facing: p.facing.toFixed(2) }));
    });
  }

  // Placed by the track (a start_official item with a route): where it says, checked the same way.
  for (const track of content.tracks.tracks.filter((t) => t.scenery?.some((it) => it.type === OFFICIAL_ITEM))) {
    it(`walks the route placed on ${track.id}, ending clear of the track`, () => {
      const it0 = track.scenery!.find((it) => it.type === OFFICIAL_ITEM)!;
      const p = officialPlan(track, parts)!;
      expect(p.a).toEqual({ x: it0.x, y: it0.y });
      expect(p.route.slice(1).map((q) => [q.x, q.y])).toEqual(it0.route);
      const len = routeLength(p.route);
      expect(len).toBeLessThanOrEqual(parts.official?.maxWalk ?? MAX_WALK);
      const pts = new SurfaceIndex(surfacePoints(track));
      const solid = footprints(parts, track)
        .filter((f) => f.type !== OFFICIAL_ITEM)
        .flatMap(colliders);
      // At B, board down, clear of the lip's slope and the scenery.
      const atB = officialRoom(pts, solid, p.b.x, p.b.y, p.facing, true);
      expect(Math.min(atB.track, atB.scenery)).toBeGreaterThanOrEqual(OFFICIAL_MARGIN - 1e-9);
      // Every 5 cm of the walk clear of the scenery, board turned any way.
      for (let d = 0; d <= len; d += 0.05) {
        const q = alongRoute(p.route, d);
        expect(officialRoom(pts, solid, q.x, q.y, p.facing).scenery).toBeGreaterThanOrEqual(OFFICIAL_MARGIN - 1e-9);
      }
      console.log(track.id, 'placed', JSON.stringify({ route: p.route, walk: len.toFixed(2), atB }));
    });
  }

  it('refuses a placed route that is too long, through scenery, through the line-up, or ending on the track', () => {
    const farm = structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!) as TrackDef;
    const set = (x: number, y: number, route: [number, number][]) => {
      farm.scenery = [...farm.scenery!.filter((it) => it.type !== OFFICIAL_ITEM), { type: OFFICIAL_ITEM, x, y, route }];
      return placedOfficial(farm, parts).problems.join(' | ');
    };
    expect(set(46.4, 48.2, [[46.2, 45.2], [45.5, 41.6]])).toBe('');
    expect(set(46.4, 48.2, [[46.2, 45.2], [45.5, 41.6], [54, 41.6]])).toMatch(/longer than the 8 they can walk/);
    // Through the hay bale at 50, 41.5.
    expect(set(47, 41.6, [[53, 41.6]])).toMatch(/walks through scenery at/);
    // Across the start straight just behind the gate (36, 46), where the riders line up.
    expect(set(35, 49.5, [[35, 42]])).toMatch(/through the riders lined up at the gate/);
    // Ending on the start straight.
    expect(set(46.4, 49.5, [[46.4, 46]])).toMatch(/ends on the track/);
  });

  it('stands where placed on a new track with no start straight yet, and says it needs one', () => {
    const farm = structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!) as TrackDef;
    delete farm.start;
    farm.scenery = [{ type: OFFICIAL_ITEM, x: 50, y: 30, rot: 30, route: [[52, 30]] }];
    const { plan, problems } = placedOfficial(farm, parts);
    expect(problems).toEqual(['the start official needs a start straight to stand by']);
    expect(plan!.a).toEqual({ x: 50, y: 30 });
    expect(plan!.b).toEqual({ x: 52, y: 30 });
    // The game itself still has no official without a start straight.
    expect(officialPlan(farm, parts)).toBeNull();
  });
});
