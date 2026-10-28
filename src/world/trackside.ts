// Trackside scenery built for the race view, the way the paddock vehicles are (paddock.ts): the TV
// crew and media, the pits set up with their teams, what stands over and beside the track (the
// footbridge, marshals, the medics, the track tractor) and the fans at their ease. Each item is
// built in metres in its own frame, centred on its footprint with x along the footprint's length and
// z its depth; the people face +z. Its design (variant), set-up (action) and colour come from
// core/paddock.ts, picked for it unless chosen in the editor, which mirrors the layouts here.
import * as THREE from 'three';
import type { SceneryItem } from '../core/race';
import { paddockColour, paddockSetup, paddockVariant } from '../core/paddock';
import type { SceneryDef } from '../core/trackParts';
import { Build, CANVAS, CHASSIS, DARK, GLASS, hexNum, MAT, rustyVan, shade, SHIRTS, STEEL, TABLE, TYRE, U } from './paddock';

/** A box with words on it, in metres, for the race view to texture: the text faces +z (and -z when `both`). */
export interface Label {
  x: number; y: number; z: number; l: number; h: number; w: number; ry?: number;
  text: string; bg: number; fg?: string; vertical?: boolean; both?: boolean;
}
export interface Built { parts: Build['parts']; labels: Label[] }

/** Items whose people face the track when the item is not turned by hand. */
export const FACES_TRACK = new Set(['tv_camera_op', 'tv_tripod', 'tv_van', 'tv_tower', 'photographer', 'commentary_box', 'marshal', 'camp_chairs', 'fan_photo', 'fan_parasol', 'fans_fence', 'camera_crane', 'drone_pilot', 'vip_stand']);
/** Items whose length is set by their width (like a banner's), so they can run as far as wanted. */
export const STRETCH = new Set(['foot_bridge', 'crowd_barrier', 'cones', 'fans_fence', 'timing_beam', 'vip_stand']);

const HIVIS = 0xf0a020;
const BLACK = 0x202428;
const WHITE = 0xf0f0f0;
const CAMERA = 0x2a2a30;
const WOOD = 0x9a7a4a;
const BIKES = [0xc21c15, 0x3b86da, 0xa0c33e, 0xecbe2a, 0xef6c18];
const hash = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

interface Ctx { b: Build; col: number; setup: string | undefined; variant: string | undefined; L: number; D: number; i: number; text: string; labels: Label[] }

/** A broadcast camera: the body with its lens pointing +z and a viewfinder, bottom at y. */
function camera(b: Build, x: number, y: number, z: number, big = false): void {
  const s = big ? 1.5 : 1;
  b.box(x, y, z, 0.28 * s, 0.26 * s, 0.5 * s, CAMERA);
  b.cyl(x, y + 0.04 * s, z + 0.4 * s, 0.09 * s, 0.3 * s, BLACK, 10).rotation.x = Math.PI / 2;
  b.box(x - 0.2 * s, y + 0.1 * s, z - 0.15 * s, 0.14 * s, 0.1 * s, 0.14 * s, BLACK);
}

/** A tripod of three legs meeting under a head at height h. */
function tripod(b: Build, x: number, z: number, h: number, spread = 0.6): void {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const lx = Math.cos(a) * spread;
    const lz = Math.sin(a) * spread;
    const len = Math.hypot(spread, h);
    const m = b.box(x + lx / 2, 0, z + lz / 2, 0.05, len, 0.05, STEEL);
    m.position.y = (h / 2) * U;
    m.rotation.set(0, -a, 0);
    m.rotateZ(Math.atan2(spread, h));
  }
  b.box(x, h - 0.08, z, 0.2, 0.08, 0.2, BLACK);
}

/** A folding chair facing +z with its seat at 0.45 m: legs, seat and back, in a colour. */
function chair(b: Build, x: number, z: number, c: number): void {
  b.box(x, 0.45, z, 0.5, 0.05, 0.5, c);
  b.box(x, 0.5, z - 0.22, 0.5, 0.5, 0.05, c);
  for (const [sx, sz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) b.pole(x + sx, 0, z + sz, 0.45, STEEL, 0.04);
}

/** A gazebo: four legs, a pitched roof in the colour and a valance round the eaves, over x0..x1 and z0..z1. */
function gazebo(b: Build, x0: number, x1: number, z0: number, z1: number, c: number, hEave = 2.1): void {
  const l = x1 - x0;
  const w = z1 - z0;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + z1) / 2;
  for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) b.pole(x, 0, z, hEave, STEEL, 0.07);
  b.box(xc, hEave - 0.3, zc, l + 0.04, 0.3, w + 0.04, shade(c, 0.85));
  // A four-sided cone turned so its corners sit on the tent's: turned and stretched in the geometry, since a mesh scales before it turns.
  const roof = b.cyl(xc, hEave, zc, Math.hypot(l, w) / 2, 0.8, c, 4, 0.05);
  roof.geometry.rotateY(Math.PI / 4).scale(l / Math.hypot(l, w) * Math.SQRT2, 1, w / Math.hypot(l, w) * Math.SQRT2);
}

/** A parasol: a pole and a shallow cone in the colour, h to its tip. */
function parasol(b: Build, x: number, z: number, h: number, r: number, c: number): void {
  b.pole(x, 0, z, h - 0.3, STEEL, 0.05);
  b.cyl(x, h - 0.5, z, r, 0.45, c, 8, 0.02);
}

/** A toolbox-sized chest on wheels, fuel cans and a spare wheel: pit clutter at x, z. */
function clutter(b: Build, x: number, z: number, c: number): void {
  b.box(x - 0.6, 0.1, z, 0.9, 0.9, 0.5, c);
  for (const k of [-1, 0, 1]) b.box(x - 0.6, 0.25 + 0.25 * k + 0.25, z + 0.26, 0.8, 0.03, 0.02, shade(c, 1.3));
  b.box(x + 0.2, 0, z - 0.1, 0.35, 0.45, 0.25, 0xc02020);
  b.box(x + 0.6, 0, z - 0.1, 0.35, 0.45, 0.25, 0x2a4aa0);
  const wheel = b.cyl(x + 0.45, 0, z + 0.35, 0.33, 0.12, TYRE, 14);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = 0.33 * U;
}

const builders: Record<string, (c: Ctx) => void> = {
  tv_camera_op({ b, col, variant, i }) {
    const pose = variant === 'kneeling' ? 'kneel' : 'stand';
    b.person(0, -0.1, 0, i, { pose, arms: 'forward', shirt: col, held: [0.5, 0.26, 0.28, CAMERA] });
    b.cyl(0, pose === 'kneel' ? 1.2 : 1.5, 0.45, 0.08, 0.25, BLACK, 10).rotation.x = Math.PI / 2;
  },
  tv_tripod({ b, col, i }) {
    tripod(b, 0, 0.2, 1.5, 0.7);
    camera(b, 0, 1.5, 0.2, true);
    b.person(0, -0.65, 0, i, { arms: 'forward', shirt: col });
  },
  tv_van({ b, col, setup, D, i }) {
    const bz = -(D - 1.8) / 2;
    b.turned(0, bz, 0, () => rustyVan(b, col, undefined, bz, false));
    // The roof platform with its rail, and the crew up there with the camera on a tripod.
    b.box(-0.55, 2.1, bz, 3.2, 0.08, 1.9, STEEL);
    for (const x of [-2.1, 1.0]) b.box(x, 2.18, bz, 0.04, 0.9, 1.9, STEEL);
    for (const s of [-1, 1]) b.box(-0.55, 2.18, bz + s * 0.93, 3.2, 0.9, 0.04, STEEL);
    b.box(-0.55, 3.0, bz, 3.2, 0.04, 1.9, shade(STEEL, 0.9));
    b.box(2.0, 0.3, bz, 0.5, 1.8, 0.4, STEEL);
    if (setup !== 'parked') {
      tripod(b, 0.2, bz + 0.3, 1.2, 0.4);
      for (const m of b.parts.slice(-4)) m.position.y += 2.18 * U;
      camera(b, 0.2, 3.38, bz + 0.3);
      b.turned(0, 0, 0, () => b.person(0.2, bz - 0.35, 0, i, { arms: 'forward', shirt: BLACK }));
      for (const m of b.parts.slice(-7)) m.position.y += 2.18 * U;
    }
  },
  tv_tower({ b, col, i }) {
    const h = 5.0;
    for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) b.pole(x, 0, z, h + 0.3, STEEL, 0.1);
    for (const y of [1.2, 2.5, 3.8]) {
      for (const x of [-1.2, 1.2]) b.box(x, y, 0, 0.06, 0.06, 2.4, STEEL);
      for (const z of [-1.2, 1.2]) b.box(0, y, z, 2.4, 0.06, 0.06, STEEL);
    }
    b.box(0, h, 0, 2.7, 0.12, 2.7, WOOD);
    for (const x of [-1.3, 1.3]) b.box(x, h + 0.12, 0, 0.05, 1.0, 2.7, STEEL);
    b.box(0, h + 0.12, -1.3, 2.7, 1.0, 0.05, STEEL);
    b.box(0, h + 0.12, 1.3, 2.7, 1.0, 0.05, STEEL);
    for (const x of [-1.25, 1.25]) for (const z of [-1.25, 1.25]) b.pole(x, h + 0.12, z, 2.3, STEEL, 0.06);
    b.box(0, h + 2.4, 0, 3.0, 0.1, 3.0, col);
    tripod(b, 0.3, 0.3, 1.3, 0.45);
    for (const m of b.parts.slice(-4)) m.position.y += (h + 0.12) * U;
    camera(b, 0.3, h + 1.42, 0.3, true);
    b.person(0.3, -0.3, 0, i, { arms: 'forward', shirt: BLACK });
    b.person(-0.8, 0.2, -0.4, i + 1, { shirt: BLACK });
    for (const m of b.parts.slice(-22)) m.position.y += (h + 0.12) * U;
  },
  photographer({ b, col, variant, i }) {
    const pose = variant === 'lying' ? 'lie' : variant === 'kneeling' ? 'kneel' : 'stand';
    b.person(0, pose === 'lie' ? -0.2 : 0, 0, i, { pose, arms: 'forward', shirt: col, held: [0.18, 0.14, 0.2, CAMERA] });
    const y = pose === 'lie' ? 0.26 : pose === 'kneel' ? 1.17 : 1.47;
    const z = pose === 'lie' ? 0.75 : 0.42;
    b.cyl(0, y, z, 0.05, 0.4, BLACK, 10).rotation.x = Math.PI / 2;
  },
  commentary_box({ b, col, i }) {
    const h = 2.6;
    for (const x of [-1.7, 1.7]) for (const z of [-1.2, 1.2]) b.pole(x, 0, z, h, STEEL, 0.12);
    for (const x of [-1.7, 1.7]) b.box(x, 1.3, 0, 0.06, 0.06, 2.4, STEEL);
    b.box(0, h, 0, 3.8, 0.15, 2.8, DARK);
    b.box(0, h + 0.15, -0.3, 3.8, 2.2, 2.2, col);
    b.box(0, h + 1.05, 0.81, 3.4, 1.0, 0.04, GLASS);
    b.box(0, h + 0.15, 0.81, 3.8, 0.9, 0.04, col);
    b.box(0, h + 2.35, 0, 4.0, 0.1, 3.0, shade(col, 0.8));
    b.box(0, h + 0.9, 0.5, 3.2, 0.06, 0.5, TABLE);
    b.person(-0.8, 0.1, 0, i, { pose: 'sit', arms: 'forward', shirt: WHITE });
    b.person(0.8, 0.1, 0, i + 1, { pose: 'sit', arms: 'forward', shirt: 0x2a4a90 });
    for (const m of b.parts.slice(-22)) m.position.y += (h + 0.15) * U;
    b.box(-1.6, 1.0, -1.4, 0.06, 2.3, 0.06, STEEL);
    b.box(-1.6, 1.0, -1.4, 0.6, 2.3, 0.06, shade(STEEL, 0.8), 0, 0.05);
  },
  big_screen({ b, col }) {
    b.box(0, 0.5, -0.4, 5.8, 0.3, 2.0, CHASSIS);
    b.box(3.2, 0.4, -0.4, 1.2, 0.12, 0.3, CHASSIS);
    b.wheels([-1.6, 1.6], -0.4, 0.9, 0.35);
    b.box(0, 0.8, -0.6, 5.6, 3.6, 0.6, col);
    b.box(0, 1.0, -0.28, 5.2, 3.2, 0.06, 0x1a2a50);
    b.box(0, 1.2, -0.24, 2.2, 1.2, 0.02, 0x4a7ad0);
    b.box(-1.6, 2.6, -0.24, 1.4, 0.4, 0.02, 0xe0e0e0);
  },
  pit_setup({ b, col, setup, i, text, labels }) {
    // The tent is open-fronted: the team's name on the front valance, the bikes just inside it and the people out front, where the race camera sees them.
    gazebo(b, -3.0, 3.0, -2.6, 1.0, col, 2.6);
    labels.push({ x: 0, y: 2.2, z: 1.03, l: 6.0, h: 0.4, w: 0.03, text, bg: shade(col, 0.85) });
    b.box(0, 0, -0.8, 6.0, 0.02, 3.6, MAT);
    const bikes = setup === 'bikes' || setup === 'both';
    const people = setup === 'people' || setup === 'both';
    if (bikes) {
      b.bikeOnStand(-1.6, 0.0, BIKES[i % 5], '250cc', -Math.PI / 2);
      b.bikeOnStand(1.6, 0.0, BIKES[(i + 1) % 5], '250cc', -Math.PI / 2);
    }
    if (people) {
      b.person(-1.6, 1.6, Math.PI, i, { shirt: col, arms: bikes ? 'forward' : 'down' });
      b.person(0.3, 1.9, 0.6, i + 1, { shirt: col });
      b.person(2.4, 1.5, Math.PI, i + 2, { shirt: BIKES[(i + 1) % 5] });
    }
    if (setup === 'tools' || setup === 'both') clutter(b, -0.6, -2.0, col);
    if (setup === 'tools') {
      b.box(1.6, 0, -1.8, 0.7, 0.55, 0.5, 0xc02020);
      b.box(1.6, 0.55, -1.8, 0.5, 0.15, 0.3, BLACK);
      b.table(1.8, 0.2);
      b.person(-0.5, 1.7, Math.PI, i + 3, { shirt: col });
    }
  },
  bike_wash({ b, col, i }) {
    b.disc(0, 0.2, 1.1, 0x5a6a70);
    b.bikeOnStand(0, 0, col, '250cc', Math.PI / 2);
    b.box(0.95, 0, -0.5, 0.45, 0.5, 0.35, 0xe8c020);
    b.box(0.95, 0.5, -0.5, 0.12, 0.3, 0.12, BLACK);
    b.box(0.6, 0.02, -0.2, 0.08, 0.04, 0.9, 0x4a4a50);
    b.person(-0.9, 0.9, Math.PI / 2, i, { arms: 'forward', shirt: 0x3a5a3a, held: [0.45, 0.05, 0.05, BLACK] });
  },
  bike_trailer({ b, col, variant }) {
    b.box(-0.3, 0.4, 0, 2.2, 0.1, 1.5, CHASSIS);
    b.box(-0.3, 0.5, 0, 2.2, 0.08, 1.5, col);
    b.box(1.2, 0.35, 0, 0.9, 0.08, 0.1, CHASSIS);
    b.box(1.6, 0.3, 0, 0.15, 0.2, 0.15, STEEL);
    b.wheels([-0.3], 0, 0.85, 0.3, 0.18);
    for (const x of [-1.38, 0.78]) b.box(x, 0.58, 0, 0.04, 0.3, 1.5, STEEL);
    if (variant === 'two') {
      b.bike(-0.3, 0.58, -0.38, BIKES[0], '250cc', 0);
      b.bike(-0.3, 0.58, 0.38, BIKES[1], '250cc', 0);
    } else b.bike(-0.3, 0.58, 0, BIKES[0], '250cc', 0);
  },
  pit_clutter({ b, col }) {
    clutter(b, 0.2, 0, col);
    for (let k = 0; k < 3; k++) {
      const t = b.cyl(-0.9, 0.13 + k * 0.26, 0.1, 0.32, 0.22, TYRE, 14);
      t.rotation.x = 0;
      t.position.x += (k % 2) * 0.05 * U;
    }
  },
  trade_stand({ b, col, i, text, labels }) {
    gazebo(b, -1.5, 1.5, -2.0, 1.0, col);
    labels.push({ x: 0, y: 1.8, z: 1.02, l: 3.0, h: 0.3, w: 0.03, text, bg: shade(col, 0.85) });
    b.box(0, 0.75, 0.5, 2.6, 0.05, 0.7, TABLE);
    for (const [sx, sz] of [[-1.2, 0.2], [1.2, 0.2], [-1.2, 0.8], [1.2, 0.8]]) b.pole(sx, 0, sz, 0.75, STEEL, 0.04);
    for (let k = 0; k < 5; k++) b.box(-1.0 + k * 0.5, 0.8, 0.5, 0.35, 0.2 + (k % 2) * 0.15, 0.4, SHIRTS[(i + k) % SHIRTS.length]);
    b.box(0, 0, -1.6, 2.8, 1.8, 0.1, shade(col, 0.9));
    for (let k = 0; k < 4; k++) b.box(-1.05 + k * 0.7, 0.9, -1.5, 0.5, 0.6, 0.08, SHIRTS[(i + k + 3) % SHIRTS.length]);
    b.person(0.3, -0.5, 0, i, { shirt: col });
  },
  catering_van({ b, col, setup, i, text, labels }) {
    const z = -0.9;
    b.box(0, 0.35, z, 4.6, 0.3, 2.0, CHASSIS);
    b.box(-0.3, 0.5, z, 4.2, 2.2, 2.2, col);
    b.box(2.2, 0.35, z, 0.7, 0.1, 0.12, CHASSIS);
    b.wheels([-1.2, 1.2], z, 1.1, 0.33, 0.2);
    b.box(-0.3, 1.3, z + 1.11, 2.8, 0.9, 0.04, GLASS);
    b.box(-0.3, 2.2, z + 1.5, 2.9, 0.05, 0.9, shade(col, 0.9));
    b.box(-0.3, 1.2, z + 1.15, 2.9, 0.08, 0.3, TABLE);
    labels.push({ x: -0.3, y: 2.72, z: z + 0.2, l: 4.0, h: 0.5, w: 0.06, text, bg: shade(col, 0.8), both: true });
    b.box(-0.3, 2.7, z, 4.0, 0.55, 2.0, shade(col, 0.95));
    b.box(1.6, 0, z + 1.4, 0.6, 1.2, 0.08, BLACK);
    b.box(1.6, 0.3, z + 1.4, 0.5, 0.8, 0.04, WHITE);
    b.person(-0.3, z + 0.5, 0, i + 9, { shirt: WHITE });
    if (setup === 'queue') for (let k = 0; k < 3; k++) b.person(-0.6 + k * 0.1, z + 2.1 + k * 0.75, Math.PI, i + k, {});
  },
  marquee({ b, col }) {
    const h = 2.6;
    const L = 10;
    const D = 6;
    b.box(0, 0, 0, L, 0.02, D, MAT);
    for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) b.pole(x, 0, z, h, STEEL, 0.08);
    b.box(0, 0, -D / 2 + 0.03, L, h, 0.06, CANVAS);
    for (const x of [-L / 2 + 0.03, L / 2 - 0.03]) b.box(x, 0, 0, 0.06, h, D, CANVAS);
    b.box(0, h - 0.4, D / 2 - 0.03, L, 0.4, 0.06, col);
    // Each slope leans down towards its own side, so the two meet at a ridge, not a valley.
    for (const s of [-1, 1]) b.box(0, h + 0.7, s * D / 4, L + 0.1, 0.08, Math.hypot(D / 2, 1.5), CANVAS, 0, s * Math.atan2(1.5, D / 2));
    b.box(0, h, 0, L + 0.1, 0.25, 0.1, STEEL);
    b.box(0, h - 0.15, 0, L + 0.12, 0.15, D + 0.12, col);
    // Canvas gable ends under the ridge.
    const gable = new THREE.Shape([[-D / 2, h - 0.02], [D / 2, h - 0.02], [0, h + 1.5]].map(([z, y]) => new THREE.Vector2(z * U, y * U)));
    for (const x of [-L / 2 - 0.03, L / 2 + 0.03]) {
      const end = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.06 * U, bevelEnabled: false }), b.mat(CANVAS));
      end.rotation.y = -Math.PI / 2;
      end.position.set(x * U, 0, 0);
      b.parts.push(end);
    }
    for (let k = 0; k < 4; k++) {
      const x = -3.6 + k * 2.4;
      b.cyl(x, 0.7, -0.8, 0.6, 0.05, TABLE, 12);
      b.pole(x, 0, -0.8, 0.7, STEEL, 0.06);
      for (let c = 0; c < 4; c++) {
        const a = (c / 4) * Math.PI * 2;
        b.box(x + Math.cos(a) * 0.95, 0.45, -0.8 + Math.sin(a) * 0.95, 0.4, 0.04, 0.4, WHITE);
      }
    }
  },
  time_check({ b, col, i, text, labels }) {
    gazebo(b, -1.5, 1.5, -1.5, 1.5, col);
    labels.push({ x: 0, y: 1.8, z: 1.52, l: 3.0, h: 0.3, w: 0.03, text, bg: shade(col, 0.85) });
    b.table(0.3, 0.2);
    b.box(-1.0, 0, -0.9, 0.5, 2.0, 0.5, BLACK);
    b.box(-1.0, 1.4, -0.63, 0.44, 0.44, 0.03, WHITE);
    b.box(-1.0, 1.57, -0.61, 0.03, 0.18, 0.02, BLACK);
    b.box(-0.9, 1.6, -0.61, 0.16, 0.03, 0.02, BLACK);
    b.person(0.3, -0.5, 0, i, { pose: 'sit', arms: 'forward', shirt: HIVIS });
    b.person(1.3, 1.4, Math.PI, i + 1, { shirt: HIVIS });
  },
  foot_bridge({ b, col, setup, L, i }) {
    const deckH = 4.8;
    const tower = 2.2;
    const w = 1.6;
    for (const s of [-1, 1]) {
      const x0 = s * (L / 2 - tower / 2);
      // A stair tower at each end: four legs, the flights zig-zagging up inside, the landing at the top.
      for (const x of [-tower / 2 + 0.08, tower / 2 - 0.08]) for (const z of [-w / 2 - 0.08, w / 2 + 0.08]) b.pole(x0 + x, 0, z, deckH + 1.2, STEEL, 0.1);
      for (let k = 0; k < 4; k++) {
        const y = (k + 0.5) * (deckH / 4);
        const dir = k % 2 ? -1 : 1;
        b.box(x0, y, 0, tower - 0.2, 0.12, w - 0.1, 0x6a6a70, dir * Math.atan2(deckH / 4, tower - 0.2));
        for (const z of [-w / 2, w / 2]) b.box(x0, y + 0.1, z, tower - 0.2, 0.08, 0.05, STEEL, dir * Math.atan2(deckH / 4, tower - 0.2));
      }
      b.box(x0, deckH, 0, tower, 0.12, w, 0x6a6a70);
    }
    const span = L - tower * 2 + 0.2;
    b.box(0, deckH, 0, span, 0.15, w, col);
    b.box(0, deckH - 0.35, 0, span, 0.35, w * 0.9, shade(col, 0.8));
    for (const z of [-w / 2, w / 2]) {
      b.box(0, deckH + 1.1, z, L, 0.06, 0.06, STEEL);
      b.box(0, deckH + 0.6, z, L, 0.04, 0.04, STEEL);
      const n = Math.max(2, Math.round(L / 1.5));
      for (let k = 0; k <= n; k++) b.pole(-L / 2 + (L * k) / n, deckH + 0.15, z, 1.0, STEEL, 0.05);
    }
    for (const s of [-1, 1]) b.box(s * (L / 2 - 0.2), deckH + 1.2, 0, 0.3, 0.3, w + 0.3, STEEL);
    if (setup === 'fans') {
      const n = Math.max(2, Math.min(8, Math.round(span / 2.5)));
      for (let k = 0; k < n; k++) {
        const x = -span / 2 + 1.2 + (span - 2.4) * (k / Math.max(1, n - 1));
        const z = (hash(i * 3 + k) - 0.5) * 0.7;
        b.person(x, z, hash(i + k * 7) > 0.5 ? 0.3 : -0.4, i + k, { arms: k % 3 === 0 ? 'up' : 'down' });
      }
      for (const m of b.parts.slice(-7 * n)) m.position.y += (deckH + 0.15) * U;
    }
  },
  crowd_barrier({ b, col, L }) {
    const n = Math.max(1, Math.round(L / 2.3));
    const seg = L / n;
    for (let k = 0; k < n; k++) {
      const x = -L / 2 + seg * (k + 0.5);
      b.box(x, 1.05, 0, seg - 0.06, 0.05, 0.05, col);
      b.box(x, 0.25, 0, seg - 0.06, 0.05, 0.05, col);
      for (const sx of [-1, 1]) {
        b.pole(x + sx * (seg / 2 - 0.05), 0.1, 0, 1.0, col, 0.05);
        b.box(x + sx * (seg / 2 - 0.05), 0, 0, 0.08, 0.1, 0.5, col);
      }
      const bars = Math.max(3, Math.round(seg / 0.25));
      for (let j = 1; j < bars; j++) b.pole(x - seg / 2 + (seg * j) / bars, 0.3, 0, 0.75, col, 0.025);
    }
  },
  marshal({ b, col, variant, i }) {
    b.person(0, 0, 0, i, { arms: 'up', shirt: col });
    b.pole(0.3, 1.9, 0.0, 1.1, 0xe8e8e8, 0.03);
    const flag = { yellow: 0xf0c020, red: 0xd02020, blue: 0x2060e0 }[variant ?? 'yellow'];
    if (variant === 'checkered') {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b.box(0.3 + 0.17 + c * 0.17, 2.98 - 0.18 - r * 0.17, 0, 0.17, 0.17, 0.02, (r + c) % 2 ? BLACK : WHITE);
    } else b.box(0.3 + 0.37, 2.42, 0, 0.7, 0.55, 0.02, flag ?? 0xf0c020);
  },
  ambulance({ b, setup, D, i }) {
    const bz = -(D - 1.8) / 2;
    rustyVan(b, 0xf4f4f0, undefined, bz, false);
    // The Battenburg band along the sides and the blue lights on the roof.
    for (const s of [-1, 1]) for (let k = 0; k < 10; k++) b.box(-2.0 + k * 0.36, 0.95, bz + s * 0.905, 0.34, 0.45, 0.02, k % 2 ? 0x2fb02a : 0xf0e020);
    for (let k = 0; k < 4; k++) b.box(-0.6 + k * 0.5, 0.75, bz - 0.92, 0.02, 0.4, 0.4, k % 2 ? 0x2fb02a : 0xf0e020);
    b.box(-0.3, 2.1, bz, 1.2, 0.18, 0.3, 0x2050e0);
    b.box(-0.3, 1.2, bz + 0.91, 1.0, 0.5, 0.02, GLASS);
    b.box(-0.3, 1.55, bz + 0.91, 0.5, 0.5, 0.02, 0xd02020);
    b.box(-0.3, 1.75, bz + 0.92, 1.3, 0.1, 0.02, 0xd02020);
    b.box(-0.3, 1.95, bz + 0.92, 0.1, 0.1, 0.02, 0xd02020);
    if (setup === 'crew') {
      b.person(-1.2, bz + 1.5, Math.PI, i, { shirt: 0x2fb02a, trousers: 0x2fb02a });
      b.person(0.4, bz + 1.7, 0.4, i + 1, { shirt: 0x2fb02a, trousers: 0x2fb02a, arms: 'forward', held: [0.4, 0.3, 0.3, 0xd02020] });
    }
  },
  quad({ b, col, variant, i }) {
    b.box(0, 0.3, 0, 1.8, 0.3, 0.7, CHASSIS);
    b.box(-0.1, 0.55, 0, 1.3, 0.3, 0.9, col);
    b.box(-0.5, 0.8, 0, 0.7, 0.12, 0.45, BLACK);
    b.box(0.4, 0.8, 0, 0.3, 0.35, 0.3, col);
    b.box(0.6, 1.1, 0, 0.06, 0.06, 0.7, STEEL);
    b.box(-1.0, 0.4, 0, 0.2, 0.4, 0.9, STEEL);
    b.box(1.0, 0.4, 0, 0.2, 0.4, 0.9, STEEL);
    b.wheels([0.65, -0.65], 0, 0.5, 0.3, 0.25);
    if (variant === 'rider') {
      b.person(-0.5, 0.0, Math.PI / 2, i, { pose: 'sit', arms: 'forward', shirt: HIVIS });
      for (const m of b.parts.slice(-7)) m.position.y += 0.47 * U;
    }
  },
  tractor({ b, col, variant, i }) {
    const x0 = 2.1;
    b.box(x0, 0.7, 0, 1.8, 0.9, 0.8, col);
    b.box(x0 + 0.9, 0.65, 0, 0.1, 0.9, 0.85, shade(col, 0.85));
    b.box(x0 - 1.1, 1.4, 0, 1.1, 0.8, 1.0, col);
    b.box(x0 - 0.5, 1.6, 0, 1.5, 0.9, 0.95, col);
    b.box(x0 - 0.6, 1.7, 0, 1.5, 1.05, 1.3, GLASS);
    b.box(x0 - 0.6, 2.75, 0, 1.6, 0.1, 1.4, shade(col, 0.8));
    b.box(x0 + 0.2, 1.4, 0, 0.14, 0.9, 0.14, BLACK);
    b.wheels([x0 - 1.1], 0, 1.05, 0.85, 0.55);
    b.wheels([x0 + 0.9], 0, 0.95, 0.5, 0.3);
    b.box(x0 - 2.4, 0.7, 0, 0.6, 0.1, 0.1, CHASSIS);
    b.person(x0 - 0.6, 0, -Math.PI / 2, i, { pose: 'sit', arms: 'forward', shirt: 0x3a5a3a });
    for (const m of b.parts.slice(-7)) m.position.y += 0.95 * U;
    if (variant === 'bowser') {
      const t = x0 - 4.6;
      b.box(t + 1.6, 0.6, 0, 1.6, 0.1, 0.1, CHASSIS);
      b.box(t, 0.5, 0, 2.6, 0.2, 1.2, CHASSIS);
      const tank = b.cyl(t, 0.7, 0, 0.8, 3.0, shade(col, 1.15), 16);
      tank.rotation.z = Math.PI / 2;
      tank.position.y = 1.5 * U;
      b.wheels([t], 0, 0.95, 0.4, 0.25);
      b.box(t - 1.7, 0.6, 0, 0.1, 0.1, 2.4, STEEL);
      for (let k = 0; k < 5; k++) b.box(t - 1.7, 0.45, -1.1 + k * 0.55, 0.08, 0.15, 0.08, STEEL);
    } else {
      const t = x0 - 2.9;
      b.box(t, 0.55, 0, 0.4, 0.15, 2.2, CHASSIS);
      b.box(t - 0.6, 0.55, 0, 0.4, 0.15, 2.2, CHASSIS);
      for (let k = 0; k < 9; k++) b.box(t - (k % 2) * 0.6, 0.05, -1.0 + k * 0.25, 0.08, 0.5, 0.06, STEEL, 0.2);
    }
  },
  toilets({ b, col, variant }) {
    const n = variant === 'four' ? 4 : variant === 'two' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 1.25;
      b.box(x, 0, 0, 1.15, 0.15, 1.15, BLACK);
      b.box(x, 0.15, 0, 1.1, 2.1, 1.1, col);
      b.box(x, 0.25, 0.555, 0.7, 1.9, 0.02, shade(col, 0.9));
      b.box(x, 2.25, 0, 1.15, 0.12, 1.15, shade(col, 1.2));
      b.box(x + 0.25, 1.1, 0.57, 0.04, 0.12, 0.02, STEEL);
    }
  },
  feather_flags({ b, col, variant, text, labels }) {
    const n = variant === 'three' ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 1.4;
      b.disc(x, 0, 0.3, BLACK, 0.03);
      b.pole(x, 0, 0, 4.0, 0xe8e8e8, 0.04);
      b.box(x, 3.98, 0, 0.3, 0.35, 0.06, col, 0.5);
      labels.push({ x: x + 0.33, y: 0.6, z: 0, l: 0.62, h: 3.2, w: 0.02, text, bg: col, vertical: true, both: true });
    }
  },
  inflatable({ b, col, variant, L, text, labels }) {
    const dark = shade(col, 0.8);
    if (variant === 'column') {
      b.cyl(0, 0, 0, 0.75, 0.5, dark, 16);
      b.cyl(0, 0.5, 0, 0.7, 5.5, col, 16);
      b.cyl(0, 6.0, 0, 0.7, 0.5, col, 16, 0.3);
      for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) labels.push({ x: Math.sin(ry) * 0.66, y: 1.5, z: Math.cos(ry) * 0.66, l: 1.0, h: 3.0, w: 0.04, ry, text, bg: col, vertical: true });
      return;
    }
    const h = 4.8;
    for (const s of [-1, 1]) {
      b.cyl(s * (L / 2 - 0.6), 0, 0, 0.6, h, col, 14);
      b.cyl(s * (L / 2 - 0.6), 0, 0, 0.65, 0.5, dark, 14);
    }
    const beam = b.cyl(0, h, 0, 0.6, L, col, 14);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = h * U;
    labels.push({ x: 0, y: h - 0.5, z: 0, l: L - 2.4, h: 1.0, w: 1.22, text, bg: col, both: true });
  },
  cones({ b, col, L }) {
    const n = Math.max(1, Math.round(L / 1.5));
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? 0 : -L / 2 + 0.3 + (L - 0.6) * (k / (n - 1));
      b.box(x, 0, 0, 0.4, 0.04, 0.4, BLACK);
      b.cyl(x, 0.04, 0, 0.17, 0.7, col, 10, 0.03);
      b.cyl(x, 0.4, 0, 0.11, 0.1, WHITE, 10, 0.085);
    }
  },
  camp_chairs({ b, col, variant, i }) {
    const n = variant === 'three' ? 3 : variant === 'two' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.85;
      chair(b, x, 0, col);
      b.person(x, 0, 0, i + k, { pose: 'sit', arms: k === 1 ? 'up' : 'down' });
    }
    b.box(n === 1 ? 0.7 : (n - 1) / 2 * 0.85 + 0.7, 0, 0.1, 0.55, 0.4, 0.4, 0x2a5ab0);
    b.box(n === 1 ? 0.7 : (n - 1) / 2 * 0.85 + 0.7, 0.4, 0.1, 0.57, 0.08, 0.42, WHITE);
  },
  fan_photo({ b, col, variant, i }) {
    const phone = variant !== 'camera';
    b.person(0, 0, 0, i, { arms: 'up', shirt: col });
    if (phone) b.box(0.3, 2.0, 0.08, 0.08, 0.16, 0.02, BLACK);
    else {
      b.box(0, 1.45, 0.22, 0.2, 0.14, 0.16, BLACK);
      b.cyl(0, 1.48, 0.42, 0.045, 0.25, CAMERA, 10).rotation.x = Math.PI / 2;
    }
  },
  lunch_table({ b, col, setup, i }) {
    b.box(0, 0.72, 0, 1.6, 0.05, 0.8, TABLE);
    for (const [sx, sz] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) b.pole(sx, 0, sz, 0.72, STEEL, 0.04);
    for (let k = 0; k < 3; k++) b.box(-0.5 + k * 0.5, 0.77, 0, 0.3, 0.06 + (k % 2) * 0.1, 0.3, [0xe0e0e0, 0xd04030, 0xe8c020][k]);
    for (const [x, z, ry] of [[-0.4, 0.9, Math.PI], [0.4, 0.9, Math.PI], [-0.4, -0.9, 0], [0.4, -0.9, 0]]) {
      chair(b, x, z, 0x3a3a40);
      b.person(x, z, ry, i + Math.round(x * 10 + z * 3), { pose: 'sit', arms: 'forward' });
    }
    if (setup === 'parasol') parasol(b, 0, 0, 2.4, 1.5, col);
  },
  picnic({ b, col, variant, i }) {
    b.box(0, 0, 0, 2.2, 0.03, 2.2, col);
    for (let k = 0; k < 4; k++) b.box(-0.8 + k * 0.55, 0.03, 0, 0.1, 0.01, 2.2, shade(col, 0.85));
    b.box(0.7, 0.03, -0.6, 0.5, 0.3, 0.35, WOOD);
    b.box(0.7, 0.33, -0.6, 0.52, 0.05, 0.37, shade(WOOD, 0.8));
    b.person(-0.5, -0.5, Math.PI * 0.75, i, { pose: 'floor', arms: 'forward' });
    b.person(-0.1, 0.6, Math.PI * 1.6, i + 1, { pose: 'floor' });
    if (variant === 'three') b.person(0.7, 0.4, Math.PI * 1.2, i + 2, { pose: 'floor', arms: 'up' });
  },
  fan_parasol({ b, col, i }) {
    b.person(-0.15, 0, 0, i, { arms: 'forward', shirt: 0xf0f0f0 });
    b.box(0.25, 1.1, 0, 0.05, 1.5, 0.05, STEEL);
    b.cyl(0.25, 2.3, 0, 0.9, 0.4, col, 10, 0.02);
  },
  fans_fence({ b, col, L, i }) {
    const n = Math.max(2, Math.round(L / 1.6));
    for (let k = 0; k <= n; k++) b.box(-L / 2 + (L * k) / n, 0, 0, 0.09, 1.05, 0.09, col);
    for (const y of [0.4, 0.95]) b.box(0, y, 0, L, 0.08, 0.06, col);
    const fans = Math.max(1, Math.round(L / 1.3));
    for (let k = 0; k < fans; k++) {
      const x = -L / 2 + 0.65 + (L - 1.3) * (fans === 1 ? 0.5 : k / (fans - 1));
      b.person(x, -0.3, (hash(i + k * 5) - 0.5) * 0.5, i + k, { arms: k % 2 ? 'forward' : 'down' });
    }
  },

  camera_crane({ b, col, i }) {
    // A jib: the base with its counterweight at -x, the arm rising to the camera at +x, the operator at the base.
    b.box(-2.3, 0, -0.3, 1.6, 0.2, 1.6, CHASSIS);
    for (const [x, z] of [[-3.0, -1.0], [-1.6, -1.0], [-3.0, 0.4], [-1.6, 0.4]]) b.cyl(x, 0, z, 0.12, 0.2, TYRE, 10);
    b.pole(-2.3, 0.2, -0.3, 1.6, STEEL, 0.14);
    b.box(-2.3, 1.7, -0.3, 0.4, 0.3, 0.4, col);
    const len = 6.0;
    const rise = 3.0;
    const arm = b.box(-2.3 + len / 2 - 0.6, 1.85 + rise / 2 - 0.08, -0.3, Math.hypot(len, rise), 0.16, 0.16, col);
    arm.rotation.z = Math.atan2(rise, len);
    b.box(-3.6, 1.6, -0.3, 0.6, 0.5, 0.5, 0x4a4a50);
    camera(b, -2.3 + len - 0.6, 1.85 + rise - 0.1, -0.3, true);
    b.person(-2.3, 0.6, 0, i, { arms: 'forward', shirt: BLACK });
  },
  drone_pilot({ b, col, i }) {
    b.person(0, 0, 0, i, { arms: 'forward', shirt: col, held: [0.14, 0.08, 0.3, BLACK] });
    b.box(0.3, 2.8, 0.6, 0.3, 0.1, 0.3, BLACK);
    for (const [sx, sz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
      b.box(0.3 + sx, 2.82, 0.6 + sz, 0.2, 0.03, 0.04, BLACK);
      b.cyl(0.3 + sx, 2.86, 0.6 + sz, 0.14, 0.01, 0x8a8a90, 10);
    }
  },
  press_tent({ b, col, i, text, labels }) {
    gazebo(b, -2.0, 2.0, -2.0, 2.0, col);
    labels.push({ x: 0, y: 1.8, z: 2.02, l: 4.0, h: 0.3, w: 0.03, text, bg: shade(col, 0.85) });
    for (const z of [-1.0, 0.8]) {
      b.box(0, 0.72, z, 3.6, 0.05, 0.7, TABLE);
      for (const sx of [-1.7, 1.7]) for (const sz of [-0.3, 0.3]) b.pole(sx, 0, z + sz, 0.72, STEEL, 0.04);
      for (let k = 0; k < 3; k++) {
        const x = -1.2 + k * 1.2;
        b.box(x, 0.77, z + 0.1, 0.32, 0.02, 0.24, 0xd0d0d4);
        b.box(x, 0.79, z - 0.05, 0.32, 0.22, 0.02, 0x3a3a40, 0, -0.3);
        b.person(x, z + 0.55, Math.PI, i + k + (z > 0 ? 3 : 0), { pose: 'sit', arms: 'forward' });
      }
    }
  },
  signing_table({ b, col, i, text, labels }) {
    b.box(0, 0.75, -0.3, 2.4, 0.05, 0.7, TABLE);
    b.box(0, 0.05, -0.0, 2.4, 0.7, 0.03, col);
    for (const sx of [-1.1, 1.1]) b.pole(sx, 0, -0.3, 0.75, STEEL, 0.04);
    b.box(0, 0, -1.4, 2.8, 2.0, 0.08, shade(col, 0.9));
    labels.push({ x: 0, y: 1.5, z: -1.35, l: 2.6, h: 0.4, w: 0.02, text, bg: col });
    b.person(-0.4, -0.95, 0, i, { pose: 'sit', arms: 'forward', shirt: BIKES[i % 5] });
    b.person(0.5, -0.95, 0, i + 1, { pose: 'sit', arms: 'forward', shirt: BIKES[(i + 2) % 5] });
    for (let k = 0; k < 3; k++) b.person(-0.3 + k * 0.1, 0.4 + k * 0.7, Math.PI, i + 3 + k, { arms: k ? 'down' : 'forward' });
    for (let k = 0; k < 3; k++) b.box(-0.8 + k * 0.6, 0.8, -0.4, 0.3, 0.02, 0.4, WHITE);
  },
  pa_speaker({ b, col }) {
    b.box(0, 0, 0, 0.6, 0.12, 0.6, CHASSIS);
    b.pole(0, 0.12, 0, 5.0, STEEL, 0.1);
    for (const s of [-1, 1]) {
      const sp = b.box(s * 0.3, 4.3, 0.1, 0.4, 0.7, 0.5, col);
      sp.rotation.y = s * 0.6;
    }
    b.box(0, 5.1, 0, 0.3, 0.3, 0.3, 0x4a4a50);
  },
  timing_beam({ b, col, L }) {
    for (const s of [-1, 1]) {
      b.box(s * (L / 2 - 0.3), 0, 0, 0.5, 0.1, 0.5, CHASSIS);
      b.pole(s * (L / 2 - 0.3), 0.1, 0, 1.2, col, 0.08);
    }
    b.box(0, 0, 0, L - 0.6, 0.03, 0.12, 0x3a3a40);
    b.box(L / 2 - 0.3, 1.3, 0, 0.4, 0.3, 0.3, col);
    b.pole(L / 2 - 0.3, 1.6, 0, 0.8, 0xe8e8e8, 0.025);
    b.box(-L / 2 + 0.3, 1.3, 0, 0.3, 0.2, 0.3, 0xd02020);
  },
  skid_steer({ b, col, i }) {
    b.box(-0.3, 0.3, 0, 1.9, 0.9, 1.3, col);
    b.box(-0.4, 1.2, 0, 1.2, 0.9, 1.0, BLACK);
    b.box(-0.4, 1.3, 0, 1.22, 0.6, 0.9, GLASS);
    b.box(-0.4, 2.1, 0, 1.3, 0.08, 1.1, col);
    for (const s of [-1, 1]) b.box(-0.3, 1.0, s * 0.75, 1.6, 0.15, 0.12, shade(col, 0.8), 0, 0);
    b.wheels([0.3, -0.9], 0, 0.75, 0.38, 0.25);
    for (const s of [-1, 1]) b.box(0.7, 0.9, s * 0.65, 1.2, 0.12, 0.1, CHASSIS, -0.25);
    b.box(1.5, 0, 0, 0.6, 0.6, 1.7, STEEL);
    b.box(1.25, 0.55, 0, 0.1, 0.3, 1.7, STEEL, 0.5);
    b.person(-0.4, -0.2, -Math.PI / 2, i, { pose: 'sit', arms: 'forward', shirt: HIVIS });
    for (const m of b.parts.slice(-7)) m.position.y += 0.75 * U;
  },
  merch_trailer({ b, col, i, text, labels }) {
    const z = -0.9;
    b.box(0, 0.4, z, 5.6, 0.25, 2.1, CHASSIS);
    b.box(3.1, 0.4, z, 0.7, 0.1, 0.12, CHASSIS);
    b.wheels([-1.0, 1.0], z, 1.15, 0.35, 0.2);
    b.box(0, 0.65, z - 0.3, 5.6, 2.2, 1.6, col);
    b.box(0, 2.85, z, 5.7, 0.12, 2.4, shade(col, 0.8));
    for (const x of [-2.75, 2.75]) b.box(x, 0.65, z + 0.5, 0.1, 2.2, 1.2, col);
    // The shelves of shirts and caps behind the counter, the side flap up as a canopy.
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) b.box(-2.25 + k * 0.9, 1.0 + r * 0.7, z + 0.55, 0.5, 0.5, 0.1, SHIRTS[(i + k + r * 3) % SHIRTS.length]);
    b.box(0, 0.65, z + 1.0, 5.2, 0.9, 0.3, shade(col, 0.9));
    b.box(0, 1.55, z + 1.0, 5.2, 0.05, 0.35, TABLE);
    b.box(0, 2.85, z + 1.9, 5.6, 0.05, 1.8, CANVAS, 0, -0.2);
    labels.push({ x: 0, y: 2.0, z: z + 1.85, l: 4.5, h: 0.6, w: 0.03, text, bg: shade(col, 0.85) });
    b.box(0, 1.95, z + 1.83, 4.6, 0.7, 0.03, shade(col, 0.85));
    b.person(-1.2, z + 0.6, 0, i, { shirt: col });
    b.person(1.6, z + 2.0, Math.PI, i + 1, { arms: 'forward' });
  },
  vip_stand({ b, col, L, i }) {
    const D = 5.0;
    const tiers = 4;
    const step = D / tiers;
    for (let k = 0; k < tiers; k++) {
      const z = -D / 2 + step * (k + 0.5);
      const h = 0.6 + k * 0.5;
      b.box(0, 0, z, L, h, step, k % 2 ? shade(col, 1.12) : col);
      const seats = Math.max(1, Math.floor(L / 0.6));
      for (let s = 0; s < seats; s++) {
        const x = -L / 2 + 0.3 + (s + 0.5) * ((L - 0.6) / seats);
        b.box(x, h, z - 0.12, 0.45, 0.08, 0.3, 0x2a4a90);
        if (hash(i * 7 + s * 3 + k) > 0.3) {
          b.box(x, h + 0.05, z + 0.08, 0.36, 0.5, 0.26, SHIRTS[Math.floor(hash(i + s * 11 + k * 5) * SHIRTS.length)]);
          b.box(x, h + 0.56, z + 0.08, 0.22, 0.22, 0.22, 0xe0b090);
        }
      }
    }
    b.box(0, 0.6 + (tiers - 1) * 0.5, -D / 2 + 0.1, L, 1.0, 0.2, shade(col, 0.7));
    for (const x of [-L / 2 + 0.2, 0, L / 2 - 0.2]) for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) b.pole(x, 0.6 + (z < 0 ? (tiers - 1) * 0.5 : 0), z, z < 0 ? 2.6 : 4.0, STEEL, 0.14);
    b.box(0, 4.2, 0, L + 0.4, 0.15, D + 0.4, shade(col, 0.6), 0, -0.1);
    for (const x of [-L / 2, L / 2]) b.box(x, 0.6 + (tiers - 1) * 0.5, 0, 0.06, 1.0, D, STEEL);
  },
};

/** The meshes and labels of a trackside item, in its own frame, or null for an item built elsewhere (the paddock vehicles). */
export function tracksideParts(def: SceneryDef, it: SceneryItem, i: number): Built | null {
  const build = builders[def.id];
  if (!build) return null;
  const b = new Build();
  const labels: Label[] = [];
  build({
    b,
    col: hexNum(paddockColour(def, it, i), hexNum(def.color, 0x888888)),
    setup: paddockSetup(def, it, i),
    variant: paddockVariant(def, it, i),
    L: (it.w ?? def.w) / U,
    D: (it.h ?? def.h) / U,
    i,
    text: it.text ?? def.text ?? '',
    labels,
  });
  return { parts: b.parts, labels };
}

/** True for an item this file builds. */
export const isTrackside = (id: string) => id in builders;
