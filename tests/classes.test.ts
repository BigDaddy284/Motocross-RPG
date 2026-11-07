import { describe, expect, it } from 'vitest';
import { newCareerState, pence } from '../src/core/career';
import { finishChampionship, enter, champProblem } from '../src/core/championship';
import { classAtLeast, classFlag, collectBike, dayClass, milestoneFlag, milestoneStatus, nextClass, sponsorBrand, stockBike, stockBikePrice, frameGradeOf, prizeBike, collectPrize, declinePrize, prizeFlag, prizeDoneFlag } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { RaceDay, entryFee, lapsFor, playerEntrant, trackById, venueProblem } from '../src/core/raceDay';
import { shopStock } from '../src/core/shops';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { xpForLevel } from '../src/core/skills';
import { loadManifest, loadMaps, rawContent } from './helpers';

const rc = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { bikes, story, shops, skills, racing, championships } = rc;
const fresh = () => newCareerState(bikes, story, 'yamamoto', () => 0.5);
const riderTo = (career: ReturnType<typeof fresh>, level: number) => {
  for (const c of skills.leads.find((l) => l.id === 'rider')!.children) career.skills.xp[c.id] = (xpForLevel(level) * 5) / 7 + 1;
};

describe('bike classes (GDD 6.4, Spec 12.1, 14.2)', () => {
  it('run in order from 50cc to the 450cc F, then the sidecar class (the Vets are championships on the 450cc F, Boss 5 Nov 2026), each with race rules and a price factor', () => {
    expect(bikes.classes.map((c) => c.id)).toEqual(['50cc', '65cc', '85cc-small', '85cc-big', '125cc-youth', '125cc', '250f', '450f', 'sidecar']);
    expect(bikes.classes.map((c) => c.unlock)).toEqual([1, 10, 20, 30, 40, 50, 60, 70, undefined]);
    for (const c of bikes.classes) {
      expect(racing.classes[c.id], c.id).toBeDefined();
      expect(shops.classPriceFactor[c.id], c.id).toBeGreaterThan(0);
      expect(!!racing.classes[c.id].youth, c.id).toBe(!!c.youth);
    }
    // Spec 12.1 laps and 14.2 entry fees.
    expect(['50cc', '65cc', '85cc-small', '85cc-big', '125cc-youth', '125cc', '450f'].map((c) => racing.classes[c].laps)).toEqual([5, 7, 9, 11, 13, 20, 20]);
    expect(['50cc', '65cc', '85cc-small', '85cc-big', '125cc-youth', '125cc', '250f', '450f'].map((c) => racing.classes[c].entry)).toEqual([20, 25, 30, 35, 45, 60, 80, 100]);
    expect(nextClass(bikes, '50cc')?.id).toBe('65cc');
    expect(nextClass(bikes, '450f')).toBeNull();
    expect(classAtLeast(bikes, '85cc-big', '65cc')).toBe(true);
    expect(classAtLeast(bikes, '50cc', '65cc')).toBe(false);
  });

  it('a venue\'s class is a minimum: a bigger bike races there in its own class, a smaller one can\'t enter (Spec 18.0)', () => {
    expect(dayClass(bikes, '50cc', '65cc')).toBe('65cc');
    expect(dayClass(bikes, '65cc', '65cc')).toBe('65cc');
    expect(dayClass(bikes, '65cc', '50cc')).toBeNull();
    const venue = rc.tracks.venues.find((v) => v.id === 'venue-farmland')!;
    const career = fresh();
    career.bike.parts.top_end.condition = 1;
    career.bike.class = '65cc';
    const flags = { 'found.venue-farmland': true, first_race_done: true };
    expect(venueProblem(rc, venue, career, flags)).toBeNull();
    const day = new RaceDay(rc, venue, playerEntrant(rc, career, 'Me'), 1, entryFee(rc, venue, flags, '65cc'));
    expect(day.cls).toBe('65cc');
    expect(day.laps).toBe(7);
    expect(day.field.every((e) => e.bike.class === '65cc')).toBe(true);
    expect(entryFee(rc, venue, flags, '65cc')).toBe(pence(25));
    // Endurance laps follow the class (twice its laps), while 50cc keeps Boss's 8.
    const longmoor = trackById(rc, 'longmoor-endurance');
    expect(lapsFor(rc, longmoor, '50cc', false)).toBe(8);
    expect(lapsFor(rc, longmoor, '65cc', false)).toBe(14);
    const smaller = { ...venue, class: '65cc' };
    career.bike.class = '50cc';
    expect(venueProblem(rc, smaller, career, flags)).toMatch(/65cc and up only/);
    const main = championships.championships.find((c) => c.id === 'area1.main')!;
    expect(champProblem(rc, { ...main, class: '65cc', needs: [] }, flags, '50cc')).toMatch(/too small/);
  });

  it('winning the Area 1 Championship is the 65cc milestone, collected at Moto78 once Rider Ability is 10 (Spec 18.3)', () => {
    const career = fresh();
    const flags: Record<string, boolean> = {};
    const main = championships.championships.find((c) => c.id === 'area1.main')!;
    expect(main.milestone).toBe('65cc');
    expect(shops.classDealers).toContain('shop.bike');
    enter(career, rc, main, 7);
    const win = finishChampionship(career, flags, main, [25, 25, 25, 25, 25, 25]);
    expect(win.position).toBe(1);
    expect(flags[milestoneFlag('65cc')]).toBe(true);
    expect(milestoneStatus(bikes, skills, career, flags)).toMatchObject({ kind: 'needLevel', level: 10, have: 1 });
    riderTo(career, 10);
    expect(milestoneStatus(bikes, skills, career, flags)).toMatchObject({ kind: 'ready', cls: { id: '65cc' } });
    // The sponsor's brand is fixed for the career; the stock bike's price is its Grade 1 parts on a Grade 2 frame.
    expect(sponsorBrand(bikes, career, '65cc')).toBe(sponsorBrand(bikes, career, '65cc'));
    expect(bikes.brands.map((b) => b.id)).toContain(sponsorBrand(bikes, career, '65cc'));
    const price = stockBikePrice(shops, bikes, '65cc');
    const { frame, ...rest } = shops.slotBase;
    expect(price).toBe(pence((Object.values(rest).reduce((a, b) => a + b, 0) + frame * shops.gradeFactor) * 1.2));
    const old = career.bike;
    career.money = price - 1;
    expect(collectBike(bikes, championships, career, flags, 'sukimoto', price).ok).toBe(false);
    const r = collectBike(bikes, championships, career, flags, 'sukimoto', 0);
    expect(r.ok).toBe(true);
    expect(career.bike).toMatchObject({ brand: 'sukimoto', class: '65cc' });
    expect(Object.entries(career.bike.parts).every(([slot, p]) => p.grade === (slot === 'frame' ? 2 : 1) && p.condition === 1)).toBe(true);
    expect(career.retired).toEqual([{ bike: old, milestone: 'area1.main' }]);
    expect(flags[classFlag('65cc')]).toBe(true);
    expect(milestoneStatus(bikes, skills, career, flags).kind).toBe('none');
    // The retired bike rides along in the save.
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'R', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags, stats: { playSeconds: 0 }, career, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.retired).toHaveLength(1);
  });

  it("each class's frame matches its town's grade, and the stock bike and Moto78's stock frame use it (Boss, 5 Nov 2026)", () => {
    const want: Record<string, number> = { '50cc': 1, '65cc': 2, '85cc-small': 3, '85cc-big': 4, '125cc-youth': 5, '125cc': 6, '250f': 7, '450f': 8 };
    for (const [cls, g] of Object.entries(want)) {
      expect(frameGradeOf(bikes, cls)).toBe(g);
      expect(stockBike(bikes, 'sukimoto', cls).parts.frame.grade).toBe(g);
      expect(stockBike(bikes, 'sukimoto', cls).parts.top_end.grade).toBe(1);
    }
    const career = fresh();
    for (const shop of shops.shops.filter((s) => s.sells?.stockOnly?.includes('frame'))) {
      for (const cls of shop.sells!.classes) {
        const frames = shopStock(shops, shop, career, cls, frameGradeOf(bikes, cls)).filter((s) => s.slot === 'frame');
        expect(frames.map((f) => f.grade)).toEqual([frameGradeOf(bikes, cls)]);
        expect(frames[0].always).toBe(true);
      }
    }
  });

  it('the Crankshaft Cup, Legends, the Vets and the Ultimate Event each give a new 450cc F for the first win (Boss, 5 Nov 2026)', () => {
    const prized = championships.championships.filter((c) => c.rewards[0].bike).map((c) => c.id);
    expect(prized).toEqual(['area8.main', 'legends', 'vets.40', 'vets.50', 'vets.60', 'ultimate']);
    for (const id of prized) expect(championships.championships.find((c) => c.id === id)!.rewards[0].bike).toBe('450f');
    const career = fresh();
    career.bike = { ...stockBike(bikes, 'yamamoto', '450f'), parts: Object.fromEntries(bikes.slots.map((s) => [s.id, { grade: 6, condition: 0.7 }])) };
    const flags: Record<string, boolean> = {};
    const cup = championships.championships.find((c) => c.id === 'area8.main')!;
    expect(prizeBike(bikes, championships, flags)).toBeNull();
    enter(career, rc, cup, 3);
    finishChampionship(career, flags, cup, Array(12).fill(25));
    expect(flags[prizeFlag('area8.main')]).toBe(true);
    expect(prizeBike(bikes, championships, flags)).toMatchObject({ champ: { id: 'area8.main' }, cls: { id: '450f' } });
    // Not a class milestone: no new class to collect.
    expect(milestoneStatus(bikes, skills, career, flags).kind).toBe('none');
    const old = career.bike;
    const money = career.money;
    expect(collectPrize(bikes, championships, career, flags, 'legends', 'sukimoto').ok).toBe(false);
    const r = collectPrize(bikes, championships, career, flags, 'area8.main', 'sukimoto');
    expect(r.ok).toBe(true);
    expect(career.money).toBe(money);
    expect(career.bike).toEqual(stockBike(bikes, 'sukimoto', '450f'));
    expect(career.bike.parts.frame.grade).toBe(8);
    expect(career.retired?.at(-1)).toEqual({ bike: old, milestone: 'area8.main' });
    expect(prizeBike(bikes, championships, flags)).toBeNull();
    // A win again later gives no second bike.
    enter(career, rc, cup, 4);
    finishChampionship(career, flags, cup, Array(12).fill(25));
    expect(prizeBike(bikes, championships, flags)).toBeNull();
    // Turning one down keeps the bike.
    flags[prizeFlag('legends')] = true;
    expect(prizeBike(bikes, championships, flags)?.champ.id).toBe('legends');
    const mine = career.bike;
    declinePrize(flags, 'legends');
    expect(flags[prizeDoneFlag('legends')]).toBe(true);
    expect(prizeBike(bikes, championships, flags)).toBeNull();
    expect(career.bike).toBe(mine);
  });

  it('a version 8 save on a Vets bike moves to a 450cc F, and a Crankshaft Cup already won has its prize waiting', () => {
    const career = fresh();
    career.bike = { ...career.bike, class: 'vets-40' };
    const save = { version: 8, savedAt: 'now', rider: { name: 'R', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: { 'trophy.area8.main': true }, stats: { playSeconds: 0 }, career, van: null, driving: false };
    const loaded = parseSave(JSON.stringify(save))!;
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.career.bike.class).toBe('450f');
    expect(loaded.flags[prizeFlag('area8.main')]).toBe(true);
  });
});
