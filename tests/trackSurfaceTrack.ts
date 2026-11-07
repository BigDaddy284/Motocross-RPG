import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, type Entrant } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { directorFor } from '../src/core/riderAI';
import { BIKE_LENGTH, LIP_AT, LIP_H, TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';
import { tracksIn, type TrackGroup } from './trackGroups';

// The 3D track surface (acceptance tests 2 and 5): every track is one continuous, closed surface
// with raised edges, and the bikes' wheels sit on it, never floating or sinking.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const SKIM = new Set(['whoops', 'rollers']);

export function trackSurfaceTests(group: TrackGroup): void {
  describe(`track surface on the ${group.replace('-', ' ').replace('-', ' to ')} tracks`, () => {
  for (const track of tracksIn(group, content.tracks.tracks)) {
    it(`is one closed, continuous surface with raised edges on ${track.id}`, () => {
      const s = new TrackSurface(track);
      const step = 0.05 / s.g.total;
      let prev = s.height(0, 0);
      for (let f = step; f <= 1 + 1e-9; f += step) {
        for (const lane of [-1, -0.5, 0, 0.5, 1]) {
          const h = s.height(f, lane);
          expect(Number.isFinite(h)).toBe(true);
          // Never below the track's own level there (a dip can take that under the grass).
          expect(h).toBeGreaterThanOrEqual(Math.min(0, s.lift(f)) - 1e-9);
        }
        // No break in the surface along the lap: even the steepest jump face is under 76 degrees.
        const h = s.height(f, 0);
        expect(Math.abs(h - prev)).toBeLessThan(0.2);
        prev = h;
        // The lip along each edge stands above the racing surface next to it, except in the
        // opening where the start straight runs onto the lap.
        for (const side of [-1, 1]) {
          const m = s.mouth(f, side);
          const rise = s.height(f, side * LIP_AT) - s.height(f, side);
          if (m > 0) expect(rise).toBeLessThanOrEqual(LIP_H * (1 - m) + 1e-9);
          else expect(rise).toBeGreaterThan(0);
        }
      }
      // The lap closes: the end of the last section meets the start line.
      expect(s.height(1 - 1e-9, 0)).toBeCloseTo(s.height(0, 0), 3);
      const a = s.spot(0, 0);
      const b = s.spot(1 - 1e-9, 0);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.01);
      // A bike is shorter than the track is wide.
      expect(BIKE_LENGTH).toBeLessThan(2 * s.hw);
    });

    it(`keeps every bike's wheels on the surface through a race on ${track.id}`, () => {
      const s = new TrackSurface(track);
      const field: Entrant[] = content.riders.riders.slice(0, 15).map((d, i) => cpuEntrant(content, d, '50cc', i));
      const sim = new MotoSim(content.racing, content.bikes, track, '50cc', field, { laps: 3, motoIndex: 0, seed: 11 });
      const dir = directorFor(sim, content.bikes, content.racing.messages);
      for (const tr of sim.runToEnd()) dir.addLap(tr);
      const end = Math.max(...sim.riders.map((r) => r.time)) + 3;
      let flying = 0;
      for (let t = 0; t < end; t += 0.5) {
        for (const p of dir.poses(t)) {
          const f = p.dist - Math.floor(p.dist);
          const wheels = s.wheels(f, p.lane, p.flight);
          for (const [k, w] of wheels.entries()) {
            const wf = f + ((k ? 1 : -1) * BIKE_LENGTH) / 2 / s.g.total;
            const ground = s.height(wf, p.lane);
            // Never under the surface.
            expect(w.y).toBeGreaterThanOrEqual(ground - 1e-9);
            const type = track.sections[s.at(wf).si].type;
            // Off its hops the wheel touches the ground, except where the bike skims whoops and rollers.
            const wf1 = wf - Math.floor(wf);
            const inHop = !!p.flight?.hops.some(([a, b]) => wf1 > a && wf1 < b);
            if (!inHop && !SKIM.has(type)) expect(w.y).toBeCloseTo(ground, 6);
            if (w.y > ground + 0.05) flying++;
          }
        }
      }
      if (track.sections.some((x) => ['tabletop', 'double', 'step_up'].includes(x.type))) expect(flying).toBeGreaterThan(0);
    });
  }
});
}
