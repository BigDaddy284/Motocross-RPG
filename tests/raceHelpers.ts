// Races for the rider AI tests: the whole CPU field on a track, simulated and handed to the director.
import { checkContent } from '../src/core/content';
import { MotoSim, seededRng, type Entrant, type LapTrace } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { directorFor, type RaceDirector } from '../src/core/riderAI';
import { lapGeom } from '../src/core/trackGeom';
import { loadManifest, loadMaps, rawContent } from './helpers';


export const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
export const units = (track: { path: Parameters<typeof lapGeom>[0] }) => lapGeom(track.path).total;
export const JUMPY = new Set(['tabletop', 'double', 'step_up', 'rhythm', 'whoops', 'braking_bumps']);

/** The first 15 CPU riders (the original local field), plus one rider on a worn-out bike with a broken part. */
export function field(cls: string): Entrant[] {
  const riders = content.riders.riders.slice(0, 15);
  const list = riders.map((d, i) => cpuEntrant(content, d, cls, i));
  const wreck = cpuEntrant(content, { ...riders[riders.length - 1], id: 'cpu.wreck', name: 'Wreck' }, cls, list.length);
  for (const [slot, p] of Object.entries(wreck.bike.parts)) wreck.bike.parts[slot] = { ...p, condition: slot === 'top_end' ? 0 : 0.15 };
  return [...list, wreck];
}

export function race(trackId: string, seed: number, shuffle = false, riders = 16): { sim: MotoSim; dir: RaceDirector; traces: LapTrace[] } {
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

/** Each rider's arrival in their slot: the line-up time they stop there for good (the riders already there: the start). */
export function arrivals(dir: RaceDirector): Map<string, number> {
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
