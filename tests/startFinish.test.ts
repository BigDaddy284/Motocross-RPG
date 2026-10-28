import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, mixSeed, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { startProblems } from '../src/core/trackCheck';
import { headingAt, lapGeom, lapMetres, lapPlan, pointAt, startGeom } from '../src/core/trackGeom';
import { LIP_AT, LIP_H, TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The start straight, the circuit and the finish line are separate components: the start may join
// the lap anywhere, the finish line is the lap's first point, and a lap only counts once the whole
// circuit has been ridden. Also the inside of a corner tighter than the track is wide is mitred,
// never folded over itself.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const farm = (): TrackDef => structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!);

/** Farmland with its start straight joining the lap `units` grid units past the finish line (negative: before it). */
function joinedNear(units: number): TrackDef {
  const t = farm();
  const g = lapGeom(t.path);
  const f = ((units / g.total) % 1 + 1) % 1;
  const j = pointAt(g, f);
  const h = headingAt(g, f);
  const width = t.width ?? 3.4;
  const off = width / 2 + (width / 2) * 1.6 + 1.5;
  for (const side of [1, -1]) {
    const back = (d: number, o: number): [number, number] => [j.x - Math.cos(h) * d - Math.sin(h) * o * side, j.y - Math.sin(h) * d + Math.cos(h) * o * side];
    t.start = { path: [back(16 + off, off), back(off, off), [j.x, j.y]] };
    if (!startProblems(t).length) return t;
  }
  throw new Error(`no clear side: ${startProblems(t).map((p) => p.message).join('; ')}`);
}

describe('a start straight joining just before or after the finish line', () => {
  it('joining a metre before the line, lap 1 is the start straight and the whole circuit', () => {
    const t = joinedNear(-1 / 2.7);
    const s = startGeom(t);
    expect(s.join).toBeGreaterThan(0.99);
    expect(s.joinAt).toBeLessThan(0);
    expect(s.joinAt).toBeCloseTo(s.join - 1, 9);
    expect(s.from).toBeLessThan(s.joinAt);
    const one = lapPlan(t, 1);
    // The start straight, then its end as the first corner, then the lap from the join.
    expect(one.secs.slice(0, 2)).toEqual([-1, -2]);
    expect(one.marks[0]).toBeCloseTo(s.from, 9);
    expect(one.marks[2]).toBeCloseTo(s.joinAt, 9);
    expect(one.marks.at(-1)).toBeCloseTo(1, 9);
    for (let i = 1; i < one.marks.length; i++) expect(one.marks[i]).toBeGreaterThan(one.marks[i - 1]);
    // Every section is ridden on lap 1, in order, after the sliver before the line.
    expect(one.secs.slice(-t.sections.length)).toEqual(t.sections.map((_, i) => i));
    expect(one.metres.reduce((a, b) => a + b, 0)).toBeCloseTo(s.metres + (1 - s.joinAt) * lapMetres(t), 6);
    // Later laps are unchanged: the whole loop, line to line.
    expect(lapPlan(t, 2).marks[0]).toBeCloseTo(1, 9);
    expect(startProblems(t)).toEqual([]);
  });

  it('joining a metre after the line, lap 1 is the start straight and the lap from there', () => {
    const t = joinedNear(1 / 2.7);
    const s = startGeom(t);
    expect(s.join).toBeGreaterThan(0);
    expect(s.join).toBeLessThan(0.01);
    expect(s.joinAt).toBe(s.join);
    const one = lapPlan(t, 1);
    expect(one.secs.slice(0, 2)).toEqual([-1, -2]);
    expect(one.marks[2]).toBeCloseTo(s.join, 9);
    expect(one.marks.at(-1)).toBeCloseTo(1, 9);
    expect(one.secs).toEqual([-1, -2, ...t.sections.map((_, i) => i)]);
  });

  for (const units of [-1 / 2.7, 1 / 2.7, -40]) {
    it(`races the laps asked for with the start joining ${units.toFixed(1)} units from the line: no extra lap, none missing`, () => {
      const t = joinedNear(units);
      const s = startGeom(t);
      const surface = new TrackSurface(t);
      // The gate is on the start straight; where it joins is not.
      expect(surface.onStart(s.from + 1e-6)).toBe(true);
      expect(surface.onStart(s.joinAt + 1e-6)).toBe(false);
      const field = content.riders.riders.slice(0, 6).map((r, gate) => ({ ...cpuEntrant(content, r, '50cc'), gate }));
      const sim = new MotoSim(content.racing, content.bikes, t, '50cc', field, { laps: 5, motoIndex: 0, seed: mixSeed(3, Math.round(units * 10)) });
      const traces = sim.runToEnd();
      expect(traces.map((x) => x.lap)).toEqual([1, 2, 3, 4, 5]);
      for (const r of sim.riders) {
        expect(r.laps).toBe(5);
        expect(r.lapTimes).toHaveLength(5);
        // Lap 1 covers the start straight plus the circuit from the join, so it is never the quickest.
        const rest = r.lapTimes.slice(1);
        if (units < 0 && units > -1) expect(r.lapTimes[0]).toBeGreaterThan(Math.min(...rest));
      }
    });
  }
});

describe('a circuit without a start straight or finish line', () => {
  it('builds a surface and races with the field starting on the line', () => {
    const t = farm();
    delete t.start;
    t.finish = false;
    const s = startGeom(t);
    expect(s.total).toBe(0);
    expect(s.joinAt).toBe(0);
    const one = lapPlan(t, 1);
    expect(one.secs).toEqual(t.sections.map((_, i) => i));
    const surface = new TrackSurface(t);
    expect(surface.onStart(0.001)).toBe(false);
    expect(Number.isFinite(surface.height(0.3, 0))).toBe(true);
  });
});

describe('tight corners', () => {
  /** A 20 x 20 box drawn as four sharp points, as narrow as the content tracks. */
  const sharp: TrackDef = {
    ...farm(),
    id: 'sharp-test',
    path: [[30, 20], [50, 20], [50, 40], [30, 40]],
    sections: [
      { type: 'straight', length: 54, passing: 0.5 },
      { type: 'flat_corner', length: 54, passing: 0.5 },
      { type: 'straight', length: 54, passing: 0.5 },
      { type: 'flat_corner', length: 54, passing: 0.5 },
    ],
  } as TrackDef;
  delete sharp.start;
  delete sharp.elevation;
  delete (sharp as { patches?: unknown }).patches;

  it('mitres the inside of a corner sharper than the lane is wide, so no lane folds back on itself', () => {
    const s = new TrackSurface(sharp);
    expect(s.sharpest() * s.hw * LIP_AT).toBeGreaterThan(1);
    const steps = Math.ceil(s.g.total / 0.1);
    for (const lane of [LIP_AT, 1.5, 2]) {
      let prev = s.spot(0, lane);
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const q = s.spot(f, lane);
        const ang = headingAt(s.g, (i - 0.5) / steps);
        // Along the lap every lane keeps moving forwards (or stands at the mitre), never back.
        const along = (q.x - prev.x) * Math.cos(ang) + (q.z - prev.z) * Math.sin(ang);
        expect(along).toBeGreaterThanOrEqual(-1e-6);
        prev = q;
      }
      // Through the corner at (50, 20) the lane is the one mitre point, no further in than the straights' edges.
      const m = s.miter(0.25, lane);
      expect(m).not.toBeNull();
      expect(m!.x).toBeLessThanOrEqual(50 - lane * s.hw + 0.3);
      expect(m!.y).toBeGreaterThanOrEqual(20 + lane * s.hw - 0.3);
    }
    // The lip still stands above the edge at the apex: a kerb, not a flattened or raised wedge.
    expect(s.height(0.25, LIP_AT) - s.height(0.25, 1)).toBeCloseTo(LIP_H, 6);
    expect(s.height(0.25, 1)).toBeCloseTo(s.height(0.25, 0), 6);
  });

  it('keeps every bike moving forwards on the surface through the tightest corners of every track', () => {
    for (const t of [...content.tracks.tracks, sharp]) {
      const s = new TrackSurface(t);
      const steps = Math.ceil(s.g.total / 0.1);
      for (const lane of [-1, -0.5, 0.5, 1]) {
        // On lap 2, clear of the start straight.
        let prev = s.place(1, lane);
        for (let i = 1; i <= steps; i++) {
          const q = s.place(1 + i / steps, lane);
          const ang = headingAt(s.g, (i - 0.5) / steps);
          const along = (q.x - prev.x) * Math.cos(ang) + (q.z - prev.z) * Math.sin(ang);
          // Forwards, bar a few centimetres swinging round the inside of a knife-edge corner.
          expect(along).toBeGreaterThan(-0.1);
          // And on the surface: no further out than the surface reaches there.
          const edge = s.spot(i / steps, Math.sign(lane));
          const mid = s.spot(i / steps, 0);
          expect(Math.hypot(q.x - mid.x, q.z - mid.z)).toBeLessThanOrEqual(Math.hypot(edge.x - mid.x, edge.z - mid.z) + 1e-6);
          prev = q;
        }
      }
    }
  });

  it('mitres the same corners on sloping ground and with the lap turned round, with finite heights everywhere', () => {
    const points: [number, number, number][] = [];
    for (let x = 20; x <= 60; x += 2) for (let y = 10; y <= 50; y += 2) points.push([x, y, +(((x - 20) / 40) * 20).toFixed(2)]);
    const hilly: TrackDef = { ...sharp, elevation: { step: 2, points } } as TrackDef;
    const turned: TrackDef = { ...sharp, path: [sharp.path[0], ...sharp.path.slice(1).reverse()] as [number, number][] };
    for (const t of [hilly, turned]) {
      const s = new TrackSurface(t);
      expect(s.sharpest() * s.hw * LIP_AT).toBeGreaterThan(1);
      let mitred = 0;
      for (let f = 0; f < 1; f += 0.002) {
        for (const lane of [-1.5, -LIP_AT, -1, 0, 1, LIP_AT, 1.5]) {
          expect(Number.isFinite(s.height(f, lane))).toBe(true);
          if (s.miter(f, lane)) mitred++;
        }
      }
      // Four corners, on the inside only (the turned lap's inside is the other side).
      expect(mitred).toBeGreaterThan(0);
      const inner = turned === t ? -1.5 : 1.5;
      expect(s.miter(0.25, inner)).not.toBeNull();
      expect(s.miter(0.25, -inner)).toBeNull();
    }
  });

  it('rides AI riders through the sharp corners', () => {
    const field = content.riders.riders.slice(0, 6).map((r, gate) => ({ ...cpuEntrant(content, r, '50cc'), gate }));
    const sim = new MotoSim(content.racing, content.bikes, sharp, '50cc', field, { laps: 3, motoIndex: 0, seed: 7 });
    sim.runToEnd();
    for (const r of sim.riders) expect(r.laps).toBe(3);
  });
});

describe('a track built in the editor with the finish line and start straight placed by hand', () => {
  // Built in the editor's browser suite: a circuit closed with no start straight, a finish line
  // placed on it, then a start straight joined part way round, then Ready to race.
  const built = JSON.parse(readFileSync(new URL('./fixtures/editor-built-track.json', import.meta.url), 'utf8')) as TrackDef;

  it('passes the game\'s checks and races five laps, the run from the gate counted in lap 1', () => {
    expect(startProblems(built)).toEqual([]);
    expect(built.sections[0].type).not.toBe('start_gate');
    expect((built as { finish?: false }).finish).toBeUndefined();
    const s = startGeom(built);
    expect(s.join).toBeGreaterThan(0.2);
    const one = lapPlan(built, 1);
    expect(one.secs[0]).toBe(-1);
    expect(one.marks.at(-1)).toBeCloseTo(1, 9);
    const field = content.riders.riders.slice(0, 8).map((r, gate) => ({ ...cpuEntrant(content, r, '50cc'), gate }));
    const sim = new MotoSim(content.racing, content.bikes, built, '50cc', field, { laps: 5, motoIndex: 0, seed: 21 });
    const traces = sim.runToEnd();
    expect(traces.map((x) => x.lap)).toEqual([1, 2, 3, 4, 5]);
    for (const r of sim.riders.filter((x) => !x.retired)) {
      expect(r.laps).toBe(5);
      expect(r.lapTimes).toHaveLength(5);
    }
  });
});
