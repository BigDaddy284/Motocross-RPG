import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, type Entrant, type LapTrace } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { directorFor, type RaceDirector } from '../src/core/riderAI';
import { sectionBounds } from '../src/core/trackGeom';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const JUMPY = new Set(['tabletop', 'double', 'step_up', 'rhythm', 'whoops', 'braking_bumps']);

/** The whole CPU field, plus one rider on a worn-out bike with a broken part. */
function field(cls: string): Entrant[] {
  const list = content.riders.riders.map((d, i) => cpuEntrant(content, d, cls, i));
  const wreck = cpuEntrant(content, { ...content.riders.riders[content.riders.riders.length - 1], id: 'cpu.wreck', name: 'Wreck' }, cls, list.length);
  for (const [slot, p] of Object.entries(wreck.bike.parts)) wreck.bike.parts[slot] = { ...p, condition: slot === 'top_end' ? 0 : 0.15 };
  return [...list, wreck];
}

function race(trackId: string, seed: number): { sim: MotoSim; dir: RaceDirector; traces: LapTrace[] } {
  const track = content.tracks.tracks.find((t) => t.id === trackId)!;
  const sim = new MotoSim(content.racing, content.bikes, track, '50cc', field('50cc'), { laps: 4, motoIndex: 0, seed });
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
    });
  }

  it('shows the same race at any playback speed', () => {
    const a = race('farmland', 5).dir;
    const b = race('farmland', 5).dir;
    for (const t of [0, 3.3, 41.7, 120]) expect(a.poses(t)).toEqual(b.poses(t));
  });

  it('lines riders up at their gates before the start', () => {
    const { dir } = race('farmland', 9);
    const grid = dir.poses(0);
    // Everyone lines up at the gate on the start straight, before it joins the lap.
    expect(grid.every((p) => p.state === 'grid' && p.dist === dir.start.from && p.dist < dir.start.join)).toBe(true);
    expect(new Set(grid.map((p) => p.lane.toFixed(3))).size).toBe(grid.length);
  });

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
