import { pence, type CareerState } from './career';
import { mixSeed, seededRng } from './race';
import { PLAYER_ID, type CpuRiderDef, type RaceContent, type RaceDay, type VenueDef } from './raceDay';
import type { ContentError, Schema } from './validate';

// Championships (Spec 12.5, 18.6): a series of rounds at the area's venues, each entered
// separately at the race office, with qualifying, the same field of 20 every round, points for
// every moto and a reward for the top three. No calendar: one stays active until it is finished,
// started again or given up. Pure rules with no graphics.

export interface ChampionshipDef {
  id: string;
  name: string;
  /** For buttons and the race screen: "Local Champion". */
  short: string;
  class: string;
  /** The riders.json field the CPU riders come from. */
  field: string;
  /** CPU riders drawn once on entering, who race every round. */
  size: number;
  /** Riders from the pool always in it, on top of the field's own regulars. */
  regulars?: string[];
  /** Venue ids, in round order. */
  rounds: string[];
  /** Entry and prize money, times the class's (Spec 14.2 event tiers). */
  entryTimes: number;
  purseTimes: number;
  qualifyingLaps: number;
  /** Flags that open it. */
  needs?: string[];
  /** By final position: prize money in pounds, a flag to set and what it is called. */
  rewards: { money: number; flag?: string; title?: string }[];
  /** XP and purse share once it has been won before (Round 125). */
  replay: number;
  /** Said when it is won for the first time. */
  won?: string;
}

export interface ChampionshipsData {
  championships: ChampionshipDef[];
}

/** One round as it was raced: qualifying order and every rider's moto finishes (null for a DNF). */
export interface RoundRecord {
  venue: string;
  qualifying: string[];
  motos: Record<string, number | null>[];
}

export interface ActiveChampionship {
  /** Seeds the field drawn on entering. */
  seed: number;
  /** The CPU riders, by id, the same every round. */
  field: string[];
  replay: boolean;
  rounds: RoundRecord[];
}

export interface ChampionshipState {
  active: Record<string, ActiveChampionship>;
  /** Finished championships: how many times, the titles won and the best final position. */
  done: Record<string, { runs: number; wins: number; best: number }>;
}

export const CHAMPIONSHIPS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    championships: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['regulars', 'needs', 'won'],
        fields: {
          id: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
          name: { type: 'string', nonEmpty: true },
          short: { type: 'string', nonEmpty: true },
          class: { type: 'string', nonEmpty: true },
          field: { type: 'string', nonEmpty: true },
          size: { type: 'number', integer: true, min: 1, max: 23 },
          regulars: { type: 'array', items: { type: 'string', nonEmpty: true } },
          rounds: { type: 'array', minItems: 1, items: { type: 'string', nonEmpty: true } },
          entryTimes: { type: 'number', min: 0 },
          purseTimes: { type: 'number', min: 0 },
          qualifyingLaps: { type: 'number', integer: true, min: 1, max: 10 },
          needs: { type: 'array', items: { type: 'string', nonEmpty: true } },
          rewards: {
            type: 'array',
            minItems: 1,
            items: { type: 'object', optional: ['flag', 'title'], fields: { money: { type: 'number', min: 0 }, flag: { type: 'string', nonEmpty: true }, title: { type: 'string', nonEmpty: true } } },
          },
          replay: { type: 'number', min: 0, max: 1 },
          won: { type: 'string', nonEmpty: true },
        },
      },
    },
  },
};

/** Cross-checks: every venue, field, rider and class named exists, and the field fits the start. */
export function checkChampionships(data: ChampionshipsData, rc: Pick<RaceContent, 'tracks' | 'riders' | 'racing'>): ContentError[] {
  const file = 'data/championships.json';
  const errors: ContentError[] = [];
  const ids = new Set<string>();
  data.championships.forEach((c, i) => {
    const err = (f: string, message: string) => errors.push({ file, field: `championships[${i}].${f}`, message });
    if (ids.has(c.id)) err('id', `"${c.id}" is used twice`);
    ids.add(c.id);
    const pool = rc.riders.fields[c.field];
    if (!pool) err('field', `no field "${c.field}" in data/riders.json`);
    else if (pool.length < c.size) err('size', `${c.size} riders, but the ${c.field} pool has ${pool.length}`);
    c.regulars?.forEach((id, j) => pool && !pool.includes(id) && err(`regulars[${j}]`, `"${id}" isn't in the ${c.field} pool`));
    if (!rc.racing.classes[c.class]) err('class', `no class "${c.class}" in data/racing.json`);
    c.rounds.forEach((v, j) => {
      const venue = rc.tracks.venues.find((x) => x.id === v);
      if (!venue) err(`rounds[${j}]`, `no venue "${v}"`);
      else if (!venue.track || venue.practiceOnly || venue.locked) err(`rounds[${j}]`, `${venue.name} has no race day to hold a round`);
      else if (venue.class !== c.class) err(`rounds[${j}]`, `${venue.name} races ${venue.class}, not ${c.class}`);
    });
  });
  return errors;
}

export function champState(career: CareerState): ChampionshipState {
  career.champs ??= { active: {}, done: {} };
  return career.champs;
}

export function champById(data: ChampionshipsData, id: string): ChampionshipDef | undefined {
  return data.championships.find((c) => c.id === id);
}

/** The championship's CPU riders: the field's and its own regulars, then drawn from the pool by the seed. */
export function drawChampField(rc: Pick<RaceContent, 'riders'>, def: ChampionshipDef, seed: number): string[] {
  const pool = rc.riders.fields[def.field] ?? [];
  const always = new Set([...(rc.riders.regulars?.[def.field] ?? []), ...(def.regulars ?? [])]);
  const regulars = pool.filter((id) => always.has(id));
  const rest = pool.filter((id) => !always.has(id));
  const rng = seededRng(mixSeed(seed, 0x63686d70));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...regulars, ...rest].slice(0, Math.max(def.size, regulars.length));
}

export function champRiders(rc: Pick<RaceContent, 'riders'>, active: ActiveChampionship): CpuRiderDef[] {
  return active.field.map((id) => rc.riders.riders.find((r) => r.id === id)).filter((r): r is CpuRiderDef => !!r);
}

/** Why the rider can't enter, or null. */
export function champProblem(rc: Pick<RaceContent, 'tracks'>, def: ChampionshipDef, flags: Record<string, boolean>): string | null {
  const missing = (def.needs ?? []).find((f) => !flags[f]);
  if (missing === 'first_race_done') return 'Race a local race day first.';
  if (missing?.startsWith('badge.')) return 'Needs the badge from this area’s Local Champion Championship.';
  if (missing) return 'Not open to you yet.';
  for (const v of def.rounds) {
    const venue = rc.tracks.venues.find((x) => x.id === v);
    if (venue?.needs && !flags[venue.needs]) return `Find ${venue.name} first: every round's track must be open to you.`;
  }
  return null;
}

export function enter(career: CareerState, rc: Pick<RaceContent, 'riders'>, def: ChampionshipDef, seed: number): ActiveChampionship {
  const state = champState(career);
  const active: ActiveChampionship = { seed, field: drawChampField(rc, def, seed), replay: (state.done[def.id]?.wins ?? 0) > 0, rounds: [] };
  state.active[def.id] = active;
  return active;
}

/** Gives up a championship: its points are lost. */
export function withdraw(career: CareerState, def: ChampionshipDef): void {
  delete champState(career).active[def.id];
}

/** The venue id of the next round, or null when every round is done. */
export function nextRoundVenue(def: ChampionshipDef, active: ActiveChampionship): string | null {
  return def.rounds[active.rounds.length] ?? null;
}

/** Active championships whose next round is at this venue. */
export function roundsHere(data: ChampionshipsData, career: CareerState, venue: VenueDef): ChampionshipDef[] {
  const state = career.champs;
  if (!state) return [];
  return data.championships.filter((d) => state.active[d.id] && nextRoundVenue(d, state.active[d.id]) === venue.id);
}

/** Entry fee for a round, in pence (Spec 14.2: class entry times the tier). */
export function roundEntry(rc: Pick<RaceContent, 'racing'>, def: ChampionshipDef): number {
  return pence(rc.racing.classes[def.class].entry * def.entryTimes);
}

/** What a round's race day runs with: the fixed field, qualifying and the purse (a replay's share). */
export function roundOptions(rc: Pick<RaceContent, 'riders'>, def: ChampionshipDef, active: ActiveChampionship) {
  const share = active.replay ? def.replay : 1;
  return { cpus: champRiders(rc, active), qualifyingLaps: def.qualifyingLaps, purseTimes: def.purseTimes * share, xpTimes: share };
}

/** Puts a finished round's results on the championship. */
export function recordRound(active: ActiveChampionship, venue: VenueDef, day: RaceDay): RoundRecord {
  const rec: RoundRecord = {
    venue: venue.id,
    qualifying: day.qualifying?.results.map((r) => r.id) ?? [],
    motos: day.motos.map((m) => Object.fromEntries(m.results.map((r) => [r.id, r.retired ? null : r.position]))),
  };
  active.rounds.push(rec);
  return rec;
}

export interface StandingRow {
  id: string;
  player: boolean;
  points: number;
  /** Points scored at each round so far. */
  byRound: number[];
  wins: number;
  position: number;
}

/**
 * The table (Spec 12.4): points for every moto, DNF 0. Ties go to the most moto wins, then the best
 * result in the series' latest moto.
 */
export function standings(points: number[], active: ActiveChampionship): StandingRow[] {
  const ids = [PLAYER_ID, ...active.field];
  const motos = active.rounds.flatMap((r) => r.motos);
  const last = motos.at(-1);
  const rows = ids.map((id) => {
    const byRound = active.rounds.map((r) => r.motos.reduce((a, m) => a + (m[id] ? (points[m[id]! - 1] ?? 0) : 0), 0));
    return { id, player: id === PLAYER_ID, points: byRound.reduce((a, b) => a + b, 0), byRound, wins: motos.filter((m) => m[id] === 1).length, position: 0 };
  });
  const lastPos = (id: string) => last?.[id] ?? Infinity;
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || lastPos(a.id) - lastPos(b.id) || ids.indexOf(a.id) - ids.indexOf(b.id));
  rows.forEach((r, i) => (r.position = i + 1));
  return rows;
}

/** Can the player still win it? True while the points left could take them past the leader (ties count as possible). */
export function titlePossible(def: ChampionshipDef, points: number[], active: ActiveChampionship, motosPerRound = 2): boolean {
  const table = standings(points, active);
  const me = table.find((r) => r.player)!;
  const best = Math.max(...table.filter((r) => !r.player).map((r) => r.points));
  const left = (def.rounds.length - active.rounds.length) * motosPerRound * (points[0] ?? 0);
  return me.points + left >= best;
}

export interface ChampionshipFinish {
  position: number;
  /** Pence. */
  money: number;
  flag?: string;
  title?: string;
  /** First time this championship has been won. */
  firstWin: boolean;
}

/**
 * Closes a championship after its last round: the reward for the top three (a replay's share of
 * the money, and no flag it already set), and the record of it.
 */
export function finishChampionship(career: CareerState, flags: Record<string, boolean>, def: ChampionshipDef, points: number[]): ChampionshipFinish {
  const state = champState(career);
  const active = state.active[def.id];
  const me = standings(points, active).find((r) => r.player)!;
  const reward = def.rewards[me.position - 1];
  const share = active.replay ? def.replay : 1;
  const record = (state.done[def.id] ??= { runs: 0, wins: 0, best: me.position });
  const firstWin = me.position === 1 && record.wins === 0;
  record.runs++;
  if (me.position === 1) record.wins++;
  record.best = Math.min(record.best, me.position);
  delete state.active[def.id];
  const money = reward ? Math.round(pence(reward.money) * share) : 0;
  career.money += money;
  if (reward?.flag) flags[reward.flag] = true;
  return { position: me.position, money, flag: reward?.flag, title: me.position === 1 && !firstWin ? undefined : reward?.title, firstWin };
}
