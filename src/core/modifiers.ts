// Part modifiers and the Modifying Machine (Spec 6). A part can carry up to three modifiers, each a
// type (Starts, Corners, ... Wet, Mud, ...) with a value from -5 to +5. Across the fitted parts the
// values of one type add up and, with diminishing returns, speed up (or slow down) the sections of
// that type, or every section when its condition holds (the rain, the track's surface). Shop parts
// never have any (Spec 6.4): the machine rolls them, three at a time, half of them bad, and one go
// in ten eats the part. Boss, 30 Oct 2026: there is one machine, Mad Maggie's in the Industrial Zone,
// broken until her quest (story.json chain `maggie`, starting in Area 5) fixes it.
import { pence, type CareerState, type Part } from './career';
import { notMine, slotName } from './shops';
import type { BikesData } from './career';
import type { TrackDef } from './race';
import type { Schema } from './validate';

export interface PartMod {
  type: string;
  /** -5 to +5, never 0. */
  value: number;
}

export interface ModifiersData {
  types: Record<string, { name: string }>;
  sections: Record<string, string[]>;
  conditions: Record<string, { weather?: string[]; surfaces?: string[] }>;
  pools: Record<string, string[]>;
  effect: { max: number; scale: number };
  machine: {
    count: number;
    positive: number;
    values: number[];
    minCondition: number;
    breakChance: number;
    fee: { base: number; perGrade: number };
    fixedFlag: string;
    map: string;
    action: string;
  };
}

/** Spec 6.3: the percent effect of raw points of one type, with diminishing returns. */
export function modifierEffect(data: ModifiersData, raw: number): number {
  if (!raw) return 0;
  return Math.sign(raw) * data.effect.max * (1 - Math.exp(-Math.abs(raw) / data.effect.scale));
}

/** The points of each type across the fitted parts. */
export function modifierTotals(parts: Record<string, Part>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of Object.values(parts)) for (const m of p.mods ?? []) out[m.type] = (out[m.type] ?? 0) + m.value;
  return out;
}

/**
 * A time factor per track section from the fitted parts' modifiers (race.ts Entrant.tuning), for
 * today's weather kind (racing.json weather) and the track's surface; all 1 for a bike with none.
 */
export function modifierFactors(data: ModifiersData, parts: Record<string, Part>, track: TrackDef, weather: string): number[] {
  const totals = modifierTotals(parts);
  const types = Object.keys(totals).filter((t) => totals[t]);
  if (!types.length) return track.sections.map(() => 1);
  return track.sections.map((sec) => {
    let pct = 0;
    for (const t of types) {
      const cond = data.conditions[t];
      const holds = (data.sections[t]?.includes(sec.type) ?? false) || (cond?.weather?.includes(weather) ?? false) || (cond?.surfaces?.includes(track.surface) ?? false);
      if (holds) pct += modifierEffect(data, totals[t]);
    }
    return 1 - pct / 100;
  });
}

/** A modifier as the player reads it: "Corners +3". */
export const modLabel = (data: ModifiersData, m: PartMod): string => `${data.types[m.type]?.name ?? m.type} ${m.value > 0 ? '+' : ''}${m.value}`;

export const modsLabel = (data: ModifiersData, mods: PartMod[] | undefined): string => (mods?.length ? mods.map((m) => modLabel(data, m)).join(', ') : 'no modifiers');

/** The machine's fee in pence for a part of this grade: base at Grade 1, times perGrade a grade. */
export const machineFee = (data: ModifiersData, grade: number): number => pence(data.machine.fee.base * data.machine.fee.perGrade ** Math.max(0, grade - 1));

/** Why this bag spare can't go in the machine, or null. */
export function machineProblem(data: ModifiersData, bikes: BikesData, career: CareerState, index: number, flags: Record<string, boolean>): string | null {
  if (!flags[data.machine.fixedFlag]) return "The machine's broken.";
  const part = career.bag[index]?.part;
  if (!part) return 'Nothing to put in.';
  if (part.owner) return notMine(part);
  if (part.mods?.length) return `That ${slotName(bikes, part.slot)} has been through already: one go per part.`;
  if (part.condition < data.machine.minCondition) return `The machine wants a part at ${Math.round(data.machine.minCondition * 100)}% or better. Get it repaired first.`;
  if (!data.pools[part.slot]) return `The machine has nothing for a ${slotName(bikes, part.slot)}.`;
  if (career.money < machineFee(data, part.grade)) return `It's £${machineFee(data, part.grade) / 100} a go for a Grade ${part.grade} part. You can't afford it.`;
  return null;
}

/** One value from 1 to 5 at the machine's weights (Spec 6.4: 45/30/15/8/2). */
export function rollValue(data: ModifiersData, rng: () => number): number {
  const w = data.machine.values;
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return i + 1;
  }
  return w.length;
}

/** The machine's roll for a slot: count distinct types from its pool, each positive with chance positive. */
export function rollMods(data: ModifiersData, slot: string, rng: () => number): PartMod[] {
  const pool = [...(data.pools[slot] ?? [])];
  const out: PartMod[] = [];
  for (let i = 0; i < data.machine.count && pool.length; i++) {
    const [type] = pool.splice(Math.floor(rng() * pool.length), 1);
    const value = rollValue(data, rng);
    out.push({ type, value: rng() < data.machine.positive ? value : -value });
  }
  return out;
}

export type MachineResult = { ok: false; message: string } | { ok: true; destroyed: true; message: string } | { ok: true; destroyed: false; mods: PartMod[]; message: string };

/** Puts the bag spare through the machine: pays the fee, then one go in ten eats it, otherwise it gets its modifiers. */
export function runMachine(data: ModifiersData, bikes: BikesData, career: CareerState, index: number, flags: Record<string, boolean>, rng: () => number = Math.random): MachineResult {
  const problem = machineProblem(data, bikes, career, index, flags);
  if (problem) return { ok: false, message: problem };
  const part = career.bag[index].part!;
  career.money -= machineFee(data, part.grade);
  const name = `G${part.grade} ${slotName(bikes, part.slot)}`;
  if (rng() < data.machine.breakChance) {
    career.bag.splice(index, 1);
    return { ok: true, destroyed: true, message: `The machine shudders, sparks, and your ${name} is gone. Nothing comes out.` };
  }
  const mods = rollMods(data, part.slot, rng);
  part.mods = mods;
  return { ok: true, destroyed: false, mods, message: `Your ${name} comes out: ${modsLabel(data, mods)}.` };
}

// ---- content checks ----

const ID = /^[a-z0-9_.-]+$/;
const IDS = { type: 'array', items: { type: 'string', pattern: ID } } as const;

export const MODIFIERS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    types: { type: 'record', values: { type: 'object', fields: { name: { type: 'string', nonEmpty: true } } } },
    sections: { type: 'record', values: IDS },
    conditions: { type: 'record', values: { type: 'object', optional: ['weather', 'surfaces'], fields: { weather: IDS, surfaces: IDS } } },
    pools: { type: 'record', values: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } } },
    effect: { type: 'object', fields: { max: { type: 'number', min: 0 }, scale: { type: 'number', min: 0.001 } } },
    machine: {
      type: 'object',
      fields: {
        count: { type: 'number', integer: true, min: 1, max: 5 },
        positive: { type: 'number', min: 0, max: 1 },
        values: { type: 'array', minItems: 1, items: { type: 'number', min: 0 } },
        minCondition: { type: 'number', min: 0, max: 1 },
        breakChance: { type: 'number', min: 0, max: 1 },
        fee: { type: 'object', fields: { base: { type: 'number', min: 0 }, perGrade: { type: 'number', min: 1 } } },
        fixedFlag: { type: 'string', pattern: ID },
        map: { type: 'string', pattern: ID },
        action: { type: 'string', pattern: ID },
      },
    },
  },
};

/** Cross-checks: every type, section, weather kind and slot named exists; the machine's map and action do. */
export function checkModifiers(file: string, data: ModifiersData, c: { slots: string[]; sections: string[]; weather: string[]; maps: Map<string, { objects: { props: Record<string, unknown> }[] }> }): { file: string; field: string; message: string }[] {
  const errors: { file: string; field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  for (const [t, list] of Object.entries(data.sections)) {
    if (!data.types[t]) err(`sections.${t}`, `no modifier type "${t}"`);
    list.forEach((s, i) => !c.sections.includes(s) && err(`sections.${t}[${i}]`, `no section "${s}" in racing.json`));
  }
  for (const [t, cond] of Object.entries(data.conditions)) {
    if (!data.types[t]) err(`conditions.${t}`, `no modifier type "${t}"`);
    cond.weather?.forEach((w, i) => !c.weather.includes(w) && err(`conditions.${t}.weather[${i}]`, `no weather "${w}" in racing.json`));
  }
  for (const t of Object.keys(data.types)) if (!data.sections[t] && !data.conditions[t]) err(`types.${t}`, 'a type needs sections or a condition to act on');
  for (const [slot, pool] of Object.entries(data.pools)) {
    if (!c.slots.includes(slot)) err(`pools.${slot}`, `no part slot "${slot}" in bikes.json`);
    pool.forEach((t, i) => !data.types[t] && err(`pools.${slot}[${i}]`, `no modifier type "${t}"`));
    if (new Set(pool).size < data.machine.count) err(`pools.${slot}`, `fewer than ${data.machine.count} different types to roll`);
  }
  const m = c.maps.get(data.machine.map);
  if (!m) err('machine.map', `no map "${data.machine.map}"`);
  else if (!m.objects.some((o) => o.props.action === data.machine.action)) err('machine.action', `nothing on ${data.machine.map} has action "${data.machine.action}"`);
  if (data.machine.values.every((v) => v === 0)) err('machine.values', 'no weight above 0');
  return errors;
}
