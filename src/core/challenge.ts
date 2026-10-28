import { pence, type BikesData, type Bike, type CareerState } from './career';
import { mixSeed, type Entrant } from './race';
import { RaceDay, drawField, type CpuRiderDef, type RaceContent, type VenueDef } from './raceDay';
import type { ContentError, Schema } from './validate';

// Challenges (Boss, 28 Oct 2026): an NPC by a practice track races the rider for money. The rider
// pays the entry; first place gets it back plus the same again, anything else wins nothing. Each
// challenge is one moto on its own track, repeatable straight away, with normal wear and XP.
//
// The win chance comes from the bike, not the race: each challenge is pitched at a bike class
// (50cc in Area 1), where all parts at 75% (averaged across the bike: a part at 100% and one at
// 40% count as two at 70%) gives the class's chance, more condition more chance. A bigger class
// is easier, up to a cap that is never 100%. Rider skill doesn't count in Area 1 (it will from
// Area 2). The chance is rolled first, then the moto is drawn so it plays out that way (rig()).
// Pure rules with no graphics.

export interface ChallengeOdds {
  /** Win chance with every part at 75%, and the most it can reach, by bike class. */
  classes: Record<string, { at75: number; cap: number }>;
  /** Win chance per 100% of average condition above or below 75% (1: 50% at 75% is 25% at 50%). */
  perCondition: number;
  /** The least it can be, however worn the bike. */
  floor: number;
}

export interface ChallengeDef {
  id: string;
  /** The NPC who offers it. */
  npc: string;
  /** "Mickey's challenge", for screens and messages. */
  name: string;
  /** The challenge's own track: until it is in tracks.json (and not a draft), the NPC says building. */
  track: string;
  /** The map the challenge is raced from, for the race screen's venue. */
  map: string;
  class: string;
  /** Pounds to race. A win pays it back plus the same again. */
  entry: number;
  laps: number;
  /** The challenger: a CPU rider who races every time. */
  challenger: string;
  /** Other riders drawn from this field's pool to make up the gate (none for a one-on-one). */
  field?: string;
  others: number;
  /** Opening flag; the NPC talks of other things until it is set. */
  needs?: string;
  odds: ChallengeOdds;
  /** Dialogue keys: the track isn't ready, the offer, not enough money, after a win, after a loss. */
  building: string;
  offer: string;
  short: string;
  won: string;
  lost: string;
}

export interface ChallengesData {
  challenges: ChallengeDef[];
}

/** Every part's condition averaged across the bike (a broken part counts as 0). */
export function averageCondition(bikes: BikesData, bike: Bike): number {
  const slots = bikes.slots.map((s) => bike.parts[s.id]?.condition ?? 0);
  return slots.length ? slots.reduce((a, c) => a + Math.max(0, c), 0) / slots.length : 0;
}

/** The chance of winning this challenge on this bike, 0 to 1 and never 1. */
export function winChance(def: ChallengeDef, bikes: BikesData, bike: Bike): number {
  const o = def.odds;
  const cls = o.classes[bike.class] ?? Object.values(o.classes).at(-1)!;
  const c = cls.at75 + o.perCondition * (averageCondition(bikes, bike) - 0.75);
  return Math.min(cls.cap, 0.99, Math.max(o.floor, c));
}

/** The challenge's track is built and racing. */
export function challengeReady(rc: RaceContent, def: ChallengeDef): boolean {
  return rc.tracks.tracks.some((t) => t.id === def.track);
}

/** A venue for the race screen: the challenge's track, class and map. */
export function challengeVenue(def: ChallengeDef): VenueDef {
  return { id: `challenge.${def.id}`, name: def.name, map: def.map, track: def.track, class: def.class, field: def.field };
}

/** Takes the entry. Returns the money short (in pence) instead when the rider can't pay. */
export function payChallenge(career: CareerState, def: ChallengeDef): number {
  const fee = pence(def.entry);
  if (career.money < fee) return fee - career.money;
  career.money -= fee;
  return 0;
}

/** What a finish pays, in pence: first gets the entry back plus the same again, the rest nothing. */
export function challengePrize(def: ChallengeDef, position: number, retired: boolean): number {
  return position === 1 && !retired ? pence(def.entry) * 2 : 0;
}

/** The challenger and the riders drawn to race with them. */
export function challengeField(rc: RaceContent, def: ChallengeDef, seed: number): CpuRiderDef[] {
  const challenger = rc.riders.riders.find((r) => r.id === def.challenger)!;
  if (!def.others || !def.field) return [challenger];
  const champs = new Set(rc.riders.regulars?.[def.field] ?? []);
  const pool = drawField(rc, { ...challengeVenue(def), regulars: [] }, seed).filter((r) => r.id !== def.challenger && !champs.has(r.id));
  return [challenger, ...pool.slice(0, def.others)];
}

/** One step of how much stronger (up) or weaker (down) the other riders are made to get the rolled result. */
function adjust(r: CpuRiderDef, step: number): CpuRiderDef {
  if (!step) return r;
  return {
    ...r,
    level: Math.max(1, Math.min(99, r.level + step * 2)),
    bike: { ...r.bike, condition: Math.max(0.2, Math.min(1, r.bike.condition + step * 0.08)) },
  };
}

export interface RiggedChallenge {
  /** The rolled result: the moto drawn plays out to it. */
  win: boolean;
  seed: number;
  cpus: CpuRiderDef[];
  /** The race day for the drawn moto, gates set. */
  day: RaceDay;
}

/** Seeds tried at each strength before the other riders are made stronger or weaker. */
const SEEDS_PER_STEP = 12;
const MAX_STEPS = 6;

/**
 * Rolls the result from the bike's win chance, then draws a moto that plays out that way when the
 * rider holds their starting message (auto-complete always does; a live race can still change it
 * with the pit board). Seeds are tried first with the riders as they are, then with them a step
 * stronger (for a loss) or weaker (for a win) at a time, so even a hard field can be beaten and an
 * easy one can win. A loss is one where the rider finishes behind someone, not one where the
 * bike gives out (that only happens as often as it would anyway). If nothing fits, the last moto
 * drawn is raced as it comes.
 */
export function rigChallenge(rc: RaceContent, def: ChallengeDef, player: Entrant, message: string, rng: () => number = Math.random): RiggedChallenge {
  const win = rng() < winChance(def, rc.bikes, player.bike);
  const base = (rng() * 2 ** 32) >>> 0;
  const venue = challengeVenue(def);
  let last: RiggedChallenge | null = null;
  let fallback: RiggedChallenge | null = null;
  for (let step = 0; step <= MAX_STEPS; step++) {
    for (let i = 0; i < SEEDS_PER_STEP; i++) {
      const seed = mixSeed(base, step * 1000 + i);
      const cpus = challengeField(rc, def, seed).map((r) => adjust(r, win ? -step : step));
      const day = challengeDay(rc, def, venue, player, seed, cpus);
      const sim = day.startMoto(message);
      sim.runToEnd();
      const me = sim.results().find((r) => r.player)!;
      const won = me.position === 1 && !me.retired;
      last = { win: won, seed, cpus, day: challengeDay(rc, def, venue, player, seed, cpus) };
      // A loss is beaten fair and square: a moto where the bike gives out is only raced if nothing else fits.
      if (won === win && (win || !me.retired)) return last;
      if (won === win) fallback ??= last;
    }
  }
  return fallback ?? last!;
}

/** The challenge's race day: one moto, its laps, the given riders, and the rider in the gate the draw leaves them. */
export function challengeDay(rc: RaceContent, def: ChallengeDef, venue: VenueDef, player: Entrant, seed: number, cpus: CpuRiderDef[]): RaceDay {
  const day = new RaceDay(rc, venue, structuredClone(player), seed, pence(def.entry), undefined, { motos: 1, laps: def.laps, cpus });
  day.assignGates(day.gatesForPlayer().free[0] ?? 0);
  return day;
}

const ID = /^[a-z0-9_.-]+$/;

export const CHALLENGES_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['needs', 'field'],
        fields: {
          id: { type: 'string', pattern: ID },
          npc: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          track: { type: 'string', pattern: ID },
          map: { type: 'string', pattern: ID },
          class: { type: 'string', nonEmpty: true },
          entry: { type: 'number', min: 0 },
          laps: { type: 'number', integer: true, min: 1, max: 20 },
          challenger: { type: 'string', pattern: ID },
          field: { type: 'string', nonEmpty: true },
          others: { type: 'number', integer: true, min: 0, max: 15 },
          needs: { type: 'string', pattern: ID },
          odds: {
            type: 'object',
            fields: {
              classes: { type: 'record', values: { type: 'object', fields: { at75: { type: 'number', min: 0, max: 1 }, cap: { type: 'number', min: 0, max: 0.99 } } } },
              perCondition: { type: 'number', min: 0 },
              floor: { type: 'number', min: 0, max: 0.99 },
            },
          },
          building: { type: 'string', pattern: ID },
          offer: { type: 'string', pattern: ID },
          short: { type: 'string', pattern: ID },
          won: { type: 'string', pattern: ID },
          lost: { type: 'string', pattern: ID },
        },
      },
    },
  },
};

/** Checks challenges.json against the NPCs, riders, fields, classes, maps and dialogue. */
export function checkChallenges(file: string, data: ChallengesData, c: { npcs: { id: string }[]; bikes: BikesData; riders: RaceContent['riders']; dialogue: Record<string, unknown> }, maps: Set<string>): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const seen = new Set<string>();
  data.challenges.forEach((d, i) => {
    const at = (f: string) => `challenges[${i}].${f}`;
    if (seen.has(d.id)) err(at('id'), `"${d.id}" is used twice`);
    seen.add(d.id);
    if (!c.npcs.some((n) => n.id === d.npc)) err(at('npc'), `no NPC "${d.npc}"`);
    if (!c.riders.riders.some((r) => r.id === d.challenger)) err(at('challenger'), `no rider "${d.challenger}"`);
    if (d.field && !c.riders.fields[d.field]) err(at('field'), `no field "${d.field}"`);
    if (d.others && !d.field) err(at('others'), 'other riders need a field to come from');
    if (!c.bikes.classes.some((k) => k.id === d.class)) err(at('class'), `no class "${d.class}"`);
    if (!d.odds.classes[d.class]) err(at('odds.classes'), `no odds for the challenge's own class "${d.class}"`);
    for (const [k, o] of Object.entries(d.odds.classes)) if (o.at75 > o.cap) err(at(`odds.classes.${k}`), 'at75 is above the cap');
    if (!maps.has(d.map)) err(at('map'), `no map "${d.map}"`);
    for (const k of ['building', 'offer', 'short', 'won', 'lost'] as const) if (!c.dialogue[d[k]]) err(at(k), `no dialogue "${d[k]}"`);
  });
  return errors;
}
