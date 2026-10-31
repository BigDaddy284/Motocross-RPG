// Tool sets (Spec 8.5, 17.2a; Areas 2 to 8 plan, Boss 30 Oct 2026). One set per part group, in
// three versions (first, Pro, Master), each repairing parts up to a grade. With the right set the
// rider repairs and fits parts themselves at their tool cabinet or the back of the motor, for
// nothing, instead of paying Phoenix MX. Sets are bought once at J's Tools in Home Town and
// last for good; a better version replaces the one below it.

import type { BikesData, CareerState, Part } from './career';
import { openAreas } from './areas';
import { addXp, type LevelUp, type SkillsData } from './skills';
import { notMine, repairQuote, slotName, type Result, type ShopsData, type SparePart } from './shops';
import type { ContentError, Schema } from './validate';

export interface ToolVersion {
  id: string;
  name: string;
  /** The area that brings it to the shop. */
  area: number;
  /** Pounds. */
  price: number;
  /** The highest part grade it can repair. */
  grade: number;
}

export interface ToolSetDef {
  id: string;
  name: string;
  /** The bike slots this set covers. */
  slots: string[];
  /** The child skill its work trains. */
  skill: string;
  /** From the first version up. */
  versions: ToolVersion[];
}

export interface ToolsData {
  /** XP for a DIY repair or fit, in the set's skill. */
  xp: { repair: number; fit: number };
  sets: ToolSetDef[];
}

/** The tool version the rider owns for a set, if any. */
export function ownedVersion(career: CareerState, set: ToolSetDef): ToolVersion | null {
  const id = career.tools?.[set.id];
  return set.versions.find((v) => v.id === id) ?? null;
}

/** The set covering a slot, and the version owned for it. */
export function toolsFor(data: ToolsData, career: CareerState, slot: string): { set: ToolSetDef; owned: ToolVersion | null } | null {
  const set = data.sets.find((s) => s.slots.includes(slot));
  return set ? { set, owned: ownedVersion(career, set) } : null;
}

/** The next version of a set the rider could buy: the one above what they own, once its area is open. */
export function nextVersion(career: CareerState, flags: Record<string, boolean>, set: ToolSetDef): { version: ToolVersion; open: boolean } | null {
  const owned = ownedVersion(career, set);
  const i = owned ? set.versions.indexOf(owned) + 1 : 0;
  const version = set.versions[i];
  return version ? { version, open: version.area <= openAreas(flags) } : null;
}

export function buyTools(career: CareerState, flags: Record<string, boolean>, set: ToolSetDef): Result {
  const next = nextVersion(career, flags, set);
  if (!next) return { ok: false, message: `You have the best ${set.name.toLowerCase()} there are.` };
  if (!next.open) return { ok: false, message: `${next.version.name} come in with Area ${next.version.area}.` };
  const price = Math.round(next.version.price * 100);
  if (career.money < price) return { ok: false, message: "You can't afford them." };
  career.money -= price;
  (career.tools ??= {})[set.id] = next.version.id;
  return { ok: true, message: `${next.version.name}: yours. They repair ${set.slots.length > 1 ? 'parts' : 'the part'} up to Grade ${next.version.grade}, and fit spares, at your tool cabinet or the back of your motor.` };
}

export type DiyQuote = { ok: true; grade: number } | { ok: false; reason: string };

/** Whether the rider can repair a fitted part themselves: the usual repair rules, with tools up to its grade. */
export function diyRepairQuote(shops: ShopsData, data: ToolsData, career: CareerState, slot: string, part: Part): DiyQuote {
  const q = repairQuote(shops, slot, part, career.bike.class);
  if (!q.ok) return q;
  const t = toolsFor(data, career, slot);
  if (!t) return { ok: false, reason: 'No tools cover this part: Phoenix MX only.' };
  if (!t.owned) return { ok: false, reason: `Needs ${t.set.name.toLowerCase()}, from J's Tools.` };
  if (part.grade > t.owned.grade) return { ok: false, reason: `Your ${t.owned.name.toLowerCase()} stop at Grade ${t.owned.grade}: Phoenix MX for this one.` };
  return { ok: true, grade: q.grade };
}

/** Repairs a fitted part with the rider's own tools: free, one grade down as always, with XP. */
export function diyRepair(shops: ShopsData, data: ToolsData, bikes: BikesData, skills: SkillsData, career: CareerState, slot: string): Result & { ups?: LevelUp[] } {
  const part = career.bike.parts[slot];
  if (!part) return { ok: false, message: 'Nothing fitted there.' };
  const q = diyRepairQuote(shops, data, career, slot, part);
  if (!q.ok) return { ok: false, message: q.reason };
  career.bike.parts[slot] = { grade: q.grade, condition: 1 };
  const set = toolsFor(data, career, slot)!.set;
  const ups = addXp(skills, career.skills, { [set.skill]: data.xp.repair });
  return { ok: true, message: `Your ${slotName(bikes, slot)} is repaired: G${q.grade} at 100%. +${data.xp.repair} ${set.skill.replace('_', ' ')} XP.`, ups };
}

/** Why the rider can't fit this spare themselves, or null. */
export function diyFitProblem(data: ToolsData, career: CareerState, part: SparePart): string | null {
  if (part.owner) return notMine(part);
  if (part.class !== career.bike.class) return `That part is for a ${part.class}.`;
  const t = toolsFor(data, career, part.slot);
  if (!t) return 'No tools cover this part: Phoenix MX only.';
  if (!t.owned) return `Needs ${t.set.name.toLowerCase()}, from J's Tools.`;
  return null;
}

export const TOOLS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    xp: { type: 'object', fields: { repair: { type: 'number', min: 0 }, fit: { type: 'number', min: 0 } } },
    sets: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        fields: {
          id: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
          name: { type: 'string', nonEmpty: true },
          slots: { type: 'array', minItems: 1, items: { type: 'string', pattern: /^[a-z0-9_.-]+$/ } },
          skill: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
          versions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              fields: {
                id: { type: 'string', pattern: /^[a-z0-9_.-]+$/ },
                name: { type: 'string', nonEmpty: true },
                area: { type: 'number', integer: true, min: 1, max: 8 },
                price: { type: 'number', min: 0 },
                grade: { type: 'number', integer: true, min: 1, max: 10 },
              },
            },
          },
        },
      },
    },
  },
};

/** Cross-checks: every slot is covered once, versions get better and later, and the skills exist. */
export function checkTools(file: string, data: ToolsData, bikes: BikesData, skills: SkillsData): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const slotIds = new Set(bikes.slots.map((s) => s.id));
  const childIds = new Set(skills.leads.flatMap((l) => l.children.map((c) => c.id)));
  const covered = new Map<string, string>();
  const ids = new Set<string>();
  data.sets.forEach((s, i) => {
    const at = (f: string) => `sets[${i}].${f}`;
    if (ids.has(s.id)) err(at('id'), `"${s.id}" is used twice`);
    ids.add(s.id);
    if (!childIds.has(s.skill)) err(at('skill'), `no child skill "${s.skill}"`);
    s.slots.forEach((slot, j) => {
      if (!slotIds.has(slot)) err(at(`slots[${j}]`), `no slot "${slot}"`);
      if (covered.has(slot)) err(at(`slots[${j}]`), `"${slot}" is already covered by ${covered.get(slot)}`);
      covered.set(slot, s.id);
    });
    s.versions.forEach((v, j) => {
      if (ids.has(v.id)) err(at(`versions[${j}].id`), `"${v.id}" is used twice`);
      ids.add(v.id);
      const prev = s.versions[j - 1];
      if (prev && (v.grade <= prev.grade || v.area <= prev.area || v.price <= prev.price)) err(at(`versions[${j}]`), `${v.name} should repair higher grades, cost more and come later than ${prev.name}`);
    });
  });
  for (const slot of slotIds) if (!covered.has(slot)) err('sets', `no tool set covers "${slot}"`);
  return errors;
}
