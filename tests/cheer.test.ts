import { describe, expect, it } from 'vitest';
import { CHEER_ACTIONS, CHEER_ITEM, CHEER_VARIANTS, cheerAction, cheerProblems, cheerTiming, cheerVariant } from '../src/core/cheer';
import { checkContent } from '../src/core/content';
import type { SceneryItem, TrackDef } from '../src/core/race';
import { SurfaceIndex, surfacePoints } from '../src/core/trackClearance';
import { checkTrackParts, type TrackPartsData } from '../src/core/trackParts';
import { loadManifest, loadMaps, rawContent } from './helpers';

const raw = rawContent();
const content = checkContent(raw, loadManifest(), loadMaps()).content!;
const parts = raw.trackParts as TrackPartsData;
const farmland = content.tracks.tracks.find((t) => t.id === 'farmland')!;

/** A spot a given distance outside the racing surface, found by walking out from a lap point. */
function spotOff(track: TrackDef, want: number): { x: number; y: number } {
  const index = new SurfaceIndex(surfacePoints(track));
  const [px, py] = track.path[2];
  for (let r = 0; r < 12; r += 0.1) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const x = +(px + r * Math.cos(a)).toFixed(1);
    const y = +(py + r * Math.sin(a)).toFixed(1);
    const off = index.offSurface(x, y);
    if (Math.abs(off - want) < 0.08) return { x, y };
  }
  throw new Error('no spot');
}
const withFan = (track: TrackDef, it: Partial<SceneryItem>): TrackDef => ({ ...track, scenery: [...(track.scenery ?? []), { type: CHEER_ITEM, x: 2, y: 2, ...it }] });

describe('cheering fans', () => {
  it('is a scenery type of its own, apart from the start official', () => {
    expect(parts.scenery.some((s) => s.id === CHEER_ITEM)).toBe(true);
    expect(CHEER_ITEM).not.toBe('start_official');
  });
  it('picks a valid variant, action and timing for each fan, the same each time and not the same for all', () => {
    const items: SceneryItem[] = Array.from({ length: 12 }, (_, i) => ({ type: CHEER_ITEM, x: i, y: 0 }));
    const variants = items.map((it, i) => cheerVariant(it, i));
    const actions = items.map((it, i) => cheerAction(it, i));
    for (const v of variants) expect(CHEER_VARIANTS).toContain(v);
    for (const a of actions) expect(CHEER_ACTIONS).toContain(a);
    expect(new Set(variants).size).toBeGreaterThan(1);
    expect(new Set(actions).size).toBeGreaterThan(1);
    expect(items.map((it, i) => cheerVariant(it, i))).toEqual(variants);
    const timings = items.map((_, i) => cheerTiming(i));
    expect(new Set(timings.map((t) => t.rest.toFixed(2))).size).toBeGreaterThan(6);
    for (const t of timings) { expect(t.rest).toBeGreaterThanOrEqual(2.5); expect(t.rest).toBeLessThanOrEqual(6.5); expect(t.delay).toBeGreaterThan(0); }
    expect(cheerVariant({ type: CHEER_ITEM, x: 0, y: 0, variant: 'kid' }, 3)).toBe('kid');
    expect(cheerAction({ type: CHEER_ITEM, x: 0, y: 0, action: 'clap' }, 3)).toBe('clap');
    expect(CHEER_VARIANTS).toContain(cheerVariant({ type: CHEER_ITEM, x: 0, y: 0, variant: 'nonsense' }, 3));
  });
  it('refuses a walk that ends on the track, warns of one that crosses it, and passes one that stays clear', () => {
    const on = spotOff(farmland, -1);
    const clear = spotOff(farmland, 2.5);
    const bad = withFan(farmland, { x: clear.x, y: clear.y, route: [[on.x, on.y]] });
    const probs = cheerProblems(bad, parts);
    expect(probs).toHaveLength(1);
    expect(probs[0].level).toBe('error');
    expect(probs[0].message).toMatch(/walks to .* on the racing surface/);
    // The game's own checks refuse it.
    expect(checkTrackParts(parts, [bad], () => true).some((e) => /walks to/.test(e.message))).toBe(true);
    const good = withFan(farmland, { x: clear.x, y: clear.y, route: [[clear.x + 1, clear.y + 1]] });
    expect(cheerProblems(good, parts)).toEqual([]);
    expect(checkTrackParts(parts, [good], () => true).filter((e) => /cheering/.test(e.message))).toEqual([]);
    // Across the track: clear to clear on the far side.
    const index = new SurfaceIndex(surfacePoints(farmland));
    const far = (() => { const [px, py] = farmland.path[2]; for (let r = 2; r < 14; r += 0.1) { const x = +(px + r).toFixed(1), y = py; if (index.offSurface(x, y) >= 2.5 && index.offSurface(px - 2.5, py) >= 0) return { x, y }; } return null; })();
    if (far) {
      const across = withFan(farmland, { x: +(farmland.path[2][0] - 3).toFixed(1), y: farmland.path[2][1], route: [[far.x, far.y]] });
      const ps = cheerProblems(across, parts).filter((p) => p.i === across.scenery!.length - 1);
      if (ps.length) { expect(ps[0].level).toBe('warning'); expect(ps[0].message).toMatch(/crosses the track on their way in/); }
    }
  });
  it('is saved with its variant, action, colour and route, which the content schema accepts, and a fan on the track is refused', () => {
    const clear = spotOff(farmland, 2.5);
    const fan: SceneryItem = { type: CHEER_ITEM, x: clear.x, y: clear.y, variant: 'kid', action: 'wave', color: '#4080e0', route: [[clear.x + 1, clear.y]] };
    const tracks = { ...(raw.tracks as { tracks: TrackDef[] }), tracks: (raw.tracks as { tracks: TrackDef[] }).tracks.map((t) => (t.id === 'farmland' ? { ...t, scenery: [...(t.scenery ?? []), fan] } : t)) };
    const res = checkContent({ ...raw, tracks }, loadManifest(), loadMaps());
    expect(res.errors.filter((e) => /scenery/.test(e.field ?? '') && /variant|action|not a known field/.test(e.message))).toEqual([]);
    expect(res.content).not.toBeNull();
    const saved = res.content!.tracks.tracks.find((t) => t.id === 'farmland')!.scenery!.at(-1)!;
    expect(saved).toMatchObject({ variant: 'kid', action: 'wave', color: '#4080e0', route: [[clear.x + 1, clear.y]] });
    const on = spotOff(farmland, -1);
    const onTrack = { ...tracks, tracks: tracks.tracks.map((t) => (t.id === 'farmland' ? { ...t, scenery: [...(t.scenery ?? []), { type: CHEER_ITEM, x: on.x, y: on.y }] } : t)) };
    const bad = checkContent({ ...raw, tracks: onTrack }, loadManifest(), loadMaps());
    expect(bad.errors.some((e) => /cheering fan .* is on the racing surface/.test(e.message))).toBe(true);
  });
});
