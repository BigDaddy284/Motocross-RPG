// Bike setup: five sliders over the part groups, set from the race office before a race (Spec 8.0 to
// 8.2). Boss, 31 Oct 2026: the Basic view (ready-made setups) arrives in Area 2, where rain first
// makes setup matter, and the Advanced view (each slider on its own) in Area 5, from Mechanical
// Engineer 15. Every number lives in data/setup.json; this is the maths and the rules.
//
// How it reaches a race: `tuningFactors` turns the rider's setup into a time factor per track
// section, which race.ts multiplies into that rider's section time (Entrant.tuning). A factor is
// relative to the default setup, so a rider who never touches the sliders and every CPU rider
// are exactly as they were.
import type { Bike } from './career';
import type { TrackDef } from './race';
import type { Schema } from './validate';

export interface SliderDef {
  id: string;
  name: string;
  /** The names of the two ends. */
  low: string;
  high: string;
  /** The part slots whose grade unlocks it. */
  slots: string[];
}

export interface PresetDef {
  id: string;
  name: string;
  note: string;
  /** The section kinds it tunes for: each slider goes to presetShare of their mean ideal. */
  aims: string[];
}

export interface SetupData {
  sliders: SliderDef[];
  unlockGrade: number;
  positions: { from: number; n: number }[];
  basicArea: number;
  advancedArea: number;
  advancedLevel: number;
  /** The Mechanical Engineer level from which the office says what a setup does in numbers (Spec 8.3). */
  detailLevel: number;
  effect: { scale: number; base: number; k: number; min: number; max: number };
  ideals: Record<string, Record<string, number>>;
  /** The kind every ideal is blended with in the rain. */
  wet: string;
  sectionKinds: Record<string, string>;
  presetShare: number;
  presets: PresetDef[];
}

/** The rider's setup: a preset by id, or their own slider values from -1 to +1 (missing is default). */
export interface SetupState {
  preset: string | null;
  sliders: Record<string, number>;
}

export const defaultSetup = (): SetupState => ({ preset: null, sliders: {} });

/** Positions a slider has at this Mechanical Engineer level (Spec 8.1). */
export function positionsFor(data: SetupData, meLevel: number): number {
  let n = data.positions[0]?.n ?? 3;
  for (const p of data.positions) if (meLevel >= p.from) n = p.n;
  return n;
}

/** The value of position i of n, evenly from -1 to +1. */
export const positionValue = (i: number, n: number): number => (n <= 1 ? 0 : Math.round((-1 + (2 * i) / (n - 1)) * 1000) / 1000);

/** The position (0 to n - 1) nearest a value. */
export const positionOf = (value: number, n: number): number => Math.max(0, Math.min(n - 1, Math.round(((value + 1) / 2) * (n - 1))));

/** A slider needs at least one Grade unlockGrade part in its group; otherwise it stays at the default (Spec 8.1). */
export function sliderUnlocked(data: SetupData, slider: SliderDef, bike: Bike): boolean {
  return slider.slots.some((s) => (bike.parts[s]?.grade ?? 0) >= data.unlockGrade);
}

/** The ideal of a kind, blended half and half with the wet kind in the rain. */
function idealOf(data: SetupData, kind: string, slider: string, wet: boolean): number {
  const dry = data.ideals[kind]?.[slider] ?? 0;
  if (!wet) return dry;
  return (dry + (data.ideals[data.wet]?.[slider] ?? 0)) / 2;
}

/** Spec 8.2: tuning% for one slider on one section, clamped. */
export function tuningPercent(data: SetupData, setting: number, ideal: number): number {
  const d = Math.abs(setting - ideal);
  const e = data.effect;
  return Math.max(e.min, Math.min(e.max, e.scale * (e.base - d * d * e.k)));
}

/** Where each slider really sits: a preset's values, or the rider's own, with locked sliders at 0. */
export function effectiveSetup(data: SetupData, setup: SetupState | undefined, bike: Bike): Record<string, number> {
  const out: Record<string, number> = {};
  const preset = setup?.preset ? data.presets.find((p) => p.id === setup.preset) : undefined;
  for (const s of data.sliders) {
    if (!sliderUnlocked(data, s, bike)) { out[s.id] = 0; continue; }
    if (preset) {
      const mean = preset.aims.reduce((a, k) => a + (data.ideals[k]?.[s.id] ?? 0), 0) / Math.max(1, preset.aims.length);
      out[s.id] = Math.round(mean * data.presetShare * 1000) / 1000;
    } else out[s.id] = Math.max(-1, Math.min(1, setup?.sliders[s.id] ?? 0));
  }
  return out;
}

/**
 * A rider's gain on a section type, in percent of its time, against the default setup (positive is
 * faster): every slider's tuning on that section (Spec 8.2), added up, less what the default gets.
 */
export function sectionGain(data: SetupData, values: Record<string, number>, sectionType: string, wet: boolean): number {
  const kind = data.sectionKinds[sectionType];
  if (!kind) return 0;
  let sum = 0;
  for (const s of data.sliders) {
    const ideal = idealOf(data, kind, s.id, wet);
    sum += tuningPercent(data, values[s.id] ?? 0, ideal) - tuningPercent(data, 0, ideal);
  }
  return sum;
}

/** The time factor for every section of a track, in order (race.ts Entrant.tuning). */
export function tuningFactors(data: SetupData, setup: SetupState | undefined, bike: Bike, track: TrackDef, wet: boolean): number[] {
  const values = effectiveSetup(data, setup, bike);
  return track.sections.map((sec) => 1 - sectionGain(data, values, sec.type, wet) / 100);
}

export type SectionColour = 'green' | 'grey' | 'amber' | 'red';

/** Spec 8.3: what the office can say about a setup on a track: a colour per section and the lap's gain. */
export function setupReport(data: SetupData, setup: SetupState | undefined, bike: Bike, track: TrackDef, wet: boolean): { colours: SectionColour[]; lapGain: number } {
  const values = effectiveSetup(data, setup, bike);
  let gain = 0;
  let total = 0;
  const colours: SectionColour[] = [];
  for (const sec of track.sections) {
    const g = sectionGain(data, values, sec.type, wet);
    gain += g * sec.length;
    total += sec.length;
    colours.push(g > 0.5 ? 'green' : g >= -0.5 ? 'grey' : g >= -2.5 ? 'amber' : 'red');
  }
  return { colours, lapGain: total ? Math.round((gain / total) * 100) / 100 : 0 };
}

/** The best single value for a slider on a track (the average of its ideals, weighted by section length). */
export function bestValue(data: SetupData, slider: string, track: TrackDef, wet: boolean): number {
  let sum = 0;
  let total = 0;
  for (const sec of track.sections) {
    const kind = data.sectionKinds[sec.type];
    if (!kind) continue;
    sum += idealOf(data, kind, slider, wet) * sec.length;
    total += sec.length;
  }
  return total ? sum / total : 0;
}

const ID = /^[a-z0-9_.-]+$/;
const S = { type: 'string', nonEmpty: true } as const;
const UNIT = { type: 'number', min: -1, max: 1 } as const;

export const SETUP_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    sliders: { type: 'array', minItems: 1, items: { type: 'object', fields: { id: { type: 'string', pattern: ID }, name: S, low: S, high: S, slots: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } } } } },
    unlockGrade: { type: 'number', integer: true, min: 1, max: 10 },
    positions: { type: 'array', minItems: 1, items: { type: 'object', fields: { from: { type: 'number', integer: true, min: 1, max: 99 }, n: { type: 'number', integer: true, min: 3, max: 41 } } } },
    basicArea: { type: 'number', integer: true, min: 1, max: 8 },
    advancedArea: { type: 'number', integer: true, min: 1, max: 8 },
    advancedLevel: { type: 'number', integer: true, min: 1, max: 99 },
    detailLevel: { type: 'number', integer: true, min: 1, max: 99 },
    effect: { type: 'object', fields: { scale: { type: 'number', min: 0 }, base: { type: 'number' }, k: { type: 'number', min: 0 }, min: { type: 'number' }, max: { type: 'number' } } },
    ideals: { type: 'record', values: { type: 'record', values: UNIT } },
    wet: { type: 'string', pattern: ID },
    sectionKinds: { type: 'record', values: { type: 'string', pattern: ID } },
    presetShare: { type: 'number', min: 0, max: 1 },
    presets: { type: 'array', minItems: 1, items: { type: 'object', fields: { id: { type: 'string', pattern: ID }, name: S, note: { type: 'string' }, aims: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } } } } },
  },
};

/** Cross-checks: slots, section types and kinds all exist, every kind has every slider, effect bounds make sense. */
export function checkSetup(file: string, data: SetupData, c: { slots: string[]; sections: string[] }): { file: string; field: string; message: string }[] {
  const errors: { file: string; field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const ids = data.sliders.map((s) => s.id);
  data.sliders.forEach((s, i) => s.slots.forEach((slot, j) => !c.slots.includes(slot) && err(`sliders[${i}].slots[${j}]`, `no part slot "${slot}" in bikes.json`)));
  if (new Set(ids).size !== ids.length) err('sliders', 'two sliders share an id');
  for (const [kind, v] of Object.entries(data.ideals)) for (const id of ids) if (v[id] === undefined) err(`ideals.${kind}`, `no ideal for slider "${id}"`);
  if (!data.ideals[data.wet]) err('wet', `no ideals for kind "${data.wet}"`);
  for (const [type, kind] of Object.entries(data.sectionKinds)) {
    if (!c.sections.includes(type)) err(`sectionKinds.${type}`, `no section "${type}" in racing.json`);
    if (!data.ideals[kind]) err(`sectionKinds.${type}`, `no ideals for kind "${kind}"`);
  }
  data.presets.forEach((p, i) => p.aims.forEach((k, j) => !data.ideals[k] && err(`presets[${i}].aims[${j}]`, `no ideals for kind "${k}"`)));
  if (data.effect.min > 0 || data.effect.max < 0) err('effect', 'min must be at or below 0 and max at or above it');
  let last = 0;
  data.positions.forEach((p, i) => { if (p.from <= last && i > 0) err(`positions[${i}].from`, 'levels must rise'); last = p.from; });
  if (data.positions[0]?.from !== 1) err('positions[0].from', 'the first row must start at level 1');
  return errors;
}
