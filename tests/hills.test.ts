import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { ELEV_MAX, Elevation, elevationIssues, hillProfile, hillsAt, lapProfile, sectionGrades, STEEP_TRACK, trackLevel } from '../src/core/elevation';
import { checkRaceContent } from '../src/core/raceContent';
import { MotoSim, type Entrant, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { lapGeom } from '../src/core/trackGeom';
import { TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

// Hills and dips along the track from the editor's elevation tool (elevation.ts TrackHill): a
// smooth centre-weighted profile on the authoritative track data, which the surface, the race
// timing and the checks all read.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const farm = (): TrackDef => structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!);

describe('a hill\'s profile', () => {
  it('peaks at the centre, is nothing at and past the ends, and has no slope at either (no step, no kink)', () => {
    expect(hillProfile(0, 16)).toBe(1);
    expect(hillProfile(8, 16)).toBe(0);
    expect(hillProfile(-8, 16)).toBe(0);
    expect(hillProfile(20, 16)).toBe(0);
    expect(hillProfile(4, 16)).toBeCloseTo(0.5, 9);
    // Slope near the ends and the peak is tiny: a raised cosine.
    expect(Math.abs(hillProfile(7.9, 16) - hillProfile(8, 16))).toBeLessThan(0.001);
    expect(Math.abs(hillProfile(0.1, 16) - hillProfile(0, 16))).toBeLessThan(0.001);
    // Symmetric, and monotonic from the centre out.
    for (let d = 0; d < 8; d += 0.25) {
      expect(hillProfile(d, 16)).toBeCloseTo(hillProfile(-d, 16), 12);
      expect(hillProfile(d + 0.25, 16)).toBeLessThanOrEqual(hillProfile(d, 16));
    }
  });

  it('counts round past the lap\'s end on a closed route, and is cut at the ends of an open one', () => {
    const hills = [{ at: 2, len: 16, height: 3 }];
    expect(hillsAt(hills, 2, 100)).toBeCloseTo(3);
    expect(hillsAt(hills, 98, 100)).toBeCloseTo(3 * hillProfile(4, 16));
    expect(hillsAt(hills, 96, 100)).toBeCloseTo(3 * hillProfile(6, 16));
    expect(hillsAt(hills, 98, 100, true)).toBe(0);
    expect(hillsAt(hills, 0, 100, true)).toBeCloseTo(3 * hillProfile(2, 16));
    // Overlapping hills add up; a dip takes away.
    const two = [...hills, { at: 6, len: 16, height: -1 }];
    expect(hillsAt(two, 4, 100)).toBeCloseTo(3 * hillProfile(2, 16) - 1 * hillProfile(2, 16));
    expect(hillsAt(undefined, 4, 100)).toBe(0);
  });
});

describe('a hill on the track', () => {
  const t = farm();
  const g = lapGeom(t.path);
  const base = new TrackSurface(t);
  const raised: TrackDef = { ...t, hills: [{ at: 40, len: 16, height: 3 }] };
  const s = new TrackSurface(raised);

  it('lifts the surface by its profile and nothing else: the track\'s level is the ground under its middle plus the hill', () => {
    const el = new Elevation(t.elevation);
    const fc = 40 / g.total;
    const mid = s.spot(fc, 0);
    expect(trackLevel(raised, g, el, fc)).toBeCloseTo(el.at(mid.x, mid.z) + 3, 6);
    expect(s.lift(fc) - base.lift(fc)).toBeCloseTo(s.units(3), 6);
    expect(s.lift((40 + 8) / g.total) - base.lift((40 + 8) / g.total)).toBeCloseTo(0, 6);
    expect(s.lift((40 + 4) / g.total) - base.lift((40 + 4) / g.total)).toBeCloseTo(s.units(1.5), 6);
    expect(s.lift(0.9)).toBeCloseTo(base.lift(0.9), 9);
  });

  it('leaves the track\'s width, banking, section shapes and ground untouched', () => {
    for (let k = 0; k <= 200; k++) {
      const f = k / 200;
      for (const lane of [-1, -0.5, 0, 0.5, 1, 1.22]) {
        const a = base.spot(f, lane);
        const b = s.spot(f, lane);
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.z).toBeCloseTo(a.z, 9);
        expect(s.bank(f, lane)).toBeCloseTo(base.bank(f, lane), 9);
        // The whole cross-section moves up together: the lift is the only difference.
        expect(s.height(f, lane) - base.height(f, lane)).toBeCloseTo(s.lift(f) - base.lift(f), 6);
      }
      expect(s.centre(f)).toBeCloseTo(base.centre(f), 9);
    }
    expect(s.groundAt(50, 30)).toBeCloseTo(base.groundAt(50, 30), 9);
    expect(raised.sections).toEqual(t.sections);
  });

  it('keeps the riding surface continuous along the lap, with no step at either end of the hill', () => {
    const n = Math.ceil(g.total / 0.1);
    let worst = 0;
    for (let k = 1; k <= n; k++) {
      for (const lane of [-1, 0, 1]) worst = Math.max(worst, Math.abs(s.height(k / n, lane) - s.height((k - 1) / n, lane)) - Math.abs(base.height(k / n, lane) - base.height((k - 1) / n, lane)));
    }
    // The hill adds at most its own gentle slope per 0.1 grid unit: 3 m over 8 units is 0.24 units of lift at most, so a tenth-unit step is under 0.05.
    expect(worst).toBeLessThan(0.05);
  });

  it('slows the riders up the climb and the checks see it: a tall short hill is a steepness warning, past the limit an error', () => {
    const grades = sectionGrades(raised);
    const flat = sectionGrades(t);
    expect(grades.some((v, i) => v !== flat[i])).toBe(true);
    const steep: TrackDef = { ...t, hills: [{ at: 40, len: 6, height: 8 }] };
    const { mpu, along } = lapProfile(steep);
    expect(elevationIssues(steep, mpu, along).some((p) => p.level === 'warning' && /climbs or drops/.test(p.message))).toBe(true);
    const gentle = lapProfile(raised);
    expect(elevationIssues(raised, gentle.mpu, gentle.along).filter((p) => /climbs or drops/.test(p.message))).toEqual([]);
    const tall: TrackDef = { ...t, hills: [{ at: 40, len: 60, height: ELEV_MAX + 1 }] };
    const tp = lapProfile(tall);
    expect(elevationIssues(tall, tp.mpu, tp.along).some((p) => p.level === 'error' && /can be 36 m at most/.test(p.message))).toBe(true);
    expect(STEEP_TRACK).toBe(0.35);
  });

  it('is accepted by the content check and raced', () => {
    const raw = rawContent();
    const tracks = raw.tracks as { tracks: TrackDef[] };
    tracks.tracks[tracks.tracks.findIndex((x) => x.id === 'farmland')] = raised;
    const res = checkContent(raw, loadManifest(), loadMaps());
    expect(res.errors ?? []).toEqual([]);
    const field: Entrant[] = content.riders.riders.slice(0, 8).map((d, i) => cpuEntrant(content, d, '50cc', i));
    const sim = new MotoSim(content.racing, content.bikes, raised, '50cc', field, { laps: 2, motoIndex: 0, seed: 3 });
    const traces = sim.runToEnd();
    expect(traces.length).toBe(2);
    expect(checkRaceContent).toBeDefined();
  });
});
