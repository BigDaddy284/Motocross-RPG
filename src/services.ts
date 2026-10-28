import type { Content, Manifest } from './core/content';
import type { BakedMap } from './core/mapTypes';
import type { ImportedFile, ModTrack } from './core/modTracks';
import { SaveManager } from './core/saves';
import { SettingsStore } from './core/settings';
import { defaultStore } from './core/storage';
import { Travel } from './core/travel';

// Shared game state that lives outside any one scene. Boot fills in the loaded data.

// A preview build (VITE_STORE_NAMESPACE, see .github/workflows/ci.yml) keeps its saves apart from the main game's.
const store = defaultStore(import.meta.env.VITE_STORE_NAMESPACE || undefined);

export const services = {
  store,
  saves: new SaveManager(store),
  settings: new SettingsStore(store),
  manifest: null as unknown as Manifest,
  content: null as unknown as Content,
  maps: new Map<string, BakedMap>(),
  travel: null as unknown as Travel,
  /** The route picked with a route marshal: leaving this map by this exit goes to that place. */
  routePick: null as { map: string; exit: string; to: string } | null,
  /** The track files installed in the mods folder, as fetched at start. */
  modFolder: [] as ImportedFile[],
  /** Every mod track, installed and imported, checked (core/modTracks.ts). */
  modTracks: [] as ModTrack[],
};

export const CAREER_SLOT = 'career-1';
export const BUILD_LABEL = 'Alpha v1';
