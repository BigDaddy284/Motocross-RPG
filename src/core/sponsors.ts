// Sponsors and reputation (Spec 16). Boss, 31 Oct 2026: in Areas 1 to 4 the area champion's
// one-off offer (the new class bike, classes.ts) stands on its own; from Area 5, Sponsored Rides
// brings contracts for a set number of race days, paid only for objectives met, with tiers from
// the local shop to a factory team, and the reputation table behind the offers. Every number is
// in data/sponsors.json.
import { pence, type CareerState } from './career';
import { mixSeed, seededRng } from './race';
import type { RaceContent, VenueDef } from './raceDay';
import type { Schema } from './validate';

export interface TierDef {
  id: string;
  name: string;
  /** Pounds per objective met, low to high. */
  pay: [number, number];
  days: number;
  minGrade: number;
  /** Early cancellation: this share of objective cash received, times (1 + days left / days). */
  cancel: number;
  /** The "finish top N" objective for the tier. */
  topN: number;
  names: string[];
}

export interface SponsorsData {
  fromArea: number;
  reputation: { max: number; finish: number; championshipWin: number; objectiveMet: number; objectiveFailed: number; dropped: number; terminated: number; tierWeight: Record<string, number> };
  cpuPerLevel: number;
  offers: { base: number; perRep: number; max: number; topShare: Record<string, number> };
  tiers: TierDef[];
  objectives: { perDay: [number, number]; warnAfter: number; endAfter: number; presentationCondition: number };
  factoryFlag: string;
  hints: { below: number; text: string }[];
}

export interface Offer {
  tier: string;
  name: string;
  /** Pounds per objective met. */
  pay: number;
  days: number;
  minGrade: number;
}

export interface Contract extends Offer {
  daysDone: number;
  failStreak: number;
  /** Pence paid so far. */
  cashReceived: number;
  seed: number;
}

export type Objective = { kind: 'top'; n: number } | { kind: 'rival'; rider: string } | { kind: 'finish' } | { kind: 'presentation' };

/** What the race day gives the settlement: the player's overall place and moto finishes, the rival's place, and the bike as signed on. */
export interface DayFacts {
  position: number;
  positions: (number | null)[];
  /** Overall positions by rider id, for the rival objective. */
  overall: Record<string, number>;
  /** Condition of every fitted part when the rider signed on. */
  partsAtStart: Record<string, { condition: number }>;
  /** The kind of day for the reputation weight: local, local_champion, main or major. */
  kind: string;
}

export interface DaySettlement {
  lines: string[];
  /** Pence earned from objectives. */
  money: number;
  reputation: number;
  ended: boolean;
  warning: boolean;
}

// ---- reputation ----

export const reputation = (career: CareerState): number => career.reputation ?? 0;

export function addReputation(data: SponsorsData, career: CareerState, by: number): number {
  career.reputation = Math.max(0, Math.min(data.reputation.max, Math.round((career.reputation ?? 0) + by)));
  return career.reputation;
}

/** Spec 16.1: a moto finish is worth (11 - position) × the day's tier weight, never less than 0. */
export const finishReputation = (data: SponsorsData, position: number | null, kind: string): number =>
  position === null ? 0 : Math.max(0, (data.reputation.finish - position) * (data.reputation.tierWeight[kind] ?? data.reputation.tierWeight.local));

/** A CPU rider's fixed score on the table: their level times cpuPerLevel. */
export const cpuReputation = (data: SponsorsData, level: number): number => Math.min(data.reputation.max, level * data.cpuPerLevel);

/** The share of the table's riders the player sits above (0 to 1). */
export function tableShare(data: SponsorsData, rc: RaceContent, career: CareerState): number {
  const riders = rc.riders.riders;
  if (!riders.length) return 1;
  const mine = reputation(career);
  return riders.filter((r) => cpuReputation(data, r.level) < mine).length / riders.length;
}

/** The Sponsors' secret table: everyone by score, the player included. */
export function secretTable(data: SponsorsData, rc: RaceContent, career: CareerState, playerName: string): { name: string; score: number; player: boolean }[] {
  const rows = rc.riders.riders.map((r) => ({ name: r.name, score: cpuReputation(data, r.level), player: false }));
  rows.push({ name: playerName, score: reputation(career), player: true });
  return rows.sort((a, b) => b.score - a.score);
}

/** What the garage says about the rider's name among sponsors (Spec 16.0, early game). */
export function reputationHint(data: SponsorsData, career: CareerState): string {
  const rep = reputation(career);
  return data.hints.find((h) => rep < h.below)?.text ?? data.hints.at(-1)?.text ?? '';
}

// ---- offers ----

/** Whether Sponsored Rides has started: Area fromArea is open. */
export const sponsorsOpen = (data: SponsorsData, flags: Record<string, boolean>): boolean => !!flags[`area.${data.fromArea}.open`];

/** The highest tier the rider's standing on the table opens. */
export function topTier(data: SponsorsData, share: number): string {
  let top = 'T2';
  for (const t of data.tiers) {
    const need = data.offers.topShare[t.id];
    if (need !== undefined && share >= need) top = t.id;
  }
  return top;
}

/** Opens an offer window: the offers the rider's reputation and standing bring, deterministic for the seed. */
export function makeOffers(data: SponsorsData, rc: RaceContent, career: CareerState, seed: number): Offer[] {
  const rep = reputation(career);
  const n = Math.min(data.offers.max, data.offers.base + Math.floor(rep / data.offers.perRep));
  const top = data.tiers.findIndex((t) => t.id === topTier(data, tableShare(data, rc, career)));
  const rng = seededRng(mixSeed(seed, 0x73706f6e));
  const out: Offer[] = [];
  for (let i = 0; i < n; i++) {
    // Offers spread from the top tier down, the better ones rarer.
    const tier = data.tiers[Math.max(0, top - Math.floor(rng() * rng() * (top + 1)))];
    const name = tier.names[Math.floor(rng() * tier.names.length)];
    if (out.some((o) => o.name === name)) continue;
    const pay = Math.round(tier.pay[0] + rng() * (tier.pay[1] - tier.pay[0]));
    out.push({ tier: tier.id, name, pay, days: tier.days, minGrade: tier.minGrade });
  }
  return out.sort((a, b) => b.pay - a.pay);
}

/** Why the rider can't sign this offer, or null. */
export function offerProblem(offer: Offer, career: CareerState): string | null {
  if (career.sponsor) return `You're riding for ${career.sponsor.name}. Drop them first.`;
  const low = Object.entries(career.bike.parts).filter(([, p]) => p.grade < offer.minGrade);
  if (low.length) return `${offer.name} wants every part at Grade ${offer.minGrade} or better: ${low.length} of yours ${low.length === 1 ? 'is' : 'are'} below.`;
  return null;
}

export function signOffer(data: SponsorsData, offer: Offer, career: CareerState, flags: Record<string, boolean>): { ok: boolean; message: string } {
  const problem = offerProblem(offer, career);
  if (problem) return { ok: false, message: problem };
  career.sponsor = { ...offer, daysDone: 0, failStreak: 0, cashReceived: 0, seed: mixSeed(reputation(career), career.counters['race.days'] ?? 0) };
  career.sponsorOffers = [];
  if (offer.tier === data.tiers.at(-1)?.id) flags[data.factoryFlag] = true;
  return { ok: true, message: `Signed with ${offer.name}: ${offer.days} race days, £${offer.pay} for every objective met. No signing bonus: they pay for results.` };
}

/** Pence owed for dropping the sponsor now (Spec 16.2), and the reputation it costs. */
export function dropPenalty(data: SponsorsData, contract: Contract): number {
  const tier = data.tiers.find((t) => t.id === contract.tier)!;
  const remaining = Math.max(0, contract.days - contract.daysDone);
  return Math.round(tier.cancel * contract.cashReceived * (1 + remaining / contract.days));
}

export function dropSponsor(data: SponsorsData, career: CareerState): { ok: boolean; message: string } {
  const c = career.sponsor;
  if (!c) return { ok: false, message: 'You have no sponsor.' };
  const penalty = dropPenalty(data, c);
  if (career.money < penalty) return { ok: false, message: `Leaving ${c.name} now costs £${penalty / 100}. You can't afford it.` };
  career.money -= penalty;
  delete career.sponsor;
  addReputation(data, career, data.reputation.dropped);
  return { ok: true, message: `You've left ${c.name}${penalty ? `, paying back £${penalty / 100}` : ''}. Word gets round.` };
}

// ---- objectives and the race day ----

/** The day's objectives under the contract: one or two, drawn from the contract's seed and the day number. */
export function dayObjectives(data: SponsorsData, rc: RaceContent, contract: Contract, venue: VenueDef): Objective[] {
  const tier = data.tiers.find((t) => t.id === contract.tier)!;
  const rng = seededRng(mixSeed(contract.seed, contract.daysDone + 1));
  const [lo, hi] = data.objectives.perDay;
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  const rival = (venue.field && rc.riders.regulars?.[venue.field]?.[0]) ?? venue.regulars?.[0];
  const pool: Objective[] = [{ kind: 'top', n: tier.topN }, { kind: 'finish' }, { kind: 'presentation' }];
  if (rival) pool.push({ kind: 'rival', rider: rival });
  const out: Objective[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export function objectiveText(rc: RaceContent, o: Objective, data: SponsorsData): string {
  switch (o.kind) {
    case 'top': return o.n === 1 ? 'Win the day' : `Finish in the top ${o.n} overall`;
    case 'rival': return `Beat ${rc.riders.riders.find((r) => r.id === o.rider)?.name ?? o.rider} overall`;
    case 'finish': return 'Finish both motos';
    case 'presentation': return `Presentation: every part at ${Math.round(data.objectives.presentationCondition * 100)}% or better when you sign on`;
  }
}

export function objectiveMet(data: SponsorsData, o: Objective, facts: DayFacts): boolean {
  switch (o.kind) {
    case 'top': return facts.position <= o.n;
    case 'rival': return facts.overall[o.rider] === undefined || facts.position < facts.overall[o.rider];
    case 'finish': return facts.positions.every((p) => p !== null);
    case 'presentation': return Object.values(facts.partsAtStart).every((p) => p.condition >= data.objectives.presentationCondition);
  }
}

/**
 * Settles a race day: reputation for the finishes, then the sponsor's objectives (paid per one met,
 * a warning after two failed in a row, the contract ended after three), and the contract's days.
 */
export function settleDay(data: SponsorsData, rc: RaceContent, career: CareerState, venue: VenueDef, facts: DayFacts): DaySettlement {
  const lines: string[] = [];
  let rep = 0;
  for (const p of facts.positions) rep += finishReputation(data, p, facts.kind);
  let money = 0;
  let ended = false;
  let warning = false;
  const c = career.sponsor;
  if (c) {
    const objectives = dayObjectives(data, rc, c, venue);
    for (const o of objectives) {
      const met = objectiveMet(data, o, facts);
      lines.push(`${met ? '✓' : '✗'} ${objectiveText(rc, o, data)}${met ? `: £${c.pay}` : ''}`);
      if (met) {
        money += pence(c.pay);
        rep += data.reputation.objectiveMet;
        c.failStreak = 0;
      } else {
        rep += data.reputation.objectiveFailed;
        c.failStreak++;
      }
    }
    c.cashReceived += money;
    c.daysDone++;
    if (c.failStreak >= data.objectives.endAfter) {
      ended = true;
      rep += data.reputation.terminated;
      lines.push(`${c.name} have ended your contract: ${c.failStreak} objectives missed in a row.`);
      delete career.sponsor;
    } else if (c.failStreak >= data.objectives.warnAfter) {
      warning = true;
      lines.push(`${c.name} are not happy: ${c.failStreak} missed in a row. One more and it's over.`);
    } else if (c.daysDone >= c.days) {
      ended = true;
      lines.push(`That was the last race day of your ${c.name} deal: £${c.cashReceived / 100} earned in all. Offers come at the end of a championship.`);
      delete career.sponsor;
    } else lines.push(`${c.name}: ${c.days - c.daysDone} race ${c.days - c.daysDone === 1 ? 'day' : 'days'} to go.`);
  }
  career.money += money;
  addReputation(data, career, rep);
  return { lines, money, reputation: rep, ended, warning };
}

// ---- content checks ----

const ID = /^[a-z0-9_.-]+$/;
const TIER = /^T[1-5]$/;

export const SPONSORS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    fromArea: { type: 'number', integer: true, min: 1, max: 8 },
    reputation: { type: 'object', fields: { max: { type: 'number', min: 1 }, finish: { type: 'number' }, championshipWin: { type: 'number' }, objectiveMet: { type: 'number' }, objectiveFailed: { type: 'number' }, dropped: { type: 'number' }, terminated: { type: 'number' }, tierWeight: { type: 'record', values: { type: 'number', min: 0 } } } },
    cpuPerLevel: { type: 'number', min: 0 },
    offers: { type: 'object', fields: { base: { type: 'number', integer: true, min: 1 }, perRep: { type: 'number', min: 1 }, max: { type: 'number', integer: true, min: 1 }, topShare: { type: 'record', values: { type: 'number', min: 0, max: 1 } } } },
    tiers: { type: 'array', minItems: 1, items: { type: 'object', fields: { id: { type: 'string', pattern: TIER }, name: { type: 'string', nonEmpty: true }, pay: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', min: 0 } }, days: { type: 'number', integer: true, min: 1 }, minGrade: { type: 'number', integer: true, min: 1, max: 10 }, cancel: { type: 'number', min: 0, max: 1 }, topN: { type: 'number', integer: true, min: 1 }, names: { type: 'array', minItems: 1, items: { type: 'string', nonEmpty: true } } } } },
    objectives: { type: 'object', fields: { perDay: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', integer: true, min: 1, max: 4 } }, warnAfter: { type: 'number', integer: true, min: 1 }, endAfter: { type: 'number', integer: true, min: 1 }, presentationCondition: { type: 'number', min: 0, max: 1 } } },
    factoryFlag: { type: 'string', pattern: ID },
    hints: { type: 'array', minItems: 1, items: { type: 'object', fields: { below: { type: 'number' }, text: { type: 'string', nonEmpty: true } } } },
  },
};

/** Cross-checks: tiers in order with rising pay, topShare names tiers, the weights cover the day kinds, hints rise. */
export function checkSponsors(file: string, data: SponsorsData): { file: string; field: string; message: string }[] {
  const errors: { file: string; field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  data.tiers.forEach((t, i) => {
    if (t.id !== `T${i + 1}`) err(`tiers[${i}].id`, `expected T${i + 1}`);
    if (t.pay[0] > t.pay[1]) err(`tiers[${i}].pay`, 'low pay is above high');
    if (i > 0 && t.pay[0] < data.tiers[i - 1].pay[1]) err(`tiers[${i}].pay`, 'pay must rise with the tier');
  });
  for (const id of Object.keys(data.offers.topShare)) if (!data.tiers.some((t) => t.id === id)) err(`offers.topShare.${id}`, 'no such tier');
  for (const k of ['local', 'local_champion', 'main']) if (data.reputation.tierWeight[k] === undefined) err('reputation.tierWeight', `no weight for "${k}"`);
  if (data.objectives.warnAfter >= data.objectives.endAfter) err('objectives.warnAfter', 'the warning must come before the end');
  data.hints.forEach((h, i) => i > 0 && h.below <= data.hints[i - 1].below && err(`hints[${i}].below`, 'hints must rise'));
  return errors;
}
