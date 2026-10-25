import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, mixSeed, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { startProblems } from '../src/core/trackCheck';
import { headingAt, lapGeom, lapMetres, startGeom } from '../src/core/trackGeom';
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
});
