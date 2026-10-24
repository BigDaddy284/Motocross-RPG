import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, seededRng, type Entrant, type LapTrace } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { directorFor, LINE_UP, START_HOLD, type RaceDirector } from '../src/core/riderAI';
import { lapGeom, lapMetres, sectionBounds } from '../src/core/trackGeom';
import { BIKE_LENGTH, TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const units = (track: { path: Parameters<typeof lapGeom>[0] }) => lapGeom(track.path).total;
const JUMPY = new Set(['tabletop', 'double', 'step_up', 'rhythm', 'whoops', 'braking_bumps']);

/** The whole CPU field, plus one rider on a worn-out bike with a broken part. */
function field(cls: string): Entrant[] {
  const list = content.riders.riders.map((d, i) => cpuEntrant(content, d, cls, i));
  const wreck = cpuEntrant(content, { ...content.riders.riders[content.riders.riders.length - 1], id: 'cpu.wreck', name: 'Wreck' }, cls, list.length);
  for (const [slot, p] of Object.entries(wreck.bike.parts)) wreck.bike.parts[slot] = { ...p, condition: slot === 'top_end' ? 0 : 0.15 };
  return [...list, wreck];
}

function race(trackId: string, seed: number, shuffle = false, riders = 16): { sim: MotoSim; dir: RaceDirector; traces: LapTrace[] } {
  const track = content.tracks.tracks.find((t) => t.id === trackId)!;
  const entrants = field('50cc').slice(0, riders);
  // A different gate draw for each seed, as race days give.
  if (shuffle) {
    const rnd = seededRng(seed);
    const gates = entrants.map((_, i) => i);
    for (let i = gates.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [gates[i], gates[j]] = [gates[j], gates[i]];
    }
    entrants.forEach((e, i) => (e.gate = gates[i]));
  }
  const sim = new MotoSim(content.racing, content.bikes, track, '50cc', entrants, { laps: 4, motoIndex: 0, seed });
  const dir = directorFor(sim, content.bikes, content.racing.messages);
  const traces = sim.runToEnd();
  for (const tr of traces) dir.addLap(tr);
  return { sim, dir, traces };
}

describe('rider AI (GDD 11.1)', () => {
  for (const track of content.tracks.tracks) {
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

  it('shows the same race at any playback speed', () => {
    const a = race('farmland', 5).dir;
    const b = race('farmland', 5).dir;
    for (const t of [0, 3.3, 41.7, 120]) expect(a.poses(t)).toEqual(b.poses(t));
  });

  it('lines riders up at their gates before the start', () => {
    const { dir } = race('farmland', 9);
    const grid = dir.poses(0);
    // Everyone lines up at the gate on the start straight, before it joins the lap: two rows of 8,
    // the second straight behind the first, every slot different.
    expect(grid.every((p) => p.state === 'grid' && p.dist === dir.start.from && p.dist < dir.start.join)).toBe(true);
    const slots = grid.map((p) => `${dir.startRow(p.id)} ${p.lane.toFixed(3)}`);
    expect(new Set(slots).size).toBe(grid.length);
    expect(grid.filter((p) => dir.startRow(p.id) === 0).length).toBe(8);
    const front = new Set(grid.filter((p) => dir.startRow(p.id) === 0).map((p) => p.lane.toFixed(3)));
    expect(grid.filter((p) => dir.startRow(p.id) === 1).every((p) => front.has(p.lane.toFixed(3)))).toBe(true);
  });

  /** Each rider's arrival in their slot: the line-up time they stop there for good (the riders already there: the start). */
  function arrivals(dir: RaceDirector): Map<string, number> {
    const at = new Map<string, number>();
    for (let t = -dir.prestart; t <= 0.001; t += 0.02) {
      for (const p of dir.poses(t)) {
        const there = p.dist === dir.start.from && p.speed === 0;
        if (!there) at.delete(p.id);
        else if (!at.has(p.id)) at.set(p.id, t);
      }
    }
    return at;
  }

  for (const trackId of ['farmland', 'arena-supercross', 'longmoor-endurance']) {
    it(`runs the start procedure on ${trackId}: riders reach their slots in gate order over six seconds, lane by lane, then hold for five`, () => {
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
          // The first gates (4 for a full field) are already in place; the line-up takes six seconds; then the hold.
          const k = Math.min(n, Math.max(4, Math.min(8, Math.round(n * 0.25))));
          expect([...dir.lined].map((id) => gate.get(id)).sort((a, b) => a! - b!)).toEqual([...Array(k).keys()]);
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
          // Everyone else rides up, several at once, and they reach their slots strictly in gate order.
          expect(setOff.size).toBe(n - k);
          expect(mostAtOnce).toBeGreaterThanOrEqual(Math.min(3, n - k));
          const arrived = arrivals(dir);
          const order = [...arrived.entries()].sort((a, b) => a[1] - b[1] || gate.get(a[0])! - gate.get(b[0])!).map(([id]) => gate.get(id));
          expect(order, `${trackId} ${n} riders, seed ${seed}`).toEqual([...Array(n).keys()]);
          for (let g = k + 1; g < n; g++) expect(arrived.get(byGate.get(g)!)!).toBeGreaterThan(arrived.get(byGate.get(g - 1)!)!);
        }
      }
    }, 60000);
  }

  it('puts the rider at each picked gate in that slot, and that place in the line-up', () => {
    for (const g of [1, 5, 8, 9, 11, 16]) {
      for (const seed of [8, 99]) {
        const { dir } = race('farmland', seed, true);
        const id = [...dir.profiles.keys()].find((x) => dir.gateOf(x) === g - 1)!;
        const slot = dir.poses(0).find((p) => p.id === id)!;
        expect(dir.startRow(id)).toBe(g <= 8 ? 0 : 1);
        // Its lane is the (g-1) % 8th of eight, from gate 1's on the inside of the first corner across.
        const inside = dir.poses(0).find((p) => dir.gateOf(p.id) === 0)!.lane;
        expect(slot.lane).toBeCloseTo(inside * (1 - (2 * ((g - 1) % 8)) / 7), 9);
        const arrived = arrivals(dir);
        const order = [...arrived.entries()].sort((a, b) => a[1] - b[1] || dir.gateOf(a[0]) - dir.gateOf(b[0])).map(([x]) => x);
        expect(order.indexOf(id) + 1).toBe(g);
      }
    }
  });

  it('refuses a start with a gate past the size of the field, or two riders on one gate', () => {
    const track = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    const es = field('50cc').slice(0, 10);
    es.forEach((e, i) => (e.gate = i));
    const profiles = () => directorFor(new MotoSim(content.racing, content.bikes, track, '50cc', es, { laps: 4, motoIndex: 0, seed: 1 }), content.bikes, content.racing.messages);
    expect(profiles).not.toThrow();
    es[3].gate = 12;
    expect(profiles).toThrow(/gate 13/);
    es[3].gate = 4;
    expect(profiles).toThrow(/gate 5/);
  });

  it('after the flag, finishers ride a slow cool-down in single file instead of stopping on the track', () => {
    for (const trackId of ['farmland', 'arena-supercross', 'longmoor-endurance']) {
      for (const seed of [3, 12]) {
        const { dir, traces } = race(trackId, seed, true);
        const track = content.tracks.tracks.find((t) => t.id === trackId)!;
        const s = new TrackSurface(track);
        const lastT = Math.max(...traces.flatMap((tr) => Object.values(tr.times).map((t) => t[t.length - 1])));
        const seen = new Map<string, number>();
        for (let t = lastT - 60; t <= lastT + 20; t += 0.25) {
          const done = dir.poses(t).filter((p) => p.state === 'finished');
          for (const p of done) {
            // Always moving on, at walking pace or more, never back.
            expect(p.speed).toBeGreaterThan(3);
            expect(p.dist).toBeGreaterThanOrEqual((seen.get(p.id) ?? -Infinity) - 1e-12);
            seen.set(p.id, p.dist);
          }
          // Once clear of the line, no two finishers are on top of each other: along the track a
          // bike is BIKE_LENGTH long, and across it under half a grid unit wide. (Measured along
          // the track, as the inside of a hairpin squeezes any line on it.)
          const clear = done.filter((p) => (p.dist % 1) * units(track) > 6);
          for (let i = 0; i < clear.length; i++) {
            for (let j = i + 1; j < clear.length; j++) {
              const along = Math.abs(clear[i].dist - clear[j].dist) * units(track);
              const across = Math.abs(clear[i].lane - clear[j].lane) * s.hw;
              expect(along < BIKE_LENGTH && across < 0.45, `${trackId} ${seed} ${clear[i].id} ${clear[j].id} at ${t}`).toBe(false);
            }
          }
        }
        expect(seen.size).toBeGreaterThan(8);
      }
    }
  }, 30000);

  it('shows mistakes and crashes where the referee put them', () => {
    let crashes = 0;
    let wobbles = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { dir, traces } = race('farmland', seed);
      for (const tr of traces) {
        for (const e of tr.events) {
          if (e.kind !== 'mistake') continue;
          const times = tr.times[e.rider];
          const leg = tr.secs.indexOf(e.section);
          const t0 = times[leg];
          const t1 = times[leg + 1];
          const states = new Set<string>();
          for (let t = t0; t < t1; t += 0.1) states.add(dir.poses(t).find((p) => p.id === e.rider)!.state);
          if (e.outcome === 'minor_crash' || e.outcome === 'serious_crash') {
            expect(states.has('crashed')).toBe(true);
            crashes++;
          } else if (states.has('wobble')) wobbles++;
        }
      }
    }
    expect(wobbles).toBeGreaterThan(0);
    expect(crashes + wobbles).toBeGreaterThan(0);
  });
});
