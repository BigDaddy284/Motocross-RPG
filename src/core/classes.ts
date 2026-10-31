// Bike classes and the class milestone (GDD 6.4, 8.1; Spec 18.3; Boss, 30 and 31 Oct 2026). The
// classes run in order from 50cc to 60+ Vets. A class opens at its Rider Ability level, and the
// rider moves up to it by winning the main championship of the class below (its milestone) and
// collecting the new bike at the class dealer: the champion's sponsor offers a stock bike of their
// brand for nothing, or the rider buys a stock Grade 1 bike of any brand. The old bike retires.

import type { Bike, BikesData, CareerState } from './career';
import type { ChampionshipsData } from './championship';
import { partPrice, type ShopsData } from './shops';
import { leadLevel, type SkillsData } from './skills';

export interface ClassDef {
  id: string;
  name: string;
  ceiling: number;
  /** Rider Ability level that unlocks the class (GDD 6.4). */
  unlock?: number;
  youth?: boolean;
  /** The world-map bike picture to use while the class has none of its own. */
  mapImage?: string;
}

/** A bike the rider has moved on from (GDD 8.1): kept as it was, unrideable. */
export interface RetiredBike {
  bike: Bike;
  /** The championship whose win retired it. */
  milestone: string;
}

export const classIndex = (bikes: BikesData, cls: string): number => bikes.classes.findIndex((c) => c.id === cls);

export const classDef = (bikes: BikesData, cls: string): ClassDef | undefined => bikes.classes.find((c) => c.id === cls);

export const className = (bikes: BikesData, cls: string): string => classDef(bikes, cls)?.name ?? cls;

/** Whether class a is b or a bigger class. */
export const classAtLeast = (bikes: BikesData, a: string, b: string): boolean => classIndex(bikes, a) >= classIndex(bikes, b);

/** The class after this one, or null at the top. */
export function nextClass(bikes: BikesData, cls: string): ClassDef | null {
  const i = classIndex(bikes, cls);
  return i >= 0 ? (bikes.classes[i + 1] ?? null) : null;
}

/**
 * The class a race day runs in: the rider's own class when it is the venue's class or bigger
 * (Spec 18.0: a venue's class is a minimum, bigger classes are allowed), else null, as a smaller
 * bike can't enter. Every CPU rider then races a bike of that class.
 */
export function dayClass(bikes: BikesData, venueClass: string | undefined, bikeClass: string): string | null {
  const min = venueClass ?? bikes.classes[0].id;
  return classAtLeast(bikes, bikeClass, min) ? bikeClass : null;
}

/** The save flag for a class milestone won (Spec 18.3 step 2). */
export const milestoneFlag = (cls: string) => `milestone.${cls}`;
/** The save flag for a class's bike collected (step 3): the rider now races that class. */
export const classFlag = (cls: string) => `class.${cls}`;

export type MilestoneStatus =
  | { kind: 'none' }
  | { kind: 'needLevel'; cls: ClassDef; level: number; have: number }
  | { kind: 'ready'; cls: ClassDef };

/**
 * The next class the rider can collect: its milestone won and the bike not yet collected. They
 * still need the class's Rider Ability level to take it (GDD 6.4).
 */
export function milestoneStatus(bikes: BikesData, skills: SkillsData, career: CareerState, flags: Record<string, boolean>): MilestoneStatus {
  const next = nextClass(bikes, career.bike.class);
  if (!next || !flags[milestoneFlag(next.id)] || flags[classFlag(next.id)]) return { kind: 'none' };
  const rider = skills.leads.find((l) => l.id === 'rider');
  const have = rider ? leadLevel(skills, career.skills, rider) : 1;
  const level = next.unlock ?? 1;
  return have >= level ? { kind: 'ready', cls: next } : { kind: 'needLevel', cls: next, level, have };
}

/** A new stock bike: Grade 1 parts, all at 100%. */
export function stockBike(bikes: BikesData, brand: string, cls: string): Bike {
  return { brand, class: cls, parts: Object.fromEntries(bikes.slots.map((s) => [s.id, { grade: 1, condition: 1 }])) };
}

/** What a stock Grade 1 bike of a class costs at the class dealer, in pence: the sum of its parts' prices (Spec 14.4). */
export function stockBikePrice(shops: ShopsData, bikes: BikesData, cls: string): number {
  return bikes.slots.reduce((a, s) => a + partPrice(shops, s.id, 1, cls), 0);
}

/**
 * The champion's sponsor's brand for a class: one of the four, fixed for the career and class so
 * the offer doesn't change between visits (Areas 1 to 4: a one-off offer with no contract, Boss
 * 31 Oct 2026).
 */
export function sponsorBrand(bikes: BikesData, career: CareerState, cls: string): string {
  let h = 2166136261;
  for (const ch of `${career.shops?.seed ?? 0}:${cls}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return bikes.brands[(h >>> 0) % bikes.brands.length].id;
}

/** The championship that is a class's milestone. */
export const milestoneOf = (champs: ChampionshipsData, cls: string) => champs.championships.find((c) => c.milestone === cls);

export type CollectResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Collects the new class's bike: the old one retires with its exact parts (GDD 8.1) and the new
 * stock bike takes its place. Free from the sponsor, or paid at the class dealer.
 */
export function collectBike(bikes: BikesData, champs: ChampionshipsData, career: CareerState, flags: Record<string, boolean>, brand: string, pricePence: number): CollectResult {
  const next = nextClass(bikes, career.bike.class);
  if (!next || !flags[milestoneFlag(next.id)]) return { ok: false, message: 'No new class to collect yet.' };
  if (career.money < pricePence) return { ok: false, message: `You're short: a stock ${next.name} is ${pricePence / 100 | 0} pounds.` };
  if (!bikes.brands.some((b) => b.id === brand)) return { ok: false, message: `No brand "${brand}".` };
  career.money -= pricePence;
  career.retired ??= [];
  career.retired.push({ bike: career.bike, milestone: milestoneOf(champs, next.id)?.id ?? '' });
  career.bike = stockBike(bikes, brand, next.id);
  flags[classFlag(next.id)] = true;
  const brandName = bikes.brands.find((b) => b.id === brand)?.name ?? brand;
  return { ok: true, message: `Your ${brandName} ${next.name} is ready: Grade 1 all round, brand new. The old bike goes on display, as it was.` };
}
