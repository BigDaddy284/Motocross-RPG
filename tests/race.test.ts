import { describe, expect, it } from 'vitest';
import { newCareerState, type CareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { MotoSim, mixSeed } from '../src/core/race';
import { PLAYER_ID, RaceDay, applyRide, cpuEntrant, entryFee, motoPrize, playerEntrant, practiceSim, venueProblem } from '../src/core/raceDay';
import { addXp, childLevel, leadLevel, levelForXp, newSkillState, xpForLevel } from '../src/core/skills';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const farmland = content.tracks.venues.find((v) => v.id === 'venue-farmland')!;
const backyard = content.tracks.venues.find((v) => v.id === 'backyard')!;

function rider(): CareerState {
  const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
  c.bike.parts.top_end = { grade: 1, condition: 0.75 };
  return c;
}

function day(seed: number): RaceDay {
  return new RaceDay(content, farmland, playerEntrant(content, rider(), 'Test'), seed, 2000);
}

describe('skills and XP (Spec 2.1)', () => {
  it('uses the OSRS table for child skills', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(99)).toBe(13034431);
    expect(levelForXp(1153)).toBe(9);
    expect(levelForXp(1154)).toBe(10);
  });

  it('works out lead levels from the children at five times the table', () => {
    const s = newSkillState();
    const rider = content.skills.leads.find((l) => l.id === 'rider')!;
    addXp(content.skills, s, { starts: 5770 });
    expect(childLevel(content.skills, s, 'starts')).toBe(levelForXp(5770));
    expect(leadLevel(content.skills, s, rider)).toBe(10);
  });

  it('gives 5% cross-skill bonus to the linked lead only, into its bonus pool (GDD 6.2)', () => {
    const s = newSkillState();
    const ups = addXp(content.skills, s, { cornering: 1000 });
    expect(s.bonus.mech).toBeCloseTo(50);
    expect(s.bonus.rider).toBeUndefined();
    expect(Object.keys(s.xp)).toEqual(['cornering']);
    expect(ups.some((u) => u.skill === 'cornering')).toBe(true);
  });
});

describe('race simulation (Spec 10)', () => {
  it('gives the same result live with a held message as auto-complete (section 22)', () => {
    for (const seed of [1, 42, 9001]) {
      const a = day(seed);
      a.assignGates(3);
      const auto = a.startMoto('push');
      auto.runToEnd();

      const b = day(seed);
      b.assignGates(3);
      const live = b.startMoto('push');
      // Live: lap by lap with the pit board kept each lap, as the race screen does.
      while (!live.finished) {
        live.nextLap();
        expect(live.changeMessage('push')).toBe(true);
      }
      expect(live.results()).toEqual(auto.results());
      expect(live.xp).toEqual(auto.xp);
      expect(live.playerBike).toEqual(auto.playerBike);
    }
  });

  it('changing message uses ink, and the pen runs dry after 3 changes (Spec 11.3)', () => {
    const d = day(7);
    d.assignGates(0);
    const sim = d.startMoto('steady');
    expect(sim.changeMessage('steady')).toBe(true);
    expect(sim.ink).toBe(3);
    expect(sim.changeMessage('push')).toBe(true);
    expect(sim.changeMessage('save_bike')).toBe(true);
    expect(sim.changeMessage('push')).toBe(true);
    expect(sim.ink).toBe(0);
    expect(sim.changeMessage('steady')).toBe(false);
    expect(sim.playerMessage).toBe('push');
  });

  it('a pit board read at the player\'s line changes nothing for riders already on the next lap', () => {
    for (const seed of [3, 18, 404]) {
      for (const change of ['push', 'save_bike', 'retire'] as const) {
        const d = day(seed);
        d.assignGates(12);
        const sim = d.startMoto('steady');
        sim.nextLap();
        sim.nextLap();
        const before = sim.nextLap(); // lap 3, run when the leader crossed the line
        const myStart = before.times[PLAYER_ID][0];
        const redo = sim.redoLap(() => (change === 'retire' ? sim.retirePlayer('test') : sim.changeMessage(change)));
        expect(redo.lap).toBe(3);
        expect(sim.lap).toBe(3);
        if (change !== 'retire') expect(sim.ink).toBe(2);
        // Everything already shown when the player reached the line (any stretch begun before
        // then) is the same as before.
        for (const [id, times] of Object.entries(before.times)) {
          if (id === PLAYER_ID) continue;
          for (let i = 1; i < times.length; i++) if (times[i - 1] < myStart) expect(redo.times[id][i], `${seed} ${change} ${id}`).toBe(times[i]);
        }
        if (change === 'retire') expect(redo.times[PLAYER_ID]).toBeUndefined();
        // And running the lap again with no change gives the same lap.
        const again = sim.redoLap(() => undefined);
        expect(again).toEqual(redo);
        while (!sim.finished) sim.nextLap();
        expect(sim.results()).toHaveLength(16);
      }
    }
  });

  it('runs a full 50cc moto: 5 laps, 16 riders, everyone placed', () => {
    const d = day(123);
    d.assignGates(0);
    const sim = d.startMoto('steady');
    sim.runToEnd();
    const res = sim.results();
    expect(res).toHaveLength(16);
    expect(res.map((r) => r.position)).toEqual([...Array(16).keys()].map((i) => i + 1));
    const finished = res.filter((r) => !r.retired);
    expect(finished.every((r) => r.laps === 5)).toBe(true);
    for (let i = 1; i < finished.length; i++) expect(finished[i].time).toBeGreaterThanOrEqual(finished[i - 1].time);
  });

  it('a better rider on the same bike is faster on average', () => {
    let gap = 0;
    for (let s = 0; s < 20; s++) {
      const novice = playerEntrant(content, rider(), 'A');
      const pro = { ...cpuEntrant(content, content.riders.riders[0], '50cc'), bike: novice.bike, gate: 1 };
      const sim = new MotoSim(content.racing, content.bikes, content.tracks.tracks.find((t) => t.id === 'farmland')!, '50cc', [novice, pro], { laps: 5, motoIndex: 0, seed: mixSeed(99, s) });
      sim.runToEnd();
      const [a, b] = sim.riders;
      gap += a.time - b.time;
    }
    expect(gap / 20).toBeGreaterThan(10);
  });

  it('wears the bike by distance and gives practice XP at a tenth of the race rate (Spec 7.3, 2.3)', () => {
    const career = rider();
    const p = practiceSim(content, farmland, playerEntrant(content, career, 'P'), 5);
    for (let i = 0; i < 5; i++) p.nextLap();
    const d = day(5);
    d.assignGates(0);
    const r = d.startMoto('steady');
    r.runToEnd();
    const total = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
    // Practice skips the start and passing, so compare against the race's ride XP only roughly.
    expect(total(p.xp) / total(r.xp)).toBeGreaterThan(0.07);
    expect(total(p.xp) / total(r.xp)).toBeLessThan(0.13);
    const before = career.bike.parts.top_end.condition;
    expect(p.playerBike!.parts.top_end.condition).toBeLessThan(before);
    // 5 laps of about 1 km at 50cc (youth ×0.8) take about 4% off a 100 km top end.
    expect(before - p.playerBike!.parts.top_end.condition).toBeGreaterThan(0.03);
    expect(before - p.playerBike!.parts.top_end.condition).toBeLessThan(0.06);
    expect(career.bike.parts.top_end.condition).toBe(before); // the career's bike only changes when the ride is applied
  });

  it('a backyard session has no start and no rivals', () => {
    const p = practiceSim(content, backyard, playerEntrant(content, rider(), 'P'), 1);
    const lap = p.nextLap();
    expect(Object.keys(lap.times)).toEqual([PLAYER_ID]);
    expect(p.finished).toBe(false);
  });
});

describe('race day (Spec 12, 14)', () => {
  it('pays 3 × entry to the winner and shares down to 10th', () => {
    expect(motoPrize(content.racing, 2000, 1)).toBe(6000);
    expect(motoPrize(content.racing, 2000, 6)).toBe(1440);
    expect(motoPrize(content.racing, 2000, 11)).toBe(0);
  });

  it('makes the first race free (GDD 4.3), then charges £20', () => {
    expect(entryFee(content, farmland, {})).toBe(0);
    expect(entryFee(content, farmland, { first_race_done: true })).toBe(2000);
  });

  it('keeps Farmland shut until the local racer points you there, and the other two locked', () => {
    const c = rider();
    expect(venueProblem(content, farmland, c, {})).not.toBeNull();
    expect(venueProblem(content, farmland, c, { 'found.venue-farmland': true })).toBeNull();
    for (const id of ['venue-quarry', 'venue-woodland']) expect(venueProblem(content, content.tracks.venues.find((v) => v.id === id)!, c, { 'found.venue-farmland': true })).not.toBeNull();
    c.bike.parts.top_end.condition = 0;
    expect(venueProblem(content, farmland, c, { 'found.venue-farmland': true })).toMatch(/broken/);
  });

  it('runs two motos, sets moto 2 gate picks by moto 1 order, and totals the day', () => {
    const d = day(77);
    for (let m = 0; m < 2; m++) {
      d.assignGates(d.gatesForPlayer().free[0]);
      const sim = d.startMoto('steady');
      sim.runToEnd();
      const rec = d.finishMoto(sim);
      if (m === 0) expect(d.pickOrder).toEqual(rec.results.map((r) => r.id));
    }
    expect(d.done).toBe(true);
    const res = d.dayResult();
    expect(res.overall).toHaveLength(16);
    expect(res.overall[0].position).toBe(1);
  });

  it('leaving early counts moto 2 as a DNF', () => {
    const d = day(78);
    d.assignGates(0);
    const sim = d.startMoto('steady');
    sim.runToEnd();
    d.finishMoto(sim);
    d.leaveEarly();
    const me = d.dayResult().overall.find((r) => r.player)!;
    expect(me.positions[1]).toBeNull();
    expect(d.dayResult().podiumBonus).toBe(0);
  });

  it('puts money, XP and the worn bike back on the career', () => {
    const c = rider();
    const bike = structuredClone(c.bike);
    bike.parts.wheels_tyres.condition = 0.1;
    const out = applyRide(content, c, bike, 1500, { starts: 100 });
    expect(c.money).toBe(15000 + 1500);
    expect(c.bike.parts.wheels_tyres.condition).toBe(0.1);
    expect(c.skills.xp.starts).toBe(100);
    expect(out.levelUps.map((u) => u.skill)).toContain('starts');
  });
});

describe('race content checks', () => {
  it('rejects a track with an unknown section, naming the file and field', () => {
    const raw = rawContent();
    (raw.tracks as { tracks: { sections: { type: string }[] }[] }).tracks[1].sections[2].type = 'loop_the_loop';
    const { errors } = checkContent(raw, loadManifest(), maps);
    expect(errors).toContainEqual(expect.objectContaining({ file: 'data/tracks.json', field: 'tracks[1].sections[2].type' }));
  });

  it('rejects a rider in a field who does not exist', () => {
    const raw = rawContent();
    (raw.riders as { fields: Record<string, string[]> }).fields['area1.local'].push('cpu.nobody');
    const { errors } = checkContent(raw, loadManifest(), maps);
    expect(errors.some((e) => e.file === 'data/riders.json' && /cpu\.nobody/.test(e.message))).toBe(true);
  });
});
