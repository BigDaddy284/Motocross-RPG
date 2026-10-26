import type { TrackDef } from './race';
import { headingAt, lapGeom, nearestOnLap, START_PAD, startGeom, startHalfWidth, startHeadingAt, startPointAt } from './trackGeom';
import { DEFAULT_TRACK_WIDTH } from './trackParts';

// Checks that a track's sections and start straight agree with its drawing, shared by the game's
// content checks and (mirrored) the track editor. A section's type says how the race simulation
// times it and how riders ride it; the shape it is drawn on is the track maker's choice (a wide
// hairpin, a tight sweeper), so no check ties a type to a drawn shape.

export interface LayoutProblem {
  field: string;
  message: string;
}

/** Shortest start straight, in grid units: room for the gate, the line-up and a run to the lap. */
export const START_MIN = 12;
/** Steepest angle, in degrees, the start straight may join the lap at. */
export const JOIN_MAX = 75;

export function layoutProblems(track: TrackDef, sectionDefs: Record<string, { name: string }>): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  track.sections.forEach((s, i) => {
    if (!sectionDefs[s.type]) return;
    if (s.type === 'start_gate') out.push({ field: `sections[${i}].type`, message: `section ${i + 1} is a start gate on the lap; the start is its own start straight now, so make this a straight` });
  });
  out.push(...startProblems(track));
  return out;
}

/** The start straight: there, long enough, joined onto the lap, clear of the rest of the track. */
export function startProblems(track: TrackDef): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const add = (message: string) => out.push({ field: 'start', message });
  if (!track.start || track.start.path.length < 2) {
    add('no start straight: every track needs a start gate on its own start straight that joins the lap');
    return out;
  }
  const g = lapGeom(track.path);
  const s = startGeom(track, g);
  const width = track.width ?? DEFAULT_TRACK_WIDTH;
  const end = s.pts[s.pts.length - 1];
  const near = nearestOnLap(g, end.x, end.y);
  if (near.d > 0.3) add(`the start straight ends ${near.d.toFixed(1)} grid units off the lap; its last point must be on the lap where it joins`);
  if (s.total < START_MIN) add(`the start straight is ${s.total.toFixed(1)} grid units long; it needs at least ${START_MIN} for the gate, the line-up and a run to the lap`);
  let turn = startHeadingAt(s, s.total - 0.5, 0.5) - headingAt(g, s.join);
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  if (Math.abs(turn) > (JOIN_MAX * Math.PI) / 180) add(`the start straight meets the lap at ${Math.round((Math.abs(turn) * 180) / Math.PI)}°; join it at ${JOIN_MAX}° or less, heading the way the lap runs`);
  // Clear of the lap everywhere but where it merges, the start pad behind the gate included.
  const merge = width * 1.5 + 1;
  for (let u = -START_PAD; u < s.total - merge; u += 0.25) {
    const p = startPointAt(s, u);
    const d = nearestOnLap(g, p.x, p.y).d;
    const clear = width / 2 + startHalfWidth(s, u, width / 2) + 0.5;
    if (d < clear) {
      add(`the start straight runs into the lap at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}; keep it at least ${clear.toFixed(1)} grid units clear until it joins`);
      break;
    }
  }
  return out;
}
