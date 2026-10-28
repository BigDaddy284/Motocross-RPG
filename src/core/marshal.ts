// Marshals placed as scenery (Boss, 28 Oct 2026): each watches a stretch of the track and keeps
// the flag down until a rider goes down or is getting back on it there, then waves it until they
// are away again. The stretch runs in the lap direction from the nearest point of the track to
// the marshal to the end they set (the last point of their `route`, projected onto the track),
// capped at WATCH_MAX grid units; without one it is the next WATCH_DEFAULT units of track. The
// race view animates them (world/RaceView.ts) and the track editor mirrors this file.
import type { SceneryItem } from './race';
import type { RiderState } from './riderAI';
import { type LapGeom, nearestOnLap, pointAt } from './trackGeom';

export const MARSHAL_ITEM = 'marshal';
/** The longest watch, in grid units (about 48 m). */
export const WATCH_MAX = 36;
/** The watch of a marshal with no end set. */
export const WATCH_DEFAULT = 18;
/** The shortest watch: an end set at or behind the marshal watches at least this much. */
export const WATCH_MIN = 2;
/** The stand a marshal has, with the height of the platform they stand on in metres. */
export const MARSHAL_STANDS: Record<string, number> = { ground: 0, pallet: 1.0, tower: 1.0, pair: 0, bales: 0 };
/** Rider states that raise the flag: down, or getting back on. */
export const DOWN_STATES: ReadonlySet<RiderState> = new Set<RiderState>(['crashed', 'remount']);

export interface Watch {
  /** Lap fractions: the stretch runs from f0 forwards to f1 (f1 may pass 1 when it wraps the lap). */
  f0: number;
  f1: number;
  /** Its length in grid units. */
  len: number;
  /** True when the end set was further than WATCH_MAX away and the watch stops short of it. */
  capped: boolean;
}

/** The stretch a marshal watches. */
export function marshalWatch(g: LapGeom, it: SceneryItem): Watch {
  const from = nearestOnLap(g, it.x, it.y).f;
  const end = it.route?.length ? it.route[it.route.length - 1] : null;
  let len = WATCH_DEFAULT;
  if (end) {
    const to = nearestOnLap(g, end[0], end[1]).f;
    len = (((to - from) % 1) + 1) % 1 * g.total;
  }
  const capped = len > WATCH_MAX;
  len = Math.max(WATCH_MIN, Math.min(WATCH_MAX, len));
  return { f0: from, f1: from + len / g.total, len, capped };
}

/** True when a rider at `dist` laps round the race is on the stretch. */
export function inWatch(w: Watch, dist: number): boolean {
  const f = ((dist % 1) + 1) % 1;
  const rel = (((f - w.f0) % 1) + 1) % 1;
  return rel <= w.f1 - w.f0 + 1e-9;
}

/** True when any rider is down on the stretch, which raises the flag. */
export function flagUp(w: Watch, riders: { dist: number; state: RiderState }[]): boolean {
  return riders.some((r) => DOWN_STATES.has(r.state) && inWatch(w, r.dist));
}

/** The point of the track a marshal faces: the middle of their watch. */
export function watchFocus(g: LapGeom, w: Watch): { x: number; y: number } {
  const p = pointAt(g, (w.f0 + w.f1) / 2);
  return { x: p.x, y: p.y };
}

/** The editor's checks: a watch cut short, or one with no track near its end. */
export function marshalProblems(g: LapGeom, scenery: SceneryItem[]): { i: number; level: 'warning'; message: string }[] {
  const out: { i: number; level: 'warning'; message: string }[] = [];
  scenery.forEach((it, i) => {
    if (it.type !== MARSHAL_ITEM || !it.route?.length) return;
    const w = marshalWatch(g, it);
    const end = it.route[it.route.length - 1];
    if (nearestOnLap(g, end[0], end[1]).d > 8) out.push({ i, level: 'warning', message: `the marshal at ${it.x}, ${it.y} has their watch's end set at ${end[0]}, ${end[1]}, well off the track; it is taken as the nearest point of the track` });
    else if (w.capped) out.push({ i, level: 'warning', message: `the marshal at ${it.x}, ${it.y} watches ${WATCH_MAX} grid units of track, not as far as the end set at ${end[0]}, ${end[1]}` });
  });
  return out;
}
