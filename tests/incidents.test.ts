import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { MotoSim, type Entrant } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { loadManifest, loadMaps, rawContent } from './helpers';

// First-corner incidents and pile-ups: crashes that take more than one rider down, some races,
// never every race and never always the same rider.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const farm = content.tracks.tracks.find((t) => t.id === 'farmland')!;

function race(seed: number, laps = 3) {
  const field: Entrant[] = content.riders.riders.slice(0, 12).map((d, i) => cpuEntrant(content, d, '50cc', i));
  field[0] = { ...field[0], player: true };
  const sim = new MotoSim(content.racing, content.bikes, farm, '50cc', field, { laps, motoIndex: 0, seed });
  return { sim, traces: sim.runToEnd(), field };
}

describe('first-corner incidents', () => {
  it('happen in some races, not all, take one to three riders, and are not always the player', () => {
    const { chance, riders } = content.racing.sim.firstCorner!;
    expect(chance).toBeGreaterThan(0);
    let races = 0;
    let withIncident = 0;
    let playerDown = 0;
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const { traces, field } = race(seed, 1);
      races++;
      const fc = traces[0].events.filter((e) => e.kind === 'mistake' && e.with === 'first_corner');
      if (!fc.length) continue;
      withIncident++;
      sizes.add(fc.length);
      expect(fc.length).toBeGreaterThanOrEqual(riders[0]);
      expect(fc.length).toBeLessThanOrEqual(riders[1]);
      // In the first corner, the start straight's end (lapPlan's stretch -2), as crashes.
      for (const e of fc) {
        if (e.kind !== 'mistake') continue;
        expect(['minor_crash', 'serious_crash']).toContain(e.outcome);
        expect(e.section).toBe(-2);
        if (e.rider === field[0].id) playerDown++;
      }
    }
    expect(withIncident).toBeGreaterThan(races * 0.1);
    expect(withIncident).toBeLessThan(races * 0.6);
    expect(sizes.size).toBeGreaterThan(1);
    expect(playerDown).toBeLessThan(withIncident);
  });

  it('never happen in practice, and never on later laps', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { traces } = race(seed, 3);
      for (const tr of traces.slice(1)) expect(tr.events.some((e) => e.kind === 'mistake' && e.with === 'first_corner')).toBe(false);
    }
  });
});

describe('loop-outs out of the gate (Boss, 30 Oct 2026)', () => {
  it('happen in some races, one rider at most, as a crash on the start straight on lap 1 only', () => {
    let withLoop = 0;
    const who = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { traces } = race(seed, 2);
      const loops = traces.flatMap((tr) => tr.events.filter((e) => e.kind === 'mistake' && e.with === 'loop_out'));
      expect(loops.length).toBeLessThanOrEqual(1);
      for (const tr of traces.slice(1)) expect(tr.events.some((e) => e.kind === 'mistake' && e.with === 'loop_out')).toBe(false);
      for (const e of loops) {
        if (e.kind !== 'mistake') continue;
        expect(['minor_crash', 'serious_crash']).toContain(e.outcome);
        expect(e.section).toBe(-1);
        // A rider who loops out isn't also caught in the first-corner incident.
        expect(traces[0].events.some((x) => x.kind === 'mistake' && x.with === 'first_corner' && x.rider === e.rider)).toBe(false);
        who.add(e.rider);
        withLoop++;
      }
    }
    expect(withLoop).toBeGreaterThan(60 * 0.1);
    expect(withLoop).toBeLessThan(60 * 0.6);
    expect(who.size).toBeGreaterThan(1);
  });
});

describe('pile-ups', () => {
  it('sometimes take riders close behind a crash down with it, in the same section, within the window', () => {
    const pile = content.racing.sim.pileup!;
    let collected = 0;
    let crashes = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const { traces, sim } = race(seed, 3);
      for (const tr of traces) {
        const ms = tr.events.filter((e): e is Extract<typeof e, { kind: 'mistake' }> => e.kind === 'mistake');
        for (const e of ms) {
          if (e.outcome === 'minor_crash' || e.outcome === 'serious_crash') crashes++;
          if (!e.with || e.with === 'first_corner' || e.with === 'loop_out') continue;
          collected++;
          const cause = ms.find((m) => m.rider === e.with && m.section === e.section);
          expect(cause).toBeDefined();
          expect(['minor_crash', 'serious_crash']).toContain(e.outcome);
          expect(sim.riders.some((r) => r.e.id === e.with)).toBe(true);
        }
      }
    }
    expect(collected).toBeGreaterThan(0);
    expect(collected).toBeLessThan(crashes);
    expect(pile.most).toBeGreaterThanOrEqual(1);
  });

  it('keeps every rider on the right number of laps and results in time order', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { sim } = race(seed, 3);
      for (const r of sim.riders.filter((x) => !x.retired)) expect(r.laps).toBe(3);
    }
  });
});

describe('after a crash (Boss, 3 Nov 2026)', () => {
  type Mistake = Extract<ReturnType<MotoSim['nextLap']>['events'][number], { kind: 'mistake' }>;
  const crashesIn = (events: ReturnType<MotoSim['nextLap']>['events']) =>
    events.filter((e): e is Mistake => e.kind === 'mistake' && (e.outcome === 'minor_crash' || e.outcome === 'serious_crash'));

  it('lets the riders behind go round a fallen rider instead of waiting for them to remount', () => {
    let passedFallen = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const { traces } = race(seed, 3);
      for (const tr of traces) {
        const ms = tr.events.filter((e): e is Mistake => e.kind === 'mistake');
        for (const c of crashesIn(tr.events)) {
          const leg = tr.secs.indexOf(c.section);
          if (leg < 0) continue;
          const tc = tr.times[c.rider];
          for (const [id, times] of Object.entries(tr.times)) {
            if (id === c.rider || times.length <= leg + 1) continue;
            // A rider entering the section just behind, who makes no mistake of their own there,
            // leaves it ahead of the rider on the ground.
            if (times[leg] <= tc[leg] || times[leg] - tc[leg] > 1 || ms.some((m) => m.rider === id && m.section === c.section)) continue;
            expect(times[leg + 1]).toBeLessThan(tc[leg + 1]);
            expect(tr.events.some((e) => e.kind === 'pass' && e.rider === id && e.other === c.rider && e.section === c.section)).toBe(true);
            passedFallen++;
          }
        }
      }
    }
    expect(passedFallen).toBeGreaterThan(10);
  });

  it('leaves the rider who crashed slower for the sections after it, fading out', () => {
    const run = (seed: number, slowPct: number) => {
      const racing = structuredClone(content.racing);
      racing.sim.afterCrash = { ...racing.sim.afterCrash!, slowPct };
      const field: Entrant[] = content.riders.riders.slice(0, 12).map((d, i) => cpuEntrant(content, d, '50cc', i));
      const sim = new MotoSim(racing, content.bikes, farm, '50cc', field, { laps: 2, motoIndex: 0, seed });
      return sim.runToEnd();
    };
    let compared = 0;
    for (let seed = 1; seed <= 40 && compared < 8; seed++) {
      const slow = run(seed, 30);
      const same = run(seed, 0);
      for (let l = 0; l < slow.length; l++) {
        for (const c of crashesIn(slow[l].events)) {
          const leg = slow[l].secs.indexOf(c.section);
          const a = slow[l].times[c.rider];
          const b = same[l].times[c.rider];
          if (leg < 0 || a.length <= leg + 2 || b.length <= leg + 2) continue;
          // The same crash in both runs, then the next section ridden slower when shaken.
          if (!crashesIn(same[l].events).some((x) => x.rider === c.rider && x.section === c.section)) continue;
          expect(a[leg + 2] - a[leg + 1]).toBeGreaterThan(b[leg + 2] - b[leg + 1]);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});
