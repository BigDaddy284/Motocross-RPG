import { Grid } from './grid';
import { objectTile, type BakedMap, type Facing } from './mapTypes';
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
}

export interface DialogueLine {
  speaker: 'npc' | 'player';
  text: string;
}

export interface Content {
  npcs: NpcDef[];
  dialogue: Record<string, { lines: DialogueLine[] }>;
}

export interface Manifest {
  maps: { id: string; title: string; kind: string }[];
  characters: {
    frame: [number, number];
    anchor: [number, number];
    rows: Facing[];
    walk: { columns: number; fps: number };
    act: { columns: string[]; idle_fps: number };
    sheets: Record<string, { name: string; walk: string; act: string }>;
  };
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
        optional: ['map', 'tile', 'facing'],
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          sprite: { type: 'string', pattern: ID },
          dialogue: { type: 'string', pattern: ID },
          map: { type: 'string', pattern: ID },
          tile: { type: 'array', items: { type: 'number', integer: true, min: 0 }, minItems: 2, maxItems: 2 },
          facing: { type: 'string', oneOf: FACING },
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
              fields: { speaker: { type: 'string', oneOf: ['npc', 'player'] }, text: { type: 'string', nonEmpty: true } },
            },
          },
        },
      },
    },
  },
};

export const CONTENT_FILES = { npcs: 'data/npcs.json', dialogue: 'data/dialogue.json' } as const;

/** Checks raw file contents and returns the typed content, or every problem found. */
export function checkContent(
  raw: { npcs: unknown; dialogue: unknown },
  manifest: Manifest,
  maps: Map<string, BakedMap>,
): { content: Content | null; errors: ContentError[] } {
  const errors = [
    ...validate(CONTENT_FILES.npcs, raw.npcs, NPCS_SCHEMA),
    ...validate(CONTENT_FILES.dialogue, raw.dialogue, DIALOGUE_SCHEMA),
  ];
  if (errors.length) return { content: null, errors };

  const content: Content = {
    npcs: (raw.npcs as { npcs: NpcDef[] }).npcs,
    dialogue: (raw.dialogue as Content).dialogue,
  };
  const file = CONTENT_FILES.npcs;
  const seen = new Set<string>();
  content.npcs.forEach((n, i) => {
    const at = (f: string) => `npcs[${i}].${f}`;
    if (seen.has(n.id)) errors.push({ file, field: at('id'), message: `"${n.id}" is used twice` });
    seen.add(n.id);
    if (!manifest.characters.sheets[n.sprite]) errors.push({ file, field: at('sprite'), message: `no character sheet "${n.sprite}"` });
    if (!content.dialogue[n.dialogue]) errors.push({ file, field: at('dialogue'), message: `no dialogue "${n.dialogue}" in ${CONTENT_FILES.dialogue}` });
    if ((n.map === undefined) !== (n.tile === undefined)) errors.push({ file, field: at(n.map ? 'tile' : 'map'), message: 'map and tile must be given together' });
    if (n.map !== undefined && n.tile) {
      const m = maps.get(n.map);
      if (!m) errors.push({ file, field: at('map'), message: `no map "${n.map}"` });
      else if (Grid.fromMap(m).isBlocked(n.tile[0], n.tile[1])) errors.push({ file, field: at('tile'), message: `tile ${n.tile.join(',')} is blocked on ${n.map}` });
    }
  });
  return { content, errors };
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
