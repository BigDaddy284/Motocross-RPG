import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { classAtLeast, dayClass, nextClass } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { gateBonus, type LapTrace } from '../src/core/race';
import { PLAYER_ID, RaceDay, lapsFor, playerEntrant, trackById, type VenueDef } from '../src/core/raceDay';
import { directorFor, type RaceDirector } from '../src/core/riderAI';
import { SIDECAR_CLASS, SIDECAR_FIELD, SIDECAR_LEFT, SIDECAR_SETTLE, SIDECAR_GATES, SIDECAR_TEST_VENUE, chairGate, isSidecarClass, isSidecarGate, sidecarTrack } from '../src/core/sidecar';
import { xpForLevel } from '../src/core/skills';
import { lapMetres } from '../src/core/trackGeom';
import { TRICKS_FLAG } from '../src/core/tricks';
import { loadManifest, loadMaps, rawContent } from './helpers';
import { arrivals } from './raceHelpers';

// Sidecar racing (Boss, 1 Nov 2026): 8 outfits on the gate, Motocross tracks only, never a whip or
// a scrub whatever the rider's skill, its own class brought in late. For now a TEST tick box at the
// Farmland race office races the player on a sidecar against 7 others: 4 on the front row and 4 on
// the back, each outfit on an even gate with its chair over the odd gate beside it.

const rc = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { bikes } = rc;
const farmland = rc.tracks.venues.find((v) => v.id === SIDECAR_TEST_VENUE)!;
const flags = { 'found.venue-farmland': true, first_race_done: true };

/** A rider with a fresh career, their bike fixed up (the starter's top end is broken). */
function career(level = 1) {
  const c = newCareerState(bikes, rc.story, 'yamamoto', () => 0.5);
  for (const p of Object.values(c.bike.parts)) p.condition = 1;
  if (level > 1) for (const ch of rc.skills.leads.find((l) => l.id === 'rider')!.children) c.skills.xp[ch.id] = (xpForLevel(level) * 5) / 7 + 1;
  return c;
}

/** A TEST sidecar race day at a venue for this career. */
function testDay(seed: number, c = career(), venue: VenueDef = farmland, saveFlags: Record<string, boolean> = flags): RaceDay {
  return new RaceDay(rc, venue, playerEntrant(rc, c, 'Me', 0, saveFlags), seed, 0, undefined, undefined, false, { test: true });
}

/** A moto ridden out: the player takes the first gate offered. */
function ride(day: RaceDay, gate = day.gatesForPlayer().free[0]): { dir: RaceDirector; traces: LapTrace[] } {
  day.assignGates(gate);
  const sim = day.startMoto('steady');
  const dir = directorFor(sim, bikes, rc.racing.messages, day.pickOrder);
  const traces = sim.runToEnd();
  for (const tr of traces) dir.addLap(tr);
  return { dir, traces };
}

describe('the sidecar class (Boss, 1 Nov 2026)', () => {
  it('is its own class after the solo ladder, with race rules and a price, never moved up to from a solo class', () => {
    const def = bikes.classes.find((c) => c.id === SIDECAR_CLASS)!;
    expect(def.sidecar).toBe(true);
    expect(bikes.classes.at(-1)!.id).toBe(SIDECAR_CLASS);
    expect(isSidecarClass(bikes, SIDECAR_CLASS)).toBe(true);
    expect(isSidecarClass(bikes, '450f')).toBe(false);
    expect(rc.racing.classes[SIDECAR_CLASS]).toBeDefined();
    expect(rc.shops.classPriceFactor[SIDECAR_CLASS]).toBeGreaterThan(0);
    // Not the next class up from the top of the solo ladder, and neither bigger nor smaller than a solo class.
    expect(nextClass(bikes, 'vets-60')).toBeNull();
    expect(nextClass(bikes, SIDECAR_CLASS)).toBeNull();
    for (const solo of ['50cc', '450f', 'vets-60']) {
      expect(classAtLeast(bikes, SIDECAR_CLASS, solo)).toBe(false);
      expect(classAtLeast(bikes, solo, SIDECAR_CLASS)).toBe(false);
      expect(dayClass(bikes, solo, SIDECAR_CLASS)).toBeNull();
    }
    expect(classAtLeast(bikes, SIDECAR_CLASS, SIDECAR_CLASS)).toBe(true);
  });

  it('keeps the sidecar classes last and off the starter bike (content checks)', () => {
    const raw = rawContent();
    const list = (raw.bikes as { classes: { id: string; name: string; sidecar?: boolean }[] }).classes;
    list.push({ ...list.find((c) => c.id === 'vets-60')!, id: 'vets-70', name: '70+ Vets' });
    (raw.racing as { classes: Record<string, unknown> }).classes['vets-70'] = (raw.racing as { classes: Record<string, unknown> }).classes['vets-60'];
    const errors = checkContent(raw, loadManifest(), loadMaps()).errors.map((e) => e.message).join('\n');
    expect(errors).toMatch(/sidecar classes go last/);
    const raw2 = rawContent();
    (raw2.bikes as { starter: { class: string } }).starter.class = SIDECAR_CLASS;
    expect(checkContent(raw2, loadManifest(), loadMaps()).errors.map((e) => e.message).join('\n')).toMatch(/starts on a solo bike/);
  });
});

describe('where sidecars race: Motocross tracks only (Boss, 1 Nov 2026)', () => {
  it('races on every outdoor track and on no stadium, endurance or enduro sprint track', () => {
    const tracks = rc.tracks.tracks;
    expect(tracks.filter(sidecarTrack).length).toBeGreaterThan(0);
    for (const t of tracks) expect(sidecarTrack(t), t.id).toBe((t.kind ?? 'outdoor') === 'outdoor');
    expect(sidecarTrack(trackById(rc, 'farmland'))).toBe(true);
  });

  it('refuses a sidecar race day at a venue that is not a Motocross track', () => {
    const notMx = rc.tracks.venues.filter((v) => v.track && !v.practiceOnly && !sidecarTrack(trackById(rc, v.track)));
    expect(notMx.length).toBeGreaterThan(0);
    for (const v of notMx) expect(() => testDay(1, career(), v), v.id).toThrow(/Motocross tracks only/);
  });
});

describe('a TEST sidecar race at Farmland (Boss, 1 Nov 2026)', () => {
  it('puts the player on a sidecar against 7 other outfits, all in the sidecar class', () => {
    const day = testDay(7);
    expect(day.field).toHaveLength(SIDECAR_FIELD);
    expect(day.field.filter((e) => !e.player)).toHaveLength(7);
    expect(day.cls).toBe(SIDECAR_CLASS);
    for (const e of day.field) expect(e.bike.class, e.id).toBe(SIDECAR_CLASS);
    expect(new Set(day.field.map((e) => e.id)).size).toBe(SIDECAR_FIELD);
    // A quick test: the laps the rider's own class races here, two motos.
    expect(day.laps).toBe(lapsFor(rc, day.track, '50cc', false));
    expect(day.motoCount).toBe(2);
  });

  it('offers only the even gates: 2, 4, 6 and 8 on the front row and 10 to 16 behind', () => {
    expect(SIDECAR_GATES.map((g) => g + 1)).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    for (let g = 0; g < 16; g++) expect(isSidecarGate(g), `gate ${g + 1}`).toBe((g + 1) % 2 === 0);
    for (const g of SIDECAR_GATES) expect(chairGate(g) + 1).toBe(g);
    for (let seed = 1; seed <= 40; seed++) {
      const day = testDay(seed);
      expect(day.gateCount).toBe(16);
      const { taken, free } = day.gatesForPlayer();
      expect(free.length).toBe(SIDECAR_FIELD - taken.size);
      for (const g of [...free, ...taken.keys()]) expect(isSidecarGate(g), `seed ${seed} gate ${g + 1}`).toBe(true);
      // A gate under a chair can't be picked.
      expect(() => day.assignGates(chairGate(free[0]))).toThrow(/under a sidecar's chair/);
    }
  });

  it('lines up 4 outfits on the front row and 4 on the back, one to each even gate, whoever picks first', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const day = testDay(seed);
      const { free } = day.gatesForPlayer();
      day.assignGates(free[free.length - 1]);
      const gates = day.field.map((e) => e.gate).sort((a, b) => a - b);
      expect(gates, `seed ${seed}`).toEqual([...SIDECAR_GATES]);
      expect(gates.filter((g) => g < 8)).toHaveLength(4);
      expect(gates.filter((g) => g >= 8)).toHaveLength(4);
    }
  });

  it('the start: each outfit on its own even gate, its chair over the empty odd gate beside it, every outfit in place before the drop', () => {
    const day = testDay(11);
    const { dir } = ride(day);
    const firstTurn = -1; // Farmland's first corner is a left: gate 1 is the left edge.
    const lanes = new Map(dir.poses(-0.01).map((p) => [p.id, p]));
    const step = 1.8 / 7;
    for (const e of day.field) {
      const p = lanes.get(e.id)!;
      expect(p.state, e.id).toBe('grid');
      expect(dir.startRow(e.id)).toBe(Math.floor(e.gate / 8));
      expect(p.lane).toBeCloseTo(firstTurn * (0.9 - step * (e.gate % 8)), 6);
      // The chair sits a gate to the rider's left (lower lane), where no outfit is.
      const chair = firstTurn * (0.9 - step * (chairGate(e.gate) % 8));
      expect(chair).toBeLessThan(p.lane);
      for (const o of day.field) if (dir.startRow(o.id) === dir.startRow(e.id)) expect(Math.abs(lanes.get(o.id)!.lane - chair)).toBeGreaterThan(step / 2);
    }
    // Front row and back row alike ride into their slots before the gate drops.
    const at = arrivals(dir);
    for (const e of day.field) expect(at.get(e.id), e.id).toBeDefined();
  });

  it('never whips or scrubs, whatever the rider skill, and never loops out at the gate', () => {
    // The player at Rider Ability 99 with the Rider Trainer's tricks learned, and the pool's best jumpers.
    const pro = career(99);
    const proFlags = { ...flags, [TRICKS_FLAG]: true };
    let hops = 0;
    for (const seed of [3, 41, 77]) {
      const day = testDay(seed, structuredClone(pro), farmland, proFlags);
      expect(day.player.riderLevel).toBeUndefined();
      const { dir, traces } = ride(day);
      expect(dir.showman).toBeNull();
      for (let t = 0; t < 300; t += 0.25) {
        for (const p of dir.poses(t)) {
          // Clear of the gate, the chair stays on the track: the bike rides SIDECAR_LEFT or further right.
          if (p.state !== 'grid' && p.state !== 'retired' && (p.dist - dir.start.from) * lapMetres(day.track) > SIDECAR_SETTLE) expect(p.lane, `${p.id} at ${t}`).toBeGreaterThanOrEqual(SIDECAR_LEFT - 1e-9);
          if (!p.flight) continue;
          hops += p.flight.hops.length;
          expect(p.flight.tricks, `${p.id} at ${t}`).toBeUndefined();
          expect(p.flight.launch).toBe(1);
          expect(p.stunt).toBeUndefined();
        }
      }
      for (const tr of traces) for (const ev of tr.events) if (ev.kind === 'mistake') expect(ev.with).not.toBe('loop_out');
    }
    expect(hops).toBeGreaterThan(0);
    // The same field on solos has its showman throwing them, and the player's tricks come back.
    const solo = new RaceDay(rc, farmland, playerEntrant(rc, structuredClone(pro), 'Me', 0, proFlags), 3, 0);
    expect(solo.player.riderLevel).toBeGreaterThan(90);
    expect(ride(solo).dir.showman).not.toBeNull();
  }, 60000);

  it('counts for nothing: no prize money, no XP, and the rider\'s own bike never touched', () => {
    const c = career();
    const before = structuredClone(c.bike);
    const day = testDay(5, c);
    expect(c.bike).toEqual(before);
    expect(day.player.bike).not.toBe(c.bike);
    while (!day.done) {
      const { free } = day.gatesForPlayer();
      day.assignGates(free[0]);
      const sim = day.startMoto('steady');
      sim.runToEnd();
      const rec = day.finishMoto(sim);
      expect(rec.prize).toBe(0);
      expect(rec.xp).toEqual({});
    }
    expect(day.dayResult().podiumBonus).toBe(0);
    expect(c.bike).toEqual(before);
    expect(day.dayResult().overall.find((r) => r.id === PLAYER_ID)).toBeDefined();
  });

  it('gives the inside even gates a better start than the outside, as the solo start does', () => {
    const track = trackById(rc, 'farmland');
    expect(gateBonus(track, SIDECAR_GATES[0])).toBeGreaterThanOrEqual(gateBonus(track, SIDECAR_GATES[3]));
  });
});
