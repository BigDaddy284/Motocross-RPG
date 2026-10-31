import { describe, expect, it } from 'vitest';
import { newCareerState, pence } from '../src/core/career';
import { finishChampionship, enter, champProblem } from '../src/core/championship';
import { classAtLeast, classFlag, collectBike, dayClass, milestoneFlag, milestoneStatus, nextClass, sponsorBrand, stockBikePrice } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { RaceDay, entryFee, lapsFor, playerEntrant, trackById, venueProblem } from '../src/core/raceDay';
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
  it('run in order from 50cc to 60+ Vets, each with race rules and a price factor', () => {
    expect(bikes.classes.map((c) => c.id)).toEqual(['50cc', '65cc', '85cc-small', '85cc-big', '125cc-youth', '125cc', '250f', '450f', 'vets-40', 'vets-50', 'vets-60']);
    expect(bikes.classes.map((c) => c.unlock)).toEqual([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]);
    for (const c of bikes.classes) {
      expect(racing.classes[c.id], c.id).toBeDefined();
      expect(shops.classPriceFactor[c.id], c.id).toBeGreaterThan(0);
      expect(!!racing.classes[c.id].youth, c.id).toBe(!!c.youth);
    }
    // Spec 12.1 laps and 14.2 entry fees.
    expect(['50cc', '65cc', '85cc-small', '85cc-big', '125cc-youth', '125cc', '450f', 'vets-40'].map((c) => racing.classes[c].laps)).toEqual([5, 7, 9, 11, 13, 20, 20, 20]);
    expect(['50cc', '65cc', '85cc-small', '85cc-big', '125cc-youth', '125cc', '250f', '450f', 'vets-40'].map((c) => racing.classes[c].entry)).toEqual([20, 25, 30, 35, 45, 60, 80, 100, 90]);
    expect(nextClass(bikes, '50cc')?.id).toBe('65cc');
    expect(nextClass(bikes, 'vets-60')).toBeNull();
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
    expect(shops.classDealer).toBe('shop.bike');
    enter(career, rc, main, 7);
    const win = finishChampionship(career, flags, main, [25, 25, 25, 25, 25, 25]);
    expect(win.position).toBe(1);
    expect(flags[milestoneFlag('65cc')]).toBe(true);
    expect(milestoneStatus(bikes, skills, career, flags)).toMatchObject({ kind: 'needLevel', level: 10, have: 1 });
    riderTo(career, 10);
    expect(milestoneStatus(bikes, skills, career, flags)).toMatchObject({ kind: 'ready', cls: { id: '65cc' } });
    // The sponsor's brand is fixed for the career; the stock bike's price is its Grade 1 parts.
    expect(sponsorBrand(bikes, career, '65cc')).toBe(sponsorBrand(bikes, career, '65cc'));
    expect(bikes.brands.map((b) => b.id)).toContain(sponsorBrand(bikes, career, '65cc'));
    const price = stockBikePrice(shops, bikes, '65cc');
    expect(price).toBe(pence(Object.values(shops.slotBase).reduce((a, b) => a + b, 0) * 1.2));
    const old = career.bike;
    career.money = price - 1;
    expect(collectBike(bikes, championships, career, flags, 'sukimoto', price).ok).toBe(false);
    const r = collectBike(bikes, championships, career, flags, 'sukimoto', 0);
    expect(r.ok).toBe(true);
    expect(career.bike).toMatchObject({ brand: 'sukimoto', class: '65cc' });
    expect(Object.values(career.bike.parts).every((p) => p.grade === 1 && p.condition === 1)).toBe(true);
    expect(career.retired).toEqual([{ bike: old, milestone: 'area1.main' }]);
    expect(flags[classFlag('65cc')]).toBe(true);
    expect(milestoneStatus(bikes, skills, career, flags).kind).toBe('none');
    // The retired bike rides along in the save.
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'R', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags, stats: { playSeconds: 0 }, career, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.retired).toHaveLength(1);
  });
});
