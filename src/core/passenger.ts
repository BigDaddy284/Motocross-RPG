import { childLevels, type SkillsData } from './skills';
import { pence, wholePounds, type Bike, type CareerState } from './career';
import type { Entrant, TrackDef } from './race';
import { PLAYER_ID, fieldRider, type RaceContent, type VenueDef } from './raceDay';
import { SIDECAR_CLASS } from './sidecar';

// Riding in Ray Crispy's chair (Boss, 4 Nov 2026): "The player is the passenger, as such gets
// buffed or added fitness XP as being a passenger is such hard work. As the bike isn't theirs
// there's no wear to worry about but the price for race and practice entry is high and winnings
// are halved as you share with the rider." Ray rides, so the outfit's pace is his riding with the
// passenger's fitness; the player earns only fitness XP, more of it than on a solo day, and their own
// bike never leaves the van. Pure rules with no graphics.

/** A sidecar rider who takes the player as passenger (NpcDef.sidecar, Ray Crispy). */
export interface PassengerTerms {
  /** The outfit's brand. */
  brand: string;
  /** How far above the venue's field the rider rides (he's a past champion): Rider Ability levels. */
  levelOver: number;
  /** Entry and practice cost this many times the venue's solo class fee. */
  feeTimes: number;
  /** The passenger's share of the prize money (the rest is the rider's). */
  prizeShare: number;
  /** Fitness XP times this: a passenger works harder than a solo rider. */
  fitnessXpTimes: number;
}

/** Where a passenger day can be raced: Motocross (outdoor) and Endurance tracks (Boss, 4 Nov 2026: "all Motocross and Endurance venues only"). */
export function passengerTrack(track: Pick<TrackDef, 'kind'>): boolean {
  const kind = track.kind ?? 'outdoor';
  return kind === 'outdoor' || kind === 'endurance';
}

/**
 * The sidecar rider's level at this venue: the field's level (or its pool's average where it has
 * none), plus levelOver, at most 99. The area's champions can still beat him, and the passenger's
 * fitness makes the difference.
 */
export function passengerRiderLevel(rc: Pick<RaceContent, 'riders'>, venue: VenueDef, terms: PassengerTerms): number {
  const field = venue.field ?? '';
  const pool = (rc.riders.fields[field] ?? []).map((id) => fieldRider(rc, field, id)?.level ?? 1);
  const base = rc.riders.fieldLevel?.[field] ?? (pool.length ? Math.round(pool.reduce((a, l) => a + l, 0) / pool.length) : 1);
  return Math.min(99, base + terms.levelOver);
}

/** The rider's outfit: the best grade in the venue's field, nearly new. Lent for the day; it is never the player's. */
export function passengerOutfit(rc: Pick<RaceContent, 'riders' | 'bikes'>, venue: VenueDef, terms: PassengerTerms): Bike {
  const ids = rc.riders.fields[venue.field ?? ''] ?? [];
  const grade = Math.max(1, ...ids.map((id) => rc.riders.riders.find((r) => r.id === id)?.bike.grade ?? 1));
  return { brand: terms.brand, class: SIDECAR_CLASS, parts: Object.fromEntries(rc.bikes.slots.map((s) => [s.id, { grade, condition: 0.95 }])) };
}

/**
 * The player in the chair: the rider's riding (every Rider Ability skill at his level here) with the
 * player's own fitness, on the rider's outfit. No setup and no tricks: it isn't their bike.
 */
export function passengerEntrant(rc: RaceContent, venue: VenueDef, career: CareerState, name: string, terms: PassengerTerms, gate = 0): Entrant {
  const level = passengerRiderLevel(rc, venue, terms);
  const own = childLevels(rc.skills, career.skills);
  const skills: Record<string, number> = { ...own };
  for (const c of rc.skills.leads.find((l) => l.id === 'rider')?.children ?? []) skills[c.id] = level;
  return { id: PLAYER_ID, name, player: true, skills, bike: passengerOutfit(rc, venue, terms), tactic: { message: 'steady' }, gate };
}

/**
 * How a passenger's work splits over the Fitness skills: hanging off the chair and holding the
 * front down is mostly strength and stamina, with agility to climb across and the calm to keep at it.
 */
export const PASSENGER_SPLIT: Readonly<Record<string, number>> = { strength: 0.35, endurance: 0.35, agility: 0.2, wellbeing: 0.1 };

/**
 * What the passenger learns from a ride: the ride's XP turned into fitness (PASSENGER_SPLIT), and no
 * riding XP (Ray rides). A solo ride's XP goes to the Rider Ability skills; in the chair the same
 * effort goes into the passenger's fitness, fitnessXpTimes as much a skill.
 */
export function passengerXp(skills: SkillsData, xp: Record<string, number>, terms: Pick<PassengerTerms, 'fitnessXpTimes'>): Record<string, number> {
  const fitness = new Set(skills.leads.find((l) => l.id === 'fitness')?.children.map((c) => c.id) ?? []);
  // Spread over as many skills as a solo ride's: each fitness skill gains fitnessXpTimes what an
  // average Rider Ability skill would on your own bike.
  const riding = skills.leads.find((l) => l.id === 'rider')?.children.length ?? 1;
  const total = (Object.values(xp).reduce((a, v) => a + v, 0) * terms.fitnessXpTimes * Object.keys(PASSENGER_SPLIT).length) / riding;
  if (!total) return {};
  return Object.fromEntries(Object.entries(PASSENGER_SPLIT).filter(([k]) => fitness.has(k)).map(([k, w]) => [k, total * w]));
}

/**
 * The outfit races in the sidecar class, which gives more XP than a small solo class; the passenger
 * learns at the venue's own class's rate (times fitnessXpTimes), so this scales the ride's XP back.
 */
export function passengerXpScale(rc: Pick<RaceContent, 'racing'>, venue: Pick<VenueDef, 'class'>): number {
  const own = rc.racing.classes[venue.class ?? '50cc']?.classXp ?? 1;
  const sidecar = rc.racing.classes[SIDECAR_CLASS]?.classXp ?? 1;
  return own / sidecar;
}

/** A passenger race day's entry at this venue, in pence: feeTimes the venue's solo class entry. */
export function passengerEntry(rc: Pick<RaceContent, 'racing'>, venue: VenueDef, terms: Pick<PassengerTerms, 'feeTimes'>): number {
  return pence(rc.racing.classes[venue.class ?? '50cc'].entry * terms.feeTimes);
}

/** A passenger practice at this venue, in pence: feeTimes the venue's solo practice fee. */
export function passengerPracticeFee(rc: Pick<RaceContent, 'racing'>, venue: VenueDef, terms: Pick<PassengerTerms, 'feeTimes'>): number {
  return wholePounds((pence(rc.racing.classes[venue.class ?? '50cc'].entry) * (venue.practiceFeePct ?? 25) * terms.feeTimes) / 100);
}

/** The NPC schema's sidecar field (content.ts). */
export const PASSENGER_SCHEMA = {
  type: 'object',
  fields: {
    brand: { type: 'string', nonEmpty: true },
    levelOver: { type: 'number', integer: true, min: 0, max: 30 },
    feeTimes: { type: 'number', min: 1 },
    prizeShare: { type: 'number', min: 0, max: 1 },
    fitnessXpTimes: { type: 'number', min: 1 },
  },
} as const;
