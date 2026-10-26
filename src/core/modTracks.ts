import type { TrackDef } from './race';
import { TRACKS_SCHEMA } from './raceContent';
import type { RaceContent, VenueDef } from './raceDay';
import type { KeyValueStore } from './storage';
import { layoutProblems } from './trackCheck';
import { checkTrackParts, type TrackPartsData } from './trackParts';
import { validate, type Schema } from './validate';

// Mod tracks: player-made tracks raced without a venue map. A mod track is the file the track
// editor's Export button makes (<id>.track.json). The game finds them two ways:
//   - files in public/mods/tracks/ (mods/tracks/ beside the published game), listed in the
//     index.json the build writes there (vite.config.ts), since a website can't list a folder;
//   - files imported in the game from the player's device, kept in that browser's storage.
// Each one gets the same checks as the game's own tracks (schema, sections, start straight,
// scenery and the start official), and a track that fails is listed with the reason, not raced.
// For now a mod track can only use the game's own track parts and art: anything else is a problem.

/** The format tag the track editor writes in a .track.json file. */
export const TRACK_FILE = 'mxrpg-track';
/** Where installed mod tracks live, relative to the game's base URL. */
export const MOD_DIR = 'mods/tracks/';
/** The index of that folder, written by the build. */
export const MOD_INDEX = `${MOD_DIR}index.json`;
/** Where imported mod tracks are kept (a JSON list of { file, text }). */
export const IMPORT_KEY = 'mods.tracks';
/** Mod track ids are kept apart from the game's own. */
export const MOD_PREFIX = 'mod.';
/** Every mod track race day is a 50cc race against the local field, like Farmland MX. */
export const MOD_CLASS = '50cc';
export const MOD_FIELD = 'area1.local';
/** The route place that opens the mod track list (world.json places[].map). */
export const MOD_PLACE = 'mod-tracks';

export interface ModTrack {
  /** The file name, as listed under the track's name. */
  file: string;
  /** Installed in the mods folder, or imported in this browser. */
  source: 'folder' | 'imported';
  /** The track's name, or the file name when it can't be read. */
  name: string;
  /** The track as raced (id prefixed with mod.), when it passed every check. */
  track: TrackDef | null;
  /** Why it can't be raced: empty when it can. */
  problems: string[];
}

const TRACK_SCHEMA: Schema = (TRACKS_SCHEMA as { fields: Record<string, { items: Schema }> }).fields.tracks.items;

/** A safe id from a file name: letters, digits, - and _ only. */
function fileId(file: string): string {
  const base = file.replace(/\.track\.json$/i, '').replace(/\.json$/i, '');
  return base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
}

/** Reads and checks one track file's text. Never throws: problems are listed instead. */
export function readModTrack(rc: RaceContent & { trackParts: TrackPartsData }, file: string, text: string, source: ModTrack['source']): ModTrack {
  const out: ModTrack = { file, source, name: file, track: null, problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    out.problems.push('the file is not valid JSON');
    return out;
  }
  const wrapped = raw as { format?: unknown; track?: unknown } | null;
  const t = (wrapped && wrapped.format === TRACK_FILE ? wrapped.track : raw) as Record<string, unknown> | null;
  if (!t || typeof t !== 'object' || !Array.isArray(t.path) || !Array.isArray(t.sections)) {
    out.problems.push('this is not a track file: export one from the track editor');
    return out;
  }
  if (typeof t.name === 'string' && t.name.trim()) out.name = t.name.trim();
  if (t.draft === true) {
    out.problems.push('the track is unfinished: mark it Ready to race in the track editor first');
    return out;
  }
  // The editor's working flags aren't part of a raced track.
  const { draft: _draft, ...rest } = t;
  const track = { ...rest, id: `${MOD_PREFIX}${source === 'imported' ? 'imp.' : ''}${fileId(file)}` } as unknown as TrackDef;
  const say = (field: string, message: string) => out.problems.push(field ? `${field}: ${message}` : message);
  for (const e of validate(file, track, TRACK_SCHEMA)) say(e.field, e.message);
  if (out.problems.length) return out;
  if (track.practiceOnly) say('', 'it is a practice-only track, so it has no race start');
  track.sections.forEach((s, j) => !rc.racing.sections[s.type] && say(`sections[${j}].type`, `no section "${s.type}" in this game`));
  for (const p of layoutProblems(track, rc.racing.sections)) say('', p.message);
  if (out.problems.length) return out;
  try {
    for (const e of checkTrackParts(rc.trackParts, [track], () => true)) say(e.field.replace(/^tracks\[0\]\./, ''), e.message);
  } catch (e) {
    say('', `the track can't be laid out (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!out.problems.length) out.track = track;
  return out;
}

/** A race day venue for a mod track, raced from where the player is (no map of its own). */
export function modVenue(mod: ModTrack, map: string): VenueDef {
  return { id: `venue-${mod.track!.id}`, name: mod.track!.name, map, track: mod.track!.id, class: MOD_CLASS, field: MOD_FIELD };
}

/** Puts the raceable mod tracks in the content's track list (replacing any loaded before), so race days find them. */
export function registerModTracks(rc: RaceContent, mods: ModTrack[]): void {
  const own = rc.tracks.tracks.filter((t) => !t.id.startsWith(MOD_PREFIX));
  rc.tracks.tracks = [...own, ...mods.flatMap((m) => (m.track ? [m.track] : []))];
}

export interface ImportedFile {
  file: string;
  text: string;
}

export function importedFiles(store: KeyValueStore): ImportedFile[] {
  try {
    const list = JSON.parse(store.get(IMPORT_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((f): f is ImportedFile => typeof f?.file === 'string' && typeof f?.text === 'string') : [];
  } catch {
    return [];
  }
}

/** Keeps an imported file, replacing one of the same name. */
export function keepImport(store: KeyValueStore, file: string, text: string): void {
  const list = importedFiles(store).filter((f) => f.file !== file);
  list.push({ file, text });
  store.set(IMPORT_KEY, JSON.stringify(list));
}

export function forgetImport(store: KeyValueStore, file: string): void {
  store.set(IMPORT_KEY, JSON.stringify(importedFiles(store).filter((f) => f.file !== file)));
}

/** Every mod track: the installed ones, then this browser's imports, each checked. */
export function readAll(rc: RaceContent & { trackParts: TrackPartsData }, folder: ImportedFile[], imported: ImportedFile[]): ModTrack[] {
  return [...folder.map((f) => readModTrack(rc, f.file, f.text, 'folder')), ...imported.map((f) => readModTrack(rc, f.file, f.text, 'imported'))];
}

/** Reads every mod track and puts the raceable ones where race days find them. */
export function loadModTracks(rc: RaceContent & { trackParts: TrackPartsData }, folder: ImportedFile[], store: KeyValueStore): ModTrack[] {
  const mods = readAll(rc, folder, importedFiles(store));
  registerModTracks(rc, mods);
  return mods;
}

/** Fetches the installed mod tracks listed in the folder's index. A missing folder is no mod tracks. */
export async function fetchFolder(base: string): Promise<ImportedFile[]> {
  try {
    const res = await fetch(`${base}${MOD_INDEX}`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const names = (await res.json()) as unknown;
    if (!Array.isArray(names)) return [];
    const files = await Promise.all(
      names
        .filter((n): n is string => typeof n === 'string' && /\.json$/i.test(n) && !n.includes('/'))
        .map(async (file) => {
          try {
            const r = await fetch(`${base}${MOD_DIR}${encodeURIComponent(file)}`, { cache: 'no-cache' });
            return r.ok ? { file, text: await r.text() } : { file, text: '' };
          } catch {
            return { file, text: '' };
          }
        }),
    );
    return files;
  } catch {
    return [];
  }
}
