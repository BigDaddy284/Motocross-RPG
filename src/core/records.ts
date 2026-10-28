import type { CareerState } from './career';
import type { Content } from './content';

// Records (Boss, 28 Oct 2026): wins out of attempts for everything that can be raced again and
// again, such as "Riverside Arena: wins 3/26". Race days at each track, each championship (replays
// count, though the badge or trophy is only given once) and each challenge. Pure rules.

export interface RecordLine {
  label: string;
  wins: number;
  attempts: number;
  /** Anything else worth a word: a championship's best finish. */
  note?: string;
}

export interface RecordGroup {
  title: string;
  lines: RecordLine[];
}

/** Counter keys for a race day at a venue (RaceScene sets them). */
export const venueDays = (id: string) => `venue.${id}.days`;
export const venueWins = (id: string) => `venue.${id}.wins`;
/** Counter keys for a challenge (RaceScene sets them). */
export const challengeRuns = (id: string) => `challenge.${id}.runs`;
export const challengeWins = (id: string) => `challenge.${id}.wins`;

/** Everything the rider has had a go at, wins out of attempts. Nothing tried yet is left out. */
export function careerRecords(content: Pick<Content, 'tracks' | 'championships' | 'challenges'>, career: CareerState): RecordGroup[] {
  const c = career.counters;
  const groups: RecordGroup[] = [];
  const venues = content.tracks.venues.filter((v) => !v.practiceOnly && c[venueDays(v.id)]);
  // Mod tracks have no venue in tracks.json: they're listed by id under one name.
  const mods = Object.keys(c).filter((k) => /^venue\.mod\..*\.days$/.test(k));
  const raceLines: RecordLine[] = venues.map((v) => ({ label: v.name, wins: c[venueWins(v.id)] ?? 0, attempts: c[venueDays(v.id)] }));
  if (mods.length) raceLines.push({ label: 'Mod tracks', wins: mods.reduce((a, k) => a + (c[k.replace(/\.days$/, '.wins')] ?? 0), 0), attempts: mods.reduce((a, k) => a + c[k], 0) });
  if (raceLines.length) groups.push({ title: 'Race days', lines: raceLines });

  const done = career.champs?.done ?? {};
  const champLines = content.championships.championships
    .filter((d) => done[d.id]?.runs)
    .map((d) => ({ label: d.name, wins: done[d.id].wins, attempts: done[d.id].runs, note: `best ${ordinalOf(done[d.id].best)}` }));
  if (champLines.length) groups.push({ title: 'Championships', lines: champLines });

  const challengeLines = content.challenges.challenges
    .filter((d) => c[challengeRuns(d.id)])
    .map((d) => ({ label: d.name, wins: c[challengeWins(d.id)] ?? 0, attempts: c[challengeRuns(d.id)] }));
  if (challengeLines.length) groups.push({ title: 'Challenges', lines: challengeLines });
  return groups;
}

/** "Riverside Arena: wins 3/26". */
export function recordText(r: RecordLine): string {
  return `${r.label}: wins ${r.wins}/${r.attempts}${r.note ? ` (${r.note})` : ''}`;
}

function ordinalOf(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
