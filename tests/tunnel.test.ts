import { describe, expect, it } from 'vitest';
import type { TrackDef } from '../src/core/race';
import { DECKS, LIP_AT, TrackSurface, WALK_HOLE, WALLS } from '../src/core/trackSurface';

// Tunnels through a jump's deck (Boss, 28 Oct 2026): a figure-of-eight lap whose tabletop carries
// the track over the crossing, and a step-on with a pedestrian tunnel.
const path: [number, number][] = [[20, 30], [40, 15], [60, 45], [80, 30], [60, 15], [40, 45]];
const base = (sections: TrackDef['sections']): TrackDef => ({ id: 't', name: 'Tunnel test', kind: 'outdoor', size: 'small', surface: 'hard_pack', gates: [], path, sections } as unknown as TrackDef);
// Lap of 172.15 grid units: the tabletop's deck (0.32 to 0.6 of it) sits over the crossing at 50, 30, 43 units round.
const total = 25 + Math.hypot(20, 30) + 25 + 25 + Math.hypot(20, 30) + 25;
const m = (u: number) => Math.round(u * 2.7);
const sections = (tunnel?: 'track' | 'walk') => [
  { type: 'straight', length: m(32.9), passing: 0.6 },
  { type: 'tabletop', length: m(22), passing: 0.4, height: 3.5, ...(tunnel ? { tunnel } : {}) },
  { type: 'straight', length: m(85), passing: 0.6 },
  { type: 'step_on', length: m(12), passing: 0.4, tunnel: 'walk' as const },
  { type: 'straight', length: Math.round(total * 2.7) - m(32.9) - m(22) - m(85) - m(12), passing: 0.6 },
];

describe('tunnels', () => {
  it('finds the lap crossing under a tabletop set as a track tunnel, and cuts the hole within its deck', () => {
    const s = new TrackSurface(base(sections('track')));
    const t = s.tunnels.find((x) => !x.walk)!;
    expect(t).toBeDefined();
    expect(t.si).toBe(1);
    // The crossing: 43 units round the lap on the deck, 129 units round on the stretch below.
    expect(t.under! * s.g.total).toBeCloseTo(129.1, 0);
    const d0 = s.bounds[1] + (s.bounds[2] - s.bounds[1]) * DECKS.tabletop[0];
    const d1 = s.bounds[1] + (s.bounds[2] - s.bounds[1]) * DECKS.tabletop[1];
    expect(t.h0).toBeGreaterThanOrEqual(d0 - 1e-9);
    expect(t.h1).toBeLessThanOrEqual(d1 + 1e-9);
    expect((t.h1 - t.h0) * s.g.total).toBeGreaterThan(4);
    expect(t.f0).toBeCloseTo(s.bounds[1] + (s.bounds[2] - s.bounds[1]) * WALLS.tabletop[0], 9);
    expect(s.inHole(43.03 / s.g.total)).toBe(true);
    expect(s.inHole(20 / s.g.total)).toBe(false);
  });

  it('stands the banks up as walls along the deck: every lane outside the lip is at the lip', () => {
    const s = new TrackSurface(base(sections('track')));
    const t = s.tunnels.find((x) => !x.walk)!;
    const f = (t.f0 + t.h0) / 2;
    const lip = s.spot(f, LIP_AT);
    const foot = s.spot(f, LIP_AT + 1.5);
    expect(foot.x).toBeCloseTo(lip.x, 6);
    expect(foot.z).toBeCloseTo(lip.z, 6);
    // Off the tunnel the bank slopes out as before.
    const away = s.spot(10 / s.g.total, LIP_AT + 1.5);
    const awayLip = s.spot(10 / s.g.total, LIP_AT);
    expect(Math.hypot(away.x - awayLip.x, away.z - awayLip.z)).toBeGreaterThan(1);
  });

  it('gives a pedestrian tunnel a hole as wide as a walkway in the middle of the deck, and none to a tabletop with no track under it', () => {
    const s = new TrackSurface(base(sections()));
    expect(s.tunnels.some((x) => !x.walk)).toBe(false);
    const w = s.tunnels.find((x) => x.walk)!;
    expect(w.si).toBe(3);
    expect((w.h1 - w.h0) * s.g.total).toBeCloseTo(WALK_HOLE, 6);
    const mid = s.bounds[3] + (s.bounds[4] - s.bounds[3]) * (DECKS.step_on[0] + DECKS.step_on[1]) / 2;
    expect((w.h0 + w.h1) / 2).toBeCloseTo(mid, 9);
  });
});
