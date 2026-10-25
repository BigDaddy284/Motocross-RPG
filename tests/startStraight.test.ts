import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, mixSeed, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { startProblems } from '../src/core/trackCheck';
import { headingAt, lapGeom, lapMetres, startGeom, startPointAt } from '../src/core/trackGeom';
import { TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

// A start straight placed first in the track editor (Start and finish): the lap is built on from
// its end, so it joins the lap exactly at the finish line, the lap's first point.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const farm = (): TrackDef => structuredClone(content.tracks.tracks.find((t) => t.id === 'farmland')!);

/** Farmland with its start straight joining at the finish line, shaped as the editor's start piece is. */
function joinedAtFinish(): TrackDef {
  const t = farm();
  const g = lapGeom(t.path);
  const [jx, jy] = t.path[0];
  const h = headingAt(g, 0);
  const width = t.width ?? 3.4;
  const off = width / 2 + (width / 2) * 1.6 + 1.5;
  // Coming in from whichever side is clear of the rest of the lap.
  for (const side of [1, -1]) {
    const back = (d: number, o: number): [number, number] => [jx - Math.cos(h) * d - Math.sin(h) * o * side, jy - Math.sin(h) * d + Math.cos(h) * o * side];
    t.start = { path: [back(16 + off, off), back(off, off), [jx, jy]] };
    if (!startProblems(t).length) return t;
  }
  throw new Error(`no clear side: ${startProblems(t).map((p) => p.message).join('; ')}`);
}

describe('a start straight joining at the finish line', () => {
  it('joins at the very start of the lap, not its end, and passes the checks', () => {
    const t = joinedAtFinish();
    const s = startGeom(t);
    expect(s.join).toBe(0);
    expect(s.from).toBeLessThan(0);
    expect(startProblems(t)).toEqual([]);
  });

  it('races the laps asked for: the run from the gate is not an extra lap, and lap 1 is the start straight and a whole lap', () => {
    const t = joinedAtFinish();
    const s = startGeom(t);
    const lap = lapMetres(t);
    let first = 0;
    let rest = 0;
    for (let seed = 0; seed < 4; seed++) {
      const field = content.riders.riders.slice(0, 4).map((r, gate) => ({ ...cpuEntrant(content, r, '50cc'), gate }));
      const sim = new MotoSim(content.racing, content.bikes, t, '50cc', field, { laps: 3, motoIndex: 0, seed: mixSeed(11, seed) });
      sim.runToEnd();
      for (const r of sim.riders) {
        expect(r.laps).toBe(3);
        expect(r.lapTimes).toHaveLength(3);
        first += r.lapTimes[0];
        rest += (r.lapTimes[1] + r.lapTimes[2]) / 2;
      }
    }
    // Lap 1 rides the start straight as well as the whole lap, so on average it takes longer by about that much.
    expect(first / rest).toBeGreaterThan(1 + (0.5 * s.metres) / lap);
  });

  it('meets the lap at the lap\'s level on steep ground, so neither surface buries the other', () => {
    const t = joinedAtFinish();
    // A 36 m hill (the new limit) centred just off the finish line, so the join is on its steep side.
    const [jx, jy] = t.path[0];
    const points: [number, number, number][] = [];
    for (let x = 0; x <= 100; x += 2) for (let y = 0; y <= 60; y += 2) {
      const d = Math.hypot(x - (jx + 8), y - (jy + 8));
      if (d < 26) points.push([x, y, +(36 * (1 - d / 26)).toFixed(2)]);
    }
    t.elevation = { step: 2, points };
    const s = new TrackSurface(t);
    let worst = 0;
    for (let f = 0; f < 1; f += 0.002) {
      for (const lane of [-1, -0.5, 0, 0.5, 1]) {
        const p = s.spot(f, lane);
        // The nearest point of the start straight, and its lane there.
        let bu = 0;
        let bd = Infinity;
        for (let u = 0; u <= s.start.total; u += 0.05) {
          const q = startPointAt(s.start, u);
          const d = Math.hypot(p.x - q.x, p.z - q.y);
          if (d < bd) [bd, bu] = [d, u];
        }
        const q = startPointAt(s.start, bu);
        const sl = (-(p.x - q.x) * Math.sin(q.ang) + (p.z - q.y) * Math.cos(q.ang)) / s.startHw(bu);
        if (Math.abs(sl) > 1 || bu < 0.1 || bu > s.start.total - 0.1) continue;
        worst = Math.max(worst, Math.abs(s.startHeight(bu, sl) - s.height(f, lane)));
      }
    }
    // Where the two overlap they are within about a wheel's height (the ground climbs over 3 grid units across them here).
    expect(worst).toBeLessThan(0.6);
  });
});

