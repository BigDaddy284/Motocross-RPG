// Cheering characters: fans placed as scenery (type "cheer") who walk in to their spot when a track
// loads, stand trackside, and react when a bike passes. Shared by the race view (RaceView), the
// content checks (trackParts) and the track editor, which mirrors the names here.
import type { SceneryItem, TrackDef } from './race';
import { SurfaceIndex, surfacePoints } from './trackClearance';
import type { TrackPartsData } from './trackParts';

export const CHEER_ITEM = 'cheer';
/** Body shapes, by how tall they stand against the official (1 is their height). */
export const CHEER_VARIANTS = ['adult', 'kid', 'tall', 'broad'] as const;
export type CheerVariant = (typeof CHEER_VARIANTS)[number];
export const VARIANT_SCALE: Record<CheerVariant, { h: number; w: number }> = { adult: { h: 1, w: 1 }, kid: { h: 0.72, w: 0.85 }, tall: { h: 1.15, w: 0.95 }, broad: { h: 1, w: 1.3 } };
/** What they do when a bike passes. */
export const CHEER_ACTIONS = ['arms_up', 'wave', 'clap', 'fist_pump', 'celebrate'] as const;
export type CheerAction = (typeof CHEER_ACTIONS)[number];
export const ACTION_NAMES: Record<CheerAction, string> = { arms_up: 'Arms up', wave: 'Wave', clap: 'Clap', fist_pump: 'Fist pump', celebrate: 'Celebrate' };
/** Shirt colours handed out when a fan has none of its own. */
export const CHEER_COLOURS = ['#e04040', '#4080e0', '#f0c030', '#40b060', '#f0f0f0', '#e07030', '#9060c0', '#30b0c0'];
/** A bike within this many grid units of a fan sets them off. */
export const CHEER_RANGE = 7;
/** A reaction lasts this long, and then the fan rests for between these seconds before the next (each fan their own). */
export const REACT_SECONDS = 1.6;
export const CHEER_REST: [number, number] = [2.5, 6.5];
/** Walking in on load: grid units a second. */
export const CHEER_WALK = 1.6;
/** How wide a fan stands, in grid units (the footprint in trackParts.json). */
export const CHEER_RADIUS = 0.4;

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export function cheerVariant(it: SceneryItem, i: number): CheerVariant {
  return (CHEER_VARIANTS as readonly string[]).includes(it.variant ?? '') ? (it.variant as CheerVariant) : CHEER_VARIANTS[Math.floor(hash(i * 3 + 1) * CHEER_VARIANTS.length)];
}
export function cheerAction(it: SceneryItem, i: number): CheerAction {
  return (CHEER_ACTIONS as readonly string[]).includes(it.action ?? '') ? (it.action as CheerAction) : CHEER_ACTIONS[Math.floor(hash(i * 5 + 2) * CHEER_ACTIONS.length)];
}
export function cheerColour(it: SceneryItem, i: number): string {
  return it.color ?? CHEER_COLOURS[Math.floor(hash(i * 7 + 3) * CHEER_COLOURS.length)];
}
/** The walk in: from where they are placed through the route's points; the last is where they stand. */
export function cheerRoute(it: SceneryItem): { x: number; y: number }[] {
  return [{ x: it.x, y: it.y }, ...(it.route ?? []).map(([x, y]) => ({ x, y }))];
}
/** How long each fan rests between reactions, and the delay before they start one: their own, so a crowd never moves as one. */
export function cheerTiming(i: number): { rest: number; delay: number } {
  return { rest: CHEER_REST[0] + (CHEER_REST[1] - CHEER_REST[0]) * hash(i * 11 + 5), delay: 0.05 + 0.45 * hash(i * 13 + 7) };
}

export interface CheerProblem {
  i: number;
  level: 'error' | 'warning';
  message: string;
}
/**
 * Fans must never be on the track: where they are placed, and where their walk ends (checked by
 * sceneryIssues for the footprint where placed; here for the route's end), are errors the game
 * refuses; a route that crosses the track on the way is a warning (they walk in before the race).
 */
export function cheerProblems(track: TrackDef, parts: TrackPartsData, index = new SurfaceIndex(surfacePoints(track))): CheerProblem[] {
  const out: CheerProblem[] = [];
  if (!parts.scenery.some((s) => s.id === CHEER_ITEM)) return out;
  (track.scenery ?? []).forEach((it, i) => {
    if (it.type !== CHEER_ITEM) return;
    const route = cheerRoute(it);
    if (route.length < 2) return;
    const end = route[route.length - 1];
    const endOff = index.offSurface(end.x, end.y) - CHEER_RADIUS;
    if (endOff < 0) { out.push({ i, level: 'error', message: `the cheering fan at ${it.x}, ${it.y} walks to ${end.x}, ${end.y}, ${endOff + CHEER_RADIUS < 0 ? 'on' : 'too near'} the racing surface; end their route trackside, clear of the track` }); return; }
    for (let k = 1; k < route.length; k++) {
      const a = route[k - 1];
      const b = route[k];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
      for (let s = 1; s < n; s++) {
        const x = a.x + ((b.x - a.x) * s) / n;
        const y = a.y + ((b.y - a.y) * s) / n;
        if (index.offSurface(x, y) < 0) { out.push({ i, level: 'warning', message: `the cheering fan at ${it.x}, ${it.y} crosses the track on their way in (at ${x.toFixed(1)}, ${y.toFixed(1)}); they walk in before the race, so it only looks odd` }); return; }
      }
    }
  });
  return out;
}
