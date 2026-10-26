import { describe, expect, it } from 'vitest';
import { LINE_UP, START_HOLD } from '../src/core/riderAI';
import { lapGeom, lapMetres } from '../src/core/trackGeom';
import { BIKE_LENGTH, TrackSurface } from '../src/core/trackSurface';
import { arrivals, content, race } from './raceHelpers';

// The slowest rider AI tests, one file a track (tests/startProcedure.*.test.ts): run in one file
// they kept a test worker busy long enough to time out its messages to vitest.

/** The start procedure on one track, over field sizes and gate draws. */
export function startProcedureTest(trackId: string): void {
  describe(`rider AI start procedure (GDD 11.1) on ${trackId}`, () => {
    it(`runs the start procedure on ${trackId}: riders reach their slots in pick order over six seconds, never through a slot, then hold for five`, () => {
      let shuffledStarts = 0;
      for (const n of [16, 12, 10, 8]) {
        for (const seed of [4, 21, 300, 5151, 77777, 123456]) {
          const { dir } = race(trackId, seed, true, n);
          const track = content.tracks.tracks.find((t) => t.id === trackId)!;
          const s = new TrackSurface(track);
          const units = lapGeom(track.path).total;
          const slots = new Map(dir.poses(0).map((p) => [p.id, p]));
          const ids = [...slots.keys()];
          expect(ids.length).toBe(n);
          const gate = new Map(ids.map((id) => [id, dir.gateOf(id)]));
          const byGate = new Map(ids.map((id) => [gate.get(id)!, id]));
          // Gates 1 to 8 are the front row, 9 to 16 the second, each straight behind the gate 8 before it.
          for (const id of ids) {
            const g = gate.get(id)!;
            expect(dir.startRow(id)).toBe(g < 8 ? 0 : 1);
            if (g >= 8) expect(slots.get(id)!.lane).toBe(slots.get(byGate.get(g - 8)!)!.lane);
          }
          expect(new Set(ids.filter((id) => gate.get(id)! < 8).map((id) => slots.get(id)!.lane)).size).toBe(Math.min(n, 8));
          // The first riders to pick (4 for a full field) are already in place; the line-up takes six seconds; then the hold.
          const k = Math.min(n, Math.max(4, Math.min(8, Math.round(n * 0.25))));
          expect(dir.arrival).toHaveLength(n);
          expect([...dir.lined].sort()).toEqual(dir.arrival.slice(0, k).sort());
          // A second-row rider never comes before the front-row rider of their lane.
          for (const id of ids) {
            const g = gate.get(id)!;
            if (g >= 8) expect(dir.arrival.indexOf(id)).toBeGreaterThan(dir.arrival.indexOf(byGate.get(g - 8)!));
          }
          expect(dir.prep).toBe(LINE_UP);
          expect(dir.prestart).toBe(LINE_UP + START_HOLD);
          expect(dir.linedUp(-START_HOLD)).toBe(true);
          expect(dir.linedUp(-START_HOLD - 0.05)).toBe(false);
          const last = new Map<string, number>();
          const setOff = new Map<string, number>();
          let mostAtOnce = 0;
          for (let t = -dir.prestart; t <= 0.001; t += 0.02) {
            const poses = dir.poses(t);
            const at = new Map(poses.map((p) => [p.id, p]));
            // Where each bike stands on the start straight, as the race view places it (second row a bike length and a bit back).
            const spots = poses.map((p) => {
              const u = (p.dist - dir.start.from) * units - dir.startRow(p.id) * BIKE_LENGTH * 1.4;
              return { id: p.id, u, x: p.lane * s.startHw(u) };
            });
            mostAtOnce = Math.max(mostAtOnce, poses.filter((p) => p.speed > 0).length);
            for (const p of poses) {
              expect(p.state).toBe('grid');
              // Only ever forwards, never past the slot.
              expect(p.dist).toBeGreaterThanOrEqual((last.get(p.id) ?? -Infinity) - 1e-12);
              expect(p.dist).toBeLessThanOrEqual(dir.start.from + 1e-12);
              if (last.has(p.id) && p.dist > last.get(p.id)! && !setOff.has(p.id)) setOff.set(p.id, t);
              last.set(p.id, p.dist);
              // Riding up at a believable pace: under 3 grid units a second, gently.
              expect((p.speed * units) / lapMetres(track)).toBeLessThan(3);
              // A second-row rider only moves once the front-row rider of their own lane is in place and still.
              const g = gate.get(p.id)!;
              const f = g >= 8 ? byGate.get(g - 8)! : undefined;
              if (f && p.dist < dir.start.from && setOff.has(p.id)) {
                expect(at.get(f)!.dist, `${p.id} behind ${f} at ${t.toFixed(2)}`).toBe(dir.start.from);
                expect(at.get(f)!.speed).toBe(0);
              }
              // Still, and in the slot, for the whole hold.
              if (t >= -START_HOLD) {
                expect(p.dist).toBe(dir.start.from);
                expect(p.lane).toBe(slots.get(p.id)!.lane);
                expect(p.speed).toBe(0);
              }
            }
            // No two bikes overlap: a bike is BIKE_LENGTH long and under half a grid unit wide.
            for (let i = 0; i < spots.length; i++) {
              for (let j = i + 1; j < spots.length; j++) {
                const touching = Math.abs(spots[i].u - spots[j].u) < BIKE_LENGTH && Math.abs(spots[i].x - spots[j].x) < 0.45;
                expect(touching, `${spots[i].id} and ${spots[j].id} at ${t.toFixed(2)}`).toBe(false);
              }
            }
          }
          // Everyone else rides up, several at once, and they reach their slots strictly in that order,
          // which is not gate order: the gate fills unevenly, as at a real start.
          expect(setOff.size).toBe(n - k);
          expect(mostAtOnce).toBeGreaterThanOrEqual(Math.min(3, n - k));
          const arrived = arrivals(dir);
          for (let i = k + 1; i < n; i++) expect(arrived.get(dir.arrival[i])!, `${trackId} ${n} riders, seed ${seed}`).toBeGreaterThan(arrived.get(dir.arrival[i - 1])!);
          if (dir.arrival.some((id, i) => gate.get(id) !== i)) shuffledStarts++;
        }
      }
      expect(shuffledStarts).toBe(24);
    }, 60000);
  });
}
