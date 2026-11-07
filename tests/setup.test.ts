import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { stockBike } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { MotoSim } from '../src/core/race';
import { RaceDay, playerEntrant, practiceSim } from '../src/core/raceDay';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { bestValue, checkSetup, defaultSetup, effectiveSetup, positionOf, positionValue, positionsFor, sectionGain, setupReport, sliderUnlocked, tuningFactors, tuningPercent, type SetupState } from '../src/core/setup';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const { bikes, story, setup: data, tracks } = content;
const track = tracks.tracks.find((t) => t.id === 'farmland')!;
/** A career on a running stock 50cc, with every part at Grade 3 so every slider is open. */
const fit = (grade = 3) => {
  const c = { ...newCareerState(bikes, story, 'yamamoto', () => 0.5), bike: stockBike(bikes, 'yamamoto', '50cc') };
  for (const p of Object.values(c.bike.parts)) p.grade = grade;
  return c;
};
const perfect = (wet = false): SetupState => ({ preset: null, sliders: Object.fromEntries(data.sliders.map((s) => [s.id, bestValue(data, s.id, track, wet)])) });
const wrong = (): SetupState => ({ preset: null, sliders: Object.fromEntries(data.sliders.map((s) => [s.id, -Math.sign(bestValue(data, s.id, track, false)) || 1])) });

describe('bike setup (Spec 8.0 to 8.2; Boss, 31 Oct 2026: Basic from Area 2, Advanced from Area 5)', () => {
  it('gives a slider 3 positions to Mechanical Engineer 14, then 5, 7, 9, 13 and 21 (Spec 8.1), spread evenly', () => {
    expect([1, 14, 15, 29, 30, 49, 50, 69, 70, 89, 90, 99].map((l) => positionsFor(data, l))).toEqual([3, 3, 5, 5, 7, 7, 9, 9, 13, 13, 21, 21]);
    expect([0, 1, 2].map((i) => positionValue(i, 3))).toEqual([-1, 0, 1]);
    expect(positionValue(1, 5)).toBe(-0.5);
    expect(positionOf(0.5, 5)).toBe(3);
    expect(positionOf(-1, 3)).toBe(0);
    expect(data.advancedLevel).toBe(15);
    expect(data.basicArea).toBe(2);
    expect(data.advancedArea).toBe(5);
  });

  it('locks a slider at the default until a Grade 3 part sits in its group', () => {
    const c = fit(2);
    for (const s of data.sliders) expect(sliderUnlocked(data, s, c.bike)).toBe(false);
    const own: SetupState = { preset: null, sliders: { suspension: 1, engine: 1 } };
    expect(effectiveSetup(data, own, c.bike)).toEqual(Object.fromEntries(data.sliders.map((s) => [s.id, 0])));
    c.bike.parts.forks.grade = 3;
    expect(effectiveSetup(data, own, c.bike).suspension).toBe(1);
    expect(effectiveSetup(data, own, c.bike).engine).toBe(0);
    expect(tuningFactors(data, own, fit(1).bike, track, false).every((f) => f === 1)).toBe(true);
  });

  it('scores a slider by distance from the section kind’s hidden ideal: +1% spot on, down to -4% (Spec 8.2)', () => {
    expect(tuningPercent(data, 0.5, 0.5)).toBeCloseTo(1, 6);
    expect(tuningPercent(data, 0, 0.5)).toBeCloseTo(0, 6);
    expect(tuningPercent(data, -1, 1)).toBe(-4);
    // Against the default: a setup at the ideal gains, one away from it loses, the default itself is nothing.
    const at = Object.fromEntries(data.sliders.map((s) => [s.id, data.ideals.tight[s.id]]));
    expect(sectionGain(data, at, 'berm', false)).toBeGreaterThan(0);
    expect(sectionGain(data, Object.fromEntries(data.sliders.map((s) => [s.id, 0])), 'berm', false)).toBe(0);
    expect(sectionGain(data, Object.fromEntries(data.sliders.map((s) => [s.id, -data.ideals.tight[s.id] || 1])), 'berm', false)).toBeLessThan(0);
    // A section type the data doesn't know is untouched.
    expect(sectionGain(data, at, 'no_such_section', false)).toBe(0);
    // In the rain the ideal is half the mud setup's.
    expect(sectionGain(data, Object.fromEntries(data.sliders.map((s) => [s.id, (data.ideals.tight[s.id] + data.ideals.mud[s.id]) / 2])), 'berm', true)).toBeGreaterThan(sectionGain(data, at, 'berm', true));
  });

  it('a preset gets most of the way there, and a well-chosen advanced setup beats it on the track (Spec 8.0, 4A)', () => {
    const c = fit();
    const best = setupReport(data, perfect(), c.bike, track, false).lapGain;
    const none = setupReport(data, defaultSetup(), c.bike, track, false).lapGain;
    const hard = setupReport(data, { preset: 'hardpack', sliders: {} }, c.bike, track, false).lapGain;
    const mud = setupReport(data, { preset: 'mud', sliders: {} }, c.bike, track, false).lapGain;
    expect(none).toBe(0);
    expect(best).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(0);
    // The mud setup on a dry hard-pack track is the wrong one.
    expect(mud).toBeLessThan(hard);
    expect(setupReport(data, wrong(), c.bike, track, false).lapGain).toBeLessThan(0);
    const report = setupReport(data, wrong(), c.bike, track, false);
    expect(report.colours).toHaveLength(track.sections.length);
    expect(report.colours).toContain('red');
    // A preset only moves the sliders that are open.
    const locked = fit(2);
    expect(effectiveSetup(data, { preset: 'hardpack', sliders: {} }, locked.bike)).toEqual(Object.fromEntries(data.sliders.map((s) => [s.id, 0])));
  });

  it('reaches the race: the player’s setup sets their tuning for the day’s track, nobody else’s, and changes their times', () => {
    const c = fit();
    c.setup = perfect();
    const venue = tracks.venues.find((v) => v.id === 'venue-farmland')!;
    const day = new RaceDay(content, venue, playerEntrant(content, c, 'T'), 5, 0);
    expect(day.weather).toBe('dry');
    const me = day.field.find((e) => e.player)!;
    expect(me.tuning).toHaveLength(track.sections.length);
    expect(me.tuning!.some((f) => f < 1)).toBe(true);
    expect(day.field.filter((e) => !e.player).every((e) => e.tuning === undefined)).toBe(true);
    expect(new RaceDay(content, venue, playerEntrant(content, fit(), 'T'), 5, 0).field.find((e) => e.player)!.tuning).toBeUndefined();
    // Practice laps use it too.
    const p = practiceSim(content, venue, playerEntrant(content, c, 'T'), 3, true);
    expect(p.riders[0].e.tuning).toEqual(me.tuning);
    // On track, alone and deterministic: the best setup is quickest, the wrong one slowest, a preset in between the best and nothing.
    const laps = (setup?: SetupState, tuning?: number[]) => {
      const rider = fit();
      if (setup) rider.setup = setup;
      const e = playerEntrant(content, rider, 'T');
      const s = new MotoSim(content.racing, bikes, track, '50cc', [{ ...e, tuning: tuning ?? (e.setup ? tuningFactors(data, e.setup, e.bike, track, false) : undefined) }], { laps: 2, motoIndex: 0, seed: 9 });
      s.runToEnd();
      return s.riders[0].time;
    };
    const base = laps();
    expect(laps()).toBe(base);
    expect(laps(perfect())).toBeLessThan(base);
    expect(laps({ preset: 'hardpack', sliders: {} })).toBeLessThan(base);
    expect(laps({ preset: 'mud', sliders: {} })).toBeGreaterThan(laps({ preset: 'hardpack', sliders: {} }));
    expect(laps(wrong())).toBeGreaterThan(base);
    // The sim takes the factors straight: a flat 2% everywhere is 2% off every section.
    expect(laps(undefined, track.sections.map(() => 0.98))).toBeLessThan(base);
  });

  it('saves with the career, and a bad setup is refused; the content check catches a wrong slot or section', () => {
    const career = fit();
    career.setup = { preset: 'sand', sliders: { suspension: -0.5 } };
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.setup).toEqual(career.setup);
    expect(parseSave(JSON.stringify({ ...save, career: { ...career, setup: { preset: null, sliders: { suspension: 7 } } } }))).toBeNull();
    const slots = bikes.slots.map((s) => s.id);
    const sections = Object.keys(content.racing.sections);
    expect(checkSetup('setup', data, { slots, sections })).toEqual([]);
    const bad = JSON.parse(JSON.stringify(data));
    bad.sliders[0].slots.push('wings');
    bad.sectionKinds.straight = 'ice';
    expect(checkSetup('setup', bad, { slots, sections }).map((e) => e.field)).toEqual(['sliders[0].slots[2]', 'sectionKinds.straight']);
  });
});
