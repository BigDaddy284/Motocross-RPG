import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { OFFICIAL_MARGIN, officialCircles, officialPlan, officialRoom } from '../src/core/startOfficial';
import { footprints, SurfaceIndex, surfacePoints } from '../src/core/trackClearance';
import { TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const parts = JSON.parse(require('fs').readFileSync('public/data/trackParts.json', 'utf8'));

describe('start official', () => {
  for (const track of content.tracks.tracks) {
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
});
