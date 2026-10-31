import { BUILDINGS_SCHEMA, checkBuildings, type BuildingsData } from './buildings';
import type { BikesData, ItemDef, StoryData, WorldData } from './career';
import { Grid } from './grid';
import { objectTile, type BakedMap, type Facing } from './mapTypes';
import { ROUTE } from './travel';
import type { RacingData } from './race';
import { TRACK_PARTS_SCHEMA, checkTrackParts, type TrackPartsData } from './trackParts';
import { CHAMPIONSHIPS_SCHEMA, checkChampionships, type ChampionshipsData } from './championship';
import { RACING_SCHEMA, RIDERS_SCHEMA, SKILLS_SCHEMA, TRACKS_SCHEMA, checkRaceContent } from './raceContent';
import { riderPools, type RidersData, type RidersFile, type TracksData } from './raceDay';
import { SHOPS_SCHEMA, checkShopContent, type ShopsData } from './shops';
import type { SkillsData } from './skills';
import { VEHICLES_SCHEMA, checkVehicles, type VanSheet, type VehiclesData } from './vehicles';
import { MOD_PLACE } from './modTracks';
import { ERRANDS_SCHEMA, checkErrands, type ErrandsData } from './errands';
import { TRAINING_SCHEMA, checkTraining, type TrainingData } from './training';
import { CHALLENGES_SCHEMA, checkChallenges, type ChallengesData } from './challenge';
import { WORLD_MAP_SCHEMA, checkWorldMap } from './worldMap';
import { TOOLS_SCHEMA, checkTools, type ToolsData } from './tools';
import { JOB_BOARD_SCHEMA, checkJobBoard, type JobBoardData } from './jobBoard';
import { AREAS_SCHEMA, checkAreas, type AreasData } from './areas';
import { SETUP_SCHEMA, checkSetup, type SetupData } from './setup';
import { MODIFIERS_SCHEMA, checkModifiers, type ModifiersData } from './modifiers';
import { HOUSE_SCHEMA, checkHouse, type HouseData } from './house';
import { SPONSORS_SCHEMA, checkSponsors, type SponsorsData } from './sponsors';
import { validate, type ContentError, type Schema } from './validate';

// Game content loaded from public/data. Each file is checked against its schema, then the files
// are checked against each other and against the baked maps (missing sprites, maps, dialogue,
// NPCs standing on blocked tiles).

export interface NpcDef {
  id: string;
  name: string;
  sprite: string;
  dialogue: string;
  map?: string;
  tile?: [number, number];
  facing?: Facing;
  /** Line sets picked by flag before falling back to dialogue: the first whose if is set, or whose unless is not. A rule with sets is said once: the flag is set when its lines close. */
  talk?: { if?: string; unless?: string; dialogue: string; sets?: string }[];
  /** The NPC ignores the rider until this flag is set (GDD 4.2: only the opening chain's NPCs talk at first). */
  quietUntil?: string;
  /** The CPU rider this NPC is (riders.json): their name is shown over the NPC's head in place of name. */
  rider?: string;
  /**
   * The NPC's dialogue is news for the players (Manny Festo, Boss 29 Oct 2026): a "!" bubble over
   * them, orange until the current dialogue has been read, then white. A new message is a new
   * dialogue key, so it shows orange again.
   */
  news?: boolean;
}

/** A person's name ("Tasha Reid") rather than a job ("Track official"): every word starts with a capital. */
export const properName = (name: string): boolean => /^[A-Z]\S*( [A-Z]\S*)+$/.test(name);

/** The save flag for having read a news NPC's message (its dialogue key). */
export const newsRead = (dialogue: string): string => `read.${dialogue}`;

export interface DialogueLine {
  speaker: 'npc' | 'player' | 'narrator';
  text: string;
}

export interface Content {
  npcs: NpcDef[];
  dialogue: Record<string, { lines: DialogueLine[] }>;
  bikes: BikesData;
  items: Record<string, ItemDef>;
  story: StoryData;
  world: WorldData;
  skills: SkillsData;
  racing: RacingData;
  tracks: TracksData;
  riders: RidersData;
  trackParts: TrackPartsData;
  shops: ShopsData;
  vehicles: VehiclesData;
  buildings: BuildingsData;
  championships: ChampionshipsData;
  errands: ErrandsData;
  training: TrainingData;
  challenges: ChallengesData;
  tools: ToolsData;
  jobboard: JobBoardData;
  areas: AreasData;
  setup: SetupData;
  modifiers: ModifiersData;
  house: HouseData;
  sponsors: SponsorsData;
}

export interface Manifest {
  maps: { id: string; title: string; kind: string }[];
  characters: {
    frame: [number, number];
    anchor: [number, number];
    rows: Facing[];
    walk: { columns: number; fps: number };
    act: { columns: string[]; idle_fps: number };
    /** fit: the player's push-up frames (arms straight, then bent), side on at 96 by 64. */
    sheets: Record<string, { name: string; walk: string; act: string; fit?: string }>;
  };
  /** Van sheets by design id (tools/import-art.mjs). */
  vehicles?: Record<string, VanSheet>;
}

const ID = /^[a-z0-9_.-]+$/;
const FACING = ['down', 'left', 'right', 'up'] as const;

export const NPCS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    npcs: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['map', 'tile', 'facing', 'talk', 'quietUntil', 'rider', 'news'],
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          sprite: { type: 'string', pattern: ID },
          dialogue: { type: 'string', pattern: ID },
          map: { type: 'string', pattern: ID },
          tile: { type: 'array', items: { type: 'number', integer: true, min: 0 }, minItems: 2, maxItems: 2 },
          facing: { type: 'string', oneOf: FACING },
          talk: {
            type: 'array',
            items: { type: 'object', optional: ['if', 'unless', 'sets'], fields: { if: { type: 'string', pattern: ID }, unless: { type: 'string', pattern: ID }, dialogue: { type: 'string', pattern: ID }, sets: { type: 'string', pattern: ID } } },
          },
          quietUntil: { type: 'string', pattern: ID },
          rider: { type: 'string', pattern: ID },
          news: { type: 'boolean' },
        },
      },
    },
  },
};

export const DIALOGUE_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    dialogue: {
      type: 'record',
      values: {
        type: 'object',
        fields: {
          lines: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              fields: { speaker: { type: 'string', oneOf: ['npc', 'player', 'narrator'] }, text: { type: 'string', nonEmpty: true } },
            },
          },
        },
      },
    },
  },
};

const NUM = { type: 'number' } as const;
const WEIGHTS: Schema = { type: 'record', values: { type: 'number', min: 0 } };

export const BIKES_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    stats: { type: 'array', minItems: 1, items: { type: 'object', fields: { id: { type: 'string', pattern: ID }, name: { type: 'string', nonEmpty: true } } } },
    slots: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', optional: ['engine'], fields: { id: { type: 'string', pattern: ID }, name: { type: 'string', nonEmpty: true }, weights: WEIGHTS, engine: { type: 'boolean' } } },
    },
    classes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        optional: ['unlock', 'youth', 'mapImage'],
        fields: { id: { type: 'string', pattern: ID }, name: { type: 'string', nonEmpty: true }, ceiling: { type: 'number', min: 1 }, unlock: { type: 'number', integer: true, min: 1, max: 99 }, youth: { type: 'boolean' }, mapImage: { type: 'string', pattern: ID } },
      },
    },
    starter: {
      type: 'object',
      fields: {
        class: { type: 'string', pattern: ID },
        grade: { type: 'number', integer: true, min: 1, max: 10 },
        condition: { type: 'array', items: { type: 'number', min: 0, max: 1 }, minItems: 2, maxItems: 2 },
        brokenSlot: { type: 'string', pattern: ID },
      },
    },
    brands: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        fields: { id: { type: 'string', pattern: ID }, name: { type: 'string', nonEmpty: true }, starter: { type: 'string', nonEmpty: true }, character: { type: 'string', nonEmpty: true }, lean: WEIGHTS },
      },
    },
  },
};

export const ITEMS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    items: {
      type: 'record',
      values: {
        type: 'object',
        optional: ['part'],
        fields: {
          name: { type: 'string', nonEmpty: true },
          desc: { type: 'string' },
          part: { type: 'object', fields: { slot: { type: 'string', pattern: ID }, grade: { type: 'number', integer: true, min: 1, max: 10 }, condition: { type: 'number', min: 0, max: 1 } } },
        },
      },
    },
  },
};

const IDS: Schema = { type: 'array', items: { type: 'string', pattern: ID } };

const STORY_STEP_SCHEMA: Schema = {
        type: 'object',
        optional: ['times', 'needs', 'notReady', 'earn', 'markVan', 'confirm', 'lines', 'effects', 'toast'],
        fields: {
          id: { type: 'string', pattern: ID },
          journal: { type: 'string', nonEmpty: true },
          on: { type: 'object', optional: ['talk', 'use', 'map'], fields: { talk: { type: 'string', pattern: ID }, use: { type: 'string', pattern: ID }, map: { type: 'string', pattern: ID } } },
          times: { type: 'number', integer: true, min: 1 },
          needs: { type: 'object', optional: ['money', 'items', 'skills'], fields: { money: { type: 'number', min: 0 }, items: IDS, skills: { type: 'record', values: { type: 'number', integer: true, min: 1, max: 99 } } } },
          notReady: { type: 'string', pattern: ID },
          markVan: { type: 'string', pattern: ID },
          earn: { type: 'object', fields: { use: { type: 'string', pattern: ID }, maps: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } } } },
          confirm: { type: 'string', nonEmpty: true },
          lines: { type: 'string', pattern: ID },
          effects: { type: 'object', optional: ['money', 'give', 'take', 'fit', 'flags', 'giveParts'], fields: { money: NUM, give: IDS, take: IDS, fit: { type: 'string', pattern: ID }, flags: IDS, giveParts: { type: 'array', items: { type: 'object', optional: ['mods'], fields: { slot: { type: 'string', pattern: ID }, grade: { type: 'number', integer: true, min: 1, max: 10 }, condition: { type: 'number', min: 0, max: 1 }, mods: { type: 'array', items: { type: 'object', fields: { type: { type: 'string', pattern: ID }, value: { type: 'number', integer: true, min: -5, max: 5 } } } } } } } } },
          toast: { type: 'string', nonEmpty: true },
        },
      };

export const STORY_SCHEMA: Schema = {
  type: 'object',
  optional: ['note', 'after', 'chains'],
  fields: {
    note: { type: 'string' },
    startMoney: { type: 'number', min: 0 },
    chains: {
      type: 'array',
      items: { type: 'object', fields: { id: { type: 'string', pattern: ID }, needs: { type: 'string', pattern: ID }, steps: { type: 'array', minItems: 1, items: STORY_STEP_SCHEMA } } },
    },
    intro: { type: 'string', pattern: ID },
    done: { type: 'string', nonEmpty: true },
    after: {
      type: 'array',
      items: { type: 'object', optional: ['if', 'unless', 'talk'], fields: { if: { type: 'string', pattern: ID }, unless: { type: 'string', pattern: ID }, text: { type: 'string', nonEmpty: true }, talk: { type: 'string', pattern: ID } } },
    },
    steps: { type: 'array', minItems: 1, items: STORY_STEP_SCHEMA },
  },
};

export const WORLD_SCHEMA: Schema = {
  type: 'object',
  optional: ['note', 'testPayMultiplier', 'worldMap'],
  fields: {
    note: { type: 'string' },
    testPayMultiplier: { type: 'number', min: 0 },
    worldMap: WORLD_MAP_SCHEMA,
    locks: {
      type: 'array',
      items: { type: 'object', fields: { map: { type: 'string', pattern: ID }, object: { type: 'string', nonEmpty: true }, flag: { type: 'string', pattern: ID }, message: { type: 'string', nonEmpty: true } } },
    },
    places: {
      type: 'array',
      items: { type: 'object', optional: ['spawn', 'mods', 'needs'], fields: { map: { type: 'string', pattern: ID }, spawn: { type: 'string', pattern: ID }, name: { type: 'string', nonEmpty: true }, note: { type: 'string' }, mods: { type: 'boolean' }, needs: { type: 'string', pattern: ID } } },
    },
    routes: {
      type: 'array',
      items: { type: 'object', fields: { map: { type: 'string', pattern: ID }, exit: { type: 'string', nonEmpty: true }, road: { type: 'string', nonEmpty: true }, to: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } } } },
    },
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['needs', 'facility', 'facilityBonus', 'keeps'],
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          map: { type: 'string', pattern: ID },
          start: { type: 'string', nonEmpty: true },
          product: { type: 'string', nonEmpty: true },
          batch: { type: 'number', integer: true, min: 1 },
          pay: { type: 'number', min: 0 },
          needs: { type: 'string', pattern: ID },
          facility: { type: 'string', pattern: ID },
          facilityBonus: { type: 'number', min: 0, max: 1.5 },
          keeps: { type: 'array', minItems: 1, items: { type: 'string', pattern: ID } },
          stations: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              optional: ['xp'],
              fields: { object: { type: 'string', nonEmpty: true }, label: { type: 'string', nonEmpty: true }, ms: { type: 'number', integer: true, min: 0 }, xp: { type: 'record', values: { type: 'number', min: 0 } } },
            },
          },
        },
      },
    },
  },
};

export const CONTENT_FILES = {
  npcs: 'data/npcs.json',
  dialogue: 'data/dialogue.json',
  bikes: 'data/bikes.json',
  items: 'data/items.json',
  story: 'data/story.json',
  world: 'data/world.json',
  skills: 'data/skills.json',
  racing: 'data/racing.json',
  tracks: 'data/tracks.json',
  riders: 'data/riders.json',
  trackParts: 'data/trackParts.json',
  shops: 'data/shops.json',
  vehicles: 'data/vehicles.json',
  buildings: 'data/buildings.json',
  championships: 'data/championships.json',
  errands: 'data/errands.json',
  training: 'data/training.json',
  challenges: 'data/challenges.json',
  tools: 'data/tools.json',
  jobboard: 'data/jobboard.json',
  areas: 'data/areas.json',
  setup: 'data/setup.json',
  modifiers: 'data/modifiers.json',
  house: 'data/house.json',
  sponsors: 'data/sponsors.json',
} as const;

export type RawContent = Record<keyof typeof CONTENT_FILES, unknown>;

const SCHEMAS: Record<keyof typeof CONTENT_FILES, Schema> = {
  npcs: NPCS_SCHEMA,
  dialogue: DIALOGUE_SCHEMA,
  bikes: BIKES_SCHEMA,
  items: ITEMS_SCHEMA,
  story: STORY_SCHEMA,
  world: WORLD_SCHEMA,
  skills: SKILLS_SCHEMA,
  racing: RACING_SCHEMA,
  tracks: TRACKS_SCHEMA,
  riders: RIDERS_SCHEMA,
  trackParts: TRACK_PARTS_SCHEMA,
  shops: SHOPS_SCHEMA,
  vehicles: VEHICLES_SCHEMA,
  buildings: BUILDINGS_SCHEMA,
  championships: CHAMPIONSHIPS_SCHEMA,
  errands: ERRANDS_SCHEMA,
  training: TRAINING_SCHEMA,
  challenges: CHALLENGES_SCHEMA,
  tools: TOOLS_SCHEMA,
  jobboard: JOB_BOARD_SCHEMA,
  areas: AREAS_SCHEMA,
  setup: SETUP_SCHEMA,
  modifiers: MODIFIERS_SCHEMA,
  house: HOUSE_SCHEMA,
  sponsors: SPONSORS_SCHEMA,
};

/** Checks raw file contents and returns the typed content, or every problem found. */
export function checkContent(raw: RawContent, manifest: Manifest, maps: Map<string, BakedMap>): { content: Content | null; errors: ContentError[] } {
  // Unfinished tracks (draft: true, still being built in the track editor) stay in tracks.json but
  // the game leaves them out: they aren't checked, raced or offered. A venue can't use one.
  const drafts = new Map<string, string>();
  const rawTracks = raw.tracks as { tracks?: unknown } | null;
  if (rawTracks && Array.isArray(rawTracks.tracks)) {
    const all = rawTracks.tracks as { draft?: unknown; id?: unknown; name?: unknown }[];
    for (const t of all) if (t?.draft === true) drafts.set(String(t.id), String(t.name ?? t.id));
    if (drafts.size) raw = { ...raw, tracks: { ...rawTracks, tracks: all.filter((t) => t?.draft !== true) } };
  }
  const errors = (Object.keys(CONTENT_FILES) as (keyof typeof CONTENT_FILES)[]).flatMap((k) => validate(CONTENT_FILES[k], raw[k], SCHEMAS[k]));
  if (errors.length) return { content: null, errors };

  const content: Content = {
    npcs: (raw.npcs as { npcs: NpcDef[] }).npcs,
    dialogue: (raw.dialogue as Content).dialogue,
    bikes: raw.bikes as BikesData,
    items: (raw.items as { items: Record<string, ItemDef> }).items,
    story: raw.story as StoryData,
    world: raw.world as WorldData,
    skills: raw.skills as SkillsData,
    racing: raw.racing as RacingData,
    tracks: raw.tracks as TracksData,
    riders: riderPools(raw.riders as RidersFile),
    trackParts: raw.trackParts as TrackPartsData,
    shops: raw.shops as ShopsData,
    vehicles: raw.vehicles as VehiclesData,
    buildings: raw.buildings as BuildingsData,
    championships: raw.championships as ChampionshipsData,
    errands: raw.errands as ErrandsData,
    training: raw.training as TrainingData,
    challenges: raw.challenges as ChallengesData,
    tools: raw.tools as ToolsData,
    jobboard: raw.jobboard as JobBoardData,
    areas: raw.areas as AreasData,
    setup: raw.setup as SetupData,
    modifiers: raw.modifiers as ModifiersData,
    house: raw.house as HouseData,
    sponsors: raw.sponsors as SponsorsData,
  };
  const file = CONTENT_FILES.npcs;
  const seen = new Set<string>();
  content.npcs.forEach((n, i) => {
    const at = (f: string) => `npcs[${i}].${f}`;
    if (seen.has(n.id)) errors.push({ file, field: at('id'), message: `"${n.id}" is used twice` });
    seen.add(n.id);
    if (!manifest.characters.sheets[n.sprite]) errors.push({ file, field: at('sprite'), message: `no character sheet "${n.sprite}"` });
    if (!content.dialogue[n.dialogue]) errors.push({ file, field: at('dialogue'), message: `no dialogue "${n.dialogue}" in ${CONTENT_FILES.dialogue}` });
    n.talk?.forEach((t, j) => {
      if (!content.dialogue[t.dialogue]) errors.push({ file, field: at(`talk[${j}].dialogue`), message: `no dialogue "${t.dialogue}" in ${CONTENT_FILES.dialogue}` });
    });
    if ((n.map === undefined) !== (n.tile === undefined)) errors.push({ file, field: at(n.map ? 'tile' : 'map'), message: 'map and tile must be given together' });
    if (n.map !== undefined && n.tile) {
      const m = maps.get(n.map);
      if (!m) errors.push({ file, field: at('map'), message: `no map "${n.map}"` });
      else if (Grid.fromMap(m).isBlocked(n.tile[0], n.tile[1])) errors.push({ file, field: at('tile'), message: `tile ${n.tile.join(',')} is blocked on ${n.map}` });
    }
  });
  errors.push(...checkCareerContent(content, maps));
  content.tracks.venues.forEach((v, i) => {
    if (v.track && drafts.has(v.track)) errors.push({ file: CONTENT_FILES.tracks, field: `venues[${i}].track`, message: `"${v.track}" (${drafts.get(v.track)}) is unfinished; mark it Ready to race in the track editor first` });
  });
  errors.push(...checkRaceContent(content, maps));
  errors.push(...checkChampionships(content.championships, content));
  errors.push(...checkErrands(CONTENT_FILES.errands, content.errands, { ...content, consumables: content.shops.consumables }));
  errors.push(...checkTraining(CONTENT_FILES.training, content.training, content, maps));
  errors.push(...checkChallenges(CONTENT_FILES.challenges, content.challenges, content, new Set(maps.keys())));
  if (content.world.worldMap) errors.push(...checkWorldMap(CONTENT_FILES.world, content.world.worldMap, maps));
  // Tile art isn't listed at run time; tests check it exists (tests/tracks.test.ts).
  errors.push(...checkTrackParts(content.trackParts, content.tracks.tracks, () => true));
  errors.push(...checkShopContent(CONTENT_FILES.shops, content.shops, content.bikes, seen, maps));
  errors.push(...checkTools(CONTENT_FILES.tools, content.tools, content.bikes, content.skills));
  errors.push(...checkAreas(CONTENT_FILES.areas, content.areas, { fields: content.riders.fields, chains: (content.story.chains ?? []).map((c) => c.id), designs: content.vehicles.designs.map((d) => d.id), npcs: content.npcs.map((n) => n.id), weather: Object.keys(content.racing.weather ?? {}) }, maps));
  errors.push(...checkJobBoard(CONTENT_FILES.jobboard, content.jobboard, maps));
  errors.push(...checkSetup(CONTENT_FILES.setup, content.setup, { slots: content.bikes.slots.map((x) => x.id), sections: Object.keys(content.racing.sections) }));
  errors.push(...checkSponsors(CONTENT_FILES.sponsors, content.sponsors));
  errors.push(...checkHouse(CONTENT_FILES.house, content.house, { sheets: Object.keys(manifest.characters.sheets), shops: content.shops.shops.map((s) => s.id) }));
  errors.push(...checkModifiers(CONTENT_FILES.modifiers, content.modifiers, { slots: content.bikes.slots.map((x) => x.id), sections: Object.keys(content.racing.sections), weather: Object.keys(content.racing.weather ?? {}), maps }));
  errors.push(...checkVehicles(CONTENT_FILES.vehicles, raw.vehicles, maps).errors);
  errors.push(...checkBuildings(content.buildings, maps));
  content.vehicles.designs.forEach((d, i) => {
    if (!manifest.vehicles?.[d.id]) errors.push({ file: CONTENT_FILES.vehicles, field: `designs[${i}].id`, message: `no van sheet for "${d.id}" in the manifest (run tools/import-art.mjs --vehicles)` });
  });
  return { content, errors };
}

/** Cross-checks between the bike, item, story and world files and the maps. */
function checkCareerContent(c: Content, maps: Map<string, BakedMap>): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, field: string, message: string) => errors.push({ file, field, message });
  const { bikes, story, world } = c;

  const statIds = new Set(bikes.stats.map((s) => s.id));
  const slotIds = new Set(bikes.slots.map((s) => s.id));
  bikes.slots.forEach((s, i) => {
    for (const k of Object.keys(s.weights)) if (!statIds.has(k)) err(CONTENT_FILES.bikes, `slots[${i}].weights.${k}`, `no stat "${k}"`);
  });
  for (const st of bikes.stats) {
    const sum = bikes.slots.reduce((a, s) => a + (s.weights[st.id] ?? 0), 0);
    if (Math.abs(sum - 1) > 0.001) err(CONTENT_FILES.bikes, 'slots', `the ${st.id} weights add up to ${sum.toFixed(3)}, not 1`);
  }
  bikes.brands.forEach((b, i) => {
    for (const k of Object.keys(b.lean)) if (!statIds.has(k)) err(CONTENT_FILES.bikes, `brands[${i}].lean.${k}`, `no stat "${k}"`);
    const total = bikes.stats.reduce((a, st) => a + (b.lean[st.id] ?? 1), 0);
    if (Math.abs(total - bikes.stats.length) > 0.001) err(CONTENT_FILES.bikes, `brands[${i}].lean`, `adds up to ${total.toFixed(3)}, not ${bikes.stats.length}, so one brand would be better overall`);
  });
  if (!bikes.classes.some((k) => k.id === bikes.starter.class)) err(CONTENT_FILES.bikes, 'starter.class', `no class "${bikes.starter.class}"`);
  bikes.classes.forEach((k, i) => {
    if (i > 0 && (k.unlock ?? 1) < (bikes.classes[i - 1].unlock ?? 1)) err(CONTENT_FILES.bikes, `classes[${i}].unlock`, `${k.name} unlocks below the class before it`);
    if (k.mapImage && !bikes.classes.some((o) => o.id === k.mapImage && !o.mapImage)) err(CONTENT_FILES.bikes, `classes[${i}].mapImage`, `no class "${k.mapImage}" with a picture of its own`);
  });
  if (!slotIds.has(bikes.starter.brokenSlot)) err(CONTENT_FILES.bikes, 'starter.brokenSlot', `no slot "${bikes.starter.brokenSlot}"`);

  for (const [id, item] of Object.entries(c.items)) {
    if (item.part && !slotIds.has(item.part.slot)) err(CONTENT_FILES.items, `items.${id}.part.slot`, `no slot "${item.part.slot}"`);
  }

  // An NPC who is a CPU rider goes by that rider's current name (Boss, 28 Oct 2026: the Area Champion).
  c.npcs.forEach((n, i) => {
    if (!n.rider) return;
    const r = c.riders.riders.find((x) => x.id === n.rider);
    if (r) n.name = r.name;
    else err(CONTENT_FILES.npcs, `npcs[${i}].rider`, `no rider "${n.rider}" in ${CONTENT_FILES.riders}`);
  });
  const npcIds = new Set(c.npcs.map((n) => n.id));
  const item = (field: string, id: string) => !c.items[id] && err(CONTENT_FILES.story, field, `no item "${id}" in ${CONTENT_FILES.items}`);
  const lines = (field: string, id: string | undefined) => id && !c.dialogue[id] && err(CONTENT_FILES.story, field, `no dialogue "${id}" in ${CONTENT_FILES.dialogue}`);
  lines('intro', story.intro);
  story.after?.forEach((a, i) => a.talk && !npcIds.has(a.talk) && err(CONTENT_FILES.story, `after[${i}].talk`, `no NPC "${a.talk}"`));
  const chainSteps = (story.chains ?? []).flatMap((c, k) => c.steps.map((s, i) => ({ s, at: (f: string) => `chains[${k}].steps[${i}].${f}` })));
  (story.chains ?? []).forEach((c, k) => {
    if (!c.needs.startsWith('area.')) err(CONTENT_FILES.story, `chains[${k}].needs`, `a chain starts with an area's open flag (area.N.open), not "${c.needs}"`);
    if (story.chains!.findIndex((x) => x.id === c.id) !== k) err(CONTENT_FILES.story, `chains[${k}].id`, `"${c.id}" is used twice`);
  });
  [...story.steps.map((s, i) => ({ s, at: (f: string) => `steps[${i}].${f}` })), ...chainSteps].forEach(({ s, at }) => {
    if (!!s.on.talk === !!s.on.use) err(CONTENT_FILES.story, at('on'), 'needs exactly one of talk or use');
    if (s.on.talk && !npcIds.has(s.on.talk)) err(CONTENT_FILES.story, at('on.talk'), `no NPC "${s.on.talk}"`);
    if (s.on.use) {
      const onMaps = s.on.map ? [maps.get(s.on.map)] : [...maps.values()];
      if (s.on.map && !onMaps[0]) err(CONTENT_FILES.story, at('on.map'), `no map "${s.on.map}"`);
      else if (!onMaps.some((m) => m?.objects.some((o) => o.props.action === s.on.use))) err(CONTENT_FILES.story, at('on.use'), `no object with action "${s.on.use}"`);
    }
    lines(at('lines'), s.lines);
    lines(at('notReady'), s.notReady);
    s.needs?.items?.forEach((id, j) => item(at(`needs.items[${j}]`), id));
    s.effects?.give?.forEach((id, j) => item(at(`effects.give[${j}]`), id));
    s.effects?.take?.forEach((id, j) => item(at(`effects.take[${j}]`), id));
    if (s.effects?.fit) {
      item(at('effects.fit'), s.effects.fit);
      if (c.items[s.effects.fit] && !c.items[s.effects.fit].part) err(CONTENT_FILES.story, at('effects.fit'), `"${s.effects.fit}" is not a part`);
    }
  });

  const objectOn = (field: string, mapId: string, name: string) => {
    const m = maps.get(mapId);
    if (!m) err(CONTENT_FILES.world, field, `no map "${mapId}"`);
    else if (!m.objects.some((o) => o.name === name)) err(CONTENT_FILES.world, field, `no object "${name}" on ${mapId}`);
  };
  world.locks.forEach((l, i) => objectOn(`locks[${i}].object`, l.map, l.object));
  world.places.forEach((d, i) => {
    // The mod track list isn't a map: it opens a list of tracks to race from where you are.
    if (d.mods) return void (d.map !== MOD_PLACE && err(CONTENT_FILES.world, `places[${i}].map`, `the mod track list is "${MOD_PLACE}"`));
    const m = maps.get(d.map);
    if (!d.spawn) err(CONTENT_FILES.world, `places[${i}].spawn`, 'a place on a map needs a spawn to arrive on');
    else if (!m) err(CONTENT_FILES.world, `places[${i}].map`, `no map "${d.map}"`);
    else if (!m.objects.some((o) => o.type === 'spawn' && o.name === d.spawn)) err(CONTENT_FILES.world, `places[${i}].spawn`, `no spawn "${d.spawn}" on ${d.map}`);
  });
  // Routes: an exit to "world_map" leads to a choice of places, so it needs its list here.
  world.routes.forEach((r, i) => {
    const m = maps.get(r.map);
    const exit = m?.objects.find((o) => o.type === 'exit' && o.name === r.exit);
    if (!m) err(CONTENT_FILES.world, `routes[${i}].map`, `no map "${r.map}"`);
    else if (!exit) err(CONTENT_FILES.world, `routes[${i}].exit`, `no exit "${r.exit}" on ${r.map}`);
    else if (exit.props.to !== ROUTE) err(CONTENT_FILES.world, `routes[${i}].exit`, `"${r.exit}" on ${r.map} goes straight to ${String(exit.props.to)}, not to a choice of places (to "${ROUTE}")`);
    r.to.forEach((id, j) => {
      if (!world.places.some((p) => p.map === id)) err(CONTENT_FILES.world, `routes[${i}].to[${j}]`, `"${id}" isn't one of the places`);
      if (id === r.map) err(CONTENT_FILES.world, `routes[${i}].to[${j}]`, `leads back to ${id}, where it starts`);
    });
  });
  for (const m of maps.values()) {
    if (m.kind !== 'area') continue;
    for (const o of m.objects) {
      if (o.type === 'exit' && o.props.to === ROUTE && !world.routes.some((r) => r.map === m.id && r.exit === o.name)) err(CONTENT_FILES.world, 'routes', `the exit "${o.name}" on ${m.id} leads to a choice of places, but no route lists them`);
    }
  }
  const childSkills = new Set(c.skills.leads.flatMap((l) => l.children.map((ch) => ch.id)));
  world.jobs.forEach((j, i) => {
    objectOn(`jobs[${i}].start`, j.map, j.start);
    j.stations.forEach((s, k) => {
      objectOn(`jobs[${i}].stations[${k}].object`, j.map, s.object);
      for (const skill of Object.keys(s.xp ?? {})) if (!childSkills.has(skill)) err(CONTENT_FILES.world, `jobs[${i}].stations[${k}].xp.${skill}`, `no child skill "${skill}"`);
    });
    j.keeps?.forEach((slot, k) => !slotIds.has(slot) && err(CONTENT_FILES.world, `jobs[${i}].keeps[${k}]`, `no slot "${slot}"`));
  });
  return errors;
}

export interface NpcPlacement {
  npc: NpcDef;
  x: number;
  y: number;
  facing: Facing;
}

/** NPCs standing on one map: those placed by tile in npcs.json, plus the map's own npc spots. */
export function npcsOnMap(content: Content, map: BakedMap): NpcPlacement[] {
  const byId = new Map(content.npcs.map((n) => [n.id, n]));
  const out: NpcPlacement[] = [];
  for (const n of content.npcs) if (n.map === map.id && n.tile) out.push({ npc: n, x: n.tile[0], y: n.tile[1], facing: n.facing ?? 'down' });
  for (const o of map.objects) {
    if (o.type !== 'npc') continue;
    const n = byId.get(String(o.props.npc));
    if (!n || n.map) continue;
    const t = objectTile(o, map.tileSize);
    out.push({ npc: n, x: t.x, y: t.y, facing: 'down' });
  }
  return out;
}
