// What the race view still builds from boxes beside the track (paddock.ts Build): the moving
// figures (marshal, flag man, pit crew) and their stands, the start official's box and the enduro
// sprint start. Every other trackside item is the game's own model in public/assets/models (Boss,
// 2 Nov 2026: "I want the models you made to become the built in models"). Each is built in metres
// in its own frame, centred on its footprint with x along the footprint's length and z its depth;
// the people face +z. Its design (variant), set-up (action) and colour come from core/paddock.ts.
import type { SceneryItem } from '../core/race';
import { MARSHAL_STANDS } from '../core/marshal';
import { paddockColour, paddockSetup, paddockVariant } from '../core/paddock';
import type { SceneryDef } from '../core/trackParts';
import { Build, hexNum, shade, STEEL, U } from './paddock';

/**
 * A box with words on it, in metres, for the race view to texture: the text faces +z (and -z when `both`).
 * `picture`: the words are the item's own, so a PNG picked for the item shows there instead (core/banners.ts; Boss, 2 Nov 2026).
 */
export interface Label {
  x: number; y: number; z: number; l: number; h: number; w: number; ry?: number;
  text: string; bg: number; fg?: string; vertical?: boolean; both?: boolean; picture?: boolean;
}
export interface Built { parts: Build['parts']; labels: Label[] }

/** Items whose people face the track when the item is not turned by hand. */
export const FACES_TRACK = new Set(['tv_camera_op', 'tv_tripod', 'tv_van', 'tv_tower', 'photographer', 'commentary_box', 'camp_chairs', 'fan_photo', 'fan_parasol', 'fans_fence', 'camera_crane', 'drone_pilot', 'vip_stand']);
/** Items whose length is set by their width (like a banner's), so they can run as far as wanted. */
export const STRETCH = new Set(['foot_bridge', 'crowd_barrier', 'cones', 'fans_fence', 'timing_beam', 'vip_stand', 'pyro', 'truss_arch']);

const HIVIS = 0xf0a020;
const BLACK = 0x202428;
const WHITE = 0xf0f0f0;

interface Ctx { b: Build; col: number; setup: string | undefined; variant: string | undefined; L: number; D: number; i: number; text: string; labels: Label[] }

/**
 * A flight of steps from a platform's edge down to the ground: the top step just under the edge at
 * z, the flight running off it in direction dir (-1 towards -z), w wide, with a stringer each side.
 */
function stairs(b: Build, x: number, z: number, h: number, w: number, dir: -1 | 1, c = STEEL): void {
  const n = Math.max(2, Math.round(h / 0.22));
  const rise = h / n;
  const run = 0.26;
  for (let k = 1; k < n; k++) b.box(x, h - k * rise - 0.04, z + dir * (k - 0.5) * run, w, 0.05, run, c);
  const len = Math.hypot(h, n * run);
  const tilt = Math.atan2(h, n * run);
  for (const sx of [-w / 2, w / 2]) b.box(x + sx, h / 2 - 0.09, z + (dir * n * run) / 2, 0.05, 0.18, len, shade(c, 0.85), 0, dir * tilt);
}

/**
 * The two officials at an enduro sprint's start (Boss, 29 Oct 2026), standing side by side facing
 * +z: the timekeeper with a stopwatch held up in the right hand, and the scorer with a clipboard
 * held in front, writing each rider's time off. Built standing at (x, z), turned by ry.
 */
export function sprintOfficials(b: Build, x: number, z: number, ry: number, i: number): void {
  b.turned(x, z, ry, () => {
    // The timekeeper: the right arm raised to the face with the watch, the left by their side.
    const n = b.parts.length;
    b.person(x - 0.45, z, 0, i, { shirt: HIVIS, trousers: BLACK, arms: 'down' });
    // Swap the right arm for one bent up to the face, the stopwatch in the hand.
    b.parts.splice(n + b.parts.slice(n).length - 1, 1);
    b.box(x - 0.15, 1.25, z + 0.14, 0.1, 0.1, 0.42, 0xe0b090, 0, -0.9);
    b.cyl(x - 0.15, 1.52, z + 0.32, 0.07, 0.03, BLACK, 12).rotation.x = Math.PI / 2;
    b.cyl(x - 0.15, 1.52, z + 0.34, 0.05, 0.01, WHITE, 12).rotation.x = Math.PI / 2;
    // A cap.
    b.box(x - 0.45, 1.73, z + 0.04, 0.26, 0.08, 0.3, BLACK);
    // The scorer: both arms forward holding the clipboard, a pen in the right hand.
    b.person(x + 0.45, z, 0, i + 1, { shirt: HIVIS, trousers: 0x2a3a5a, arms: 'forward' });
    b.box(x + 0.45, 1.18, z + 0.52, 0.34, 0.03, 0.44, 0x8a6a40, 0, -0.5);
    b.box(x + 0.45, 1.2, z + 0.52, 0.28, 0.03, 0.36, WHITE, 0, -0.5);
    b.box(x + 0.6, 1.26, z + 0.5, 0.02, 0.02, 0.14, BLACK);
  });
}

/**
 * The starter's box on a No-Turn Takedown's start platform (Boss, 30 Oct 2026), between the two
 * pairs of gates: a waist-high booth `w` metres across and deep, its open back at -z, with the
 * starter standing in it facing +z (down the run) and the gate's push-button lever by the front
 * wall. Built in metres at (0, 0, 0), on the platform's deck.
 */
export function starterBox(w: number, i: number): Build['parts'] {
  const b = new Build();
  const h = 1.05;
  const t = 0.06;
  const RED = 0xc8302a;
  b.box(0, 0, 0, w, 0.06, w, 0x5a5a60);
  b.box(0, 0, w / 2 - t / 2, w, h, t, RED);
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - t / 2), 0, 0, t, h, w, RED);
  b.box(0, h, w / 2 - t / 2, w + 0.06, 0.06, t + 0.08, WHITE);
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - t / 2), h, 0, t + 0.08, 0.06, w, WHITE);
  // A canopy on two poles at the back corners.
  for (const sx of [-1, 1]) b.pole(sx * (w / 2 - 0.05), 0, -w / 2 + 0.05, 2.3, STEEL, 0.05);
  b.box(0, 2.3, 0, w + 0.2, 0.06, w + 0.2, RED);
  // The gate lever on its post by the front wall, and the starter behind it.
  b.pole(w * 0.25, 0, w / 2 - 0.2, 0.95, STEEL, 0.06);
  b.box(w * 0.25, 0.95, w / 2 - 0.2, 0.12, 0.08, 0.12, 0xf0c020);
  b.person(-0.05, -0.05, 0, i, { shirt: HIVIS, trousers: BLACK, arms: 'forward' });
  return b.parts;
}

const builders: Record<string, (c: Ctx) => void> = {
  sprint_start({ b, col, L, i, text, labels }) {
    // An enduro sprint's start line: the sponsor arch over the line, the timing beam across the
    // ground under it, and the timekeeper and the scorer at the right-hand post with the clock.
    const dark = shade(col, 0.8);
    const h = 4.4;
    for (const s of [-1, 1]) {
      b.cyl(s * (L / 2 - 0.55), 0, 0, 0.55, h, col, 14);
      b.cyl(s * (L / 2 - 0.55), 0, 0, 0.6, 0.45, dark, 14);
    }
    const beam = b.cyl(0, h, 0, 0.55, L, col, 14);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = h * U;
    labels.push({ x: 0, y: h - 0.45, z: 0, l: L - 2.2, h: 0.9, w: 1.12, text, picture: true, bg: col, both: true });
    // The timing beam: a cell on a post each side just inside the arch, and the line across.
    for (const s of [-1, 1]) {
      b.pole(s * (L / 2 - 1.4), 0, 0.7, 1.0, 0xf0a020, 0.07);
      b.box(s * (L / 2 - 1.4), 1.0, 0.7, 0.22, 0.18, 0.22, s > 0 ? 0xd02020 : 0x3a3a40);
    }
    b.box(0, 0, 0.7, L - 2.8, 0.03, 0.1, 0xf0f0f0);
    // The clock on its stand beside the right post, facing the riders, and the officials by it.
    b.pole(L / 2 + 0.9, 0, -0.9, 1.5, STEEL, 0.06);
    b.box(L / 2 + 0.9, 1.5, -0.9, 0.9, 0.42, 0.08, BLACK);
    labels.push({ x: L / 2 + 0.9, y: 1.53, z: -0.95, l: 0.84, h: 0.36, w: 0.02, ry: Math.PI, text: '0:10', bg: BLACK, fg: '#ffd040' });
    sprintOfficials(b, L / 2 + 1.25, 0.9, -Math.PI / 2, i);
  },
};

const HAY = 0xd8b45a;
export interface MarshalBuilt {
  /** The stand, the hay bales, a second marshal: still, merged into one mesh. */
  base: Build['parts'];
  /** The marshal with the flag: the figure less the flag arm, and the arm with the pole and flag, in metres from the feet. */
  figure: Build['parts'];
  arm: Build['parts'];
  /** Where the feet stand and where the flag arm pivots, in metres in the item's frame. */
  feet: [number, number, number];
  shoulder: [number, number, number];
  /** The stand's design: on a roofed tower the flag is raised less, to stay under the roof. */
  variant: string;
  /** The item's colour: their shirt, and a stand model's Team material. */
  colour: number;
  /** The mate beside them (the pair design; else empty), standing at MATE_AT. */
  mate: Build['parts'];
}

/**
 * A marshal (core/marshal.ts) for the race view to animate: the flag arm is built apart, pivoting
 * at the shoulder, hanging with the flag down and swung up to wave it; the figure leans with it.
 */
export function marshalParts(def: SceneryDef, it: SceneryItem, i: number): MarshalBuilt {
  const b = new Build();
  const col = hexNum(paddockColour(def, it, i), hexNum(def.color, HIVIS));
  const variant = paddockVariant(def, it, i) ?? 'ground';
  const m = new Build();
  const lift = marshalStand(b, variant, col, i, m);
  const base = b.parts;
  // The marshal: a figure at the platform's height, with their right arm, the pole and the flag apart.
  const f = new Build();
  const fx = variant === 'pair' ? 0.3 : 0;
  f.person(fx, 0, 0, i, { shirt: col, arms: 'down' });
  for (const m of f.parts) m.position.y += lift * U;
  const arm = [f.parts.pop()!];
  const a = new Build();
  a.parts.push(...arm);
  // The pole hangs by the arm with the flag at its lower end, so swung up the flag is on top.
  a.pole(fx + 0.36, lift + 0.1, 0.12, 1.3, 0xe8e8e8, 0.03);
  a.box(fx + 0.36 + 0.32, lift + 0.12, 0.12, 0.64, 0.5, 0.02, 0xf0c020);
  return { base, figure: f.parts, arm: a.parts, feet: [0, lift, 0], shoulder: [fx + 0.3, lift + 1.45, 0], variant, colour: col, mate: m.parts };
}

/**
 * A marshal's stand by its design (the same for the flag man): a pallet stand or a roofed tower
 * with stairs, hay bales, or a second marshal with an extinguisher. Returns the platform height.
 */
/** Where the pair design's mate (a second marshal with an extinguisher) stands, in metres in the item's frame. */
export const MATE_AT: [number, number, number] = [-0.9, 0, 0];

function marshalStand(b: Build, variant: string, col: number, i: number, mate: Build): number {
  const lift = MARSHAL_STANDS[variant] ?? 0;
  const deck = (l: number, w: number, roof: boolean) => {
    // A steel platform with a handrail round it, the stairs down the back.
    for (const x of [-l / 2 + 0.06, l / 2 - 0.06]) for (const z of [-w / 2 + 0.06, w / 2 - 0.06]) b.pole(x, 0, z, roof ? lift + 2.3 : lift + 1.05, 0x6a5a48, 0.08);
    b.box(0, lift - 0.08, 0, l, 0.08, w, 0x5a4a3a);
    b.box(0, lift - 0.3, 0, l, 0.06, w, 0x6a5a48);
    for (const x of [-l / 2, l / 2]) b.box(x, lift + 1.0, 0, 0.05, 0.05, w, 0x6a5a48);
    b.box(0, lift + 1.0, w / 2, l, 0.05, 0.05, 0x6a5a48);
    for (const x of [-l / 2, l / 2]) b.box(x, lift + 0.5, 0, 0.04, 0.04, w, 0x6a5a48);
    b.box(0, lift + 0.5, w / 2, l, 0.04, 0.04, 0x6a5a48);
    // The back rails stop either side of the stairs, which come down from the deck's back edge.
    const side = (l - 0.9) / 2;
    for (const sx of [-1, 1]) for (const y of [0.5, 1.0]) b.box(sx * (l / 2 - side / 2), lift + y, -w / 2, side, 0.05, 0.05, 0x6a5a48);
    stairs(b, 0, -w / 2, lift, 0.8, -1, 0x6a5a48);
    if (roof) b.box(0, lift + 2.3, 0, l + 0.4, 0.1, w + 0.4, col);
  };
  if (variant === 'pallet') deck(1.6, 1.4, false);
  else if (variant === 'tower') deck(2.0, 2.0, true);
  else if (variant === 'bales') {
    for (const x of [-0.95, 0.95]) b.box(x, 0, 0.85, 1.8, 0.6, 1.0, HAY);
    b.box(0, 0.6, 0.85, 1.8, 0.6, 1.0, HAY);
  } else if (variant === 'pair') {
    // The mate and their extinguisher, built apart so a model's Mate can take their place (Boss, 1 Nov 2026).
    mate.person(MATE_AT[0], MATE_AT[2], 0.3, i + 1, { shirt: col, arms: 'down' });
    mate.cyl(-1.35, 0, 0.2, 0.09, 0.5, 0xd02020, 10);
    mate.box(-1.35, 0.5, 0.2, 0.08, 0.1, 0.08, BLACK);
  }
  return lift;
}

/** A flag man for the race view to animate: the white flag in the left hand, the chequered flag in the right, each arm built apart. */
export interface FlaggerBuilt {
  base: Build['parts'];
  figure: Build['parts'];
  /** The left arm with the white flag, the right arm with the chequered flag, in metres from the feet. */
  white: Build['parts'];
  chequered: Build['parts'];
  feet: [number, number, number];
  /** Where the left and right arms pivot. */
  left: [number, number, number];
  right: [number, number, number];
  /** The stand's design, picked or chosen. */
  variant: string;
  /** The item's colour: his shirt, and a stand model's Team material. */
  colour: number;
  /** The mate beside them (the pair design; else empty), standing at MATE_AT. */
  mate: Build['parts'];
}

/**
 * The flag man (core/finishCrew.ts), on any of the marshals' stands: each flag on a short pole hangs
 * from its hand with the flag at the lower end, so swung up the flag is on top.
 */
export function flaggerParts(def: SceneryDef, it: SceneryItem, i: number): FlaggerBuilt {
  const b = new Build();
  const col = hexNum(paddockColour(def, it, i), hexNum(def.color, WHITE));
  const variant = paddockVariant(def, it, i) ?? 'ground';
  const m = new Build();
  const lift = marshalStand(b, variant, col, i, m);
  const f = new Build();
  const fx = variant === 'pair' ? 0.3 : 0;
  f.person(fx, 0, 0, i, { shirt: col, trousers: BLACK, arms: 'down' });
  for (const m of f.parts) m.position.y += lift * U;
  const right = f.parts.pop()!;
  const left = f.parts.pop()!;
  const w = new Build();
  w.parts.push(left);
  w.pole(fx - 0.36, lift + 0.1, 0.12, 1.3, 0xe8e8e8, 0.03);
  w.box(fx - 0.36 - 0.36, lift + 0.12, 0.12, 0.72, 0.55, 0.02, 0xf4f4f4);
  const c = new Build();
  c.parts.push(right);
  c.pole(fx + 0.36, lift + 0.1, 0.12, 1.3, 0xe8e8e8, 0.03);
  // The chequered flag: six squares by four, black and white.
  const sq = 0.12;
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) c.box(fx + 0.36 + sq * (k + 0.5), lift + 0.12 + sq * r, 0.12, sq, sq, 0.02, (r + k) % 2 ? 0x16161a : 0xf4f4f4);
  return { base: b.parts, figure: f.parts, white: w.parts, chequered: c.parts, feet: [0, lift, 0], left: [fx - 0.3, lift + 1.45, 0], right: [fx + 0.3, lift + 1.45, 0], variant, colour: col, mate: m.parts };
}

/** A pit crew member for the race view to animate: the arms and the board's pole built apart; the board itself (with its words) is drawn by the view. */
export interface PitCrewBuilt {
  base: Build['parts'];
  figure: Build['parts'];
  /** Both arms and the pole, pivoting at the shoulders, in metres from the feet. */
  arms: Build['parts'];
  feet: [number, number, number];
  shoulder: [number, number, number];
  /** Where the board hangs from the end of the pole, in the arms' frame before they swing (metres from the shoulder). */
  board: [number, number, number];
  /** The team's colour: their shirt and cap. */
  colour: number;
  /** The design: standing, behind a pit wall, or with a mate beside them. */
  variant: string;
  /** The mate beside them (the pair design; else empty), standing at mateAt, in metres in the item's frame. */
  mate: Build['parts'];
  mateAt: [number, number, number];
}

/**
 * A pit crew member (core/finishCrew.ts): a team shirt and cap, holding a pit board on a pole in
 * both hands. Standing alone, behind a pit wall, or with a mechanic beside them.
 */
export function pitCrewParts(def: SceneryDef, it: SceneryItem, i: number): PitCrewBuilt {
  const b = new Build();
  const col = hexNum(paddockColour(def, it, i), hexNum(def.color, 0x2a4a90));
  const variant = paddockVariant(def, it, i) ?? 'standing';
  if (variant === 'wall') {
    // A low concrete pit wall in front of them, the lap side.
    b.box(0, 0, 0.75, 2.4, 0.9, 0.3, 0xb8b8b0);
    b.box(0, 0.9, 0.75, 2.4, 0.06, 0.34, 0xd8d8d0);
  }
  // The mate, a mechanic with a fuel can, built apart so a model's Mate can take their place (Boss, 1 Nov 2026).
  const m = new Build();
  if (variant === 'pair') m.person(-0.9, -0.2, 0.4, i + 1, { shirt: col, arms: 'forward', held: [0.3, 0.2, 0.3, 0xc02020] });
  const f = new Build();
  f.person(0, 0, 0, i, { shirt: col, trousers: BLACK, arms: 'down' });
  // A team cap.
  f.box(0, 1.73, 0.04, 0.26, 0.08, 0.3, col);
  const cap = f.parts.pop()!;
  const right = f.parts.pop()!;
  const left = f.parts.pop()!;
  f.parts.push(cap);
  const a = new Build();
  a.parts.push(left, right);
  // A handle across both hands, and the pole running on from it, so held out the board is at its end.
  a.box(0, 0.72, 0.06, 0.66, 0.05, 0.05, 0xc8c8c8);
  a.pole(0, -0.05, 0.06, 0.8, 0xc8c8c8, 0.04);
  return { base: b.parts, figure: f.parts, arms: a.parts, feet: [0, 0, 0], shoulder: [0, 1.45, 0], board: [0, -1.5, 0.06], colour: col, variant, mate: m.parts, mateAt: [-0.9, 0, -0.2] };
}

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
