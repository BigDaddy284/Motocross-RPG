import { addXp, type LevelUp, type SkillsData, type SkillState } from './skills';
import type { ContentError, Schema } from './validate';

// Fitness training (Spec 3.3, Boss 29 Oct 2026): Area 1 has bodyweight drills on the exercise mat
// at home (Strength) and runs at the running track with the coach (Endurance), plus a little
// Agility for walking about. Each drill is a short round played by hand (Spec 3, Round 122): about
// 40 seconds, it can't be failed, and finishing it gives its fixed XP whatever the score. Unlimited,
// with no cooldowns. Pure rules with no graphics; the rounds themselves are drawn by the HUD.

/** How a drill's round plays: a rep timing bar, or keeping a running pace in its band. */
export type DrillGame = 'reps' | 'pace' | 'react';

export interface DrillDef {
  /** The map object action that starts it (train.bodyweight), or the NPC's drill. */
  id: string;
  name: string;
  /** The child skill it trains. */
  skill: string;
  /** XP for each finished round, whatever the score. */
  xp: number;
  game: DrillGame;
  /** Milliseconds a round lasts. */
  ms: number;
  /** The NPC who runs it (talk to them to start), if any. */
  npc?: string;
  /** The venue whose start menu offers it (the backyard loop's gate drop), if any. */
  venue?: string;
  /** One line on how to play, shown before the round. */
  how: string;
}

export interface TrainingData {
  drills: DrillDef[];
  /** Agility from walking: this much XP every `tiles` tiles walked. */
  walk: { skill: string; tiles: number; xp: number };
}

export const drillForAction = (data: TrainingData, action: string): DrillDef | undefined => data.drills.find((d) => d.id === action && !d.npc && !d.venue);
export const drillForNpc = (data: TrainingData, npc: string): DrillDef | undefined => data.drills.find((d) => d.npc === npc);
export const drillsAtVenue = (data: TrainingData, venue: string): DrillDef[] => data.drills.filter((d) => d.venue === venue);

/** Gives a finished round's XP. The score is only for the round's own screen: it never changes the XP. */
export function finishRound(skills: SkillsData, state: SkillState, drill: DrillDef): LevelUp[] {
  return addXp(skills, state, { [drill.skill]: drill.xp });
}

/**
 * Counts tiles walked and gives walking XP every `walk.tiles` of them. `carry` holds the tiles
 * walked since the last XP; returns the new carry and any level-ups.
 */
export function walked(data: TrainingData, skills: SkillsData, state: SkillState, carry: number, tiles = 1): { carry: number; ups: LevelUp[] } {
  let n = carry + tiles;
  const times = Math.floor(n / data.walk.tiles);
  n -= times * data.walk.tiles;
  return { carry: n, ups: times > 0 ? addXp(skills, state, { [data.walk.skill]: times * data.walk.xp }) : [] };
}

// ---- the rounds' scoring, shared by the HUD and tests ----

/**
 * The gate drop (Boss, 30 Oct 2026): a close-up of the front wheel at the gate; watch it fall and
 * react. A press within the window after the drop is a good start, before it a jumped start, after
 * it a slow one. The gate drops as if slower only at much later Starts levels, from GATE_EASE_LEVEL
 * on, so nobody gets the easy version from Area 1 alone.
 */
export const GATE_WINDOW_MS = 320;
export const GATE_EASE_LEVEL = 70;
export const GATE_EASE_PER_LEVEL_MS = 6;
export const gateWindowMs = (startsLevel: number): number => GATE_WINDOW_MS + Math.max(0, startsLevel - GATE_EASE_LEVEL + 1) * GATE_EASE_PER_LEVEL_MS;
/** How a press at `reactMs` after the drop (negative before it) scores. */
export const gateStart = (reactMs: number, startsLevel: number): 'jumped' | 'good' | 'slow' => (reactMs < 0 ? 'jumped' : reactMs <= gateWindowMs(startsLevel) ? 'good' : 'slow');
/** Seconds the gate holds before dropping: 1.5 to 4.5, never the same. */
export const gateHoldMs = (rng: () => number): number => 1500 + rng() * 3000;

/** A rep counts when the marker (0 to 1 across the bar) is inside the zone. */
export const REP_ZONE: [number, number] = [0.4, 0.6];
export const goodRep = (marker: number): boolean => marker >= REP_ZONE[0] && marker <= REP_ZONE[1];

/** The running pace band (0 to 1 up the bar): inside it, the split is on pace. */
export const PACE_BAND: [number, number] = [0.55, 0.75];
export const onPace = (pace: number): boolean => pace >= PACE_BAND[0] && pace <= PACE_BAND[1];

// ---- content checks ----

const ID = /^[a-z0-9_.-]+$/;

export const TRAINING_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    drills: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['npc', 'venue'],
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          skill: { type: 'string', pattern: ID },
          xp: { type: 'number', min: 1 },
          game: { type: 'string', oneOf: ['reps', 'pace', 'react'] },
          ms: { type: 'number', integer: true, min: 5000 },
          npc: { type: 'string', pattern: ID },
          venue: { type: 'string', pattern: ID },
          how: { type: 'string', nonEmpty: true },
        },
      },
    },
    walk: { type: 'object', fields: { skill: { type: 'string', pattern: ID }, tiles: { type: 'number', integer: true, min: 1 }, xp: { type: 'number', min: 1 } } },
  },
};

/** Checks training.json against the skills and NPCs. */
export function checkTraining(file: string, data: TrainingData, c: { skills: SkillsData; npcs: { id: string }[]; tracks?: { venues: { id: string }[] } }): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const children = new Set(c.skills.leads.flatMap((l) => l.children.map((k) => k.id)));
  const seen = new Set<string>();
  data.drills.forEach((d, i) => {
    const at = (f: string) => `drills[${i}].${f}`;
    if (seen.has(d.id)) err(at('id'), `"${d.id}" is used twice`);
    seen.add(d.id);
    if (!children.has(d.skill)) err(at('skill'), `no skill "${d.skill}"`);
    if (d.npc && !c.npcs.some((n) => n.id === d.npc)) err(at('npc'), `no NPC "${d.npc}"`);
    if (d.venue && c.tracks && !c.tracks.venues.some((v) => v.id === d.venue)) err(at('venue'), `no venue "${d.venue}"`);
  });
  if (!children.has(data.walk.skill)) err('walk.skill', `no skill "${data.walk.skill}"`);
  return errors;
}
