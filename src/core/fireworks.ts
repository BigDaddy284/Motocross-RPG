import { mixSeed, seededRng } from './race';
import type { RiderState } from './riderAI';

// Fireworks off the finish arch (Boss, 30 Oct 2026): on a Supercross, EnduroCross or No-Turn
// Takedown track, fireworks go up from the tops of the finish arch's posts as the winner comes to
// the line, starting a little before they cross it. A race with a winner crossing the line first
// has them (every moto, and every heat and final run of a No-Turn Takedown); practice, qualifying
// and a No-Turn Takedown's seeding run, ridden one at a time, don't. Like the rest of the race view
// they are drawn from a seed, so a race always looks the same.

/** The track kinds (trackParts.json) whose finish arch sends up fireworks for the winner. */
export const FIREWORK_KINDS: ReadonlySet<string> = new Set(['stadium', 'endurocross', 'no_turn']);
/** Seconds before the winner crosses the line that the first fireworks go up. */
export const FIREWORKS_LEAD = 1.2;
/** Seconds the arch keeps sending fireworks up. */
export const SHOW_SECONDS = 6;
/** Seconds between shells from each post, before a little jitter. */
const EVERY = 0.45;
/** The shells' colours: bright, so they read against an arena roof or the grass. */
export const FIREWORK_COLOURS = [0xff4a3d, 0xffd23f, 0x3fa9ff, 0x4dff88, 0xff6bd6, 0xffffff, 0xff9a2e];

interface Runner {
  dist: number;
  speed: number;
  state: RiderState;
}

/**
 * True once the leader of a `laps`-lap race is FIREWORKS_LEAD seconds or less from the finish
 * line at their speed (or over it). `lapMetres` is the lap's length, to turn speed into laps.
 */
export function fireworksDue(laps: number | undefined, riders: Runner[], lapMetres: number): boolean {
  if (!laps || laps < 1 || lapMetres <= 0) return false;
  const racing = riders.filter((r) => r.state !== 'retired');
  if (!racing.length) return false;
  return racing.some((r) => r.dist + (Math.max(0, r.speed) * FIREWORKS_LEAD) / lapMetres >= laps);
}

/** One shell: `at` seconds into the show, from post `post`, bursting `rise` grid units above its top. */
export interface Shell {
  at: number;
  post: number;
  colour: number;
  rise: number;
}

/** The show for an arch with `posts` posts: shells from each in turn, offset so they don't go up together. */
export function fireworkShow(posts: number, seed: number): Shell[] {
  const rnd = seededRng(mixSeed(seed, 0xf14e));
  const out: Shell[] = [];
  for (let post = 0; post < posts; post++) {
    for (let at = (post % 2) * (EVERY / 2); at < SHOW_SECONDS; at += EVERY * (0.75 + 0.5 * rnd())) {
      out.push({ at, post, colour: FIREWORK_COLOURS[Math.floor(rnd() * FIREWORK_COLOURS.length)], rise: 3.5 + 2 * rnd() });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
