// The flag man and the pit crews placed as scenery by the finish line (Boss, 29 Oct 2026).
//
// The flag man stands just before the finish line. As the leader comes up to him on the
// penultimate lap, about to start the last lap, he holds up the white flag, until the leader comes
// round again, when he puts the white flag down and takes up the chequered flag. He holds the
// chequered flag until the last rider still in the race has passed him.
//
// A pit crew member stands just after the finish line holding a pit board for one rider, picked
// for them when the race starts. As that rider comes up to them each lap they lean out holding
// the board up (the rider's place and the laps to go) until the rider has gone by. Later in the
// game the player can have a pit crew of their own, once the fourth pit board message is unlocked;
// for now every crew holds a board for a CPU rider.
//
// The race view animates them (world/RaceView.ts) and the track editor places them.
import type { SceneryItem } from './race';
import type { RiderState } from './riderAI';
import { type LapGeom, nearestOnLap } from './trackGeom';

export const FLAGGER_ITEM = 'flagger';
export const PIT_CREW_ITEM = 'pit_crew';
/** How far before them (grid units) a rider counts as coming up to the flag man or a pit crew. */
export const APPROACH = 24;
/** How far past them (grid units) a pit crew keeps the board out after their rider has gone by. */
export const BOARD_PAST = 3;

/** What the flag man is holding up. */
export type FlagState = 'none' | 'white' | 'chequered';

interface Runner {
  id: string;
  dist: number;
  state: RiderState;
}

/**
 * Where on the lap someone stands, as a lap fraction from -0.5 to 0.5: the nearest point of the
 * track to them, negative just before the finish line, positive just after it.
 */
export function crewSpot(g: LapGeom, it: SceneryItem): number {
  const f = nearestOnLap(g, it.x, it.y).f;
  return f > 0.5 ? f - 1 : f;
}

/**
 * The flag man's flag, for a race of `laps` laps, with him standing at lap fraction `spot`
 * (crewSpot) and riders coming up to him from `approach` (a lap fraction) away. The white flag
 * is up from the leader coming up to him to start the last lap; the chequered flag from the
 * leader coming up to him to finish, until every rider still racing has passed him.
 */
export function flagState(spot: number, approach: number, laps: number | undefined, riders: Runner[]): FlagState {
  if (!laps || laps < 1) return 'none';
  const racing = riders.filter((r) => r.state !== 'retired');
  if (!racing.length) return 'none';
  const leader = Math.max(...racing.map((r) => r.dist));
  // Passing him on the last lap: just before the line he is passed as each rider finishes; set
  // after it, a rider has passed him once over the line (riders pull over after the flag).
  const passed = laps + Math.min(spot, 0);
  if (leader >= laps + spot - approach) return racing.every((r) => r.dist >= passed) ? 'none' : 'chequered';
  if (laps >= 2 && leader >= laps - 1 + spot - approach) return 'white';
  return 'none';
}

/**
 * True while a pit crew at lap fraction `spot` holds the board out for a rider at `dist`: from the
 * rider coming up to them (`approach` away) until `past` after the rider has gone by, every lap
 * up to the one that starts the last lap (LAST), not as they come round to finish.
 */
export function boardOut(spot: number, approach: number, past: number, laps: number | undefined, dist: number, state: RiderState): boolean {
  if (state === 'retired' || dist < 0) return false;
  // The last board is the one for the last lap: none as the rider comes round to finish.
  if (laps && dist >= laps - 1 + spot + past) return false;
  const ahead = (((spot - dist) % 1) + 1) % 1;
  const behind = (((dist - spot) % 1) + 1) % 1;
  return ahead <= approach || behind <= past;
}

/**
 * The rider each pit crew holds a board for: CPU riders, picked by the crew's place in the list so
 * a track gives the same picks each race, different riders for different crews while there are
 * enough to go round.
 */
export function assignCrews(crews: number, riderIds: string[], playerId: string, seed: number): string[] {
  const pool = riderIds.filter((id) => id !== playerId).sort();
  if (!pool.length) return [];
  const start = Math.floor(Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % pool.length);
  return Array.from({ length: crews }, (_, k) => pool[(start + k * 7) % pool.length]);
}

/**
 * The words on a pit board held at lap fraction `spot` for a rider at `dist`: their place and the
 * laps to go counting the one they are starting as they pass (LAST for the last lap).
 */
export function boardText(place: number, laps: number | undefined, spot: number, approach: number, dist: number): [string, string] {
  if (!laps) return [`P${place}`, ''];
  const starting = Math.floor(dist - spot + approach) + 1;
  const toGo = laps - starting + 1;
  return [`P${place}`, toGo <= 1 ? 'LAST' : `${toGo} L`];
}
