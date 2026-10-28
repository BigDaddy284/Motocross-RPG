import { describe, expect, it } from 'vitest';
import { flagUp, inWatch, MARSHAL_ITEM, MARSHAL_STANDS, marshalProblems, marshalWatch, WATCH_DEFAULT, WATCH_MAX, WATCH_MIN, watchFocus } from '../src/core/marshal';
import { checkContent } from '../src/core/content';
import type { SceneryItem } from '../src/core/race';
import { lapGeom, nearestOnLap, pointAt } from '../src/core/trackGeom';
import type { TrackPartsData } from '../src/core/trackParts';
import { loadManifest, loadMaps, rawContent } from './helpers';

const raw = rawContent();
const content = checkContent(raw, loadManifest(), loadMaps()).content!;
const parts = raw.trackParts as TrackPartsData;
const farmland = content.tracks.tracks.find((t) => t.id === 'farmland')!;
const g = lapGeom(farmland.path);
/** A marshal beside the lap at fraction f, with the watch's end at fraction fe when given. */
const marshal = (f: number, fe?: number): SceneryItem => {
  const p = pointAt(g, f);
  const it: SceneryItem = { type: MARSHAL_ITEM, x: p.x + 3, y: p.y + 3 };
  if (fe !== undefined) { const e = pointAt(g, fe); it.route = [[e.x, e.y]]; }
  return it;
};

describe('marshals', () => {
  it('is a scenery item with the stands as its designs and vest colours', () => {
    const def = parts.scenery.find((s) => s.id === MARSHAL_ITEM)!;
    expect(def.variants?.map(([id]) => id)).toEqual(Object.keys(MARSHAL_STANDS));
    expect(def.colours?.length).toBeGreaterThan(2);
    expect(MARSHAL_STANDS.pallet).toBeGreaterThan(0);
    expect(MARSHAL_STANDS.tower).toBe(MARSHAL_STANDS.pallet);
  });

  it('with no end set, watches the next stretch of track past them', () => {
    const w = marshalWatch(g, marshal(0.3));
    expect(w.len).toBe(WATCH_DEFAULT);
    expect(w.capped).toBe(false);
    expect(w.f0).toBeCloseTo(nearestOnLap(g, marshal(0.3).x, marshal(0.3).y).f, 3);
    expect(w.f1 - w.f0).toBeCloseTo(WATCH_DEFAULT / g.total, 6);
  });

  it('watches from the nearest track to them to the end set, in the lap direction, and never further than the cap', () => {
    const m = marshal(0.3, 0.32);
    const w = marshalWatch(g, m);
    const from = nearestOnLap(g, m.x, m.y).f;
    const to = nearestOnLap(g, m.route![0][0], m.route![0][1]).f;
    expect(w.len).toBeCloseTo((((to - from) % 1) + 1) % 1 * g.total, 6);
    expect(w.len).toBeLessThan(WATCH_MAX);
    expect(w.capped).toBe(false);
    const far = marshalWatch(g, marshal(0.3, 0.6));
    expect(far.len).toBe(WATCH_MAX);
    expect(far.capped).toBe(true);
    // An end behind them means nearly a whole lap forwards: capped too.
    expect(marshalWatch(g, marshal(0.3, 0.29)).capped).toBe(true);
    // An end right by them still watches a little.
    expect(marshalWatch(g, { ...m, route: [[m.x, m.y]] }).len).toBe(WATCH_MIN);
  });

  it('knows which riders are on the watch, round the lap and across the finish line', () => {
    const w = { f0: 0.3, f1: 0.32, len: 0.02 * g.total, capped: false };
    expect(inWatch(w, 0.31)).toBe(true);
    expect(inWatch(w, 2.31)).toBe(true);
    expect(inWatch(w, 0.33)).toBe(false);
    expect(inWatch(w, 0.29)).toBe(false);
    const wrap = { f0: 0.995, f1: 1.005, len: 0.01 * g.total, capped: false };
    expect(inWatch(wrap, 1.002)).toBe(true);
    expect(inWatch(wrap, 0.998)).toBe(true);
    expect(inWatch(wrap, 0.5)).toBe(false);
  });

  it('raises the flag only while a rider is down or getting back on within the watch', () => {
    const w = marshalWatch(g, marshal(0.3, 0.32));
    expect(flagUp(w, [{ dist: 0.31, state: 'riding' }])).toBe(false);
    expect(w.f1 - w.f0).toBeGreaterThan(0.005);
    expect(flagUp(w, [{ dist: 0.31, state: 'crashed' }])).toBe(true);
    expect(flagUp(w, [{ dist: 1.31, state: 'remount' }])).toBe(true);
    expect(flagUp(w, [{ dist: 0.5, state: 'crashed' }])).toBe(false);
    expect(flagUp(w, [{ dist: 0.31, state: 'wobble' }])).toBe(false);
  });

  it('faces the middle of the watch, and the editor is told of a watch cut short or ended off the track', () => {
    const w = { f0: 0.3, f1: 0.32, len: 0.02 * g.total, capped: false };
    const at = watchFocus(g, w);
    expect(nearestOnLap(g, at.x, at.y).f).toBeCloseTo(0.31, 2);
    expect(marshalProblems(g, [marshal(0.3, 0.32)])).toEqual([]);
    expect(marshalProblems(g, [marshal(0.3, 0.6)])[0].message).toContain(`${WATCH_MAX} grid units`);
    const off: SceneryItem = { ...marshal(0.3), route: [[-30, -30]] };
    expect(marshalProblems(g, [off])[0].message).toContain('well off the track');
  });
});
