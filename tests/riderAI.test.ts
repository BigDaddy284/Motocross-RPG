import { describe, expect, it } from 'vitest';
import { MotoSim } from '../src/core/race';
import { directorFor } from '../src/core/riderAI';
import { sectionBounds } from '../src/core/trackGeom';
import { BIKE_LENGTH, TrackSurface } from '../src/core/trackSurface';
import { arrivals, content, field, JUMPY, race, units } from './raceHelpers';


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
