import { describe, expect, it } from 'vitest';
import { pickWay, tapsAfter, WHOOP_TOPS, WHOOP_WAYS } from '../src/core/jumps';
import type { TrackDef } from '../src/core/race';
import { sectionBounds } from '../src/core/trackGeom';
import { TrackSurface } from '../src/core/trackSurface';
import { WHOOP_WHEELIE } from '../src/core/wheelie';
import { content, race } from './raceHelpers';

// Whoops (Boss, 2 Nov 2026): "Wheelie through whoop, also jump rhythms in woops rider movement".
describe('whoops', () => {
  it('are skimmed, wheelied or jumped in rhythm, the rhythms by good jumpers only, and a mistake skims', () => {
    const names = (jumping: number) => new Set(Array.from({ length: 100 }, (_, k) => pickWay('whoops', jumping, k / 100)!.name));
    expect([...names(0)].sort()).toEqual(['skim', 'wheelie']);
    expect(names(1)).toEqual(new Set(WHOOP_WAYS.map((w) => w.name)));
    expect(pickWay('whoops', 1, 0.9, true)!.name).toBe('skim');
  });

  it('jumps from whoop top to whoop top, tapping the back wheel and popping off, clear of the ground between', () => {
    const track = {
      id: 'whoop-test', name: 'Whoop test', kind: 'outdoor',
      path: [[10, 10], [90, 10], [90, 50], [10, 50]],
      sections: [{ type: 'straight', length: 40, passing: 0.5 }, { type: 'whoops', length: 40, passing: 0.5 }, { type: 'straight', length: 60, passing: 0.5 }],
    } as unknown as TrackDef;
    const s = new TrackSurface(track);
    const f0 = s.bounds[1];
    const span = s.bounds[2] - f0;
    for (const way of WHOOP_WAYS.filter((w) => w.hops.length)) {
      for (const [a, b] of way.hops) {
        expect(WHOOP_TOPS).toContain(a);
        expect(WHOOP_TOPS).toContain(b);
      }
      expect(way.hops.every((_, i) => i === way.hops.length - 1 || tapsAfter(way, i)), way.name).toBe(true);
      const flight = { hops: way.hops.map(([a, b]) => [f0 + a * span, f0 + b * span] as [number, number]), launch: 0.8 };
      for (const [a, b] of flight.hops) for (let t = 0.05; t < 1; t += 0.05) {
        const f = a + (b - a) * t;
        expect(s.wheel(f, 0, flight), `${way.name}`).toBeGreaterThan(s.height(f, 0));
      }
    }
  });

  it('shows riders wheelieing across them and jumping them in a race', () => {
    const track = content.tracks.tracks.find((t) => t.id === 'arena-supercross')!;
    const bounds = sectionBounds(track);
    const whoops = track.sections.map((sec, i) => (sec.type === 'whoops' ? i : -1)).filter((i) => i >= 0);
    const inWhoops = (d: number) => {
      const f = d - Math.floor(d);
      return whoops.some((i) => f > bounds[i] && f < bounds[i + 1]);
    };
    let wheelies = 0;
    let hops = 0;
    for (const seed of [2, 9]) {
      const { dir } = race('arena-supercross', seed);
      for (let t = 0; t < 200; t += 0.1) for (const p of dir.poses(t)) {
        if (!inWhoops(p.dist) || p.state === 'retired') continue;
        if (p.wheelie) {
          wheelies++;
          expect(p.wheelie).toBeLessThanOrEqual(WHOOP_WHEELIE);
          expect(p.wheelieHold).toBe(true);
        }
        if (p.flight && p.air > 0.05) hops++;
      }
    }
    expect(wheelies).toBeGreaterThan(5);
    expect(hops).toBeGreaterThan(5);
  });
});
