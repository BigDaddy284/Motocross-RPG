// Skills and XP (GDD 6, Spec 2). Child skills use the OSRS XP table; a lead skill's level comes
// from the sum of its children's XP plus its bonus pool, against the same table times its
// multiplier. Cross-skill bonus XP goes into the linked lead's pool, never into a child skill, so
// child levels always reflect real practice (Spec 2.1).

export interface ChildSkillDef {
  id: string;
  name: string;
  desc: string;
}

export interface LeadSkillDef {
  id: string;
  name: string;
  multiplier: number;
  /** The lead that gets the cross-skill bonus from this one's direct XP (GDD 6.2). */
  bonusTo: string;
  desc: string;
  children: ChildSkillDef[];
  unlocks: { level: number; text: string }[];
}

export interface SkillsData {
  maxLevel: number;
  crossBonus: number;
  leads: LeadSkillDef[];
}

export interface SkillState {
  /** Direct XP per child skill. Fractions are kept so small practice XP adds up. */
  xp: Record<string, number>;
  /** Cross-skill bonus XP per lead skill. */
  bonus: Record<string, number>;
}

export const newSkillState = (): SkillState => ({ xp: {}, bonus: {} });

const TABLE: number[] = (() => {
  // OSRS: the XP to reach level L is floor(sum over l < L of floor(l + 300 × 2^(l / 7)) / 4).
  const t = [0, 0];
  let points = 0;
  for (let l = 1; l < 126; l++) {
    points += Math.floor(l + 300 * 2 ** (l / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

/** XP needed for a child skill level (level 1 is 0 XP, level 99 is 13,034,431). */
export function xpForLevel(level: number): number {
  return TABLE[Math.max(1, Math.min(level, TABLE.length - 1))];
}

/** The level for an amount of XP, capped at maxLevel. */
export function levelForXp(xp: number, multiplier = 1, maxLevel = 99): number {
  let l = 1;
  while (l < maxLevel && xp >= xpForLevel(l + 1) * multiplier) l++;
  return l;
}

export function leadOf(data: SkillsData, child: string): LeadSkillDef | undefined {
  return data.leads.find((l) => l.children.some((c) => c.id === child));
}

export function childXp(state: SkillState, child: string): number {
  return state.xp[child] ?? 0;
}

export function childLevel(data: SkillsData, state: SkillState, child: string): number {
  return levelForXp(childXp(state, child), 1, data.maxLevel);
}

export function leadXp(state: SkillState, lead: LeadSkillDef): number {
  return lead.children.reduce((a, c) => a + childXp(state, c.id), 0) + (state.bonus[lead.id] ?? 0);
}

export function leadLevel(data: SkillsData, state: SkillState, lead: LeadSkillDef): number {
  return levelForXp(leadXp(state, lead), lead.multiplier, data.maxLevel);
}

/** Every child skill's level, for the race simulation. */
export function childLevels(data: SkillsData, state: SkillState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lead of data.leads) for (const c of lead.children) out[c.id] = childLevel(data, state, c.id);
  return out;
}

export interface LevelUp {
  skill: string;
  name: string;
  level: number;
  lead: boolean;
}

/**
 * Adds direct XP to child skills, plus the cross-skill bonus to each source lead's linked lead.
 * A lead at 99 stops giving bonus XP (GDD 6.2). Returns the level-ups it caused.
 */
export function addXp(data: SkillsData, state: SkillState, gains: Record<string, number>): LevelUp[] {
  const before = snapshotLevels(data, state);
  const bonusFrom: Record<string, number> = {};
  for (const [child, xp] of Object.entries(gains)) {
    if (!(xp > 0)) continue;
    const lead = leadOf(data, child);
    if (!lead) continue;
    state.xp[child] = childXp(state, child) + xp;
    bonusFrom[lead.id] = (bonusFrom[lead.id] ?? 0) + xp;
  }
  for (const [leadId, xp] of Object.entries(bonusFrom)) {
    const lead = data.leads.find((l) => l.id === leadId)!;
    if (before[leadId] >= data.maxLevel) continue;
    state.bonus[lead.bonusTo] = (state.bonus[lead.bonusTo] ?? 0) + xp * data.crossBonus;
  }
  const after = snapshotLevels(data, state);
  const ups: LevelUp[] = [];
  for (const lead of data.leads) {
    for (const c of lead.children) if (after[c.id] > before[c.id]) ups.push({ skill: c.id, name: c.name, level: after[c.id], lead: false });
    if (after[lead.id] > before[lead.id]) ups.push({ skill: lead.id, name: lead.name, level: after[lead.id], lead: true });
  }
  return ups;
}

function snapshotLevels(data: SkillsData, state: SkillState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lead of data.leads) {
    out[lead.id] = leadLevel(data, state, lead);
    for (const c of lead.children) out[c.id] = childLevel(data, state, c.id);
  }
  return out;
}

/** Progress through the current level, 0 to 1, for XP bars. */
export function levelProgress(xp: number, multiplier = 1, maxLevel = 99): number {
  const l = levelForXp(xp, multiplier, maxLevel);
  if (l >= maxLevel) return 1;
  const lo = xpForLevel(l) * multiplier;
  const hi = xpForLevel(l + 1) * multiplier;
  return (xp - lo) / (hi - lo);
}

/**
 * Where a skill stands, for the Skills tab's hover and tap box (Boss, 31 Oct 2026): its level, its
 * XP, and the XP the next level starts at, or null at the top level.
 */
export function levelStatus(xp: number, multiplier = 1, maxLevel = 99): { level: number; xp: number; next: number | null; toGo: number } {
  const level = levelForXp(xp, multiplier, maxLevel);
  if (level >= maxLevel) return { level, xp, next: null, toGo: 0 };
  const next = Math.ceil(xpForLevel(level + 1) * multiplier);
  return { level, xp, next, toGo: Math.max(0, next - xp) };
}
