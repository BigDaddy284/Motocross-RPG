import { describe, expect, it } from 'vitest';
import { jobPay, newCareerState, pence } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { doublePartChance, finishBatch, finishPass, openJobAt, passXp, rollGrade, startJob } from '../src/core/jobs';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { childLevel, leadLevel, xpForLevel } from '../src/core/skills';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { bikes, story, world, skills } = content;
const fab = world.jobs.find((j) => j.id === 'job.fabrication')!;
const engine = world.jobs.find((j) => j.id === 'job.engine')!;
const engineSlots = new Set(bikes.slots.filter((s) => s.engine).map((s) => s.id));
const fresh = () => newCareerState(bikes, story, 'yamamoto', () => 0.5);

/** A fixed-sequence random source. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('batch jobs (Spec 15.1, 15.5)', () => {
  it('every pass pays per part and gives the stations\' XP in Mechanical Engineer child skills', () => {
    const career = fresh();
    const money = career.money;
    const r = finishPass(skills, career, fab, jobPay(world, fab), () => 0.99);
    expect(r.parts).toBe(1);
    expect(r.done).toBe(false);
    expect(career.money - money).toBe(jobPay(world, fab));
    expect(career.skills.xp).toMatchObject({ bodywork: 6, welding: 6 });
    expect(openJobAt(career, fab)).toEqual({ job: 'job.fabrication', made: 1 });
    expect(passXp(engine)).toEqual({ engine_components: 6, machining: 6, engine_assembly: 3 });
  });

  it('a Tier 1 shift trains each skill at about 3,000 to 6,000 XP an hour (Spec 2.2)', () => {
    for (const job of world.jobs) {
      // A pass is the stations' time plus a few seconds of walking between them.
      const passSeconds = job.stations.reduce((a, s) => a + s.ms, 0) / 1000 + 3;
      const best = Math.max(...Object.values(passXp(job)));
      const perHour = (3600 / passSeconds) * best;
      expect(perHour, job.id).toBeGreaterThanOrEqual(3000);
      expect(perHour, job.id).toBeLessThanOrEqual(6000);
    }
  });

  it('a batch can be left and picked up again where it was, one job per facility', () => {
    const career = fresh();
    for (let i = 0; i < 10; i++) finishPass(skills, career, fab, 75, () => 0.99);
    expect(openJobAt(career, fab)?.made).toBe(10);
    // Back later: the same job carries on from 10; a different job at the same facility would wait.
    const again = startJob(career, fab);
    expect(again.ok && again.open.made).toBe(10);
    const other = startJob(career, { ...engine, id: 'job.other', facility: fab.id });
    expect(other.ok).toBe(false);
    // The engine shop is its own facility, so a job there runs alongside.
    expect(startJob(career, engine).ok).toBe(true);
  });

  it('finishing the batch counts it, frees the facility and gives one new part of the rider\'s class', () => {
    const career = fresh();
    let last = finishPass(skills, career, engine, 125, () => 0.99);
    while (!last.done) last = finishPass(skills, career, engine, 125, () => 0.99);
    expect(openJobAt(career, engine)?.made).toBe(engine.batch);
    const r = finishBatch(skills, career, engine, engineSlots, () => 0.5);
    expect(r.batches).toBe(1);
    expect(career.counters['job.engine']).toBe(1);
    expect(openJobAt(career, engine)).toBeNull();
    expect(r.kept).toMatchObject({ slot: 'top_end', class: '50cc', condition: 1 });
    expect(career.bag.at(-1)?.part).toEqual(r.kept);
    expect(r.kept!.grade).toBeGreaterThanOrEqual(1);
  });

  it('the kept part\'s grade follows Spec 15.3: mostly Grade 1 to 2 at level 1, Grade 5 to 6 common at level 60, never above 9 without the Grade 10 roll', () => {
    const grades = (mechLevel: number) => {
      const career = fresh();
      // Spread the lead's XP evenly across its seven children.
      const perChild = xpForLevel(mechLevel) * 5 / 7;
      for (const c of skills.leads.find((l) => l.id === 'mech')!.children) career.skills.xp[c.id] = perChild;
      expect(leadLevel(skills, career.skills, skills.leads.find((l) => l.id === 'mech')!)).toBeGreaterThanOrEqual(mechLevel);
      let seed = 12345;
      const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const out = Array.from({ length: 2000 }, () => rollGrade(skills, career, engine, true, rng));
      return out;
    };
    const low = grades(1);
    expect(low.filter((g) => g <= 2).length / low.length).toBeGreaterThan(0.9);
    expect(Math.max(...low)).toBeLessThanOrEqual(9);
    const mid = grades(60);
    const mean = mid.reduce((a, b) => a + b, 0) / mid.length;
    expect(mean).toBeGreaterThan(4);
    expect(mean).toBeLessThan(7);
    expect(Math.max(...mid)).toBeLessThanOrEqual(9);
    // The Grade 10 roll comes first: at level 99 a lucky draw is Legendary.
    const career = fresh();
    for (const c of skills.leads.find((l) => l.id === 'mech')!.children) career.skills.xp[c.id] = xpForLevel(99) * 5 / 7 + 1;
    expect(rollGrade(skills, career, engine, true, seq(0, 0.5, 0.5))).toBe(10);
  });

  it('two parts a pass at 4% once every Mechanical Engineer skill is 80 or more', () => {
    const career = fresh();
    expect(doublePartChance(skills, career)).toBe(0);
    for (const c of skills.leads.find((l) => l.id === 'mech')!.children) career.skills.xp[c.id] = xpForLevel(80);
    expect(childLevel(skills, career.skills, 'welding')).toBe(80);
    expect(doublePartChance(skills, career)).toBe(0.04);
    const r = finishPass(skills, career, fab, 75, () => 0.01);
    expect(r.parts).toBe(2);
    expect(openJobAt(career, fab)?.made).toBe(2);
  });

  it('an open batch is kept in the save', () => {
    const career = fresh();
    finishPass(skills, career, fab, 75, () => 0.99);
    const save = {
      version: SAVE_VERSION, savedAt: 'now', rider: { name: 'R', look: 'player-m-start-a' },
      position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career, van: null, driving: false,
    };
    const back = parseSave(JSON.stringify(save));
    expect(back?.career.jobs).toEqual({ open: { 'job.fabrication': { job: 'job.fabrication', made: 1 } } });
    expect(parseSave(JSON.stringify({ ...save, career: { ...career, jobs: { open: { x: { job: 1 } } } } }))).toBeNull();
    expect(pence(0.75)).toBe(75);
  });
});
