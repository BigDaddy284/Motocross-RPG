import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { stockBike } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { addReputation, checkSponsors, cpuReputation, dayObjectives, dropPenalty, dropSponsor, finishReputation, makeOffers, objectiveMet, offerProblem, reputationHint, secretTable, settleDay, signOffer, sponsorsOpen, tableShare, topTier, type Contract, type DayFacts } from '../src/core/sponsors';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { bikes, story, sponsors: data, tracks } = content;
const venue = tracks.venues.find((v) => v.id === 'venue-a2-mx')!;
const fresh = (grade = 1) => {
  const c = { ...newCareerState(bikes, story, 'yamamoto', () => 0.5), bike: stockBike(bikes, 'yamamoto', '50cc'), money: 100000 };
  for (const p of Object.values(c.bike.parts)) p.grade = grade;
  return c;
};
const contract = (over: Partial<Contract> = {}): Contract => ({ tier: 'T2', name: 'Valley Motorcycles', pay: 100, days: 10, minGrade: 2, daysDone: 0, failStreak: 0, cashReceived: 0, seed: 7, ...over });
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({ position: 1, positions: [1, 1], overall: { 'cpu.r21': 2 }, partsAtStart: { forks: { condition: 0.9 } }, kind: 'local', ...over });

describe('reputation (Spec 16.1)', () => {
  it('rises with finishes by the day’s weight, with championship wins, and stays between 0 and 1,000', () => {
    expect(finishReputation(data, 1, 'local')).toBe(5);
    expect(finishReputation(data, 1, 'main')).toBe(20);
    expect(finishReputation(data, 11, 'local')).toBe(0);
    expect(finishReputation(data, 15, 'main')).toBe(0);
    expect(finishReputation(data, null, 'main')).toBe(0);
    const c = fresh();
    expect(addReputation(data, c, -20)).toBe(0);
    expect(addReputation(data, c, 5000)).toBe(1000);
    expect(reputationHint(data, { ...c, reputation: 0 })).toMatch(/Nobody/);
    expect(reputationHint(data, { ...c, reputation: 999 })).toMatch(/Big teams/);
  });

  it('ranks the rider on the Sponsors’ secret table against every CPU rider’s fixed score', () => {
    expect(cpuReputation(data, 8)).toBe(80);
    expect(cpuReputation(data, 999)).toBe(1000);
    const c = fresh();
    c.reputation = 85;
    const share = tableShare(data, content, c);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.8);
    const table = secretTable(data, content, c, 'Me');
    expect(table.find((r) => r.player)!.score).toBe(85);
    expect(table.map((r) => r.score)).toEqual([...table.map((r) => r.score)].sort((a, b) => b - a));
    expect(topTier(data, 0.1)).toBe('T2');
    expect(topTier(data, 0.5)).toBe('T3');
    expect(topTier(data, 0.8)).toBe('T4');
    expect(topTier(data, 0.99)).toBe('T5');
  });
});

describe('Sponsored Rides (Spec 16.2, 16.3; Boss, 31 Oct 2026: from Area 5)', () => {
  it('opens with Area 5 and makes 2 to 5 offers from the top tier down, deterministic for the seed', () => {
    expect(sponsorsOpen(data, {})).toBe(false);
    expect(sponsorsOpen(data, { 'area.5.open': true })).toBe(true);
    const c = fresh();
    const low = makeOffers(data, content, c, 3);
    expect(low.length).toBeGreaterThanOrEqual(1);
    expect(low.length).toBeLessThanOrEqual(2);
    expect(low.every((o) => ['T1', 'T2'].includes(o.tier))).toBe(true);
    expect(makeOffers(data, content, c, 3)).toEqual(low);
    c.reputation = 1000;
    const high = makeOffers(data, content, c, 3);
    expect(high.length).toBeLessThanOrEqual(5);
    expect(high.length).toBeGreaterThanOrEqual(3);
    for (const o of high) {
      const tier = data.tiers.find((t) => t.id === o.tier)!;
      expect(o.pay).toBeGreaterThanOrEqual(tier.pay[0]);
      expect(o.pay).toBeLessThanOrEqual(tier.pay[1]);
      expect(o.days).toBe(tier.days);
      expect(o.minGrade).toBe(tier.minGrade);
    }
    expect(high.map((o) => o.pay)).toEqual([...high.map((o) => o.pay)].sort((a, b) => b - a));
  });

  it('signs only with every part at the tier’s grade and no sponsor already, and a factory team sets the factory flag', () => {
    const c = fresh(1);
    const offer = { tier: 'T2', name: 'Valley Motorcycles', pay: 100, days: 10, minGrade: 2 };
    expect(offerProblem(offer, c)).toMatch(/Grade 2/);
    const ok = fresh(2);
    const flags: Record<string, boolean> = {};
    expect(signOffer(data, offer, ok, flags).ok).toBe(true);
    expect(ok.sponsor?.name).toBe('Valley Motorcycles');
    expect(ok.sponsor?.daysDone).toBe(0);
    expect(offerProblem(offer, ok)).toMatch(/Drop them first/);
    expect(flags[data.factoryFlag]).toBeUndefined();
    const factory = fresh(7);
    expect(signOffer(data, { tier: 'T5', name: 'Yamamoto Factory', pay: 9000, days: 20, minGrade: 7 }, factory, flags).ok).toBe(true);
    expect(flags[data.factoryFlag]).toBe(true);
  });

  it('sets one or two objectives a day from the contract’s seed, and judges them from the day', () => {
    const c = contract();
    const a = dayObjectives(data, content, c, venue);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(2);
    expect(dayObjectives(data, content, c, venue)).toEqual(a);
    expect(new Set(a.map((o) => o.kind)).size).toBe(a.length);
    const kinds = new Set<string>();
    for (let d = 0; d < 30; d++) for (const o of dayObjectives(data, content, { ...c, daysDone: d }, venue)) kinds.add(o.kind);
    expect([...kinds].sort()).toEqual(['finish', 'presentation', 'rival', 'top']);
    expect(objectiveMet(data, { kind: 'top', n: 6 }, facts({ position: 6 }))).toBe(true);
    expect(objectiveMet(data, { kind: 'top', n: 6 }, facts({ position: 7 }))).toBe(false);
    expect(objectiveMet(data, { kind: 'rival', rider: 'cpu.r21' }, facts({ position: 3, overall: { 'cpu.r21': 2 } }))).toBe(false);
    expect(objectiveMet(data, { kind: 'rival', rider: 'cpu.r21' }, facts({ position: 1, overall: { 'cpu.r21': 2 } }))).toBe(true);
    expect(objectiveMet(data, { kind: 'rival', rider: 'cpu.r99' }, facts({ position: 9, overall: {} }))).toBe(true);
    expect(objectiveMet(data, { kind: 'finish' }, facts({ positions: [1, null] }))).toBe(false);
    expect(objectiveMet(data, { kind: 'presentation' }, facts({ partsAtStart: { forks: { condition: 0.4 } } }))).toBe(false);
  });

  it('settles a race day: pays per objective met, warns after two misses, ends after three, and ends when the days run out', () => {
    const c = fresh(2);
    c.sponsor = contract({ pay: 100, days: 3 });
    // A day of wins meets everything on offer.
    const win = settleDay(data, content, c, venue, facts({ kind: 'main' }));
    const met = dayObjectives(data, content, { ...c.sponsor!, daysDone: 0 }, venue).length;
    expect(win.money).toBe(met * 10000);
    expect(c.money).toBe(100000 + met * 10000);
    expect(c.sponsor!.cashReceived).toBe(met * 10000);
    expect(c.sponsor!.daysDone).toBe(1);
    expect(c.reputation).toBe(2 * 20 + met * 10);
    expect(win.lines.some((l) => l.includes('to go'))).toBe(true);
    // Three bad days in a row end it, with a warning after two.
    const bad = fresh(2);
    bad.sponsor = contract({ pay: 100, days: 20 });
    const terrible = facts({ position: 15, positions: [null, null], overall: { 'cpu.r21': 1 }, partsAtStart: { forks: { condition: 0.1 } } });
    const d1 = settleDay(data, content, bad, venue, terrible);
    expect(d1.money).toBe(0);
    // The streak counts objectives, not days (Round 99, 4A): two missed on day one is already a warning.
    expect(d1.warning).toBe(dayObjectives(data, content, { ...bad.sponsor!, daysDone: 0 }, venue).length >= 2);
    const d2 = settleDay(data, content, bad, venue, terrible);
    expect(d2.warning || d2.ended).toBe(true);
    let ended = d2.ended;
    for (let i = 0; i < 3 && !ended; i++) ended = settleDay(data, content, bad, venue, terrible).ended;
    expect(ended).toBe(true);
    expect(bad.sponsor).toBeUndefined();
    expect(bad.reputation).toBe(0);
    // The days run out.
    const short = fresh(2);
    short.sponsor = contract({ days: 1 });
    expect(settleDay(data, content, short, venue, facts()).ended).toBe(true);
    expect(short.sponsor).toBeUndefined();
    // No sponsor: just the finishes count.
    const none = fresh();
    expect(settleDay(data, content, none, venue, facts({ positions: [3, 5] })).lines).toEqual([]);
    expect(none.reputation).toBe(4 + 3);
  });

  it('dropping a sponsor costs the tier’s share of what they paid, more with days left, and 50 reputation', () => {
    const c = contract({ tier: 'T3', cashReceived: 100000, days: 12, daysDone: 6 });
    expect(dropPenalty(data, c)).toBe(Math.round(0.25 * 100000 * 1.5));
    expect(dropPenalty(data, { ...c, daysDone: 12 })).toBe(25000);
    const career = fresh(4);
    career.sponsor = c;
    career.reputation = 100;
    expect(dropSponsor(data, career).ok).toBe(true);
    expect(career.sponsor).toBeUndefined();
    expect(career.money).toBe(100000 - 37500);
    expect(career.reputation).toBe(50);
    expect(dropSponsor(data, career).ok).toBe(false);
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career: { ...fresh(), reputation: 12, sponsor: contract(), sponsorOffers: [{ tier: 'T1', name: 'Moto78', pay: 40, days: 6, minGrade: 1 }] }, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.sponsor?.name).toBe('Valley Motorcycles');
    expect(parseSave(JSON.stringify({ ...save, career: { ...save.career, sponsor: { tier: 'T1' } } }))).toBeNull();
  });

  it('content check: tiers in order with rising pay, known tiers in topShare, weights for every day kind, rising hints', () => {
    expect(checkSponsors('s', data)).toEqual([]);
    const bad = JSON.parse(JSON.stringify(data));
    bad.tiers[1].pay = [10, 20];
    bad.offers.topShare.T9 = 0.5;
    delete bad.reputation.tierWeight.main;
    bad.hints[1].below = 0;
    expect(checkSponsors('s', bad).map((e) => e.field)).toEqual(['tiers[1].pay', 'offers.topShare.T9', 'reputation.tierWeight', 'hints[1].below']);
  });
});
