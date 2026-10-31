import { describe, expect, it } from 'vitest';
import { AREA_COUNT, areaFlag, areaOfMap, buyHouse, buyMotor, houseFlag, motorProblem, openAreas, rollWeather } from '../src/core/areas';
import { chainDone, currentStep, journal, matchStory, advanceStory, newCareerState, openChains } from '../src/core/career';
import { champProblem, enter, finishChampionship } from '../src/core/championship';
import { stockBike } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { roadMenu } from '../src/core/guides';
import { RaceDay, drawField, fieldRider, playerEntrant } from '../src/core/raceDay';
import { MotoSim } from '../src/core/race';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const { bikes, story, items, areas, vehicles, tracks, riders, championships } = content;
const area2 = areas.areas.find((a) => a.n === 2)!;
const fresh = () => newCareerState(bikes, story, 'yamamoto', () => 0.5);
/** A career on a running stock bike (the starter 50cc has a dead top end). */
const fit = () => ({ ...fresh(), bike: stockBike(bikes, 'yamamoto', '50cc') });

describe('areas (Spec 18.1, 18.2; Areas 2 to 8 plan, Boss 30 and 31 Oct 2026)', () => {
  it('Area 1 is always open; Area N opens with area.N.open, counted up from 1', () => {
    expect(openAreas({})).toBe(1);
    expect(openAreas({ [areaFlag(2)]: true })).toBe(2);
    expect(openAreas({ [areaFlag(3)]: true })).toBe(1);
    expect(AREA_COUNT).toBe(8);
  });

  it('winning the Area 1 Championship opens Area 2, which starts its intro chain', () => {
    const career = fresh();
    const flags: Record<string, boolean> = { 'badge.area1': true, 'found.venue-farmland': true };
    const main = championships.championships.find((c) => c.id === 'area1.main')!;
    expect(main.opens).toBe(2);
    expect(champProblem(content, main, flags)).toBeNull();
    enter(career, content, main, 7);
    const r = finishChampionship(career, flags, main, [50, 10, 5]);
    expect(r.position).toBe(1);
    expect(flags[areaFlag(2)]).toBe(true);
    // The intro chain starts once the flag is set, and only once.
    career.story.step = story.steps.length;
    expect(currentStep(story, career)).toBeNull();
    expect(openChains(story, career, flags).map((c) => c.id)).toEqual(['area2']);
    expect(openChains(story, career, flags)).toEqual([]);
    expect(currentStep(story, career)?.id).toBe('a2_news');
    expect(journal(story, career, flags)).toMatch(/Manny Festo/);
  });

  it('the Area 2 intro plays like the opening chain and ends by opening the tracks', () => {
    const career = fresh();
    const flags: Record<string, boolean> = { [areaFlag(2)]: true };
    career.story.step = story.steps.length;
    openChains(story, career, flags);
    const chain = story.chains!.find((c) => c.id === 'area2')!;
    for (const step of chain.steps) {
      expect(matchStory(story, career, { talk: step.on.talk! })?.kind).toBe('ready');
      expect(advanceStory(story, career, flags, items)).toBe(true);
    }
    expect(chainDone(story, career, 'area2')).toBe(true);
    expect(flags['area2.intro_done']).toBe(true);
    expect(currentStep(story, career)).toBeNull();
    for (const v of tracks.venues.filter((x) => x.town === area2.map)) expect(v.needs).toBe('area2.intro_done');
    // The road menu shows Mountain Town only once the area is open.
    const places = content.world.places;
    expect(roadMenu(places, tracks.venues, () => 'outdoor', {}).areas.map((p) => p.name)).not.toContain('Mountain Town');
    expect(roadMenu(places, tracks.venues, () => 'outdoor', flags).areas.map((p) => p.name)).toContain('Mountain Town');
  });

  it('the Area 2 pool rides at least at the area level, and its champions keep their edge', () => {
    expect(riders.fieldLevel?.['area2.local']).toBe(24);
    const jeno = fieldRider(content, 'area2.local', 'cpu.r03')!;
    expect(jeno.level).toBe(24);
    expect(fieldRider(content, 'area1.local', 'cpu.r03')!.level).toBe(12);
    expect(fieldRider(content, 'area2.local', 'cpu.r21')!.level).toBeGreaterThan(24);
    const venue = tracks.venues.find((v) => v.id === 'venue-a2-mx')!;
    const field = drawField(content, venue, 7);
    expect(field).toHaveLength(15);
    expect(field.map((r) => r.id)).toContain('cpu.r21');
    expect(field.every((r) => r.level >= 24)).toBe(true);
    // Area 1's field is untouched: nobody from Area 2 turns up there.
    expect(riders.fields['area1.local']).not.toContain('cpu.r21');
    expect(riders.fields['area1.local']).not.toContain('cpu.a2.local');
  });

  it('rain arrives in Area 2 (Spec 10.5): a wet day is slower and riskier, a dry one unchanged', () => {
    expect(rollWeather(undefined, () => 0.5)).toBe('dry');
    expect(rollWeather(area2, () => 0)).toBe('dry');
    expect(rollWeather(area2, () => 0.99)).toBe('heavy_rain');
    const kinds = new Set<string>();
    for (let s = 1; s < 40; s++) kinds.add(new RaceDay(content, tracks.venues.find((v) => v.id === 'venue-a2-mx')!, playerEntrant(content, fresh(), 'T'), s, 0).weather);
    expect(kinds.size).toBeGreaterThan(1);
    expect(new RaceDay(content, tracks.venues.find((v) => v.id === 'venue-farmland')!, playerEntrant(content, fresh(), 'T'), 3, 0).weather).toBe('dry');
    const track = tracks.tracks.find((t) => t.id === 'farmland')!;
    const run = (weather?: { factor: number; risk: number }) => {
      const sim = new MotoSim(content.racing, bikes, track, '50cc', [playerEntrant(content, fit(), 'T')], { laps: 2, motoIndex: 0, seed: 11, weather });
      sim.runToEnd();
      return sim.riders[0].time;
    };
    const dry = run();
    expect(run({ factor: 1, risk: 1 })).toBe(dry);
    expect(run(content.racing.weather!.heavy_rain)).toBeGreaterThan(dry);
  });

  it('the Starter terrace is bought at its door and unlocks the wardrobe; the Old Rusty Van at Nicholls in part exchange', () => {
    const career = fresh();
    const flags: Record<string, boolean> = {};
    expect(areaOfMap(areas, area2.map)).toBe(area2);
    expect(maps.get(area2.map)!.objects.some((o) => o.type === 'door' && o.name === area2.house!.door && o.props.unlock === houseFlag(2))).toBe(true);
    expect(buyHouse(area2, career, flags).ok).toBe(false);
    career.money = 300000;
    const r = buyHouse(area2, career, flags);
    expect(r.ok).toBe(true);
    expect(career.money).toBe(0);
    expect(flags[houseFlag(2)]).toBe(true);
    expect(flags.wardrobe).toBe(true);
    expect(buyHouse(area2, career, flags).ok).toBe(false);
    expect(motorProblem(vehicles, area2, career, null)).toMatch(/Home Town/);
    const van = { design: 'motor-1' };
    expect(motorProblem(vehicles, area2, career, van)).toMatch(/short/);
    career.money = 250000;
    expect(buyMotor(vehicles, area2, career, van).ok).toBe(true);
    expect(van.design).toBe('motor-2');
    expect(career.money).toBe(0);
    expect(motorProblem(vehicles, area2, { ...career, money: 999999 }, van)).toMatch(/already/);
  });

  it('a save with started chains loads, and a bad chain does not', () => {
    const career = fresh();
    career.chains = { area2: { step: 2, used: [] } };
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area2-mountain-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.chains).toEqual(career.chains);
    expect(parseSave(JSON.stringify({ ...save, career: { ...career, chains: { area2: { step: 'two' } } } }))).toBeNull();
  });
});

describe('the stamped Mountain Town (tools/gen-area.mjs)', () => {
  it('has the five travelling shops, the Wheel works, the house, the gym and the drill yard, and road exits both ways', () => {
    const m = maps.get('area2-mountain-town')!;
    const names = m.objects.filter((o) => o.type === 'building').map((o) => o.name);
    for (const n of ['Phoenix MX', 'Moto78', "Lee's T's & Wheels", 'Nicholls Used Motors', 'Wheel works', 'Starter terrace', 'Town gym']) expect(names).toContain(n);
    expect(m.objects.filter((o) => o.type === 'exit').map((o) => o.name).sort()).toEqual(['East road', 'West road']);
    expect(m.objects.some((o) => o.type === 'blocker')).toBe(false);
    expect(m.objects.some((o) => o.type === 'venue' && o.props.venue === 'yard-a2')).toBe(true);
    expect(m.objects.some((o) => o.type === 'venue' && o.props.venue === 'fitness-a2')).toBe(true);
    // Its insides are its own, so the way back out lands in Mountain Town, not Home Town.
    for (const id of ['int-a2-local-garage', 'int-a2-bike-shop', 'int-a2-tyre-shop', 'int-a2-van-office', 'int-a2-rented-room', 'int-a2-tool-shop']) expect(maps.has(id)).toBe(true);
    const routes = content.world.routes.filter((r) => r.map === m.id);
    expect(routes.map((r) => r.exit).sort()).toEqual(['East road', 'West road']);
    // The roads match the world map: Home Town one way, the Race Hub's tracks the other, and its own tracks on both.
    expect(routes.find((r) => r.exit === 'East road')!.to).toContain('area1-home-town');
    expect(routes.find((r) => r.exit === 'West road')!.to).toContain('venue-motocross');
    for (const r of routes) for (const v of ['venue-a2-mx', 'venue-a2-sx', 'venue-a2-enduro']) expect(r.to).toContain(v);
  });
});
