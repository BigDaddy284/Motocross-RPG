import { describe, expect, it } from 'vitest';
import { advanceStory, applyEffects, currentStep, matchStory, newCareerState, openChains } from '../src/core/career';
import { stockBike } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { MotoSim } from '../src/core/race';
import { RaceDay, playerEntrant, practiceSim } from '../src/core/raceDay';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { checkModifiers, machineFee, machineProblem, modifierEffect, modifierFactors, modifierTotals, rollMods, rollValue, runMachine } from '../src/core/modifiers';
import { SPARE, fitSpare, repairPart } from '../src/core/shops';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const { bikes, story, items, modifiers: data, tracks, shops } = content;
const track = tracks.tracks.find((t) => t.id === 'farmland')!;
const fixed = { [data.machine.fixedFlag]: true };
const fresh = () => ({ ...newCareerState(bikes, story, 'yamamoto', () => 0.5), bike: stockBike(bikes, 'yamamoto', '50cc'), money: 100000 });
const spare = (career: ReturnType<typeof fresh>, slot = 'forks', grade = 2, condition = 1, mods?: { type: string; value: number }[]) => {
  career.bag.push({ id: SPARE, part: { slot, class: '50cc', grade, condition, ...(mods ? { mods } : {}) } });
  return career.bag.length - 1;
};

describe('part modifiers (Spec 6.1 to 6.3)', () => {
  it('add up by type across the fitted parts, with diminishing returns: ±1 is 0.7%, ±5 2.8%, ±10 4.3%, capped at 6%', () => {
    expect(modifierEffect(data, 1)).toBeCloseTo(0.7, 1);
    expect(modifierEffect(data, 5)).toBeCloseTo(2.8, 1);
    expect(modifierEffect(data, 10)).toBeCloseTo(4.3, 1);
    expect(modifierEffect(data, -3)).toBeCloseTo(-1.9, 1);
    expect(modifierEffect(data, 1000)).toBeCloseTo(6, 3);
    expect(modifierEffect(data, 0)).toBe(0);
    const parts = { forks: { grade: 2, condition: 1, mods: [{ type: 'corners', value: 3 }] }, brakes: { grade: 2, condition: 1, mods: [{ type: 'corners', value: -1 }, { type: 'wet', value: 2 }] }, frame: { grade: 1, condition: 1 } };
    expect(modifierTotals(parts)).toEqual({ corners: 2, wet: 2 });
  });

  it('speed up their own section types, and a condition every section when the weather or surface matches', () => {
    const bike = fresh().bike;
    bike.parts.forks.mods = [{ type: 'corners', value: 4 }];
    const f = modifierFactors(data, bike.parts, track, 'dry');
    expect(f).toHaveLength(track.sections.length);
    track.sections.forEach((sec, i) => expect(f[i], sec.type).toBeCloseTo(data.sections.corners.includes(sec.type) ? 1 - modifierEffect(data, 4) / 100 : 1, 9));
    bike.parts.forks.mods = [{ type: 'wet', value: -2 }];
    expect(modifierFactors(data, bike.parts, track, 'dry').every((x) => x === 1)).toBe(true);
    expect(modifierFactors(data, bike.parts, track, 'heavy_rain').every((x) => x > 1)).toBe(true);
    bike.parts.forks.mods = [{ type: 'hardpack', value: 2 }];
    expect(track.surface).toBe('hard_pack');
    expect(modifierFactors(data, bike.parts, track, 'dry').every((x) => x < 1)).toBe(true);
    expect(modifierFactors(data, fresh().bike.parts, track, 'dry').every((x) => x === 1)).toBe(true);
  });

  it('reach the race through the player’s tuning, on top of the bike setup, and change lap times', () => {
    const career = fresh();
    career.bike.parts.top_end.mods = [{ type: 'straights', value: 5 }];
    const venue = tracks.venues.find((v) => v.id === 'venue-farmland')!;
    const day = new RaceDay(content, venue, playerEntrant(content, career, 'T'), 5, 0);
    const me = day.field.find((e) => e.player)!;
    expect(me.tuning!.some((x) => x < 1)).toBe(true);
    expect(day.field.filter((e) => !e.player).every((e) => e.tuning === undefined)).toBe(true);
    expect(practiceSim(content, venue, playerEntrant(content, career, 'T'), 3, true).riders[0].e.tuning).toEqual(me.tuning);
    const laps = (c: ReturnType<typeof fresh>) => {
      const e = playerEntrant(content, c, 'T');
      const s = new MotoSim(content.racing, bikes, track, '50cc', [{ ...e, tuning: modifierFactors(data, c.bike.parts, track, 'dry') }], { laps: 2, motoIndex: 0, seed: 9 });
      s.runToEnd();
      return s.riders[0].time;
    };
    const base = laps(fresh());
    expect(laps(career)).toBeLessThan(base);
    const bad = fresh();
    bad.bike.parts.top_end.mods = [{ type: 'straights', value: -5 }];
    expect(laps(bad)).toBeGreaterThan(base);
  });

  it('stay on a part through a swap, a repair and a save', () => {
    const career = fresh();
    const mods = [{ type: 'jumps', value: 2 }];
    const garage = shops.shops.find((s) => s.fitAction)!;
    const i = spare(career, 'forks', 2, 1, mods);
    expect(fitSpare(shops, bikes, garage, career, i).ok).toBe(true);
    expect(career.bike.parts.forks.mods).toEqual(mods);
    // The one that came off has none; fit a plain one back and the modded forks return to the bag with their modifiers.
    const plain = career.bag.findIndex((b) => b.part?.slot === 'forks');
    expect(career.bag[plain].part!.mods).toBeUndefined();
    expect(fitSpare(shops, bikes, garage, career, plain).ok).toBe(true);
    expect(career.bag.find((b) => b.part?.slot === 'forks')!.part!.mods).toEqual(mods);
    career.bike.parts.forks = { grade: 3, condition: 0.2, mods };
    expect(repairPart(shops, bikes, career, 'forks').ok).toBe(true);
    expect(career.bike.parts.forks).toEqual({ grade: 2, condition: 1, mods });
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.bike.parts.forks.mods).toEqual(mods);
    expect(parseSave(JSON.stringify({ ...save, career: { ...career, bike: { ...career.bike, parts: { ...career.bike.parts, forks: { grade: 2, condition: 1, mods: [{ type: 'jumps', value: 9 }] } } } } }))).toBeNull();
  });
});

describe('the Modifying Machine (Spec 6.4; Boss, 30 Oct 2026: one machine, fixed by Mad Maggie’s quest)', () => {
  it('is broken until the quest flag, takes a clean part at 80% or better once, and charges £20 at Grade 1 doubling a grade', () => {
    const career = fresh();
    const i = spare(career, 'forks', 2);
    expect(machineProblem(data, bikes, career, i, {})).toMatch(/broken/);
    expect(machineProblem(data, bikes, career, i, fixed)).toBeNull();
    expect(machineFee(data, 1)).toBe(2000);
    expect(machineFee(data, 2)).toBe(4000);
    expect(machineFee(data, 5)).toBe(32000);
    expect(machineProblem(data, bikes, career, spare(career, 'forks', 2, 0.5), fixed)).toMatch(/80%/);
    expect(machineProblem(data, bikes, career, spare(career, 'forks', 2, 1, [{ type: 'jumps', value: 1 }]), fixed)).toMatch(/already/);
    career.bag.push({ id: SPARE, part: { slot: 'shock', class: '50cc', grade: 2, condition: 1, owner: { errand: 'x', name: 'Kyle' } } });
    expect(machineProblem(data, bikes, career, career.bag.length - 1, fixed)).toMatch(/don't own/);
    expect(machineProblem(data, bikes, { ...career, money: 100 }, i, fixed)).toMatch(/afford/);
  });

  it('rolls three different types from the slot’s pool, each as likely bad as good, values 1 to 5 at 45/30/15/8/2', () => {
    const seq = (vals: number[]) => { let k = 0; return () => vals[k++ % vals.length]; };
    expect([0, 0.449, 0.45, 0.749, 0.75, 0.899, 0.9, 0.979, 0.98, 0.999].map((r) => rollValue(data, () => r))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const mods = rollMods(data, 'forks', seq([0, 0, 0.2, 0.5, 0.5, 0.9, 0, 0.98, 0.1]));
    expect(mods).toHaveLength(3);
    expect(new Set(mods.map((m) => m.type)).size).toBe(3);
    for (const m of mods) expect(data.pools.forks).toContain(m.type);
    expect(mods.map((m) => m.value)).toEqual([1, -2, 5]);
    // Over many goes, about half the values are negative and every type in the pool turns up.
    let rng = 12345;
    const next = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
    const all = Array.from({ length: 400 }, () => rollMods(data, 'wheels_tyres', next)).flat();
    const neg = all.filter((m) => m.value < 0).length / all.length;
    expect(neg).toBeGreaterThan(0.4);
    expect(neg).toBeLessThan(0.6);
    expect(new Set(all.map((m) => m.type)).size).toBe(5);
    expect(all.every((m) => m.value !== 0 && Math.abs(m.value) <= 5)).toBe(true);
  });

  it('eats one part in ten, pays either way, and otherwise sends the part back with its modifiers', () => {
    const career = fresh();
    const i = spare(career, 'brakes', 3);
    const lost = runMachine(data, bikes, career, i, fixed, () => 0.05);
    expect(lost.ok && lost.destroyed).toBe(true);
    expect(career.bag.some((b) => b.part?.slot === 'brakes')).toBe(false);
    expect(career.money).toBe(100000 - machineFee(data, 3));
    const j = spare(career, 'brakes', 3);
    const r = runMachine(data, bikes, career, j, fixed, () => 0.5);
    expect(r.ok && !r.destroyed && r.mods.length === 3).toBe(true);
    expect(career.bag[j].part!.mods).toHaveLength(3);
    expect(career.money).toBe(100000 - 2 * machineFee(data, 3));
    expect(runMachine(data, bikes, career, j, fixed, () => 0.5).ok).toBe(false);
  });

  it('the quest: Manny’s news when Area 5 opens, the coil, the valve and the test parts, then the fix at Mechanical Engineer 30', () => {
    const career = fresh();
    const flags: Record<string, boolean> = { 'area.5.open': true };
    career.story.step = story.steps.length;
    // Area 5's own intro plays first, then Maggie's chain.
    expect(openChains(story, career, flags).map((c) => c.id).sort()).toEqual(['area5', 'maggie']);
    const a5 = story.chains!.find((c) => c.id === 'area5')!;
    for (let i = 0; i < a5.steps.length; i++) expect(advanceStory(story, career, flags, items)).toBe(true);
    const chain = story.chains!.find((c) => c.id === 'maggie')!;
    expect(currentStep(story, career)?.id).toBe('mg_news');
    for (const step of chain.steps.slice(0, 5)) {
      expect(matchStory(story, career, { talk: step.on.talk! })?.kind).toBe('ready');
      expect(advanceStory(story, career, flags, items)).toBe(true);
    }
    expect(career.bag.map((b) => b.id)).toEqual(expect.arrayContaining(['task.machine_coil', 'task.machine_valve', 'task.test_parts']));
    const use = { use: 'story.modifier_machine', map: 'int-iz-modifier-unit', object: 'm' };
    expect(matchStory(story, career, use, { mech: 29 })?.kind).toBe('notReady');
    expect(matchStory(story, career, use, { mech: 30 })?.kind).toBe('ready');
    expect(advanceStory(story, career, flags, items, 'm')).toBe(true);
    expect(flags[data.machine.fixedFlag]).toBe(true);
    expect(career.bag.filter((b) => b.id.startsWith('task.'))).toHaveLength(0);
    // Maggie's first test leaves the player a part at +1, -1, -1 (the plan's step 4).
    const test = career.bag.find((b) => b.part?.mods)!.part!;
    expect(test.mods!.map((m) => m.value)).toEqual([1, -1, -1]);
    expect(test.class).toBe('50cc');
    expect(machineProblem(data, bikes, career, career.bag.indexOf(career.bag.find((b) => b.part?.mods)!), flags)).toMatch(/already/);
    expect(currentStep(story, career)).toBeNull();
    // giveParts stands on its own too.
    const c2 = fresh();
    applyEffects(c2, {}, items, { giveParts: [{ slot: 'forks', grade: 2, condition: 0.9 }] });
    expect(c2.bag.at(-1)!.part).toEqual({ slot: 'forks', class: '50cc', grade: 2, condition: 0.9 });
  });

  it('content check: a type with nothing to act on, an unknown section, slot or weather, and a pool too small', () => {
    const slots = bikes.slots.map((s) => s.id);
    const sections = Object.keys(content.racing.sections);
    const weather = Object.keys(content.racing.weather!);
    expect(checkModifiers('m', data, { slots, sections, weather, maps })).toEqual([]);
    const bad = JSON.parse(JSON.stringify(data));
    bad.types.ice = { name: 'Ice' };
    bad.sections.corners.push('loop');
    bad.conditions.wet.weather.push('snow');
    bad.pools.wings = ['corners', 'corners', 'corners'];
    expect(checkModifiers('m', bad, { slots, sections, weather, maps }).map((e) => e.field)).toEqual(['sections.corners[8]', 'conditions.wet.weather[2]', 'types.ice', 'pools.wings', 'pools.wings']);
  });
});
