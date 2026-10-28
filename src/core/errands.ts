import { formatMoney, pence, type BikesData, type CareerState } from './career';
import { repairQuote, slotName, spareCount, SPARE, type Result, type ShopsData } from './shops';
import type { ContentError, Schema } from './validate';

// Errands (Boss, 28 Oct 2026): an NPC lends the rider a worn part to get repaired at the garage
// and brought back, for the repair cost back and a small reward on top. The part is the NPC's,
// tagged with its owner, so it can't be fitted, sold, dumped or used in a machine. One errand at
// a time; another can be taken straight after. Pure rules with no graphics.

export interface ErrandDef {
  id: string;
  /** The NPC who gives it and takes the part back. */
  npc: string;
  /** For the owner tag and messages: "the scrapyard owner". */
  owner: string;
  /** Pounds on top of the repair cost when the part comes back repaired (to be balanced later). */
  reward: number;
  class: string;
  /** The part lent: a random slot of these, grade and condition in these ranges. */
  slots: string[];
  grades: [number, number];
  condition: [number, number];
  /** Opening flag; the NPC talks of other things until it is set. */
  needs?: string;
  /** Dialogue keys: offering the job, waiting for the part, and thanks on return. */
  offer: string;
  waiting: string;
  thanks: string;
}

export interface ErrandsData {
  errands: ErrandDef[];
}

/** Jobs done for each errand, and the one under way (its part is the bag spare with this errand's tag). */
export interface ErrandState {
  active: string | null;
  done: Record<string, number>;
}

/** Who a lent part belongs to: never the rider's to fit, sell or dump. */
export interface PartOwner {
  errand: string;
  name: string;
  /** Pence the rider paid to repair it, paid back on return. */
  paid?: number;
  repaired?: boolean;
}

export const errandState = (career: CareerState): ErrandState => (career.errands ??= { active: null, done: {} });

/** The bag index of the part lent for this errand, or -1. */
export function lentPart(career: CareerState, errand: string): number {
  return career.bag.findIndex((b) => b.part?.owner?.errand === errand);
}

export type ErrandStage = 'offer' | 'waiting' | 'ready';

/** Where the rider is with this errand: offered a job, out getting the part repaired, or back with it done. */
export function errandStage(career: CareerState, def: ErrandDef): ErrandStage {
  const s = errandState(career);
  if (s.active !== def.id) return 'offer';
  const i = lentPart(career, def.id);
  // The part can't leave the bag any other way, so a job without one is over: offer a new one.
  if (i < 0) {
    s.active = null;
    return 'offer';
  }
  return career.bag[i].part!.owner!.repaired ? 'ready' : 'waiting';
}

/** Takes the job: the NPC's part goes in the bag, if there is room. */
export function takeErrand(shops: ShopsData, bikes: BikesData, career: CareerState, def: ErrandDef, rng: () => number = Math.random): Result {
  const s = errandState(career);
  if (s.active) return { ok: false, message: 'Finish the job you have first.' };
  if (spareCount(career) >= shops.spareLimit) return { ok: false, message: `Your spares are full (${shops.spareLimit} parts). Make room in your bag first.` };
  const slot = def.slots[Math.floor(rng() * def.slots.length)];
  const [g0, g1] = def.grades;
  const grade = g0 + Math.floor(rng() * (g1 - g0 + 1));
  const [c0, c1] = def.condition;
  const condition = Math.round((c0 + rng() * (c1 - c0)) * 100) / 100;
  career.bag.push({ id: SPARE, part: { slot, class: def.class, grade, condition, owner: { errand: def.id, name: def.owner } } });
  s.active = def.id;
  return { ok: true, message: `${def.owner[0].toUpperCase()}${def.owner.slice(1)}'s G${grade} ${slotName(bikes, slot)} (${Math.round(condition * 100)}%) is in your bag. Get it repaired at the garage.` };
}

/** Repairs a lent part at the garage, as a fitted part would be: a grade lower at 100% (Spec 7.4). */
export function repairLent(shops: ShopsData, bikes: BikesData, career: CareerState, index: number): Result {
  const part = career.bag[index]?.part;
  if (!part?.owner) return { ok: false, message: 'Only parts you are fixing for someone are repaired from the bag.' };
  if (part.owner.repaired) return { ok: false, message: 'Already repaired: take it back.' };
  const q = repairQuote(shops, part.slot, part, part.class);
  if (!q.ok) return { ok: false, message: q.reason };
  if (career.money < q.cost) return { ok: false, message: "You can't afford it." };
  career.money -= q.cost;
  part.grade = q.grade;
  part.condition = 1;
  part.owner.paid = q.cost;
  part.owner.repaired = true;
  return { ok: true, message: `${part.owner.name[0].toUpperCase()}${part.owner.name.slice(1)}'s ${slotName(bikes, part.slot)} is repaired. Take it back to them.` };
}

/** Hands back the repaired part: the repair cost back plus the reward. */
export function finishErrand(career: CareerState, def: ErrandDef): Result {
  const i = lentPart(career, def.id);
  const owner = career.bag[i]?.part?.owner;
  if (i < 0 || !owner?.repaired) return { ok: false, message: "It isn't repaired yet." };
  const pay = (owner.paid ?? 0) + pence(def.reward);
  career.bag.splice(i, 1);
  career.money += pay;
  const s = errandState(career);
  s.active = null;
  s.done[def.id] = (s.done[def.id] ?? 0) + 1;
  return { ok: true, message: `Paid ${formatMoney(pay)}: the repair, plus ${formatMoney(pence(def.reward))} for your trouble.` };
}

export const ERRANDS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    errands: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['needs'],
        fields: {
          id: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
          npc: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
          owner: { type: 'string', nonEmpty: true },
          reward: { type: 'number', min: 0 },
          class: { type: 'string', nonEmpty: true },
          slots: { type: 'array', minItems: 1, items: { type: 'string', nonEmpty: true } },
          grades: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', integer: true, min: 2, max: 10 } },
          condition: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', min: 0.01, max: 0.99 } },
          needs: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
          offer: { type: 'string', nonEmpty: true },
          waiting: { type: 'string', nonEmpty: true },
          thanks: { type: 'string', nonEmpty: true },
        },
      },
    },
  },
};

/** Checks errands.json against the NPCs, bike slots, classes and dialogue. */
export function checkErrands(file: string, data: ErrandsData, c: { npcs: { id: string }[]; bikes: BikesData; dialogue: Record<string, unknown> }): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const slots = new Set(c.bikes.slots.map((s) => s.id));
  const seen = new Set<string>();
  data.errands.forEach((e, i) => {
    const at = (f: string) => `errands[${i}].${f}`;
    if (seen.has(e.id)) err(at('id'), `"${e.id}" is used twice`);
    seen.add(e.id);
    if (!c.npcs.some((n) => n.id === e.npc)) err(at('npc'), `no NPC "${e.npc}"`);
    if (!c.bikes.classes.some((k) => k.id === e.class)) err(at('class'), `no class "${e.class}"`);
    e.slots.forEach((s, j) => !slots.has(s) && err(at(`slots[${j}]`), `no slot "${s}"`));
    if (e.grades[0] > e.grades[1]) err(at('grades'), 'the lowest grade is above the highest');
    if (e.condition[0] > e.condition[1]) err(at('condition'), 'the lowest condition is above the highest');
    for (const k of ['offer', 'waiting', 'thanks'] as const) if (!c.dialogue[e[k]]) err(at(k), `no dialogue "${e[k]}"`);
  });
  return errors;
}
