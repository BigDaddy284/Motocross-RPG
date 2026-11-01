import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { champById, enter, recordNight, roundOptions, standings } from '../src/core/championship';
import { entryFee, PLAYER_ID, playerEntrant } from '../src/core/raceDay';
import { isSupercross, MAIN_COUNTS, SupercrossNight } from '../src/core/supercross';
import { content } from './raceHelpers';

// The Supercross night (Boss, 1 Nov 2026): no qualifying; two heats of 16, the first 6 to the
// Main, the last 2 home and the rest to the LCQ; the LCQ's first 4 to the Main; the Main's 16 race
// for the prize money and points, worth a whole race day.

const venue = (id = 'venue-riverside') => content.tracks.venues.find((v) => v.id === id)!;

function night(seed = 7, id = 'venue-riverside', level?: number) {
  const career = newCareerState(content.bikes, content.story, content.bikes.brands[0].id);
  const v = venue(id);
  const me = playerEntrant(content, career, 'Test');
  if (level !== undefined) for (const k of Object.keys(me.skills)) me.skills[k] = level;
  // A sound bike: the starting one is a worn-out first bike.
  for (const p of Object.values(me.bike.parts)) p.condition = 1;
  return new SupercrossNight(content, v, me, seed, entryFee(content, v, {}));
}

/** Rides the whole night, the player on auto-complete in every race they make. */
function rideAll(n: SupercrossNight): void {
  for (;;) {
    n.runUntilPlayer();
    const r = n.next;
    if (!r) return;
    const sim = n.startRace(r, 'steady', n.gatesForPlayer(r).free[0]);
    sim.runToEnd();
    n.finishRace(r, sim);
  }
}

describe('Supercross night', () => {
  it('runs at every stadium track, Riverside Arena too, and nowhere else', () => {
    const sx = content.tracks.tracks.filter(isSupercross).map((t) => t.id);
    expect(sx).toContain('arena-supercross');
    expect(sx.length).toBe(8);
    expect(content.tracks.tracks.filter((t) => t.kind === 'outdoor').some(isSupercross)).toBe(false);
  });

  it('draws 32 riders into two heats of 16 at random, the player in either', () => {
    const heats = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const n = night(seed);
      expect(n.field.length).toBe(32);
      expect(new Set(n.field.map((e) => e.id)).size).toBe(32);
      expect(n.heats.map((h) => h.riders.length)).toEqual([16, 16]);
      expect(n.heats.map((h) => h.laps)).toEqual([4, 4]);
      expect(n.lcq.laps).toBe(3);
      heats.add(n.heats.findIndex((h) => h.riders.includes(PLAYER_ID)));
    }
    expect([...heats].sort()).toEqual([0, 1]);
  });

  it('every stadium has the riders for a full night', () => {
    for (const v of content.tracks.venues.filter((v) => v.track && isSupercross(content.tracks.tracks.find((t) => t.id === v.track)!))) {
      expect(night(3, v.id).field.length, v.id).toBe(32);
    }
  });

  it('sends the first 6 of each heat to the Main, the last 2 home, the rest to the LCQ, and the LCQ’s first 4 to the Main', () => {
    const n = night(11);
    rideAll(n);
    for (const h of n.heats) {
      const ids = h.results!.map((r) => r.id);
      expect(h.toMain).toEqual(ids.slice(0, 6));
      expect(h.toLcq).toEqual(ids.slice(6, 14));
    }
    expect(n.lcq.riders.length).toBe(16);
    expect(new Set(n.lcq.riders)).toEqual(new Set(n.heats.flatMap((h) => h.toLcq)));
    expect(n.lcq.toMain).toEqual(n.lcq.results!.slice(0, 4).map((r) => r.id));
    expect(n.main.riders.length).toBe(16);
    expect(n.main.laps).toBe(content.racing.sim.supercross?.mainLaps ?? 8);
    expect(n.done).toBe(true);
  });

  it('gives the Main’s gate picks to the heat winners first, then the 2nds and so on, the LCQ’s four last', () => {
    const n = night(4);
    rideAll(n);
    const heatPos = new Map(n.heats.flatMap((h) => h.results!.map((r) => [r.id, r.position] as const)));
    const fromHeats = n.main.riders.slice(0, 12).map((id) => heatPos.get(id)!);
    expect(fromHeats).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(n.main.riders.slice(12)).toEqual(n.lcq.toMain);
    // The LCQ picks in heat finishing order too: the 7ths first.
    expect(n.lcq.riders.slice(0, 2).map((id) => heatPos.get(id))).toEqual([7, 7]);
  });

  it('runs the other heat off screen: the player only rides their own races', () => {
    const n = night(9);
    const ran = n.runUntilPlayer();
    const mine = n.playerHeat!;
    expect(n.next).toBe(mine);
    expect(ran.length).toBe(mine.index);
    expect(n.playerIn).toBe(true);
  });

  it('places everyone: the Main in order, then the LCQ, then the heats', () => {
    const n = night(13);
    rideAll(n);
    const places = n.dayResult().places;
    expect(places.length).toBe(32);
    expect(places.slice(0, 16).every((p) => p.reached === 'Main Event')).toBe(true);
    expect(places.slice(16, 28).every((p) => p.reached === 'LCQ')).toBe(true);
    expect(places.slice(28).every((p) => p.reached === 'Heat')).toBe(true);
    expect(places.map((p) => p.position)).toEqual([...Array(32).keys()].map((i) => i + 1));
  });

  it('pays from the Main only, two motos’ worth plus the podium bonus; knocked out pays nothing but keeps the XP', () => {
    let paid = 0;
    let out = 0;
    for (let seed = 1; seed <= 20 && (!paid || !out); seed++) {
      // A rider good enough to make some Mains and miss others.
      const n = night(seed, 'venue-riverside', seed % 2 ? 40 : 1);
      rideAll(n);
      const res = n.dayResult();
      const me = res.places.find((p) => p.player)!;
      if (me.reached === 'Main Event' && res.main !== null) {
        paid++;
        expect(res.prize).toBeGreaterThan(0);
      } else {
        out++;
        expect(res.prize).toBe(0);
        expect(res.podiumBonus).toBe(0);
        expect(Object.values(res.xp).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      }
    }
    expect(paid).toBeGreaterThan(0);
    expect(out).toBeGreaterThan(0);
  });

  it('replays exactly from the same seed', () => {
    const a = night(21);
    const b = night(21);
    rideAll(a);
    rideAll(b);
    expect(a.dayResult().places.map((p) => p.id)).toEqual(b.dayResult().places.map((p) => p.id));
  });

  it('leave early: the player rides no more, the rest of the night runs without them, and nothing is paid', () => {
    const n = night(5);
    n.runUntilPlayer();
    const r = n.next!;
    const sim = n.startRace(r, 'steady', n.gatesForPlayer(r).free[0]);
    sim.runToEnd();
    n.finishRace(r, sim);
    n.leaveEarly();
    expect(n.done).toBe(true);
    expect(n.main.riders).not.toContain(PLAYER_ID);
    expect(n.lcq.riders).not.toContain(PLAYER_ID);
    const res = n.dayResult();
    expect(res.prize).toBe(0);
    expect(res.places.length).toBe(32);
  });

  it('a championship round fills the night from riders outside it, and the Main scores a whole round', () => {
    const def = champById(content.championships, 'area1.local_champion')!;
    const career = newCareerState(content.bikes, content.story, content.bikes.brands[0].id);
    const active = enter(career, content, def, 3);
    const opts = roundOptions(content, def, active);
    const v = venue('venue-riverside');
    const n = new SupercrossNight(content, v, playerEntrant(content, career, 'Test'), 8, 0, opts);
    expect(n.field.length).toBe(32);
    for (const id of active.field) expect(n.field.some((e) => e.id === id)).toBe(true);
    expect(n.field.some((e) => def.without?.includes(e.id))).toBe(false);
    rideAll(n);
    recordNight(active, v, n.championshipMotos());
    expect(active.rounds[0].motos.length).toBe(MAIN_COUNTS);
    const table = standings(content.racing.points, active);
    const winner = n.main.results![0];
    const row = table.find((r) => r.id === winner.id);
    if (row) expect(row.points).toBe(MAIN_COUNTS * content.racing.points[0]);
  });
});
