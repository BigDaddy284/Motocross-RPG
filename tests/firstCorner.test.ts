import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, type Entrant, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { layoutProblems } from '../src/core/trackCheck';
import { FIRST_CORNER_SHARE, firstCorner, lapGeom, lapPlan, startGeom } from '../src/core/trackGeom';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The first corner is not a section of its own: it is the start straight's end, the leg between
// its last two points that bends onto the lap, timed as its own stretch of lap 1 and ridden with
// the first corner's rules (race.ts). A lap section left as a first corner rides as a flat corner.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const farm = content.tracks.tracks.find((t) => t.id === 'farmland')!;

/** A 60 x 30 box ridden clockwise from its top-left corner, drawn as plain track with one feature, and a start straight joining the top side 15 units along. */
function boxTrack(features = true): TrackDef {
  const points = [[20, 10], [80, 10], [80, 40], [20, 40]];
  const path = points.map(([x, y]) => [x, y] as [number, number]);
  const lap = 180 * 2.7;
  const sections = features
    ? [
        { type: 'straight', length: Math.round(lap * (120 / 180)), passing: 0.6 },
        { type: 'rutted_corner', length: Math.round(lap * (20 / 180)), passing: 0.5 },
        { type: 'straight', length: lap - Math.round(lap * (120 / 180)) - Math.round(lap * (20 / 180)), passing: 0.6 },
      ]
    : [{ type: 'straight', length: lap, passing: 0.6 }];
  return {
    id: 'box', name: 'Box', size: 'small', surface: 'hard_pack', gates: farm.gates, path, sections, layout: { points },
    start: { path: [[22, -6], [30, 4], [35, 10]] },
  };
}

function race(track: TrackDef, seed: number, laps = 2, racing = content.racing) {
  const field: Entrant[] = content.riders.riders.slice(0, 12).map((d, i) => cpuEntrant(content, d, '50cc', i));
  field[0] = { ...field[0], player: true };
  const sim = new MotoSim(racing, content.bikes, track, '50cc', field, { laps, motoIndex: 0, seed });
  return { sim, traces: sim.runToEnd(), field };
}

describe('the first corner at the start straight\'s end', () => {
  const t = boxTrack();
  const g = lapGeom(t.path);
  const s = startGeom(t, g);
  const legs = Math.hypot(30 - 22, 4 + 6) + Math.hypot(35 - 30, 10 - 4);
  const last = Math.hypot(35 - 30, 10 - 4);

  it('is the leg between the start straight\'s last two points, and is not a section', () => {
    const fc = firstCorner(s)!;
    expect(fc).not.toBeNull();
    expect(fc.from).toBeCloseTo(legs - last, 6);
    expect(fc.share).toBeCloseTo(last / legs, 6);
    expect(fc.metres).toBeCloseTo(s.metres * (last / legs), 6);
    expect(t.sections.some((x) => x.type === 'first_corner')).toBe(false);
    expect(layoutProblems(t, content.racing.sections)).toEqual([]);
  });

  it('is the last quarter of a start straight of two points, and null without one', () => {
    const two = startGeom({ ...t, start: { path: [[22, -6], [35, 10]] } });
    const fc = firstCorner(two)!;
    expect(fc.share).toBeCloseTo(FIRST_CORNER_SHARE, 6);
    expect(fc.from).toBeCloseTo(two.total * (1 - FIRST_CORNER_SHARE), 6);
    expect(firstCorner(startGeom({ ...t, start: undefined }))).toBeNull();
  });

  it('is timed as its own stretch of lap 1 after the run from the gate, and the lap and later laps are not in it', () => {
    const fc = firstCorner(s)!;
    const one = lapPlan(t, 1, undefined, s);
    expect(one.secs.slice(0, 3)).toEqual([-1, -2, 0]);
    expect(one.metres[0]).toBeCloseTo(s.metres - fc.metres, 6);
    expect(one.metres[1]).toBeCloseTo(fc.metres, 6);
    expect(one.marks[0]).toBeCloseTo(s.from, 9);
    expect(one.marks[2]).toBeCloseTo(s.joinAt, 9);
    expect(one.marks[1]).toBeLessThan(one.marks[2]);
    expect(one.marks[1]).toBeGreaterThan(one.marks[0]);
    expect(one.metres.reduce((a, b) => a + b, 0)).toBeCloseTo(s.metres + 165 * 2.7, 0);
    const two = lapPlan(t, 2, undefined, s);
    expect(two.secs.every((si) => si >= 0)).toBe(true);
    expect(two.metres.reduce((a, b) => a + b, 0)).toBeCloseTo(180 * 2.7, 0);
  });

  it('rides with the first corner\'s own difficulty: a harder first corner slows that stretch and nothing else', () => {
    const hard = structuredClone(content.racing);
    hard.sections.first_corner = { ...hard.sections.first_corner, diff: hard.sections.first_corner.diff * 3 };
    const a = race(t, 7, 2).traces;
    const b = race(t, 7, 2, hard).traces;
    const sim = new MotoSim(content.racing, content.bikes, t, '50cc', [], { laps: 1, motoIndex: 0, seed: 1 });
    expect(sim.firstCorner).toEqual(firstCorner(s));
    for (const lap of [0, 1]) {
      const plan = lapPlan(t, lap + 1, undefined, s);
      const legTimes = (tr: typeof a[0], rider: string) => tr.times[rider].slice(1).map((x, i) => x - tr.times[rider][i]);
      const rider = Object.keys(a[lap].times)[3];
      const ta = legTimes(a[lap], rider);
      const tb = legTimes(b[lap], rider);
      plan.secs.forEach((si, k) => {
        // Only the first corner's stretch is slower; the run from the gate before it is timed the same (the stretches after it share the rider's draws, so a mistake drawn differently can move them).
        if (si === -2) expect(tb[k]).toBeGreaterThan(ta[k] * 1.3);
        else if (k < 1) expect(tb[k]).toBeCloseTo(ta[k], 3);
      });
    }
  });

  it('hosts lap 1\'s first-corner incident, and the lap\'s own sections keep their own rules', () => {
    let incidents = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { traces } = race(t, seed, 2);
      for (const e of traces[0].events) {
        if (e.kind !== 'mistake' || e.with !== 'first_corner') continue;
        incidents++;
        expect(e.section).toBe(-2);
      }
      for (const e of traces[1].events) expect(e.kind === 'mistake' && e.with === 'first_corner').toBe(false);
    }
    expect(incidents).toBeGreaterThan(0);
  });

  it('the game\'s own tracks get it at their start straight\'s end, and a first-corner section left in the lap rides as a flat corner', () => {
    const fs = startGeom(farm);
    const fc = firstCorner(fs)!;
    expect(fc.from).toBeCloseTo(fs.cum[fs.pts.length - 2], 6);
    expect(lapPlan(farm, 1).secs.slice(0, 2)).toEqual([-1, -2]);
    const flat = structuredClone(content.racing);
    flat.sections.first_corner = { ...flat.sections.first_corner, diff: flat.sections.first_corner.diff * 3 };
    const a = race(farm, 3, 2).traces;
    const b = race(farm, 3, 2, flat).traces;
    const k = farm.sections.findIndex((x) => x.type === 'first_corner');
    expect(k).toBeGreaterThan(0);
    const leg = lapPlan(farm, 2).secs.indexOf(k);
    const rider = Object.keys(a[1].times)[2];
    // Lap 2's first-corner section is timed the same with a harder first corner: it rides as a flat corner.
    expect(b[1].times[rider][leg + 1] - b[1].times[rider][leg]).toBeCloseTo(a[1].times[rider][leg + 1] - a[1].times[rider][leg], 3);
  });

  it('a track without a start straight has no first-corner incident, and races as before', () => {
    const plain: TrackDef = { ...boxTrack(false), start: undefined };
    for (let seed = 1; seed <= 10; seed++) {
      const { traces } = race(plain, seed, 1);
      expect(traces[0].events.some((e) => e.kind === 'mistake' && e.with === 'first_corner')).toBe(false);
    }
  });
});
