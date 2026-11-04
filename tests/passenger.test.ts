import { describe, expect, it } from 'vitest';
import { newCareerState, pence } from '../src/core/career';
import { champProblem, checkChampionships, otherActive, enter } from '../src/core/championship';
import { checkContent } from '../src/core/content';
import { PLAYER_ID, RaceDay, lapsFor, motoPrize, practiceSim, trackById, type VenueDef } from '../src/core/raceDay';
import { passengerEntrant, passengerEntry, passengerPracticeFee, passengerRiderLevel, passengerTrack, passengerXp, type PassengerTerms } from '../src/core/passenger';
import { directorFor } from '../src/core/riderAI';
import { SIDECAR_CLASS, SIDECAR_FIELD, SIDECAR_GATES, SIDECAR_LEFT, SIDECAR_SETTLE } from '../src/core/sidecar';
import { xpForLevel } from '../src/core/skills';
import { lapMetres } from '../src/core/trackGeom';
import { loadManifest, loadMaps, rawContent } from './helpers';

// Ray Crispy and riding in his sidecar's chair (Boss, 4 Nov 2026): "The player is the passenger, as
// such gets buffed or added fitness XP as being a passenger is such hard work. As the bike isn't
// theirs there's no wear to worry about but the price for race and practice entry is high and
// winnings are halved as you share with the rider." He's met in Beach Town after its intro, then
// stands next to Big Pete at every Motocross and Enduro venue, for practice, a race day or the
// sidecar championships.

const rc = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const ray = rc.npcs.find((n) => n.id === 'npc.sidecar_ray')!;
const terms = ray.sidecar as PassengerTerms;
const venue = (id: string): VenueDef => rc.tracks.venues.find((v) => v.id === id)!;

function career(fitness = 1) {
  const c = newCareerState(rc.bikes, rc.story, 'yamamoto', () => 0.5);
  if (fitness > 1) for (const ch of rc.skills.leads.find((l) => l.id === 'fitness')!.children) c.skills.xp[ch.id] = (xpForLevel(fitness) * 5) / 5 + 1;
  return c;
}

function passengerDay(v: VenueDef, seed: number, c = career()): RaceDay {
  const entry = passengerEntry(rc, v, terms);
  return new RaceDay(rc, v, passengerEntrant(rc, v, c, 'Me', terms), seed, entry, undefined, undefined, false, { passenger: { entry, prizeShare: terms.prizeShare, fitnessXpTimes: terms.fitnessXpTimes } });
}

describe('Ray Crispy (Boss, 4 Nov 2026)', () => {
  it('is met by Big Pete\'s sand track in Beach Town once its intro is done, and tells his story once', () => {
    const beach = rc.npcs.find((n) => n.id === 'npc.a3.ray')!;
    const pete = rc.npcs.find((n) => n.id === 'npc.a3.yard_coach')!;
    expect(beach).toMatchObject({ name: 'Ray Crispy', sprite: 'npc-32-ray-crispy', map: 'area3-beach-town', quietUntil: 'area3.intro_done' });
    expect(Math.abs(beach.tile![0] - pete.tile![0]) + Math.abs(beach.tile![1] - pete.tile![1])).toBeLessThanOrEqual(3);
    expect(beach.talk).toEqual([{ unless: 'met.ray', dialogue: 'ray.story', sets: 'met.ray' }]);
    const story = rc.dialogue['ray.story'].lines.map((l) => l.text).join(' ');
    expect(story).toMatch(/championships/);
    expect(story).toMatch(/passengers keep getting hurt/);
  });

  it('then stands next to Big Pete at the Motocross and Enduro venues only', () => {
    const rays = rc.npcs.filter((n) => n.sidecar);
    expect(rays.map((n) => n.map).sort()).toEqual(['venue-enduro', 'venue-motocross']);
    for (const r of rays) {
      expect(r).toMatchObject({ name: 'Ray Crispy', sprite: 'npc-32-ray-crispy', showIf: 'met.ray' });
      const pete = rc.npcs.find((n) => n.trainer && n.map === r.map)!;
      expect(Math.abs(r.tile![0] - pete.tile![0]) + Math.abs(r.tile![1] - pete.tile![1])).toBe(1);
      expect(r.sidecar).toEqual(terms);
    }
    expect(rc.npcs.some((n) => n.sidecar && n.map === 'venue-supercross')).toBe(false);
  });
});

describe('riding in his chair (Boss, 4 Nov 2026)', () => {
  it('races on Motocross and Endurance tracks, never Supercross', () => {
    for (const v of rc.tracks.venues.filter((x) => x.track && !x.practiceOnly)) {
      const ok = passengerTrack(trackById(rc, v.track!));
      expect(ok, v.id).toBe(v.map === 'venue-motocross' || v.map === 'venue-enduro');
    }
  });

  it('costs three times the solo entry and practice, and pays half the prize money', () => {
    const v = venue('venue-a3-mx');
    expect(passengerEntry(rc, v, terms)).toBe(pence(rc.racing.classes[v.class!].entry * 3));
    expect(passengerPracticeFee(rc, v, terms)).toBe(pence((rc.racing.classes[v.class!].entry * 3 * v.practiceFeePct!) / 100));
    const c = career();
    for (const seed of [2, 9]) {
      const day = passengerDay(v, seed, c);
      day.assignGates(day.gatesForPlayer().free[0]);
      const sim = day.startMoto('steady');
      sim.runToEnd();
      const rec = day.finishMoto(sim);
      const me = rec.results.find((r) => r.player)!;
      const full = me.retired ? 0 : motoPrize(rc.racing, passengerEntry(rc, v, terms), me.position);
      expect(rec.prize).toBe(Math.round(full * terms.prizeShare / 100) * 100);
    }
  });

  it('puts you on his outfit against 7 others: his riding, your fitness, and no wear on your own bike', () => {
    const c = career(20);
    const before = structuredClone(c.bike);
    for (const id of ['venue-a3-mx', 'venue-a3-enduro', 'venue-a8-enduro']) {
      const v = venue(id);
      const day = passengerDay(v, 4, c);
      expect(day.cls).toBe(SIDECAR_CLASS);
      expect(day.field).toHaveLength(SIDECAR_FIELD);
      expect(day.field.every((e) => e.bike.class === SIDECAR_CLASS)).toBe(true);
      expect(day.player.bike.brand).toBe(terms.brand);
      expect(day.laps).toBe(lapsFor(rc, day.track, v.class!, false));
      const level = passengerRiderLevel(rc, v, terms);
      expect(day.player.skills.cornering).toBe(level);
      expect(day.player.skills.strength).toBe(20);
      while (!day.done) {
        day.assignGates(day.gatesForPlayer().free[0]);
        const sim = day.startMoto('steady');
        sim.runToEnd();
        day.finishMoto(sim);
      }
    }
    expect(c.bike).toEqual(before);
  });

  it('turns the ride into fitness XP, half as much again as a solo ride teaches, and no riding XP', () => {
    const xp = { cornering: 10, starts: 6, consistency: 4 };
    const got = passengerXp(rc.skills, xp, terms);
    expect(Object.keys(got).sort()).toEqual(['agility', 'endurance', 'strength', 'wellbeing']);
    // A solo ride's 20 XP over 7 riding skills is about 2.9 a skill; in the chair each of 4 fitness skills gets 1.5 times that on average.
    const total = (20 * 1.5 * 4) / 7;
    expect(Object.values(got).reduce((a, v) => a + v, 0)).toBeCloseTo(total, 9);
    expect(got.strength).toBeCloseTo(total * 0.35, 9);
    expect(passengerXp(rc.skills, {}, terms)).toEqual({});
    const day = passengerDay(venue('venue-a3-mx'), 12);
    day.assignGates(day.gatesForPlayer().free[0]);
    const sim = day.startMoto('steady');
    sim.runToEnd();
    const rec = day.finishMoto(sim);
    const fitness = new Set(rc.skills.leads.find((l) => l.id === 'fitness')!.children.map((c) => c.id));
    expect(Object.keys(rec.xp).length).toBeGreaterThan(0);
    for (const k of Object.keys(rec.xp)) expect(fitness.has(k), k).toBe(true);
  });

  it('acts out on every Enduro venue track with the chair kept on the track', () => {
    for (const v of rc.tracks.venues.filter((x) => x.map === 'venue-enduro')) {
      const day = passengerDay(v, 21);
      day.assignGates(day.gatesForPlayer().free[0]);
      const sim = day.startMoto('steady');
      const dir = directorFor(sim, rc.bikes, rc.racing.messages, day.pickOrder);
      for (const tr of sim.runToEnd()) dir.addLap(tr);
      const metres = lapMetres(day.track);
      for (let t = 0; t < 240; t += 0.5) {
        for (const p of dir.poses(t)) {
          expect(Number.isFinite(p.lane), `${v.id} ${p.id} at ${t}`).toBe(true);
          if (p.state !== 'grid' && p.state !== 'retired' && (p.dist - dir.start.from) * metres > SIDECAR_SETTLE) expect(p.lane, `${v.id} ${p.id} at ${t}`).toBeGreaterThanOrEqual(SIDECAR_LEFT - 1e-9);
        }
      }
    }
  }, 120000);

  it('practises with other outfits on the even gates', () => {
    const v = venue('venue-a3-enduro');
    const sim = practiceSim(rc, v, passengerEntrant(rc, v, career(), 'Me', terms), 7, false, 1, true);
    expect(sim.riders.length).toBeLessThanOrEqual(SIDECAR_FIELD);
    for (const { e } of sim.riders) {
      expect(e.bike.class).toBe(SIDECAR_CLASS);
      expect(SIDECAR_GATES).toContain(e.gate);
    }
    expect(sim.opts.sidecar).toBe(true);
  });
});

describe('the sidecar championships (Boss, 4 Nov 2026)', () => {
  const champs = rc.championships.championships.filter((d) => d.sidecar);

  it('one an area at its Motocross and Enduro venues, open once you have met Ray', () => {
    expect(champs.map((d) => d.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `area${n}.sidecar`));
    for (const d of champs) {
      expect(d.class).toBe(SIDECAR_CLASS);
      expect(d.size).toBe(SIDECAR_FIELD - 1);
      expect(d.needs).toContain('met.ray');
      for (const id of d.rounds) expect(['venue-motocross', 'venue-enduro']).toContain(venue(id).map);
      expect(d.rewards[0].flag).toMatch(/^trophy\.sidecar\.area\d$/);
      expect(d.milestone).toBeUndefined();
      expect(d.opens).toBeUndefined();
    }
    expect(champProblem(rc, champs[2], { 'area3.intro_done': true })).not.toBeNull();
    expect(champProblem(rc, champs[2], { 'area3.intro_done': true, 'met.ray': true })).toBeNull();
  });

  it('runs alongside a solo championship, but only one sidecar championship at a time', () => {
    const c = career();
    const solo = rc.championships.championships.find((d) => d.id === 'area3.main')!;
    enter(c, rc, solo, 1);
    expect(otherActive(rc.championships, c, champs[2])).toBeNull();
    enter(c, rc, champs[2], 2);
    expect(otherActive(rc.championships, c, champs[3])?.id).toBe(champs[2].id);
    expect(otherActive(rc.championships, c, rc.championships.championships.find((d) => d.id === 'area4.main'))?.id).toBe(solo.id);
  });

  it('refuses a sidecar championship at a Supercross track (content checks)', () => {
    const bad = { championships: [{ ...champs[2], rounds: ['venue-a3-sx'] }] };
    expect(checkChampionships(bad, rc).map((e) => e.field)).toEqual(['championships[0].rounds[0]']);
  });

  it('a round races the championship field in the chair', () => {
    const v = venue('venue-a3-mx');
    const c = career();
    const active = enter(c, rc, champs[2], 3);
    const entry = passengerEntry(rc, v, terms);
    const cpus = active.field.map((id) => rc.riders.riders.find((r) => r.id === id)!);
    const day = new RaceDay(rc, v, passengerEntrant(rc, v, c, 'Me', terms), 5, entry, { cpus, purseTimes: champs[2].purseTimes, xpTimes: 1 }, undefined, false, { passenger: { entry, prizeShare: terms.prizeShare, fitnessXpTimes: terms.fitnessXpTimes } });
    expect(day.field.map((e) => e.id)).toEqual([PLAYER_ID, ...active.field]);
    expect(day.laps).toBe(lapsFor(rc, day.track, v.class!, true));
  });
});
