import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { checkTrackParts, trackKind } from '../src/core/trackParts';
import { sceneryIssues, SurfaceIndex, surfacePoints } from '../src/core/trackClearance';
import { lapGeom, lapMetres, pointAt, sectionTurns } from '../src/core/trackGeom';
import { TrackSurface } from '../src/core/trackSurface';
import { TRACK_GROUPS } from './trackGroups';
import { loadManifest, loadMaps, rawContent } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TILES = path.join(ROOT, 'public/assets/art/area-map/tiled/tiles');
const artExists = (rel: string) => fs.existsSync(path.join(TILES, `${rel}.png`));
const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;

describe('track parts and track layouts', () => {
  it('puts every track in exactly one per-track test group (trackGroups.ts)', () => {
    for (const t of content.tracks.tracks) {
      const groups = Object.entries(TRACK_GROUPS).filter(([, inGroup]) => inGroup(t.id)).map(([g]) => g);
      expect(groups, t.id).toHaveLength(1);
    }
  });

  it('finds the art for every ground tile and scenery piece', () => {
    expect(checkTrackParts(content.trackParts, content.tracks.tracks, artExists)).toEqual([]);
  });

  it('spots a missing piece of art, an unknown ground tile and a patch past the lap', () => {
    const tracks = structuredClone(content.tracks.tracks);
    const t = tracks.find((x) => x.ground)!;
    t.ground!.paint.nonsense = [[1, 1]];
    t.patches = [{ surface: 'mud', at: 99999, length: 10 }];
    const problems = checkTrackParts(content.trackParts, tracks, () => false).map((e) => `${e.field}: ${e.message}`);
    expect(problems.some((p) => p.includes('nonsense'))).toBe(true);
    expect(problems.some((p) => /art/i.test(p))).toBe(true);
    expect(problems.some((p) => /past the end/.test(p))).toBe(true);
  });

  it('has one track of each kind, all inside the grid', () => {
    const kinds = new Set(content.tracks.tracks.map((t) => trackKind(content.trackParts, t).id));
    for (const k of ['stadium', 'outdoor', 'endurance']) expect(kinds.has(k)).toBe(true);
    for (const t of content.tracks.tracks) {
      const g = lapGeom(t.path);
      expect(g.total).toBeGreaterThan(0);
      expect(lapMetres(t)).toBeGreaterThan(0);
      expect(sectionTurns(t, g)).toHaveLength(t.sections.length);
      for (const [x, y] of t.path) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(60);
      }
    }
  });

  describe('scenery checks', () => {
    const farm = () => structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!);
    /** A spot `off` grid units out from the racing surface's edge, beside the lap at fraction f, and the lap's heading there. */
    const beside = (t: ReturnType<typeof farm>, f: number, off: number) => {
      const s = new TrackSurface(t);
      const spot = s.spot(f, 1);
      const nx = -Math.sin(spot.ang);
      const ny = Math.cos(spot.ang);
      return { x: +(spot.x + nx * off).toFixed(3), y: +(spot.z + ny * off).toFixed(3), deg: (spot.ang * 180) / Math.PI };
    };
    /** A bit of the lap with no scenery within 8 grid units of its outside edge, on either side. */
    const quiet = (t: ReturnType<typeof farm>) => {
      // Only the finish arch and start official are needed: the rest is cleared to leave room.
      t.scenery = (t.scenery ?? []).filter((it) => it.type === 'finish_arch' || it.type === 'start_official');
      for (let f = 0.05; f < 1; f += 0.01) {
        const spots = [-1, 1, 3, 6].map((o) => beside(t, f, o));
        if ((t.scenery ?? []).every((it) => spots.every((p) => Math.hypot(it.x - p.x, it.y - p.y) > 8))) return f;
      }
      throw new Error('no quiet bit of lap');
    };
    const issuesFor = (t: ReturnType<typeof farm>, i: number) => sceneryIssues(content.trackParts, t).filter((p) => p.i === i);

    it('the tracks as shipped have no scenery errors', () => {
      for (const t of content.tracks.tracks) expect(sceneryIssues(content.trackParts, t).filter((p) => p.level === 'error')).toEqual([]);
    });

    it('finds a hay bale on the racing surface, by its turned footprint, and never moves it', () => {
      const t = farm();
      // A hay bale (2 × 1.2) whose middle is 0.9 off the edge: lying along the track it is 0.3
      // clear, but turned to point at it, its end reaches 0.1 onto the surface.
      const at = beside(t, quiet(t), 0.9);
      t.scenery!.push({ type: 'hay_bale', x: at.x, y: at.y, rot: Math.round(at.deg) });
      const i = t.scenery!.length - 1;
      expect(issuesFor(t, i).map((p) => p.message)).toEqual([]);
      t.scenery![i].rot = Math.round(at.deg) + 90;
      const before = structuredClone(t);
      expect(issuesFor(t, i).map((p) => p.level)).toEqual(['error']);
      expect(issuesFor(t, i)[0].message).toMatch(/hay bale at .* on the racing surface/);
      expect(t).toEqual(before);
      // And the game's content check refuses it, naming the item.
      const tracks = content.tracks.tracks.map((x) => (x.id === t.id ? t : x));
      expect(checkTrackParts(content.trackParts, tracks, artExists).map((e) => e.field)).toContain(`tracks[${tracks.indexOf(t)}].scenery[${i}]`);
    });

    it('warns about a bale touching the edge, and about two bales in one place, without refusing them', () => {
      const t = farm();
      const f = quiet(t);
      const at = beside(t, f, 0.6 + 0.1);
      t.scenery!.push({ type: 'hay_bale', x: at.x, y: at.y, rot: Math.round(at.deg) });
      const i = t.scenery!.length - 1;
      expect(issuesFor(t, i).map((p) => p.level)).toEqual(['warning']);
      expect(issuesFor(t, i)[0].message).toMatch(/from the edge of the racing surface/);
      const far = beside(t, f, 6);
      t.scenery!.push({ type: 'hay_bale', x: far.x, y: far.y }, { type: 'hay_bale', x: far.x + 0.5, y: far.y });
      expect(issuesFor(t, i + 2).map((p) => p.message)).toEqual([expect.stringMatching(/stands inside the hay bale/)]);
      const tracks = content.tracks.tracks.map((x) => (x.id === t.id ? t : x));
      expect(checkTrackParts(content.trackParts, tracks, artExists)).toEqual([]);
    });

    it('lets a tree overhang the track edge (only its trunk stands there) and a start gate cross it', () => {
      const t = farm();
      const at = beside(t, 0.5, 1);
      t.scenery!.push({ type: 'tree', x: at.x, y: at.y, w: 4, h: 4 });
      expect(issuesFor(t, t.scenery!.length - 1)).toEqual([]);
      const mid = pointAt(lapGeom(t.path), 0.5);
      t.scenery!.push({ type: 'start_gate', x: mid.x, y: mid.y });
      expect(issuesFor(t, t.scenery!.length - 1)).toEqual([]);
      t.scenery!.push({ type: 'hay_bale', x: mid.x, y: mid.y });
      expect(issuesFor(t, t.scenery!.length - 1).map((p) => p.level)).toEqual(['error']);
    });

    it('measures from the racing surface by its true width', () => {
      const t = farm();
      const idx = new SurfaceIndex(surfacePoints(t));
      const s = new TrackSurface(t);
      for (const f of [0.1, 0.3, 0.6, 0.9]) {
        const at = beside(t, f, 0.5);
        expect(idx.offSurface(at.x, at.y)).toBeCloseTo(0.5, 1);
        const mid = s.spot(f, 0);
        // Within the surface index's sampling step (0.125) of the half width.
        expect(Math.abs(idx.offSurface(mid.x, mid.z) + s.hw)).toBeLessThanOrEqual(0.13);
      }
    });
  });
});
