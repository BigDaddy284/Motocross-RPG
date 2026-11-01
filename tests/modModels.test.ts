import { describe, expect, it } from 'vitest';
import { CHEER_ITEM } from '../src/core/cheer';
import { FLAGGER_ITEM, PIT_CREW_ITEM } from '../src/core/finishCrew';
import { MARSHAL_ITEM } from '../src/core/marshal';
import {
  BIKE_LIMITS,
  checkModel,
  FIGURE_LIMITS,
  FIGURE_PARTS,
  glbInfo,
  GRID_PER_METRE,
  LOCKED_ITEMS,
  MAX_FILE_BYTES,
  MODEL_COLOUR,
  materialSlot,
  modelDef,
  modelEntry,
  modelId,
  modelName,
  modelRole,
  partName,
  RIDER_SLOTS,
  FAN_SLOTS,
  raceBikeKind,
  YOUTH_BIKE_METRES,
  PIT_CREW_SLOTS,
  BIKE_SLOTS,
  SCENERY_LIMITS,
  type ModelInfo,
  checkBikeSizes,
  fullSizeScale,
  ADULT_BIKE_METRES as ADULT_M,
} from '../src/core/modModels';
import { OFFICIAL_ITEM } from '../src/core/startOfficial';
import { SPANS_TRACK, SPRINT_START_ITEM } from '../src/core/trackClearance';
import { BIKE_LENGTH } from '../src/core/trackSurface';
import { readPublic } from './helpers';

// Your own Blender models in public/mods/models (Boss, 31 Oct 2026): reading a .glb's size without
// three.js, and the rules for each kind of model, which the models page and the one-pager list.

type Node = { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] };

/** A .glb with one box mesh (the given min and max, 12 triangles) under the given nodes. */
function glb(nodes: Node[], box: { min: number[]; max: number[] } = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }, opts: { tris?: number; roots?: number[]; textures?: number; animations?: number } = {}): Uint8Array {
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: opts.roots ?? [0] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { count: 8, componentType: 5126, type: 'VEC3', min: box.min, max: box.max },
      { count: (opts.tris ?? 12) * 3, componentType: 5123, type: 'SCALAR' },
    ],
    ...(opts.textures ? { textures: new Array(opts.textures).fill({ source: 0 }) } : {}),
    ...(opts.animations ? { animations: new Array(opts.animations).fill({ channels: [], samplers: [] }) } : {}),
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(12 + 8 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); // glTF
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, body.length, true);
  v.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(body, 20);
  return out;
}

const info = (min: number[], max: number[], tris = 12): ModelInfo => ({ min: min as ModelInfo['min'], max: max as ModelInfo['max'], tris, meshes: 1, textures: 0 });
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 5));

describe('reading a .glb', () => {
  it('reads the box round its mesh and counts the triangles', () => {
    const i = glbInfo(glb([{ mesh: 0 }]))!;
    close(i.min, [-0.5, 0, -0.5]);
    close(i.max, [0.5, 1, 0.5]);
    expect(i.tris).toBe(12);
    expect(i.meshes).toBe(1);
  });

  it('moves, scales and turns the mesh with its nodes, parents first', () => {
    // Parent moved up 2 and scaled 2; child turned 90° about Y (x becomes -z) and moved 1 along x.
    const s = Math.SQRT1_2;
    const i = glbInfo(glb([{ children: [1], translation: [0, 2, 0], scale: [2, 2, 2] }, { mesh: 0, translation: [1, 0, 0], rotation: [0, s, 0, s] }], { min: [0, 0, 0], max: [3, 1, 1] }))!;
    // Child: box x 0..3 turned → z -3..0, z 0..1 → x 0..1, then +1 x: x 1..2; parent ×2 and +2 y.
    close(i.min, [2, 2, -6]);
    close(i.max, [4, 4, 0]);
  });

  it('takes a node matrix as glTF stores it, column by column', () => {
    const i = glbInfo(glb([{ mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, -2, 1] }]))!;
    close(i.min, [4.5, 0, -2.5]);
    close(i.max, [5.5, 1, -1.5]);
  });

  it('counts each time a mesh is used, and its textures', () => {
    const i = glbInfo(glb([{ children: [1, 2] }, { mesh: 0 }, { mesh: 0, translation: [3, 0, 0] }], undefined, { textures: 2 }))!;
    expect(i.meshes).toBe(2);
    expect(i.tris).toBe(24);
    expect(i.textures).toBe(2);
    close(i.max, [3.5, 1, 0.5]);
  });

  it('lists its node names and counts its animations', () => {
    const i = glbInfo(glb([{ name: 'Body', children: [1] }, { name: 'ArmL.001', mesh: 0 }], undefined, { animations: 2 }))!;
    expect(i.names).toEqual(['Body', 'ArmL.001']);
    expect(i.animations).toBe(2);
  });

  it("isn't fooled by a file that isn't a .glb", () => {
    expect(glbInfo(new TextEncoder().encode('{"asset":{"version":"2.0"}}'))).toBeNull();
    expect(glbInfo(new Uint8Array(4))).toBeNull();
  });
});

describe('what a model does', () => {
  const scenery = [{ id: 'hay_bale' }, { id: 'tree' }, { id: 'marshal' }];

  it('takes its id from the file name', () => {
    expect(modelId('hay_bale.glb')).toBe('hay_bale');
    expect(modelName('round_hay-bale')).toBe('Round hay bale');
  });

  it('replaces an item with the same name, the race bikes and rider, or is a new item', () => {
    expect(modelRole('hay_bale', scenery)).toBe('replace');
    expect(modelRole('race_bike', scenery)).toBe('bike');
    expect(modelRole('race_bike_youth', scenery)).toBe('bike');
    expect(modelRole('race_rider', scenery)).toBe('rider');
    expect(modelRole('round_bale', scenery)).toBe('new');
    // The sidecar outfit is a race bike model, never a new scenery item (Boss, 1 Nov 2026).
    expect(modelRole('sidecar', scenery)).toBe('bike');
    // The sidecar's rider and passenger, one model with two moving parts (Boss, 1 Nov 2026).
    expect(modelRole('sidecar_crew', scenery)).toBe('crew');
    expect(FIGURE_PARTS.sidecar_crew).toEqual(['Rider', 'Passenger']);
  });


  it('locks the items that move or stretch to fit the track', () => {
    for (const id of [OFFICIAL_ITEM, CHEER_ITEM, MARSHAL_ITEM, FLAGGER_ITEM, PIT_CREW_ITEM, SPRINT_START_ITEM, 'start_gate', ...SPANS_TRACK]) expect(LOCKED_ITEMS.has(id)).toBe(true);
    // The stretched ones are never swapped.
    for (const id of ['start_gate', ...SPANS_TRACK]) expect(checkModel(`${id}.glb`, 100, info([-0.5, 0, -0.5], [0.5, 1.8, 0.5]), [{ id }]).join(' ')).toMatch(/can't be swapped/);
  });

  it('swaps a moving figure part by part, by the names of its parts (Boss, 31 Oct 2026)', () => {
    // Every animated figure has parts, and only those.
    // ...and the sidecar's crew, a model of its own rather than a scenery item (Boss, 1 Nov 2026).
    expect(Object.keys(FIGURE_PARTS).sort()).toEqual([CHEER_ITEM, FLAGGER_ITEM, MARSHAL_ITEM, PIT_CREW_ITEM, OFFICIAL_ITEM, 'sidecar_crew'].sort());
    for (const [id, parts] of Object.entries(FIGURE_PARTS)) {
      if (id === 'sidecar_crew') continue;
      expect(LOCKED_ITEMS.has(id)).toBe(true);
      expect(parts).toContain('Body');
      expect(modelRole(id, scenery)).toBe('figure');
    }
    const figure = (names: string[]) => ({ ...info([-0.4, 0, -0.2], [0.4, 1.8, 0.2]), names });
    expect(checkModel('marshal.glb', 100, figure(['Scene', 'Body', 'Arm']), scenery)).toEqual([]);
    expect(checkModel('marshal.glb', 100, figure(['Scene', 'Body', 'Arm', 'Forearm', 'Flag']), scenery)).toEqual([]);
    expect(checkModel('flagger.glb', 100, figure(['Scene', 'Body', 'WhiteArm', 'WhiteForearm', 'WhiteFlag', 'ChequeredArm', 'ChequeredForearm', 'ChequeredFlag']), scenery)).toEqual([]);
    // A part on its own is enough: the rest stay the game's.
    expect(checkModel('cheer.glb', 100, figure(['armL.001']), scenery)).toEqual([]);
    // With no named parts the game can't move it.
    expect(checkModel('marshal.glb', 100, figure(['Cube', 'Cube.001']), scenery).join(' ')).toMatch(/Body, Arm, Forearm, Flag, Mate, Base/);
    expect(checkModel('marshal.glb', 100, info([-0.4, 0, -0.2], [0.4, 1.8, 0.2]), scenery).join(' ')).toMatch(/named/);
    // A figure is kept light: crowds can be big.
    expect(checkModel('cheer.glb', 100, { ...figure(['Body']), tris: FIGURE_LIMITS.tris + 1 }, scenery).join(' ')).toMatch(/triangles/);
  });

  it("reads a part's name as Blender writes it", () => {
    expect(partName('Body', FIGURE_PARTS.marshal)).toBe('Body');
    expect(partName('armL.002', FIGURE_PARTS.cheer)).toBe('ArmL');
    expect(partName(' WhiteArm ', FIGURE_PARTS.flagger)).toBe('WhiteArm');
    expect(partName('ChequeredForearm.001', FIGURE_PARTS.flagger)).toBe('ChequeredForearm');
    expect(partName('chequeredflag', FIGURE_PARTS.flagger)).toBe('ChequeredFlag');
    expect(partName('WhiteForearm', FIGURE_PARTS.flagger)).toBe('WhiteForearm');
    expect(partName('Arm', FIGURE_PARTS.cheer)).toBeNull();
    expect(partName(undefined, FIGURE_PARTS.cheer)).toBeNull();
  });

  it('uses grid units a metre the same as the race view', () => {
    expect(GRID_PER_METRE).toBeCloseTo(BIKE_LENGTH / 1.46, 9);
  });

  it('makes a new item its footprint in grid units, in the model colour', () => {
    const def = modelDef('round_bale', info([-1, 0, -0.5], [1, 1.2, 0.5]), GRID_PER_METRE);
    expect(def).toEqual({ id: 'round_bale', name: 'Round bale', w: Math.round(2 * GRID_PER_METRE * 10) / 10, h: Math.round(GRID_PER_METRE * 10) / 10, color: MODEL_COLOUR, model: true });
    // Never smaller than a fifth of a grid unit, so it can still be picked in the editor.
    expect(modelDef('pin', info([0, 0, 0], [0.01, 0.5, 0.01]), GRID_PER_METRE).w).toBe(0.2);
  });

  it('reads a paint slot from a Blender material name', () => {
    expect(materialSlot('Plastics', BIKE_SLOTS)).toBe('plastics');
    expect(materialSlot('Plate.001', BIKE_SLOTS)).toBe('plate');
    expect(materialSlot('Jersey', RIDER_SLOTS)).toBe('jersey');
    expect(materialSlot('Chrome', BIKE_SLOTS)).toBeNull();
    expect(materialSlot(undefined, RIDER_SLOTS)).toBeNull();
    expect(materialSlot('TopTrim', FAN_SLOTS)).toBe('toptrim');
    expect(materialSlot('Fan_Cap', FAN_SLOTS)).toBeNull();
    expect(materialSlot('TeamTrim', PIT_CREW_SLOTS)).toBe('teamtrim');
    expect(materialSlot('Team.001', PIT_CREW_SLOTS)).toBe('team');
  });
});

describe('the rules for each kind of model', () => {
  const scenery = [{ id: 'hay_bale' }];
  const ok = (file: string, i: ModelInfo, bytes = 1000) => checkModel(file, bytes, i, scenery);

  it('passes a good scenery model', () => {
    expect(ok('hay_bale.glb', info([-1.3, 0, -0.8], [1.3, 0.8, 0.8]))).toEqual([]);
    expect(ok('round_bale.glb', info([-1, -0.02, -1], [1, 1.5, 1]))).toEqual([]);
  });

  it('wants a lower-case file name ending .glb', () => {
    for (const bad of ['Hay Bale.glb', 'hay bale.glb', 'HAY.glb', '_x.glb', 'hay.gltf']) expect(ok(bad, info([-1, 0, -1], [1, 1, 1])).join(' ')).toMatch(/file name/);
  });

  it('turns away a file too big, unreadable or empty', () => {
    expect(ok('a.glb', info([-1, 0, -1], [1, 1, 1]), MAX_FILE_BYTES + 1).join(' ')).toMatch(/MB/);
    expect(checkModel('a.glb', 10, null, scenery).join(' ')).toMatch(/glTF Binary/);
    expect(ok('a.glb', { ...info([0, 0, 0], [0, 0, 0]), meshes: 0, tris: 0 }).join(' ')).toMatch(/no meshes/);
  });

  it('limits triangles and size for scenery', () => {
    expect(ok('a.glb', info([-1, 0, -1], [1, 1, 1], SCENERY_LIMITS.tris + 1)).join(' ')).toMatch(/triangles/);
    expect(ok('a.glb', info([-16, 0, -1], [16, 1, 1])).join(' ')).toMatch(/long/);
    expect(ok('a.glb', info([-1, 0, -1], [1, SCENERY_LIMITS.tall + 1, 1])).join(' ')).toMatch(/tall/);
  });

  it('wants scenery standing on the ground', () => {
    expect(ok('a.glb', info([-1, 0.5, -1], [1, 1, 1])).join(' ')).toMatch(/lowest point/);
    expect(ok('a.glb', info([-1, -0.5, -1], [1, 1, 1])).join(' ')).toMatch(/lowest point/);
  });

  it('wants a race bike in metres, pointing along +X, under its triangle limit', () => {
    expect(ok('race_bike.glb', info([-1.08, 0, -0.38], [1.1, 1.28, 0.38], 4900))).toEqual([]);
    // Pointing along Z instead: too short along X.
    expect(ok('race_bike.glb', info([-0.38, 0, -1.08], [0.38, 1.28, 1.1])).join(' ')).toMatch(/points along \+X/);
    // Left in centimetres.
    expect(ok('race_bike_youth.glb', info([-108, 0, -38], [110, 128, 38])).join(' ')).toMatch(/metres/);
    expect(ok('race_bike.glb', info([-1.08, 0, -0.38], [1.1, 1.28, 0.38], BIKE_LIMITS.tris + 1)).join(' ')).toMatch(/triangles/);
  });

  it("passes Boss's sidecar outfit as a race bike: chair on the left, inside the bike limits (Boss, 1 Nov 2026)", () => {
    // sidecar.glb as exported: 2.19 m long, its chair out to 1.12 m on the left (glTF -Z), 5,984 triangles.
    expect(ok('sidecar.glb', info([-1.09, 0, -1.12], [1.1, 1.18, 0.43], 5984))).toEqual([]);
    expect(ok('sidecar.glb', info([-1.09, 0, -1.12], [1.1, 1.18, 0.43], BIKE_LIMITS.tris + 1)).join(' ')).toMatch(/triangles/);
  });

  it("takes the sidecar's rider and passenger as one model: 8,000 triangles, boots on the pegs and the platform, parts named (Boss, 1 Nov 2026)", () => {
    const crew = (tris: number, names = ['Rider', 'Passenger']): ModelInfo => ({ ...info([-0.9, 0.29, -0.9], [0.4, 1.7, 0.3], tris), names });
    expect(ok('sidecar_crew.glb', crew(7192))).toEqual([]);
    expect(ok('sidecar_crew.glb', crew(8001)).join(' ')).toMatch(/triangles/);
    expect(ok('sidecar_crew.glb', crew(7192, ['Body'])).join(' ')).toMatch(/Rider, Passenger/);
  });

  it('lets a rider sit on the pegs, off the ground', () => {
    expect(ok('race_rider.glb', info([-0.3, 0.25, -0.47], [0.5, 1.87, 0.47], 2608))).toEqual([]);
    expect(ok('race_rider.glb', info([-0.3, 1, -0.47], [0.5, 1.9, 0.47])).join(' ')).toMatch(/pegs/);
  });

  it('lists a folder file with its problems, and a usable new one with its item', () => {
    const good = modelEntry('round_bale.glb', glb([{ mesh: 0 }], { min: [-1, 0, -0.5], max: [1, 1.2, 0.5] }), scenery);
    expect(good.problems).toEqual([]);
    expect(good.def?.id).toBe('round_bale');
    const swap = modelEntry('hay_bale.glb', glb([{ mesh: 0 }]), scenery);
    expect(swap.role).toBe('replace');
    expect(swap.def).toBeUndefined();
    const bad = modelEntry('Round Bale.glb', glb([{ mesh: 0 }]), scenery);
    expect(bad.problems.length).toBeGreaterThan(0);
    expect(bad.def).toBeUndefined();
  });

  it("knows every one of the game's locked items", () => {
    const ids = new Set(readPublic<{ scenery: { id: string }[] }>('data/trackParts.json').scenery.map((s) => s.id));
    for (const id of LOCKED_ITEMS) expect(ids.has(id)).toBe(true);
  });

  it('picks each class its race bike model (Boss, 1 Nov 2026)', () => {
    for (const cls of ['50cc', '65cc', '85cc-small', '85cc-big']) expect(raceBikeKind(cls)).toBe('youth');
    for (const cls of ['125cc-youth', '125cc']) expect(raceBikeKind(cls)).toBe('two-stroke');
    for (const cls of ['250f', '450f', 'vets-40', 'vets-50', 'vets-60']) expect(raceBikeKind(cls)).toBe('adult');
    // Each youth class has its own size, smallest first; the 125s ride full size.
    const sizes = ['50cc', '65cc', '85cc-small', '85cc-big'].map((c) => YOUTH_BIKE_METRES[c]);
    expect(sizes.every((m, i) => m > 0 && (i === 0 || m > sizes[i - 1]))).toBe(true);
    expect(YOUTH_BIKE_METRES['125cc-youth']).toBeUndefined();
  });
});

// Boss, 1 Nov 2026: "Add a check somewhere so when the new models come in they must be checked for this sizing
// change to make sure they look right". The 125s ride race_bike_youth.glb scaled up to race_bike.glb's length.
describe('race bike size checks (Boss, 1 Nov 2026)', () => {
  const box = (min: number[], max: number[]): ModelInfo => ({ min: min as ModelInfo['min'], max: max as ModelInfo['max'], tris: 4000, meshes: 1, textures: 0 });
  // Real sizes: an 85cc about 1.85 m long and 1.13 m tall, a 450 2.15 m by 1.28 m.
  const youth = box([-0.925, 0, -0.37], [0.925, 1.13, 0.37]);
  const adult = box([-1.075, 0, -0.415], [1.075, 1.28, 0.415]);

  it('wants the youth bike at youth size and the race bike at full size', () => {
    expect(checkModel('race_bike_youth.glb', 1000, youth, [])).toEqual([]);
    expect(checkModel('race_bike.glb', 1000, adult, [])).toEqual([]);
    expect(checkModel('race_bike_youth.glb', 1000, adult, []).join(' ')).toMatch(/youth size/);
    expect(checkModel('race_bike.glb', 1000, youth, []).join(' ')).toMatch(/full size/);
  });

  it("scales the youth bike by the race bike's length, or the game's own adult length without one", () => {
    expect(fullSizeScale(1.85, 2.15)).toBeCloseTo(2.15 / 1.85, 5);
    expect(fullSizeScale(1.85, null)).toBeCloseTo(ADULT_M / 1.85, 5);
  });

  it('passes a real pair, and flags a scaled 125 that would look wrong beside the race bike', () => {
    expect(checkBikeSizes(youth, adult)).toEqual([]);
    expect(checkBikeSizes(null, adult)).toEqual([]);
    const stubby = box([-0.8, 0, -0.38], [0.8, 1.3, 0.38]);
    expect(checkBikeSizes(stubby, adult).join(' ')).toMatch(/about the same height/);
    const long = box([-1.05, 0, -0.4], [1.05, 1.25, 0.4]);
    expect(checkBikeSizes(long, adult).join(' ')).toMatch(/×1.02/);
  });
});
