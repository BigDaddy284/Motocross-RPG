import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, type Entrant, type TrackDef } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { layoutProblems } from '../src/core/trackCheck';
import { firstCornerSpan, inSpan, lapGeom, lapPlan, startGeom } from '../src/core/trackGeom';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The first corner on a track drawn in the layout editor: not a section of its own, but the
// stretch from where the start straight joins to the route's next control point, ridden with
// the first corner's rules (race.ts). A track with its own first-corner section keeps it.

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

describe('the first corner on a layout track', () => {
  const t = boxTrack();
  const g = lapGeom(t.path);
  const s = startGeom(t, g);

  it('runs from the start straight\'s join to the route\'s next control point, and is not a section', () => {
    const span = firstCornerSpan(t, g, s)!;
    expect(span).not.toBeNull();
    expect(span.from).toBeCloseTo(15 / 180, 6);
    expect(span.to).toBeCloseTo(60 / 180, 6);
    expect(t.sections.some((x) => x.type === 'first_corner')).toBe(false);
    expect(layoutProblems(t, content.racing.sections)).toEqual([]);
  });

  it('is null without a start straight, and on a track with its own first-corner section', () => {
    expect(firstCornerSpan({ ...t, start: undefined })).toBeNull();
    expect(firstCornerSpan(farm)).toBeNull();
    expect(farm.sections.some((x) => x.type === 'first_corner')).toBe(true);
  });

  it('passes over a route point at the join itself for the next one', () => {
    const atCorner: TrackDef = { ...t, start: { path: [[8, -6], [15, 4], [20, 10]] } };
    const span = firstCornerSpan(atCorner)!;
    expect(span.from).toBeCloseTo(0, 6);
    expect(span.to).toBeCloseTo(60 / 180, 6);
  });

  it('is timed as its own stretch of the lap, every lap, and the rest of the start straight and lap are not in it', () => {
    const span = firstCornerSpan(t, g, s)!;
    for (const lap of [1, 2]) {
      const plan = lapPlan(t, lap, undefined, s, [span.from, span.to]);
      const inside = plan.secs.map((si, k) => si >= 0 && inSpan(span, plan.spans[k]));
      expect(inside.filter(Boolean).length).toBe(1);
      const k = inside.indexOf(true);
      expect(plan.spans[k][0]).toBeCloseTo(span.from, 6);
      expect(plan.spans[k][1]).toBeCloseTo(span.to, 6);
      expect(plan.metres[k]).toBeCloseTo(45 * 2.7, 0);
      // The start straight's own stretch (lap 1) is not the first corner.
      if (lap === 1) expect(plan.secs[0]).toBe(-1);
      expect(plan.metres.reduce((a, b) => a + b, 0)).toBeCloseTo(lap === 1 ? s.metres + 165 * 2.7 : 180 * 2.7, 0);
    }
  });

  it('rides with the first corner\'s own difficulty: a harder first corner slows that stretch and nothing else', () => {
    const hard = structuredClone(content.racing);
    hard.sections.first_corner = { ...hard.sections.first_corner, diff: hard.sections.first_corner.diff * 3 };
    const a = race(t, 7, 2).traces;
    const b = race(t, 7, 2, hard).traces;
    const span = firstCornerSpan(t)!;
    const sim = new MotoSim(content.racing, content.bikes, t, '50cc', [], { laps: 1, motoIndex: 0, seed: 1 });
    expect(sim.firstCorner).toEqual(span);
    for (const lap of [0, 1]) {
      const plan = lapPlan(t, lap + 1, undefined, startGeom(t), [span.from, span.to]);
      const legTimes = (tr: typeof a[0], rider: string) => tr.times[rider].slice(1).map((x, i) => x - tr.times[rider][i]);
      const rider = Object.keys(a[lap].times)[3];
      const ta = legTimes(a[lap], rider);
      const tb = legTimes(b[lap], rider);
      plan.secs.forEach((si, k) => {
        const fc = si >= 0 && inSpan(span, plan.spans[k]);
        // Only the first corner's stretch is slower; the rest of the lap, the start straight and the rutted corner are timed the same (barring passing and mistakes, which the same draws keep equal here).
        if (fc) expect(tb[k]).toBeGreaterThan(ta[k] * 1.3);
        else if (k < 2) expect(tb[k]).toBeCloseTo(ta[k], 3);
      });
    }
  });

  it('hosts lap 1\'s first-corner incident, and the rutted corner keeps its own rules', () => {
    let incidents = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { traces } = race(t, seed, 2);
      const span = firstCornerSpan(t)!;
      const plan = lapPlan(t, 1, undefined, startGeom(t), [span.from, span.to]);
      for (const e of traces[0].events) {
        if (e.kind !== 'mistake' || e.with !== 'first_corner') continue;
        incidents++;
        // In the plain stretch the span lies in (section 0), never in the rutted corner or the start straight.
        expect(e.section).toBe(0);
        const leg = plan.secs.indexOf(0);
        expect(inSpan(span, plan.spans[leg]) || inSpan(span, plan.spans[leg + 1])).toBe(true);
      }
      for (const e of traces[1].events) expect(e.kind === 'mistake' && e.with === 'first_corner').toBe(false);
    }
    expect(incidents).toBeGreaterThan(0);
  });

  it('a track without a start straight has no first-corner incident, and races as before', () => {
    const plain: TrackDef = { ...boxTrack(false), start: undefined };
    for (let seed = 1; seed <= 10; seed++) {
      const { traces } = race(plain, seed, 1);
      expect(traces[0].events.some((e) => e.kind === 'mistake' && e.with === 'first_corner')).toBe(false);
    }
  });
});
