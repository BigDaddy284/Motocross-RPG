import * as THREE from 'three';

// The race-day bike and rider (Boss's brief, 24 Oct 2026: "Race day bike colours.png"; Boss, 25 Oct:
// "use the model from the coloured race day rides"). A port of the vehicles thread's sprite models
// (art/vehicles/tools/vehgen/models.py) to the 3D race view: one youth model for the 50 to 85
// classes and a slightly bigger adult model, with the plastics in the bike's brand colours and the
// chibi rider in their own gear colours. Visual only: the bike is scaled so its wheelbase is the
// race's BIKE_LENGTH with the tyres on the ground, exactly where the old bike's wheels were, and
// nothing here feeds back into the race.

type Ramp = number;
const BLACK = 0x3b3c45;
const GREY = 0x918e93;
const WHITE = 0xcfc5bf;
const BRIGHT_WHITE = 0xeaebeb;
const RED = 0xc21c15;
const BLUE = 0x3b86da;
const LIME = 0xa0c33e;
const YELLOW = 0xecbe2a;
const HIVIS = 0xdad65d;
const PINK = 0xf067d5;
const ORANGE = 0xef6c18;
const CAMO = 0x6a9f50;
const GREEN = 0x447f3c;
const SILVER = 0xb1aeaf;

const FIXED = {
  tyre: BLACK,
  rim: SILVER,
  metal: SILVER,
  engine: GREY,
  engine2: 0xa39997,
  exhaust: 0x6c686b,
  chain: 0x4b4c57,
  shock: YELLOW,
  fork: 0xd9c096,
  seat: BLACK,
  bar: BLACK,
};

/** Brand colours (Boss, 22 Oct): blue Yamamoto, green Kwakmoto, yellow Sukimoto, red Hondmoto. */
export const BRAND_COLOURS: Record<string, { body: Ramp; body2: Ramp; frame: Ramp; frame2: Ramp; plate: Ramp }> = {
  yamamoto: { body: BLUE, body2: BRIGHT_WHITE, frame: BLUE, frame2: BLACK, plate: BRIGHT_WHITE },
  kwakmoto: { body: LIME, body2: BLACK, frame: LIME, frame2: BLACK, plate: LIME },
  sukimoto: { body: YELLOW, body2: BLUE, frame: SILVER, frame2: BLACK, plate: YELLOW },
  hondmoto: { body: RED, body2: BRIGHT_WHITE, frame: RED, frame2: BLACK, plate: BRIGHT_WHITE },
};

/** Gear colourways from the rider atlas: each item's main colour and its accent. */
const COLOURWAYS: Record<string, [Ramp, Ramp]> = {
  black: [BLACK, GREY],
  red: [RED, WHITE],
  hivis: [HIVIS, BLACK],
  blue: [BLUE, WHITE],
  pink: [PINK, BLACK],
  orange: [ORANGE, BLACK],
  white: [WHITE, GREY],
  camo: [CAMO, BLACK],
  green: [GREEN, WHITE],
};

export interface Gear {
  helmet: Ramp;
  helmet2: Ramp;
  visor: Ramp;
  jersey: Ramp;
  glove: Ramp;
  pants: Ramp;
  boot: Ramp;
  /** The rider's own bike colour, over the brand's (a named racer's bike to match their kit). */
  bike?: Ramp;
}

function gear(helmet: string, goggles: string, top: string, gloves: string, bottoms: string, boots: string, bike?: string): Gear {
  const c = (k: string, i = 0) => COLOURWAYS[k][i];
  return { helmet: c(helmet), helmet2: c(helmet, 1), visor: c(goggles), jersey: c(top), glove: c(gloves), pants: c(bottoms), boot: c(boots), ...(bike ? { bike: c(bike) } : {}) };
}

/** The gear sets drawn on the race sheets: the player's starter kit and the CPU riders' kits. */
export const GEAR_SETS: Record<string, Gear> = {
  'player-default': gear('white', 'orange', 'orange', 'black', 'black', 'white'),
  'cpu-red': gear('red', 'red', 'red', 'red', 'red', 'red'),
  'cpu-hivis': gear('hivis', 'hivis', 'black', 'hivis', 'black', 'black'),
  'cpu-blue': gear('blue', 'blue', 'blue', 'blue', 'blue', 'blue'),
  'cpu-pink': gear('pink', 'pink', 'pink', 'pink', 'pink', 'white'),
  'cpu-camo': gear('black', 'white', 'white', 'camo', 'camo', 'camo'),
  'cpu-black': gear('black', 'orange', 'black', 'black', 'black', 'black'),
  'cpu-champion': gear('hivis', 'hivis', 'hivis', 'black', 'black', 'black'),
  // Neal Gizard, the pro: blue with black (Boss, 28 Oct 2026).
  'cpu-neal': gear('blue', 'black', 'blue', 'black', 'blue', 'black'),
  // The named racers in their map kits, on bikes to match (Boss, 29 Oct 2026).
  'cpu-dan': gear('orange', 'black', 'orange', 'black', 'black', 'black', 'orange'),
  'cpu-mickey': gear('green', 'white', 'green', 'white', 'white', 'green', 'green'),
  'cpu-louis': gear('red', 'white', 'red', 'red', 'red', 'red', 'red'),
};

/** A rider's race kit: the player's, a rider's own, the champions' hi-vis, or the field's kits in turn. */
export function kitFor(e: { player?: boolean; tag?: string; kit?: string }, i: number): Gear {
  if (e.player) return GEAR_SETS['player-default'];
  if (e.kit && GEAR_SETS[e.kit]) return GEAR_SETS[e.kit];
  return GEAR_SETS[e.tag?.endsWith('Champion') ? 'cpu-champion' : CPU_GEAR[i % CPU_GEAR.length]];
}

/** CPU kits in the order the field is dressed. The Local Champion wears hi-vis. */
export const CPU_GEAR = ['cpu-red', 'cpu-blue', 'cpu-pink', 'cpu-camo', 'cpu-black', 'cpu-hivis'];

/**
 * The colour that stands for a rider on the race screen's map and labels: their jersey, so the
 * dot matches the rider on the track (grey for a black jersey, which would vanish on the map).
 */
export function gearColour(g: Gear): number {
  return g.jersey === BLACK ? GREY : g.jersey;
}

/** How one rider looks on race day. */
export interface RaceLook {
  brand: string;
  /** Racing class id, such as 50cc. Up to 125 cc rides the youth model, the 250F and up the adult (modelFor). */
  cls: string;
  gear: Gear;
}

/** The colour of each part of the race view's plain bike and rider, for a rider with no look (RaceView.makeBike). */
export interface BikeColours {
  plastics: number;
  frame: number;
  plate: number;
  legs: number;
  torso: number;
  arms: number;
  helmet: number;
  visor: number;
}

const DARK = 0x1c1c22;
const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 0xff) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * The colours for one rider. Without a look, the original single-colour scheme: everything in the
 * rider's colour, with darker kit and a white helmet for the player.
 */
export function bikeColours(color: number, player: boolean, look?: RaceLook): BikeColours {
  if (!look) {
    const kit = shade(color, 0.75);
    return { plastics: color, frame: 0x9a9aa0, plate: 0xf4f4f4, legs: kit, torso: color, arms: kit, helmet: player ? 0xffffff : shade(color, 1.15), visor: DARK };
  }
  const b = look.gear?.bike ? brandFromColour(look.gear.bike) : BRAND_COLOURS[look.brand] ?? BRAND_COLOURS.hondmoto;
  const g = look.gear;
  return { plastics: b.body, frame: b.frame, plate: b.plate, legs: g.pants, torso: g.jersey, arms: g.jersey, helmet: g.helmet, visor: g.visor };
}

interface Model {
  /** Wheelbase, front and rear wheel radius and seat height in metres. */
  wb: number; fr: number; rr: number; seat: number;
  twostroke: boolean;
  /** The rider's and the plastics' scale against the adult bike's. */
  rider: number; plastics: number;
  /** Lights and a number board: the enduro bike. */
  lights?: boolean;
  /** Two shocks on the swingarm and steel mudguards: the vintage bike. */
  twinshock?: boolean;
  /** A horizontal engine and a low tank: the pit bike. */
  pit?: boolean;
}
/**
 * The bike models. Races ride the youth model (50 to 125 cc) or the adult one (modelFor); the rest are
 * for the scenery bikes placed round a track (Boss, 28 Oct 2026) and never ride in a race.
 */
export const MODELS: Record<string, Model> = {
  youth: { wb: 1.3, fr: 0.34, rr: 0.32, seat: 0.86, twostroke: true, rider: 0.9, plastics: 1.0 },
  adult: { wb: 1.46, fr: 0.37, rr: 0.35, seat: 0.96, twostroke: false, rider: 1.0, plastics: 1.08 },
  mini: { wb: 0.95, fr: 0.25, rr: 0.25, seat: 0.6, twostroke: true, rider: 0.72, plastics: 0.75 },
  pitbike: { wb: 1.12, fr: 0.28, rr: 0.26, seat: 0.74, twostroke: false, rider: 0.85, plastics: 0.82, pit: true },
  enduro: { wb: 1.48, fr: 0.37, rr: 0.35, seat: 0.97, twostroke: false, rider: 1.0, plastics: 1.08, lights: true },
  twinshock: { wb: 1.42, fr: 0.37, rr: 0.36, seat: 0.88, twostroke: true, rider: 1.0, plastics: 0.9, twinshock: true },
};
/** The models the editor offers for a scenery bike, with their names. */
export const BIKE_MODELS: [string, string][] = [['adult', 'Adult MX bike'], ['youth', 'Youth MX bike'], ['mini', '50cc mini'], ['pitbike', 'Pit bike'], ['enduro', 'Enduro bike'], ['twinshock', 'Vintage twin-shock']];

/**
 * The model a class races (Boss, 1 Nov 2026: "Youth bike scaled up for Adult 125, race_bike model for 250f and
 * up"): the youth model, a two-stroke, up to 125 cc; the adult race bike, a four-stroke, from the 250F on.
 */
export function modelFor(cls: string): 'youth' | 'adult' {
  const cc = parseInt(cls, 10);
  return Number.isFinite(cc) && cc <= 125 ? 'youth' : 'adult';
}

/** Whether a class's bike is full size, the race bike's size: every class over 85 cc. The 125s ride the youth model scaled up to it. */
export function fullSize(cls: string): boolean {
  const cc = parseInt(cls, 10);
  return !(Number.isFinite(cc) && cc <= 85);
}

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * The bike and rider as meshes, each with one plain colour, facing +x with the wheels on y = 0
 * and the wheelbase `length` long. The models are in metres with x forward, y left and z up
 * (vehgen), turned here into the race view's x forward, y up.
 */
export type BrandColours = (typeof BRAND_COLOURS)[string];
/** Brand colours for a bike in any one colour: plastics and frame in it, with white (or black on a light bike) accents. */
export function brandFromColour(color: number): BrandColours {
  const lum = (((color >> 16) & 0xff) * 0.3 + ((color >> 8) & 0xff) * 0.59 + (color & 0xff) * 0.11) / 255;
  const accent = lum > 0.72 ? BLACK : BRIGHT_WHITE;
  return { body: color, body2: accent, frame: color, frame2: BLACK, plate: accent };
}

/** The bike's meshes, and the rider's unless `rider` is false (a parked bike in the paddock); `colours` replaces the brand's. */
export function raceBikeParts(look: RaceLook, length: number, opts: { rider?: boolean; colours?: BrandColours; model?: string } = {}): THREE.Mesh[] {
  const M = MODELS[opts.model ?? ''] ?? MODELS[modelFor(look.cls)];
  const k = length / M.wb;
  const brand = opts.colours ?? (look.gear?.bike ? brandFromColour(look.gear.bike) : BRAND_COLOURS[look.brand] ?? BRAND_COLOURS.hondmoto);
  const g = look.gear;
  const mats = new Map<number, THREE.MeshLambertMaterial>();
  const mat = (c: number) => mats.get(c) ?? mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c)!;
  const out: THREE.Mesh[] = [];
  const at = (p: V3) => new THREE.Vector3(p[0] * k, p[2] * k, -p[1] * k);
  const put = (geo: THREE.BufferGeometry, c: number, p: V3) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.copy(at(p));
    out.push(m);
    return m;
  };
  const box = (c: V3, s: V3, col: number) => put(new THREE.BoxGeometry(s[0] * k, s[2] * k, s[1] * k), col, c);
  const ell = (c: V3, r: V3, col: number) => put(new THREE.SphereGeometry(1, 10, 8), col, c).scale.set(r[0] * k, r[2] * k, r[1] * k);
  /** A capsule (or cylinder) from a to b. */
  const rod = (a: V3, b: V3, r: number, col: number, capped = true) => {
    const va = at(a);
    const vb = at(b);
    const len = va.distanceTo(vb);
    const geo = capped ? new THREE.CapsuleGeometry(r * k, Math.max(0.001, len), 3, 8) : new THREE.CylinderGeometry(r * k, r * k, Math.max(0.001, len), 12);
    const m = new THREE.Mesh(geo, mat(col));
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    if (len > 1e-6) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    out.push(m);
  };

  const { wb, fr, rr, seat, plastics: pl } = M;
  const fx = wb / 2;
  const rx = -wb / 2;
  const tw = 0.085;
  for (const [cx, R] of [[fx, fr], [rx, rr]] as const) {
    // Tyre, a thin rim inside it and the hub: open spokes, so the wheel reads as a wheel, not a disc.
    for (const [rad, tube, col] of [[R - tw, tw, FIXED.tyre], [R - tw * 2.1, 0.018, FIXED.rim]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * k, tube * k, 8, 18), mat(col));
      ring.position.copy(at([cx, 0, R]));
      out.push(ring);
    }
    rod([cx, -0.05, R], [cx, 0.05, R], 0.06, FIXED.metal, false);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      const d = R - tw * 2.1;
      rod([cx - Math.cos(a) * d, 0, R - Math.sin(a) * d], [cx + Math.cos(a) * d, 0, R + Math.sin(a) * d], 0.008, FIXED.rim, false);
    }
  }
  const head: V3 = [fx - 0.3, 0, seat + 0.08];
  const swing: V3 = [-0.08, 0, 0.4];
  for (const y of [-0.1, 0.1]) rod([fx, y, fr], [head[0] + 0.02, y, head[2] + 0.06], 0.034, FIXED.fork);
  box([head[0] + 0.02, 0, head[2] + 0.07], [0.08, 0.26, 0.05], FIXED.metal);
  rod(head, add(swing, [0.02, 0, 0.06]), 0.032, brand.frame);
  rod(head, [swing[0] - 0.08, 0, seat - 0.12], 0.03, brand.frame);
  rod([swing[0] - 0.08, 0, seat - 0.12], [rx + 0.25, 0, seat - 0.02], 0.022, brand.frame);
  const eng: V3 = [swing[0] + 0.2, 0, M.pit ? 0.36 : 0.44];
  box(add(eng, [0, 0, -0.03]), [0.34, 0.2, 0.24], FIXED.engine);
  if (M.pit) box(add(eng, [0.26, 0, 0.0]), [0.2, 0.14, 0.14], FIXED.engine2);
  else box(add(eng, [0.06, 0, 0.17]), [0.16, 0.15, 0.15], FIXED.engine2);
  if (M.pit) {
    // The pit bike's pipe runs up from the horizontal cylinder to a stubby silencer under the seat.
    const p0 = add(eng, [0.36, -0.03, 0.02]);
    rod(p0, add(eng, [0.1, -0.15, 0.2]), 0.028, FIXED.metal);
    rod(add(eng, [0.1, -0.15, 0.2]), [rx + 0.36, -0.15, seat - 0.1], 0.03, FIXED.metal);
    rod([rx + 0.36, -0.15, seat - 0.1], [rx + 0.1, -0.15, seat - 0.05], 0.05, FIXED.metal, false);
  } else if (M.twostroke) {
    // Expansion chamber under the frame, silencer under the side panel.
    const p0 = add(eng, [0.14, -0.02, 0.14]);
    const pts: V3[] = [p0, add(p0, [0.12, -0.06, -0.1]), add(eng, [0.1, -0.16, -0.12]), add(eng, [-0.25, -0.17, 0.02]), [rx + 0.32, -0.15, seat - 0.12]];
    [0.045, 0.065, 0.07, 0.055].forEach((r, i) => rod(pts[i], pts[i + 1], r, FIXED.exhaust));
    rod(pts[4], [rx + 0.06, -0.15, seat - 0.06], 0.045, FIXED.metal, false);
  } else {
    // Four-stroke header and a big silencer.
    const p0 = add(eng, [0.1, -0.02, 0.2]);
    const pts: V3[] = [p0, add(p0, [0.08, -0.07, -0.12]), add(eng, [-0.1, -0.16, 0.12]), [rx + 0.38, -0.16, seat - 0.12]];
    for (let i = 0; i < 3; i++) rod(pts[i], pts[i + 1], 0.032, FIXED.metal);
    rod(pts[3], [rx + 0.02, -0.16, seat - 0.04], 0.07, FIXED.metal, false);
  }
  box([swing[0] - 0.02, 0.03, seat - 0.17], [0.14, 0.14, 0.12], brand.frame2);
  for (const y of [-0.11, 0.11]) rod(swing, [rx, y, rr], 0.032, FIXED.metal);
  if (M.twinshock) for (const y of [-0.15, 0.15]) rod([rx + 0.3, y, seat - 0.04], [rx + 0.12, y, rr + 0.02], 0.03, FIXED.shock);
  else rod([swing[0] - 0.12, 0, seat - 0.1], [swing[0] - 0.2, 0, 0.36], 0.045, FIXED.shock);
  rod(add(eng, [-0.06, 0.13, -0.04]), [rx, 0.13, rr], 0.016, FIXED.chain);
  // Bodywork: the big plastics carry the brand colour.
  ell([head[0] - 0.2, 0, seat + 0.03], [0.26 * pl, 0.16 * pl, 0.11 * pl], brand.body);
  for (const y of [-1, 1]) {
    box([head[0] - 0.12, y * 0.17 * pl, seat - 0.08], [0.28 * pl, 0.05, 0.22 * pl], brand.body);
    box([head[0] - 0.12, y * (0.17 * pl + 0.028), seat - 0.06], [0.16 * pl, 0.01, 0.1 * pl], brand.body2);
    box([rx * 0.48, y * 0.14, seat - 0.11], [0.3 * pl, 0.03, 0.19 * pl], brand.plate);
  }
  box([rx * 0.42 - 0.05, 0, seat + 0.01], [wb * 0.54, 0.22, 0.07], FIXED.seat);
  // Mudguards: plastics, or steel on the vintage bike, whose front one sits high on the forks.
  const guard = M.twinshock ? FIXED.metal : brand.body;
  box([rx - 0.1, 0, seat - 0.02], [0.42 * pl, 0.16, 0.04], guard);
  box([fx + 0.04, 0, fr * 2 + (M.twinshock ? 0.1 : 0.06)], [0.4 * pl, 0.15, 0.04], M.twinshock ? FIXED.metal : brand.body2);
  if (M.lights) {
    // The enduro bike's headlight in its cowl and the tail light on the rear guard.
    box([head[0] + 0.1, 0, head[2] + 0.02], [0.05, 0.26 * pl, 0.26 * pl], brand.plate);
    box([head[0] + 0.14, 0, head[2] + 0.03], [0.03, 0.14, 0.12], 0xfff6c0);
    box([rx - 0.3, 0, seat - 0.05], [0.03, 0.08, 0.05], RED);
  } else if (M.twinshock) {
    // Oval number boards at the sides instead of a front plate.
    for (const y of [-1, 1]) ell([rx * 0.5, y * 0.16, seat - 0.1], [0.14, 0.01, 0.1], brand.plate);
  } else box([head[0] + 0.1, 0, head[2] + 0.02], [0.035, 0.26 * pl, 0.24 * pl], brand.plate);
  const bar = add(head, [-0.06, 0, 0.21]);
  rod(add(bar, [0, -0.36, 0]), add(bar, [0, 0.36, 0]), 0.018, FIXED.bar);
  rod(add(head, [0.02, 0, 0.08]), bar, 0.022, FIXED.metal);

  if (opts.rider === false) return out;
  // The chibi rider, seated: helmet about half the figure.
  const s = M.rider;
  const peg = add(eng, [-0.06, 0, -0.12]);
  const hip: V3 = [peg[0] - 0.14 * s, 0, seat + 0.07 * s];
  const sh = add(hip, [0.16 * s, 0, 0.34 * s]);
  const hd = add(sh, [0.1 * s, 0, 0.26 * s]);
  for (const y of [-1, 1]) {
    const w = y * 0.13 * s;
    const knee: V3 = [peg[0] + 0.18 * s, w * 1.4, (peg[2] + hip[2]) / 2 + 0.08 * s];
    rod(add(peg, [0.02, w * 1.1, 0.03]), knee, 0.07 * s, g.boot);
    rod(knee, add(hip, [0, w, 0]), 0.085 * s, g.pants);
    const hand = add(bar, [0, y * 0.33, 0.02]);
    const elbow = add(mid(sh, hand), [-0.02, w * 1.6, -0.05 * s]);
    rod(add(sh, [0, w * 1.1, 0]), elbow, 0.065 * s, g.jersey);
    rod(elbow, hand, 0.055 * s, g.jersey);
    ell(hand, [0.055 * s, 0.055 * s, 0.055 * s], g.glove);
  }
  rod(hip, sh, 0.17 * s, g.jersey);
  ell(add(hip, [0.02, 0, 0.04]), [0.16 * s, 0.16 * s, 0.16 * s], g.pants);
  ell(hd, [0.26 * s, 0.22 * s, 0.24 * s], g.helmet);
  ell(add(hd, [0, 0, 0.1 * s]), [0.2 * s, 0.226 * s, 0.1 * s], g.helmet2);
  box(add(hd, [0.22 * s, 0, 0]), [0.06 * s, 0.3 * s, 0.1 * s], g.visor);
  box(add(hd, [0.24 * s, 0, 0.15 * s]), [0.16 * s, 0.22 * s, 0.035], g.helmet2);
  box(add(hd, [0.22 * s, 0, -0.15 * s]), [0.1 * s, 0.14 * s, 0.1 * s], g.helmet);
  return out;
}
