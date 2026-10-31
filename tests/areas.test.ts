import { describe, expect, it } from 'vitest';
import { AREA_COUNT, areaFlag, areaOfMap, buyHouse, buyMotor, houseFlag, motorProblem, openAreas, rollWeather } from '../src/core/areas';
import { chainDone, currentStep, journal, matchStory, advanceStory, newCareerState, openChains } from '../src/core/career';
import { champProblem, enter, finishChampionship } from '../src/core/championship';
import { stockBike } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { roadMenu, venueHere } from '../src/core/guides';
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

describe('Mountain Town (drawn, Boss, 31 Oct 2026)', () => {
  it('has the five travelling shops, the Wheel works, the house, the gym and the drill yard, and three roads out', () => {
    const m = maps.get('area2-mountain-town')!;
    const names = m.objects.filter((o) => o.type === 'building').map((o) => o.name);
    for (const n of ['Phoenix MX', 'Moto78', "Lee's T's & Wheels", 'Nicholls Used Motors', 'Wheel works', 'Starter terrace', 'Town gym']) expect(names).toContain(n);
    expect(m.objects.filter((o) => o.type === 'exit').map((o) => o.name).sort()).toEqual(['South road', 'South-west road', 'West road']);
    expect(m.objects.some((o) => o.type === 'blocker')).toBe(false);
    expect(m.objects.some((o) => o.type === 'venue' && o.props.venue === 'yard-a2')).toBe(true);
    expect(m.objects.some((o) => o.type === 'venue' && o.props.venue === 'fitness-a2')).toBe(true);
    // Its insides are its own, so the way back out lands in Mountain Town, not Home Town.
    for (const id of ['int-a2-local-garage', 'int-a2-bike-shop', 'int-a2-tyre-shop', 'int-a2-van-office', 'int-a2-rented-room', 'int-a2-tool-shop']) expect(maps.has(id)).toBe(true);
    const routes = content.world.routes.filter((r) => r.map === m.id);
    expect(routes.map((r) => r.exit).sort()).toEqual(['South road', 'South-west road', 'West road']);
    // The roads match the world map: Home Town to the south, the Race Hub to the south-west. Its tracks race at the
    // hub's venues, one per track type (Boss, 30 Oct 2026), reached from every road; no venue maps of its own.
    expect(routes.find((r) => r.exit === 'South road')!.to).toContain('area1-home-town');
    for (const r of routes) for (const v of ['venue-motocross', 'venue-supercross', 'venue-enduro']) expect(r.to).toContain(v);
    expect(content.world.places.some((p) => /^venue-a2-/.test(p.map))).toBe(false);
    expect([...maps.keys()].filter((id) => /^venue-a\d+-/.test(id))).toEqual([]);
  });

  it('races at the venue maps: one venue per track type (Boss, 30 Oct 2026), picked on the road and at the office', () => {
    const byType = { mx: 'venue-motocross', sx: 'venue-supercross', enduro: 'venue-enduro' };
    for (const [key, map] of Object.entries(byType)) {
      const v = tracks.venues.find((x) => x.id === `venue-a2-${key}`)!;
      expect(v.map, v.id).toBe(map);
      expect(v.office).toBe(tracks.venues.find((x) => x.map === map && x.id.startsWith('venue-') && !x.town)!.office);
    }
    // The road lists each open track under its type by the venue's name, all on the hub's maps.
    const open = { 'found.venue-farmland': true, 'area.2.open': true, 'area2.intro_done': true };
    const menu = roadMenu(content.world.places, tracks.venues, (id) => tracks.tracks.find((t) => t.id === id)?.kind, open);
    const names = (i: number) => menu.tracks[i].places.map((p) => [p.name, p.map, p.venue]);
    expect(names(0)).toEqual([['Farmland MX', 'venue-motocross', 'venue-farmland'], ['Clayhill MX', 'venue-motocross', 'venue-a2-mx']]);
    expect(names(1)).toEqual([['Riverside Arena', 'venue-supercross', 'venue-riverside'], ['Valley Arena', 'venue-supercross', 'venue-a2-sx']]);
    expect(names(2)).toEqual([['Longmoor Enduro', 'venue-enduro', 'venue-longmoor'], ['Bog End Enduro', 'venue-enduro', 'venue-a2-enduro']]);
    expect(menu.areas.map((p) => p.name)).toEqual(['Home Town', 'Mountain Town']);
    // At the venue map, the gate and office are for the track picked on the road; the map's first open one otherwise.
    expect(venueHere(tracks.venues, 'venue-motocross', open, 'venue-a2-mx')!.id).toBe('venue-a2-mx');
    expect(venueHere(tracks.venues, 'venue-motocross', open, 'venue-a2-sx')!.id).toBe('venue-farmland');
    expect(venueHere(tracks.venues, 'venue-motocross', { 'area2.intro_done': true }, 'venue-a2-mx')!.id).toBe('venue-a2-mx');
    expect(venueHere(tracks.venues, 'venue-motocross', {}, 'venue-a2-mx')!.id).toBe('venue-farmland');
    expect(venueHere(tracks.venues, 'area1-home-town', open)).toBeUndefined();
    // The area champion waits in the town, not at a venue.
    expect(content.npcs.find((n) => n.id === 'npc.a2.area_champion')!.map).toBe(area2.map);
  });
});

describe('Areas 3 to 8 (Areas 2 to 8 plan; Boss, 31 Oct 2026: placeholder towns, NPCs and tracks until drawn)', () => {
  const later = areas.areas.filter((a) => a.n >= 3);
  // The world map's roads (tools/art/world-map.py): a4–a3, a3–a2, a4–a5, a5–a6, a6–a7, a7–a8, home–a8, and the Race Hub to every area.
  const roads: Record<number, { W: string; E: string }> = {
    3: { W: 'area4-forest-town', E: 'area2-mountain-town' },
    4: { W: 'area5-northern-works', E: 'area3-beach-town' },
    5: { W: 'area4-forest-town', E: 'area6-highlands' },
    6: { W: 'area5-northern-works', E: 'area7-the-city' },
    7: { W: 'area6-highlands', E: 'area8-capital' },
    8: { W: 'area7-the-city', E: 'area1-home-town' },
  };
  const badgeClass: Record<number, string> = { 3: '85cc-small', 4: '85cc-big', 5: '125cc-youth', 6: '125cc', 7: '250f', 8: '450f' };

  it('are all there, in order, each with a stamped town, its insides, three tracks at the hub venues and a locked house', () => {
    expect(later.map((a) => a.n)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(later.map((a) => a.name)).toEqual(['Beach Town', 'Forest Town', 'Northern Works', 'Highlands', 'The City', 'Capital']);
    for (const a of later) {
      const m = maps.get(a.map)!;
      expect(m, a.map).toBeDefined();
      const names = m.objects.filter((o) => o.type === 'building').map((o) => o.name);
      for (const n of ['Phoenix MX', 'Moto78', "Lee's T's & Wheels", 'Nicholls Used Motors', a.town!.works, a.house!.name, a.town!.fitness]) expect(names, a.name).toContain(n);
      expect(m.objects.some((o) => o.type === 'door' && o.name === a.house!.door && o.props.locked && o.props.unlock === houseFlag(a.n))).toBe(true);
      for (const key of ['local-garage', 'bike-shop', 'tyre-shop', 'van-office', 'rented-room', 'tool-shop']) expect(maps.has(`int-a${a.n}-${key}`)).toBe(true);
      for (const [key, map] of Object.entries({ mx: 'venue-motocross', sx: 'venue-supercross', enduro: 'venue-enduro' })) {
        expect(maps.has(`venue-a${a.n}-${key}`)).toBe(false);
        const v = tracks.venues.find((x) => x.id === `venue-a${a.n}-${key}`)!;
        expect(v.map, v.id).toBe(map);
        expect(v.town).toBe(a.map);
        expect(v.class).toBe(badgeClass[a.n]);
        expect(v.needs).toBe(`area${a.n}.intro_done`);
      }
    }
  });

  it('roads match the world map, and a town only shows on the road menu once its area is open', () => {
    const places = content.world.places;
    for (const a of later) {
      const routes = content.world.routes.filter((r) => r.map === a.map);
      expect(routes.map((r) => r.exit).sort()).toEqual(['East road', 'West road']);
      expect(routes.find((r) => r.exit === 'West road')!.to).toContain(roads[a.n].W);
      expect(routes.find((r) => r.exit === 'East road')!.to).toContain(roads[a.n].E);
      // The Race Hub reaches every area, and every town road reaches the hub's three venues, where its tracks race.
      expect(content.world.routes.find((r) => r.map === 'venue-motocross')!.to).toContain(a.map);
      for (const r of routes) for (const v of ['venue-motocross', 'venue-supercross', 'venue-enduro']) expect(r.to).toContain(v);
      expect(content.npcs.find((n) => n.id === `npc.a${a.n}.area_champion`)!.map).toBe(a.map);
      expect(roadMenu(places, tracks.venues, () => 'outdoor', {}).areas.map((p) => p.name)).not.toContain(a.name);
      expect(roadMenu(places, tracks.venues, () => 'outdoor', { [areaFlag(a.n)]: true }).areas.map((p) => p.name)).toContain(a.name);
    }
    expect(content.world.routes.find((r) => r.map === 'area1-home-town')!.to).toContain('area8-capital');
    expect(content.world.routes.find((r) => r.map === 'area2-mountain-town' && r.exit === 'West road')!.to).toContain('area3-beach-town');
  });

  it('each area opens with the one before, plays its intro chain and opens its tracks', () => {
    for (const a of later) {
      const prev = championships.championships.find((c) => c.id === `area${a.n - 1}.main`)!;
      expect(prev.opens, prev.id).toBe(a.n);
      const career = fresh();
      const flags: Record<string, boolean> = { [areaFlag(a.n)]: true };
      career.story.step = story.steps.length;
      // Area 5 also starts Mad Maggie's quest (tests/modifiers.test.ts), which waits its turn behind the intro.
      expect(openChains(story, career, flags).map((c) => c.id)).toContain(`area${a.n}`);
      expect(currentStep(story, career)?.id).toBe(`a${a.n}_news`);
      const chain = story.chains!.find((c) => c.id === `area${a.n}`)!;
      for (const step of chain.steps) {
        expect(matchStory(story, career, { talk: step.on.talk! })?.kind, `${a.name} ${step.id}`).toBe('ready');
        expect(advanceStory(story, career, flags, items)).toBe(true);
      }
      expect(chainDone(story, career, `area${a.n}`)).toBe(true);
      expect(flags[`area${a.n}.intro_done`]).toBe(true);
    }
    // Big Pete, the Rider Trainer in Beach Town, teaches whips and scrubs on the way (core/tricks.ts TRICKS_FLAG).
    const career = fresh();
    const flags: Record<string, boolean> = { [areaFlag(3)]: true };
    career.story.step = story.steps.length;
    openChains(story, career, flags);
    for (let i = 0; i < 5; i++) advanceStory(story, career, flags, items);
    expect(flags.rider_trainer_tricks).toBe(true);
    expect(championships.championships.find((c) => c.id === 'area8.main')!.opens).toBeUndefined();
  });

  it('fields rise by area and each area keeps its two champions on top, who then stay on to Area 8', () => {
    let last = riders.fieldLevel!['area2.local'];
    for (const a of later) {
      const level = riders.fieldLevel![a.field];
      expect(level, a.name).toBeGreaterThan(last);
      last = level;
      const local = championships.championships.find((c) => c.id === `area${a.n}.local_champion`)!;
      const main = championships.championships.find((c) => c.id === `area${a.n}.main`)!;
      expect(local.class).toBe(badgeClass[a.n]);
      expect(main.class).toBe(badgeClass[a.n]);
      expect(local.rewards[0].flag).toBe(`badge.area${a.n}`);
      expect(main.needs).toContain(`badge.area${a.n}`);
      const localChamp = riders.riders.find((r) => r.id === local.main)!;
      const areaChamp = riders.riders.find((r) => r.id === main.main)!;
      expect(localChamp.level).toBeGreaterThan(level);
      expect(areaChamp.level).toBeGreaterThan(localChamp.level);
      for (const r of [localChamp, areaChamp]) expect(r.areas, r.name).toEqual(Array.from({ length: 9 - a.n }, (_, i) => a.n + i));
      const venue = tracks.venues.find((v) => v.id === `venue-a${a.n}-mx`)!;
      const field = drawField(content, venue, 3);
      expect(field).toHaveLength(15);
      expect(field.every((r) => r.level >= level)).toBe(true);
      expect(field.map((r) => r.id)).toContain(areaChamp.id);
      // Everyone from an earlier area rides at this area's level here, and Area 1's field never sees them.
      expect(fieldRider(content, a.field, 'cpu.r21')!.level).toBeGreaterThanOrEqual(level);
      expect(riders.fields['area1.local']).not.toContain(areaChamp.id);
    }
    expect(riders.riders.find((r) => r.id === 'cpu.r16')!.tag).toBe('Area 8 Champion');
  });

  it('shops stock their area’s grades and classes, and the house and motor prices climb', () => {
    // Area N stocks Grades N to N + 2, never 9 or 10 (Boss, 31 Oct 2026).
    const grades: Record<number, [number, number]> = { 2: [2, 4], 3: [3, 5], 4: [4, 6], 5: [5, 7], 6: [6, 8], 7: [7, 8], 8: [8, 8] };
    // Moto78 sells every part but wheels, tyres and brakes in every area, as in Area 1; Phoenix MX
    // only repairs and fits (Boss, 31 Oct 2026).
    const moto78 = content.shops.shops.find((s) => s.id === 'shop.bike')!.sells!.slots;
    expect(content.shops.shops.find((s) => s.id === 'garage')!.sells).toBeUndefined();
    for (const kind of ['bike', 'tyres']) expect(content.shops.shops.find((s) => s.id === `shop.a2.${kind}`)!.sells!.grades).toEqual(grades[2]);
    expect(content.shops.shops.find((s) => s.id === 'shop.a2.bike')!.sells!.slots).toEqual(moto78);
    expect(content.shops.shops.find((s) => s.id === 'shop.a2.garage')!.sells).toBeUndefined();
    let house = areas.areas.find((a) => a.n === 2)!.house!.price;
    let motor = areas.areas.find((a) => a.n === 2)!.motor!.price;
    for (const a of later) {
      for (const kind of ['bike', 'tyres']) {
        const shop = content.shops.shops.find((s) => s.id === `shop.a${a.n}.${kind}`)!;
        expect(shop.sells!.grades, shop.id).toEqual(grades[a.n]);
        expect(shop.sells!.classes).toContain(badgeClass[a.n]);
      }
      expect(content.shops.shops.find((s) => s.id === `shop.a${a.n}.bike`)!.sells!.slots).toEqual(moto78);
      const garage = content.shops.shops.find((s) => s.id === `shop.a${a.n}.garage`)!;
      expect(garage.sells, garage.id).toBeUndefined();
      expect(garage.repairs).toBe(true);
      expect(a.house!.price).toBeGreaterThan(house);
      house = a.house!.price;
      if (a.motor) {
        expect(a.motor.price).toBeGreaterThan(motor);
        motor = a.motor.price;
      } else expect(a.n).toBeGreaterThanOrEqual(7);
      expect(content.jobboard.boards.some((b) => b.map === `int-a${a.n}-local-garage`)).toBe(true);
      expect(content.world.jobs.some((j) => j.map === `int-a${a.n}-tool-shop`)).toBe(true);
      expect(content.training.drills.some((d) => d.venue === `fitness-a${a.n}`)).toBe(true);
      expect(content.training.drills.some((d) => d.venue === `yard-a${a.n}`)).toBe(true);
      expect(content.challenges.challenges.filter((c) => c.map === a.map)).toHaveLength(2);
      expect(content.errands.errands.filter((e) => e.needs === `area${a.n}.intro_done`)).toHaveLength(2);
      expect(content.world.worldMap!.zones.some((z) => z.maps.includes(a.map))).toBe(true);
    }
  });
});
