import { describe, expect, it } from 'vitest';
import { sectionBounds } from '../src/core/trackGeom';
import { content, JUMPY, race } from './raceHelpers';
import { tracksIn, type TrackGroup } from './trackGroups';

/** The rider AI acts out the simulation's result on every track of the group (GDD 11.1). */
export function riderAITrackTests(group: TrackGroup): void {
  describe(`rider AI (GDD 11.1) on the ${group.replace('-', ' ').replace('-', ' to ')} tracks`, () => {
  for (const track of tracksIn(group, content.tracks.tracks)) {
    it(`acts out the simulation's result on ${track.id}`, () => {
      for (const seed of [3, 77]) {
        const { sim, dir, traces } = race(track.id, seed);
        const bounds = sectionBounds(track);
        // At every checkpoint the referee recorded, the rider is exactly at that point of the race.
        for (const tr of traces) {
          for (const [id, times] of Object.entries(tr.times)) {
            for (let i = 1; i < times.length; i++) {
              const p = dir.poses(times[i]).find((q) => q.id === id)!;
              expect(p.dist).toBeCloseTo(tr.marks[i], 6);
            }
          }
        }
        // Over the race: nobody goes backwards, stays on the track, and only leaves the ground on jumps.
        const end = Math.max(...traces.flatMap((tr) => Object.values(tr.times).map((t) => t[t.length - 1]))) + 6;
        const last = new Map<string, number>();
        let airborne = 0;
        for (let t = 0; t <= end; t += 0.25) {
          for (const p of dir.poses(t)) {
            expect(p.dist).toBeGreaterThanOrEqual((last.get(p.id) ?? -Infinity) - 1e-9);
            last.set(p.id, p.dist);
            expect(p.air).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(p.speed)).toBe(true);
            if (p.state !== 'retired') expect(Math.abs(p.lane)).toBeLessThanOrEqual(1);
            if (p.air > 0) {
              expect(p.dist).toBeGreaterThan(dir.start.join);
              const at = p.dist - Math.floor(p.dist);
              const si = bounds.findIndex((b, k) => k > 0 && at < b + 1e-9) - 1;
              expect(JUMPY.has(track.sections[Math.max(0, si)].type)).toBe(true);
              airborne++;
            }
          }
        }
        if (track.sections.some((s) => JUMPY.has(s.type))) expect(airborne).toBeGreaterThan(0);
        // Finishers end on the full distance, and in the referee's finishing order.
        const results = sim.results().filter((r) => !r.retired);
        const finals = dir.poses(end);
        for (const r of results) expect(finals.find((p) => p.id === r.id)!.state).toBe('finished');
        for (const r of sim.results().filter((x) => x.retired)) expect(finals.find((p) => p.id === r.id)!.state).toBe('retired');
      }
    }, 20000); // Longmoor is a long race: 16 riders over every quarter second.
  }
  });
}
