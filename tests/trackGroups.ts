// The per-track tests are split into files by area group, like the start-procedure tests, so no
// file runs much past a minute of synchronous work: a vitest worker that can't answer the runner for
// 60 s fails the run with "Timeout calling onTaskUpdate" (seen once Areas 3 to 8 brought 30 more
// tracks, 31 Oct 2026). Each track belongs to exactly one group (checked in tracks.test.ts).
export const TRACK_GROUPS = {
  'areas-1-2': (id: string) => !/^(challenge-)?a[3-8]-/.test(id),
  'areas-3-5': (id: string) => /^(challenge-)?a[345]-/.test(id),
  'areas-6-8': (id: string) => /^(challenge-)?a[678]-/.test(id),
} as const;
export type TrackGroup = keyof typeof TRACK_GROUPS;

export function tracksIn<T extends { id: string }>(group: TrackGroup, tracks: T[]): T[] {
  return tracks.filter((t) => TRACK_GROUPS[group](t.id));
}
