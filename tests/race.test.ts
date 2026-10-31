import { describe, expect, it } from 'vitest';
import { newCareerState, type CareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { MotoSim, gateBonus, mixSeed } from '../src/core/race';
import { PLAYER_ID, RaceDay, applyRide, cpuEntrant, drawField, entryFee, motoPrize, playerEntrant, practiceSim, venueProblem } from '../src/core/raceDay';
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

/** The free gate nearest to the one wanted (the CPU riders who pick first may have it). */
function freeGate(d: RaceDay, want: number): number {
  return d.gatesForPlayer().free.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
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
      a.assignGates(freeGate(a, 3));
      const auto = a.startMoto('push');
      auto.runToEnd();

      const b = day(seed);
      b.assignGates(freeGate(b, 3));
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
    d.assignGates(freeGate(d, 0));
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
        d.assignGates(freeGate(d, 12));
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
    d.assignGates(freeGate(d, 0));
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
    d.assignGates(freeGate(d, 0));
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

  it('keeps every race track shut until the tutorial ends (the local racer points you to Farmland), then opens all three', () => {
    const c = rider();
    expect(venueProblem(content, farmland, c, {})).not.toBeNull();
    expect(venueProblem(content, farmland, c, { 'found.venue-farmland': true })).toBeNull();
    for (const [id, track] of [['venue-riverside', 'arena-supercross'], ['venue-longmoor', 'longmoor-endurance']]) {
      const v = content.tracks.venues.find((x) => x.id === id)!;
      expect(venueProblem(content, v, c, { van_loaded: true })).not.toBeNull();
      expect(venueProblem(content, v, c, { 'found.venue-farmland': true })).toBeNull();
      // Same prices as Farmland, its own track official on its own map, and an official placed on the start straight.
      expect([v.track, v.class, v.field, v.practiceFeePct, v.firstRaceFree]).toEqual([track, farmland.class, farmland.field, farmland.practiceFeePct, farmland.firstRaceFree]);
      expect(content.npcs.find((n) => n.id === v.office)?.map).toBe(v.map);
      expect(content.tracks.tracks.find((t) => t.id === track)!.scenery!.filter((s) => s.type === 'start_official')).toHaveLength(1);
    }
    c.bike.parts.top_end.condition = 0;
    expect(venueProblem(content, farmland, c, { 'found.venue-farmland': true })).toMatch(/broken/);
  });

  it('CPU riders pick gates they like, so the start fills unevenly, and the gate screen matches the start', () => {
    let inOrder = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const d = day(seed);
      const { taken, free } = d.gatesForPlayer();
      d.assignGates(free[free.length - 1]);
      for (const [g, id] of taken) expect(d.field.find((e) => e.id === id)!.gate).toBe(g);
      const gates = d.pickOrder.map((id) => d.field.find((e) => e.id === id)!.gate!);
      expect(new Set(gates).size).toBe(d.field.length);
      if (gates.every((g, i) => i === 0 || g > gates[i - 1] || d.pickOrder[i] === PLAYER_ID)) inOrder++;
    }
    expect(inOrder).toBe(0);
  });

  it('the first three pickers always take the three best gates, and no CPU rider takes a gate more than 2% worse than one left', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = day(seed);
      d.pickOrder = [...d.pickOrder.filter((id) => id !== PLAYER_ID), PLAYER_ID];
      d.pickOrder.splice(3 + (seed % 10), 0, d.pickOrder.pop()!);
      const { taken, free } = d.gatesForPlayer();
      const best = [...Array(d.gateCount).keys()].sort((a, b) => gateBonus(d.track, b) - gateBonus(d.track, a) || a - b).slice(0, 3);
      for (const g of best) expect(taken.has(g)).toBe(true);
      // Gates taken in pick order: each pick is at most 2% worse than the best gate free at the time.
      const left = new Set([...Array(d.gateCount).keys()]);
      for (const id of d.pickOrder.slice(0, d.pickOrder.indexOf(PLAYER_ID))) {
        const g = [...taken].find(([, who]) => who === id)![0];
        const top = Math.max(...[...left].map((x) => gateBonus(d.track, x)));
        expect(gateBonus(d.track, g)).toBeGreaterThanOrEqual(top - 2);
        left.delete(g);
      }
      expect(free.length).toBe(d.gateCount - taken.size);
    }
  });

  it('never shows the gates filled in a neat line from gate 1 to a player picking 6th to 13th, at any venue (Boss, 28 Oct 2026)', () => {
    for (const vid of ['venue-farmland', 'venue-riverside', 'venue-longmoor']) {
      const v = content.tracks.venues.find((x) => x.id === vid)!;
      for (let pos = 6; pos <= 13; pos++) {
        for (let seed = 1; seed <= 60; seed++) {
          const d = new RaceDay(content, v, playerEntrant(content, rider(), 'Test'), seed, 2000);
          const order = d.pickOrder.filter((id) => id !== PLAYER_ID);
          order.splice(pos - 1, 0, PLAYER_ID);
          d.pickOrder = order;
          const { taken } = d.gatesForPlayer();
          expect([...taken.keys()].some((g) => g >= taken.size)).toBe(true);
        }
      }
    }
  });

  it('never fills the start in a neat line, in either moto (Boss, 28 Oct 2026)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const d = day(seed);
      // The player picks last, so every CPU pick shows on the gate screen.
      d.pickOrder = [...d.pickOrder.filter((id) => id !== PLAYER_ID), PLAYER_ID];
      const { taken } = d.gatesForPlayer();
      const inPickOrder = d.pickOrder.slice(0, -1).map((id) => [...taken].find(([, who]) => who === id)![0]);
      expect(inPickOrder.every((g, i) => i === 0 || g > inPickOrder[i - 1])).toBe(false);
    }
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

  it('gives the player exactly the gate they pick, one gate per rider, and refuses any other', () => {
    let picked = 0;
    for (const gate of [1, 5, 8, 9, 11, 16]) {
      // The player picks first on this day, so every gate is free.
      const d = day(31);
      d.pickOrder = [PLAYER_ID, ...d.pickOrder.filter((id) => id !== PLAYER_ID)];
      const { free, taken } = d.gatesForPlayer();
      if (!free.includes(gate - 1)) {
        expect(() => d.assignGates(gate - 1)).toThrow(/already taken/);
        continue;
      }
      d.assignGates(gate - 1);
      expect(d.field.find((e) => e.id === PLAYER_ID)!.gate).toBe(gate - 1);
      expect(new Set(d.field.map((e) => e.gate)).size).toBe(d.field.length);
      expect(Math.max(...d.field.map((e) => e.gate))).toBe(d.field.length - 1);
      for (const [g, id] of taken) expect(d.field.find((e) => e.id === id)!.gate).toBe(g);
      picked++;
    }
    expect(picked).toBe(6);
    // A gate a CPU rider picked first is refused, not swapped.
    const late = day(31);
    late.pickOrder = [...late.pickOrder.filter((id) => id !== PLAYER_ID), PLAYER_ID];
    expect(() => late.assignGates(0)).toThrow(/Gate 1 is already taken/);
    const d = day(31);
    expect(() => d.assignGates(d.field.length)).toThrow(/Gate 17 is not on this start/);
    expect(() => d.assignGates(-1)).toThrow(RangeError);
    expect(() => d.assignGates(2.5)).toThrow(RangeError);
  });

  it('leaving early counts moto 2 as a DNF', () => {
    const d = day(78);
    d.assignGates(freeGate(d, 0));
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

  it("rejects a field regular who doesn't race in the field's area", () => {
    const raw = rawContent();
    (raw.riders as { riders: { id: string; areas: number[] }[] }).riders.find((r) => r.id === 'cpu.local_champion')!.areas = [2];
    const { errors } = checkContent(raw, loadManifest(), maps);
    expect(errors.some((e) => e.file === 'data/riders.json' && /cpu\.local_champion/.test(e.message))).toBe(true);
  });

  it("puts riders in the pools of the areas they race in, and Neal Gizard in Area 8 only (Boss, 28 Oct 2026)", () => {
    const pool = content.riders.fields['area1.local'];
    expect(pool).toEqual(content.riders.riders.filter((r) => r.areas.includes(1)).map((r) => r.id));
    const neal = content.riders.riders.find((r) => r.name === 'Neal Gizard')!;
    expect(neal.areas).toEqual([8]);
    expect(pool).not.toContain(neal.id);
    for (const n of ['Lee Stocky', 'Brandon Stocky']) expect(pool).toContain(content.riders.riders.find((r) => r.name === n)?.id);
  });
});

describe('the race day field: regulars plus a random draw from the pool', () => {
  const venue = (id: string) => content.tracks.venues.find((v) => v.id === id)!;
  const ids = (v: string, seed: number) => drawField(content, venue(v), seed).map((r) => r.id);

  it('races 15 CPU riders, the Local Champion every time and Louis Jonez every time at Farmland', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const v of ['venue-farmland', 'venue-riverside', 'venue-longmoor']) {
        const f = ids(v, seed);
        expect(f, `${v} ${seed}`).toHaveLength(15);
        expect(new Set(f).size).toBe(15);
        expect(f).toContain('cpu.local_champion');
      }
      expect(ids('venue-farmland', seed)).toContain('cpu.local_racer');
      expect(new RaceDay(content, venue('venue-farmland'), playerEntrant(content, rider(), 'Test'), seed, 2000).field).toHaveLength(16);
    }
  });

  it('draws the rest at random each race day, the same draw for the same day, from the whole pool', () => {
    expect(ids('venue-riverside', 5)).toEqual(ids('venue-riverside', 5));
    const fields = new Set([...Array(20).keys()].map((s) => ids('venue-riverside', s + 1).join()));
    expect(fields.size).toBeGreaterThan(15);
    const seen = new Set([...Array(200).keys()].flatMap((s) => ids('venue-riverside', s + 1)));
    expect([...seen].sort()).toEqual([...content.riders.fields['area1.local']].sort());
    // Louis is in the pool away from Farmland, so some days he isn't there.
    expect([...Array(40).keys()].some((s) => !ids('venue-riverside', s + 1).includes('cpu.local_racer'))).toBe(true);
  });

  it('includes every new rider by name, with average stats', () => {
    // Taylor Heart joins in Area 2 as its champion (Areas 2 to 8 plan, Boss 31 Oct 2026), so she is in Area 2's pool, not Area 1's.
    const taylor = content.riders.riders.find((x) => x.name === 'Taylor Heart')!;
    expect(content.riders.fields['area2.local']).toContain(taylor.id);
    expect(content.riders.fields['area1.local']).not.toContain(taylor.id);
    const names = ['Jason Styles', 'Jordan Styles', 'Mickey Alington', 'Louis Jonez', 'Andy McLaren', 'Justin Smyth', 'Dan Smyth'];
    const champ = content.riders.riders.find((r) => r.id === 'cpu.local_champion')!;
    for (const n of names) {
      const r = content.riders.riders.find((x) => x.name === n)!;
      expect(r, n).toBeDefined();
      expect(content.riders.fields['area1.local']).toContain(r.id);
      expect(r.level).toBeLessThan(champ.level);
    }
    // The future Area Champions are taken out of the Area 1 pool and join with their own area, staying on to Area 8.
    const champions: [string, number][] = [['Aidan Gizard', 3], ['Kate Gizard', 4], ['Louie Gizard', 5], ['James Nestor', 6], ['Harvey Gizard', 7], ['Neal Gizard', 8]];
    for (const [n, area] of champions) {
      const r = content.riders.riders.find((x) => x.name === n)!;
      expect(r.areas, n).toEqual(Array.from({ length: 9 - area }, (_, i) => area + i));
      expect(content.riders.fields['area1.local']).not.toContain(r.id);
      expect(content.riders.fields[`area${area}.local`]).toContain(r.id);
    }
  });
});
