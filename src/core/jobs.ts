// Batch jobs at the employers (Spec 15, Boss 30 Oct 2026, "gaps 1 to 3 go in together"): XP for
// every part made, one open job per facility that can be stopped and picked up again, and the
// random part the employer gives the rider from each finished batch. Pure rules, no graphics.

import type { CareerState, JobDef } from './career';
import type { SkillsData } from './skills';
import { addXp, childLevel, leadLevel, type LevelUp } from './skills';
import { SPARE, type SparePart } from './shops';
import type { Ticket } from './jobBoard';

/** A job the rider has started and not finished: the parts made so far (Spec 15.1, the facility lock). */
export interface OpenJob {
  job: string;
  made: number;
  /** A customer repair ticket under way (core/jobBoard.ts), for the job to be rebuilt on return. */
  ticket?: Ticket;
}

/** Jobs under way, by facility. Kept on the career, made on the first shift. */
export interface JobState {
  open: Record<string, OpenJob>;
}

export function jobState(career: CareerState): JobState {
  career.jobs ??= { open: {} };
  return career.jobs;
}

/** The facility a job locks while it is open: its own, or the job itself. */
export const facilityOf = (job: JobDef) => job.facility ?? job.id;

/** The job open at this job's facility, if any. */
export function openJobAt(career: CareerState, job: JobDef): OpenJob | null {
  return career.jobs?.open[facilityOf(job)] ?? null;
}

/**
 * Starts a job, or carries on the one already open at its facility. A facility holds one job at a
 * time, so a different job there waits until the open one is finished.
 */
export function startJob(career: CareerState, job: JobDef): { ok: true; open: OpenJob } | { ok: false; reason: string } {
  const state = jobState(career);
  const open = state.open[facilityOf(job)];
  if (open && open.job !== job.id) return { ok: false, reason: `You're part way through another batch here (${open.job}). Finish that first.` };
  if (!open) state.open[facilityOf(job)] = { job: job.id, made: 0 };
  return { ok: true, open: state.open[facilityOf(job)] };
}

/** Every Mechanical Engineer child skill at 80 or more: each pass then has a 4% chance of two parts (Boss, after Round 124). */
export function doublePartChance(skills: SkillsData, career: CareerState): number {
  const mech = skills.leads.find((l) => l.id === 'mech');
  if (!mech) return 0;
  return mech.children.every((c) => childLevel(skills, career.skills, c.id) >= 80) ? 0.04 : 0;
}

export interface PassResult {
  /** Parts this pass made: 1, or 2 on the double-part bonus. */
  parts: number;
  /** Pence paid for them. */
  pay: number;
  ups: LevelUp[];
  /** True when this pass finished the batch. */
  done: boolean;
}

/**
 * One pass through the stations: one part made (two on the bonus), paid per part, with the
 * stations' XP. The XP is paid once per pass, as a pass is one go at each station.
 */
export function finishPass(skills: SkillsData, career: CareerState, job: JobDef, payPerPart: number, rng: () => number = Math.random): PassResult {
  const open = startJob(career, job);
  if (!open.ok) return { parts: 0, pay: 0, ups: [], done: false };
  // A double only when the batch has room for it: a one-part ticket is one part.
  const parts = job.batch - open.open.made > 1 && rng() < doublePartChance(skills, career) ? 2 : 1;
  open.open.made += parts;
  const pay = payPerPart * parts;
  career.money += pay;
  const gains: Record<string, number> = {};
  for (const st of job.stations) for (const [skill, xp] of Object.entries(st.xp ?? {})) gains[skill] = (gains[skill] ?? 0) + xp;
  const ups = addXp(skills, career.skills, gains);
  return { parts, pay, ups, done: open.open.made >= job.batch };
}

/** The skill XP one pass gives, by child skill, for the shift's offer line. */
export function passXp(job: JobDef): Record<string, number> {
  const gains: Record<string, number> = {};
  for (const st of job.stations) for (const [skill, xp] of Object.entries(st.xp ?? {})) gains[skill] = (gains[skill] ?? 0) + xp;
  return gains;
}

/** Spec 15.3: the grade of a part made, from Mechanical Engineer and the facility. */
export function rollGrade(skills: SkillsData, career: CareerState, job: JobDef, engine: boolean, rng: () => number = Math.random): number {
  const mech = skills.leads.find((l) => l.id === 'mech')!;
  const mechLevel = leadLevel(skills, career.skills, mech);
  const level = (id: string) => childLevel(skills, career.skills, id);
  // Grade 10: 1 in 100,000 per part at Mechanical Engineer 99, scaled down below that, checked first.
  if (rng() < (mechLevel / 99) / 100000) return 10;
  let centre = 1 + 5 * (mechLevel / 99) + (job.facilityBonus ?? 0) + 0.5 * ((level('welding') + level('machining')) / 198);
  if (engine) centre += 0.5 * (level('engine_assembly') / 99);
  const spread = 1 + 2 * (mechLevel / 99);
  const grade = Math.round(centre + gaussian(rng) * spread * 0.5);
  return Math.max(1, Math.min(9, grade));
}

/** A standard normal draw (Box–Muller). */
function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface BatchResult {
  /** The part the employer gives the rider (Spec 15.1), now in the bag; null when the job keeps nothing. */
  kept: SparePart | null;
  batches: number;
}

/**
 * Closes a finished batch: counts it, frees the facility and puts the kept part in the bag. The
 * kept part is a new part of the rider's current class (no parts above your class, Boss 30 Oct
 * 2026), at a grade rolled by Spec 15.3. The bag's spare limit only gates buying, so a gift from
 * the employer always fits.
 */
export function finishBatch(skills: SkillsData, career: CareerState, job: JobDef, engineSlots: Set<string>, rng: () => number = Math.random): BatchResult {
  const state = jobState(career);
  delete state.open[facilityOf(job)];
  career.counters[job.id] = (career.counters[job.id] ?? 0) + 1;
  let kept: SparePart | null = null;
  if (job.keeps) {
    const slot = job.keeps[Math.floor(rng() * job.keeps.length)];
    kept = { slot, class: career.bike.class, grade: rollGrade(skills, career, job, engineSlots.has(slot), rng), condition: 1 };
    career.bag.push({ id: SPARE, part: kept });
  }
  return { kept, batches: career.counters[job.id] };
}
