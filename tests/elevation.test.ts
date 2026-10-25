import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { ELEV_MAX, Elevation, elevationIssues, lapProfile, sectionGrades, type TrackElevation } from '../src/core/elevation';
import { MotoSim, mixSeed, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { checkTrackParts } from '../src/core/trackParts';
import { pointAt } from '../src/core/trackGeom';
import { TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const farm = (): TrackDef => structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!);

/** A smooth hill `m` metres high and `r` grid units across its foot, centred on the lap at fraction f. */
function hill(t: TrackDef, f: number, m: number, r: number, step = 2): TrackElevation {
  const s = new TrackSurface(t);
  const c = pointAt(s.g, f);
  const points: [number, number, number][] = [];
  for (let x = Math.floor((c.x - r) / step) * step; x <= c.x + r; x += step) {
    for (let y = Math.floor((c.y - r) / step) * step; y <= c.y + r; y += step) {
      const d = Math.hypot(x - c.x, y - c.y) / r;
      if (d < 1) points.push([x, y, +(m * (0.5 + 0.5 * Math.cos(Math.PI * d))).toFixed(2)]);
    }
  }
  return { step, points };
}

describe('ground elevation', () => {
  it('runs smoothly between lattice corners and is flat without any', () => {
    const e = new Elevation({ step: 2, points: [[2, 2, 4]] });
    expect(e.at(2, 2)).toBeCloseTo(4);
    expect(e.at(3, 2)).toBeCloseTo(2);
    expect(e.at(3, 3)).toBeCloseTo(1);
    expect(e.at(4, 4)).toBe(0);
    expect(new Elevation(undefined).empty).toBe(true);
    expect(new Elevation(undefined).at(10, 10)).toBe(0);
  });

  it('keeps the edge height past the grid, so a hill at the edge is no wall', () => {
    const e = new Elevation({ step: 2, points: [[0, 30, 20], [100, 60, -20]] });
    expect(e.at(-10, 30)).toBeCloseTo(20);
    expect(e.at(130, 90)).toBeCloseTo(-20);
    const t = farm();
    // 20 m along the left edge, easing down 3 m every lattice step.
    const points: [number, number, number][] = [];
    for (let x = 0; x <= 12; x += 2) for (let y = 0; y <= 60; y += 2) points.push([x, y, 20 - 1.5 * x]);
    t.elevation = { step: 2, points };
    const { mpu, along } = lapProfile(t);
    expect(elevationIssues(t, mpu, along).filter((p) => p.level === 'error')).toEqual([]);
  });

  it('leaves an old track without elevation exactly as it was', () => {
    const t = farm();
    const a = new TrackSurface(t);
    const b = new TrackSurface({ ...t, elevation: { step: 2, points: [] } });
    for (let f = 0; f < 1; f += 0.013) for (const lane of [-1.4, -1, 0, 0.6, 1.2]) expect(b.height(f, lane)).toBe(a.height(f, lane));
    expect(sectionGrades(t).every((g) => g === 1)).toBe(true);
    expect(elevationIssues(t, 1, [])).toEqual([]);
  });

  it('lifts the track, its edges and the bikes on it by the ground under the middle', () => {
    const t = farm();
    const flat = new TrackSurface(t);
    t.elevation = hill(t, 0.4, 3, 10);
    const up = new TrackSurface(t);
    const top = up.lift(0.4);
    expect(top).toBeCloseTo(up.units(3), 1);
    for (const lane of [-1, 0, 1, 1.3]) expect(up.height(0.4, lane) - flat.height(0.4, lane)).toBeCloseTo(top, 6);
    expect(up.wheel(0.4, 0, 0, 0) - flat.wheel(0.4, 0, 0, 0)).toBeCloseTo(top, 6);
    // Well away from the hill nothing changes.
    expect(up.height(0.9, 0)).toBeCloseTo(flat.height(0.9, 0), 6);
  });

  it('makes a section over a climb slower to ride, and the riders take longer over it', () => {
    const t = farm();
    t.elevation = hill(t, 0.4, 4, 14);
    const grades = sectionGrades(t);
    expect(Math.max(...grades)).toBeGreaterThan(1.02);
    expect(Math.min(...grades)).toBeGreaterThanOrEqual(0.8);
    const time = (track: TrackDef) => {
      let sum = 0;
      for (let s = 0; s < 6; s++) {
        const field = content.riders.riders.slice(0, 2).map((r, gate) => ({ ...cpuEntrant(content, r, '50cc'), gate }));
        const sim = new MotoSim(content.racing, content.bikes, track, '50cc', field, { laps: 3, motoIndex: 0, seed: mixSeed(7, s) });
        sim.runToEnd();
        sum += sim.riders.reduce((a, r) => a + r.time, 0);
      }
      return sum;
    };
    expect(time(t)).toBeGreaterThan(time(farm()));
  });

  it('lets the ground go 36 m up and 36 m down (1.5 times the old 24 m), and no further', () => {
    expect(ELEV_MAX).toBe(36);
    // A wide hill and a wide valley, eased so no step is a wall.
    const cone = (cx: number, cy: number, top: number, r: number) => {
      const pts: [number, number, number][] = [];
      for (let x = 0; x <= 100; x += 2) for (let y = 0; y <= 60; y += 2) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) pts.push([x, y, Math.round(top * (0.5 + 0.5 * Math.cos(Math.PI * d)) * 100) / 100]);
      }
      return pts;
    };
    for (const top of [24, -24, 36, -36]) {
      const t = farm();
      t.elevation = { step: 2, points: cone(50, 30, top, 26) };
      const { mpu, along } = lapProfile(t);
      const errors = elevationIssues(t, mpu, along).filter((p) => p.level === 'error');
      expect(errors, String(top)).toEqual([]);
      expect(Math.max(...t.elevation.points.map((p) => Math.abs(p[2])))).toBe(Math.abs(top));
    }
    for (const past of [36.01, -36.01]) {
      const t = farm();
      t.elevation = { step: 2, points: [[50, 30, past]] };
      expect(elevationIssues(t, 1, []).some((p) => p.level === 'error' && /36 m up or down/.test(p.message)), String(past)).toBe(true);
    }
  });

  it('refuses a height past the limit, a point off the lattice and a wall, and warns of a steep track', () => {
    const t = farm();
    t.elevation = { step: 2, points: [[10, 10, 37], [11, 10, 1], [40, 40, 7]] };
    const { mpu, along } = lapProfile(t);
    const issues = elevationIssues(t, mpu, along);
    const errors = issues.filter((p) => p.level === 'error').map((p) => p.message);
    expect(errors.some((m) => /36 m up or down/.test(m))).toBe(true);
    expect(errors.some((m) => /not on the 2-unit lattice/.test(m))).toBe(true);
    expect(errors.some((m) => /a wall/.test(m))).toBe(true);
    const problems = checkTrackParts(content.trackParts, [t], () => true).map((e) => e.message);
    expect(problems.some((m) => /a wall/.test(m))).toBe(true);

    const steep = farm();
    steep.elevation = hill(steep, 0.4, 8, 6);
    const prof = lapProfile(steep);
    const all = elevationIssues(steep, prof.mpu, prof.along);
    expect(all.some((p) => p.level === 'warning' && /steep/.test(p.message))).toBe(true);
  });

  it('a gentle hill passes the content check', () => {
    const t = farm();
    t.elevation = hill(t, 0.4, 3, 12);
    const { mpu, along } = lapProfile(t);
    expect(elevationIssues(t, mpu, along).filter((p) => p.level === 'error')).toEqual([]);
    expect(checkTrackParts(content.trackParts, [t], () => true).filter((e) => /elevation/.test(e.field + e.message))).toEqual([]);
  });
});
