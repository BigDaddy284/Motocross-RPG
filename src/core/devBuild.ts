// DEV ONLY, v2.1DevOnly test build (Boss, 4 Nov 2026): every new rider starts with every skill at
// the max level and the most cash, so testing never stops at a skill gate. Area and championship
// locks are untouched: each area still opens only when its championship is won (Boss, 4 Nov 2026).
// This branch is for testing only and must never be merged into test/v2.0 or main.

import type { CareerState } from './career';
import { pence } from './career';
import { leadXp, xpForLevel, type SkillsData } from './skills';
import { setTestAlwaysWin } from './race';
import { PLAYER_ID, type RaceDay } from './raceDay';
import type { SupercrossNight } from './supercross';

/** Switches the dev start on. Set to false to get a normal new career on this branch. */
export const DEV_MAX_START = true;

/** The dev start's cash in pounds: the most the HUD's money line shows comfortably. */
export const DEV_START_MONEY = 9_999_999;

/** Fills a career's skills so every child and lead skill sits at the max level, and gives it the dev cash. */
export function applyDevMaxStart(skills: SkillsData, career: CareerState): void {
  const top = xpForLevel(skills.maxLevel);
  for (const lead of skills.leads) {
    for (const c of lead.children) career.skills.xp[c.id] = Math.max(career.skills.xp[c.id] ?? 0, top);
    // A lead needs its children's XP times its multiplier; the bonus pool tops up the rest.
    const short = top * lead.multiplier - leadXp(career.skills, lead);
    if (short > 0) career.skills.bonus[lead.id] = (career.skills.bonus[lead.id] ?? 0) + short;
  }
  career.money = pence(DEV_START_MONEY);
}

// DEV ONLY, v2.1DevOnly test build (Boss, 5 Nov 2026): "Complete Race Day" on the first race's gate
// pick runs every race left that day off screen with the player first, straight to the overall.

/** Runs one race to the end with "always win" on, then puts the setting back as it was. */
function won<T>(always: boolean, run: () => T): T {
  setTestAlwaysWin(true);
  try {
    return run();
  } finally {
    setTestAlwaysWin(always);
  }
}

/** Runs every moto left on a race day with the player first in each. `always` is the "TEST: Always win" setting to restore. */
export function completeRaceDay(day: RaceDay, message: string, always: boolean): void {
  while (!day.done) {
    won(always, () => {
      if (!day.sprint) day.assignGates(day.gatesForPlayer().free[0]);
      const sim = day.startMoto(message);
      sim.runToEnd();
      day.finishMoto(sim);
    });
  }
}

/** Runs the rest of a Supercross night with the player first in every race they ride: heat, then the Main. */
export function completeSxNight(sx: SupercrossNight, message: string, always: boolean): void {
  for (let race = sx.next; race; race = sx.next) {
    const r = race;
    if (!r.riders.includes(PLAYER_ID)) sx.autoRun(r);
    else won(always, () => {
      const sim = sx.startRace(r, message, sx.gatesForPlayer(r).free[0]);
      sim.runToEnd();
      sx.finishRace(r, sim);
    });
  }
}
