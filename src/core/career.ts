// The rider's career state beyond where they stand: money, the bike, the bag, the opening chain
// and shift work. Pure rules with no graphics, so they can be tested and reused by a later
// standalone economy tool (GDD 2.2).

import type { ChampionshipState } from './championship';
import type { SetupState } from './setup';
import type { ErrandState } from './errands';
import type { JobState } from './jobs';
import type { ClassDef, RetiredBike } from './classes';
import type { ShopState, SparePart } from './shops';
import type { Contract, Offer } from './sponsors';
import type { WorldMapData } from './worldMap';
import { newSkillState, type SkillState } from './skills';

export interface StatDef {
  id: string;
  name: string;
}

export interface SlotDef {
  id: string;
  name: string;
  /** How much of each bike stat this slot supplies. Each stat's weights add up to 1 across slots. */
  weights: Record<string, number>;
  engine?: boolean;
}

export interface BrandDef {
  id: string;
  name: string;
  starter: string;
  character: string;
  /** Stat multipliers for the brand's frame character. They add up to the number of stats, so no brand is best. */
  lean: Record<string, number>;
}

export interface BikesData {
  stats: StatDef[];
  slots: SlotDef[];
  /** In class order, 50cc first (core/classes.ts). */
  classes: ClassDef[];
  starter: { class: string; grade: number; condition: [number, number]; brokenSlot: string };
  brands: BrandDef[];
}

export interface ItemDef {
  name: string;
  desc: string;
  part?: { slot: string; grade: number; condition: number };
}

export interface StoryEffects {
  /** Pounds, positive or negative. */
  money?: number;
  give?: string[];
  take?: string[];
  /** Fits a part item from the bag into its bike slot. */
  fit?: string;
  flags?: string[];
  /** Spare parts for the bag, in the bike's class (Mad Maggie's test part, Areas 2 to 8 plan). */
  giveParts?: { slot: string; grade: number; condition: number; mods?: { type: string; value: number }[] }[];
}

export interface StoryStep {
  id: string;
  journal: string;
  on: { talk?: string; use?: string; map?: string };
  /** Uses of different objects needed before the step completes (default 1). */
  times?: number;
  /** Money, items, and lead skill levels (by lead id: Mad Maggie's machine needs Mechanical Engineer 30, Boss 30 Oct 2026). */
  needs?: { money?: number; items?: string[]; skills?: Record<string, number> };
  /** Lines shown when the needs are not met. */
  notReady?: string;
  /** While the rider is short of needs.money, the tutorial markers point here to earn it (Boss, 28 Oct 2026). */
  earn?: { use: string; maps: string[] };
  /** Until this flag is set (on first getting in), the tutorial markers point to the van (Boss, 28 Oct 2026). */
  markVan?: string;
  confirm?: string;
  lines?: string;
  effects?: StoryEffects;
  toast?: string;
}

/**
 * A later chain of steps (the area intros, Areas 2 to 8 plan, Boss 31 Oct 2026): played like the
 * opening chain once it has started (openChains), after the opening chain and any chain before it.
 */
export interface StoryChain {
  id: string;
  /** The flag that starts it: the area's open flag. */
  needs: string;
  steps: StoryStep[];
}

export interface StoryData {
  startMoney: number;
  intro: string;
  steps: StoryStep[];
  done: string;
  chains?: StoryChain[];
  /** Task lines once the opening chain is over: the first whose if is set, or whose unless is not. */
  /** The task line once the opening chain is done: the first whose if is set, or whose unless is not. talk marks that NPC on the map, as a story step's NPC is. */
  after?: { if?: string; unless?: string; text: string; talk?: string }[];
}

export interface JobDef {
  id: string;
  name: string;
  map: string;
  /** Object that starts a shift. */
  start: string;
  product: string;
  batch: number;
  /** Pounds per part. */
  pay: number;
  needs?: string;
  /** The facility the job locks while it is open (Spec 15.1); the job's own id when left out. */
  facility?: string;
  /** Spec 15.3 facilityBonus, 0 to 1.5, on the grade of the kept part. */
  facilityBonus?: number;
  /** Bike slots the employer's kept part can be, one at random per finished batch (Spec 15.1). */
  keeps?: string[];
  /** xp: child skill XP for each go at the station (Spec 3.2). */
  stations: { object: string; label: string; ms: number; xp?: Record<string, number> }[];
}

export interface PlaceDef {
  /** The map it arrives on, or "mod-tracks" for the mod track list (mods: true). */
  map: string;
  /** The spawn on that map; none for the mod track list. */
  spawn?: string;
  name: string;
  note: string;
  /** Not a map: picking it opens the list of mod tracks to race (core/modTracks.ts). */
  mods?: boolean;
  /** The flag that puts the place on the road menu (an area's open flag). */
  needs?: string;
}

export interface RouteDef {
  /** The map and the name of its exit (an exit with to "world_map"). */
  map: string;
  exit: string;
  /** What the road is called, for directions ("the venue road"). */
  road: string;
  /** The places it leads to, by map id: each must be in places. */
  to: string[];
}

export interface WorldData {
  /** Testing only: multiplies all shift pay. Review before Final v1. */
  testPayMultiplier?: number;
  /** The world map screen (core/worldMap.ts). */
  worldMap?: WorldMapData;
  locks: { map: string; object: string; flag: string; message: string }[];
  /** Places at the end of a route (an exit with a choice of roads): where you arrive and what it is. */
  places: PlaceDef[];
  /** Exits that lead to a choice of places, and which ones (the route marshal there gives directions). */
  routes: RouteDef[];
  jobs: JobDef[];
}

export interface Part {
  grade: number;
  /** 0 to 1. A part at 0 is broken. */
  condition: number;
  /** Modifiers from the Modifying Machine (core/modifiers.ts, Spec 6); shop parts have none. */
  mods?: { type: string; value: number }[];
}

export interface Bike {
  brand: string;
  class: string;
  parts: Record<string, Part>;
}

export interface BagItem {
  id: string;
  /** A spare bike part, with its own grade and condition (id "spare"). */
  part?: SparePart;
}

export interface CareerState {
  /** Money in pence, so shift pay like 75p stays exact. */
  money: number;
  bike: Bike;
  bag: BagItem[];
  /** Index of the current opening-chain step, and the objects already used for a multi-use step. */
  story: { step: number; used: string[] };
  /** Later chains (story.json chains) by id, once started: where the rider is in each. */
  chains?: Record<string, { step: number; used: string[] }>;
  /** Running totals such as batches finished per employer, race days and wins. */
  counters: Record<string, number>;
  skills: SkillState;
  /** Shop stock rotation, made on the first shop visit. */
  shops?: ShopState;
  /** Championships entered and finished, made on entering the first one. */
  champs?: ChampionshipState;
  /** Errands for NPCs (core/errands.ts), made on taking the first one. */
  errands?: ErrandState;
  /** Batch jobs under way (core/jobs.ts), made on the first shift. */
  jobs?: JobState;
  /** Bikes retired at a class milestone (GDD 8.1), oldest first. */
  retired?: RetiredBike[];
  /** Tool sets owned (core/tools.ts): the version id by set id. */
  tools?: Record<string, string>;
  /** Bike setup (core/setup.ts): a preset or the rider's own slider values, once they have touched it. */
  setup?: SetupState;
  /** Spare parts in the house storage chest (core/house.ts), shared by every house. */
  storage?: SparePart[];
  /** Reputation among sponsors, 0 to 1000 (core/sponsors.ts, Spec 16.1). */
  reputation?: number;
  /** The sponsor contract under way, and the offers open to sign. */
  sponsor?: Contract;
  sponsorOffers?: Offer[];
}

export const pence = (pounds: number) => Math.round(pounds * 100);

/** A shift job's pay per part in pence, after the testing multiplier. */
export const jobPay = (world: WorldData, job: JobDef) => pence(job.pay * (world.testPayMultiplier ?? 1));

export function formatMoney(p: number): string {
  const sign = p < 0 ? '−' : '';
  const a = Math.abs(p);
  return a % 100 === 0 ? `${sign}£${a / 100}` : `${sign}£${(a / 100).toFixed(2)}`;
}

/** A new starter bike: the starter grade everywhere, random 50–80% condition, and one broken part (GDD 4.1). */
export function starterBike(bikes: BikesData, brand: string, rng: () => number = Math.random): Bike {
  const s = bikes.starter;
  const [lo, hi] = s.condition;
  const parts: Record<string, Part> = {};
  for (const slot of bikes.slots) {
    const c = slot.id === s.brokenSlot ? 0 : lo + rng() * (hi - lo);
    parts[slot.id] = { grade: s.grade, condition: Math.round(c * 100) / 100 };
  }
  return { brand, class: s.class, parts };
}

export function newCareerState(bikes: BikesData, story: StoryData, brand: string, rng?: () => number): CareerState {
  return { money: pence(story.startMoney), bike: starterBike(bikes, brand, rng), bag: [], story: { step: 0, used: [] }, counters: {}, skills: newSkillState() };
}

/** Spec 7.1 and 7.2: 0.80 + 0.20 × condition, and a broken part keeps only 10%. */
export function conditionFactor(c: number): number {
  return c <= 0 ? 0.1 : 0.8 + 0.2 * c;
}

/** Spec 5.3 grade curve for one slot's share of a stat. */
export function partStat(ceiling: number, weight: number, part: Part): number {
  return ceiling * weight * 0.36 * 1.12 ** (part.grade - 1) * conditionFactor(part.condition);
}

/** The bike's six stats, rounded. Brand lean shapes them without changing the total. */
export function bikeStats(bikes: BikesData, bike: Bike): Record<string, number> {
  const ceiling = bikes.classes.find((c) => c.id === bike.class)?.ceiling ?? 0;
  const lean = bikes.brands.find((b) => b.id === bike.brand)?.lean ?? {};
  const out: Record<string, number> = {};
  for (const st of bikes.stats) {
    let v = 0;
    for (const slot of bikes.slots) {
      const w = slot.weights[st.id];
      const part = bike.parts[slot.id];
      if (w && part) v += partStat(ceiling, w, part);
    }
    out[st.id] = Math.round(v * (lean[st.id] ?? 1));
  }
  return out;
}

/** The best a bike of this class can reach on one stat (Grade 10, new, strongest lean), for scaling bars. */
export function statMax(bikes: BikesData, cls: string): number {
  const ceiling = bikes.classes.find((c) => c.id === cls)?.ceiling ?? 0;
  const lean = Math.max(...bikes.brands.flatMap((b) => Object.values(b.lean)));
  return ceiling * 0.36 * 1.12 ** 9 * lean;
}

/** Why the bike can't be ridden, or null when it runs. */
export function bikeProblem(bikes: BikesData, bike: Bike): string | null {
  const broken = bikes.slots.filter((s) => s.engine && bike.parts[s.id]?.condition <= 0);
  return broken.length ? `Won't start: the ${broken[0].name.toLowerCase()} is broken.` : null;
}

export const hasItems = (state: CareerState, ids: string[] = []) => {
  const left = state.bag.map((b) => b.id);
  return ids.every((id) => {
    const i = left.indexOf(id);
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
};

/** Applies a step's effects. Flags live on the save itself, so they are passed in to be set. */
export function applyEffects(state: CareerState, flags: Record<string, boolean>, items: Record<string, ItemDef>, e: StoryEffects = {}): void {
  if (e.money) state.money += pence(e.money);
  for (const id of e.take ?? []) {
    const i = state.bag.findIndex((b) => b.id === id);
    if (i >= 0) state.bag.splice(i, 1);
  }
  for (const id of e.give ?? []) state.bag.push({ id });
  if (e.fit) {
    const i = state.bag.findIndex((b) => b.id === e.fit);
    const part = items[e.fit]?.part;
    if (i >= 0 && part) {
      state.bag.splice(i, 1);
      state.bike.parts[part.slot] = { grade: part.grade, condition: part.condition };
    }
  }
  for (const f of e.flags ?? []) flags[f] = true;
  for (const p of e.giveParts ?? []) state.bag.push({ id: 'spare', part: { slot: p.slot, class: state.bike.class, grade: p.grade, condition: p.condition, ...(p.mods ? { mods: p.mods.map((m) => ({ ...m })) } : {}) } });
}

// ---- the opening chain ----

export type StoryEvent = { talk: string } | { use: string; map: string; object: string };

export type StoryMatch =
  | { kind: 'ready'; step: StoryStep }
  | { kind: 'notReady'; step: StoryStep; short: number }
  | { kind: 'alreadyUsed'; step: StoryStep };

/** The chain the rider is on: the opening chain while it lasts, then each started chain in turn. */
function activeChain(story: StoryData, state: CareerState): { steps: StoryStep[]; st: { step: number; used: string[] } } | null {
  if (state.story.step < story.steps.length) return { steps: story.steps, st: state.story };
  for (const c of story.chains ?? []) {
    const st = state.chains?.[c.id];
    if (st && st.step < c.steps.length) return { steps: c.steps, st };
  }
  return null;
}

/**
 * Starts every chain whose flag is set and which hasn't started (called when flags change, and
 * on loading a save). Returns the chains started.
 */
export function openChains(story: StoryData, state: CareerState, flags: Record<string, boolean>): StoryChain[] {
  const started: StoryChain[] = [];
  for (const c of story.chains ?? []) {
    if (!flags[c.needs] || state.chains?.[c.id]) continue;
    (state.chains ??= {})[c.id] = { step: 0, used: [] };
    started.push(c);
  }
  return started;
}

/** Whether a chain has been played to its end. */
export const chainDone = (story: StoryData, state: CareerState, id: string): boolean => {
  const c = story.chains?.find((x) => x.id === id);
  return !!c && (state.chains?.[id]?.step ?? 0) >= c.steps.length;
};

export function currentStep(story: StoryData, state: CareerState): StoryStep | null {
  const c = activeChain(story, state);
  return c ? (c.steps[c.st.step] ?? null) : null;
}

/** Whether a talk or object use is the current step, and whether the rider can do it yet. */
export function matchStory(story: StoryData, state: CareerState, ev: StoryEvent, levels: Record<string, number> = {}): StoryMatch | null {
  const step = currentStep(story, state);
  if (!step) return null;
  if ('talk' in ev) {
    if (step.on.talk !== ev.talk) return null;
  } else {
    if (step.on.use !== ev.use || (step.on.map && step.on.map !== ev.map)) return null;
    if (activeChain(story, state)!.st.used.includes(ev.object)) return { kind: 'alreadyUsed', step };
  }
  const needMoney = pence(step.needs?.money ?? 0);
  const skilled = Object.entries(step.needs?.skills ?? {}).every(([lead, level]) => (levels[lead] ?? 0) >= level);
  if (state.money < needMoney || !hasItems(state, step.needs?.items) || !skilled) return { kind: 'notReady', step, short: Math.max(0, needMoney - state.money) };
  return { kind: 'ready', step };
}

/** Records one use of the current step. Returns true when the step finished and its effects applied. */
export function advanceStory(story: StoryData, state: CareerState, flags: Record<string, boolean>, items: Record<string, ItemDef>, object?: string): boolean {
  const c = activeChain(story, state);
  const step = c?.steps[c.st.step];
  if (!c || !step) return false;
  if (object) c.st.used.push(object);
  if (c.st.used.length < (step.times ?? 1) && object) return false;
  applyEffects(state, flags, items, step.effects);
  c.st.step += 1;
  c.st.used = [];
  return true;
}

/** The task after the opening chain for these flags (story.json after), if any. */
export function afterTask(story: StoryData, flags: Record<string, boolean>): NonNullable<StoryData['after']>[number] | undefined {
  return story.after?.find((a) => (a.if === undefined || flags[a.if]) && (a.unless === undefined || !flags[a.unless]));
}

/** The task line for the journal. */
export function journal(story: StoryData, state: CareerState, flags: Record<string, boolean> = {}): string {
  const step = currentStep(story, state);
  if (!step) return afterTask(story, flags)?.text ?? story.done;
  const n = step.times ?? 1;
  return n > 1 ? `${step.journal} (${activeChain(story, state)!.st.used.length} of ${n})` : step.journal;
}

export function fillText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
