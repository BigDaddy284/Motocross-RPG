// The paddock vehicles built for the race view (core/paddock.ts has the options): old trucks and
// vans with rust on their panels, MX vans and sports motorhomes with their awnings out, the factory
// hauler with its three-sided awning the length of the trailer, and a race bike on a stand. Sizes
// are in metres from the real vehicles (the game's seven van designs, vehicles.json), scaled so a
// race bike's wheelbase is BIKE_LENGTH grid units, as the race view's bikes are.
import * as THREE from 'three';
import { paddockColour, paddockSetup, paddockVariant } from '../core/paddock';
import type { SceneryItem } from '../core/race';
import type { SceneryDef } from '../core/trackParts';
import { BIKE_LENGTH } from '../core/trackSurface';
import { brandFromColour, modelFor, raceBikeParts } from './raceBike';

/** Grid units per metre: the adult race bike's 1.46 m wheelbase is BIKE_LENGTH apart. */
export const U = BIKE_LENGTH / 1.46;

const GLASS = 0x223344;
const TYRE = 0x1c1c22;
const RIM = 0x9a9ca0;
const STEEL = 0x8a8c90;
const CHROME = 0xc8cacc;
const DARK = 0x1e2a44;
const CHASSIS = 0x2a2a30;
const CANVAS = 0xe2ded4;
const TABLE = 0xd8d8d0;
const MAT = 0x3a3a3e;
const RUST = [0x6b3f22, 0x8a5a30, 0x5a3418];

const hexNum = (s: string, fallback: number) => (/^#[0-9a-f]{6}$/i.test(s) ? parseInt(s.slice(1), 16) : fallback);
const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 0xff) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const Y = new THREE.Vector3(0, 1, 0);

/** Builds one vehicle's meshes, in grid units, from sizes given in metres: x along its length (front at +x), y up, z across. */
class Build {
  parts: THREE.Mesh[] = [];
  private mats = new Map<number, THREE.MeshLambertMaterial>();
  mat(c: number): THREE.MeshLambertMaterial {
    return this.mats.get(c) ?? this.mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c)!;
  }
  /** A box: centre x and z, bottom y, length l along x, height h, width w across z; rz leans it back, rx tilts it across. */
  box(x: number, y: number, z: number, l: number, h: number, w: number, c: number, rz = 0, rx = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(l * U, h * U, w * U), this.mat(c));
    m.position.set(x * U, (y + h / 2) * U, z * U);
    m.rotation.set(rx, 0, rz);
    this.parts.push(m);
    return m;
  }
  /** A road wheel on an axle across z: the tyre and a lighter rim. */
  wheel(x: number, z: number, r: number, w = 0.25): void {
    for (const [rad, wid, c] of [[r, w, TYRE], [r * 0.6, w + 0.02, RIM]] as const) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * U, rad * U, wid * U, 14), this.mat(c));
      m.rotation.x = Math.PI / 2;
      m.position.set(x * U, r * U, z * U);
      this.parts.push(m);
    }
  }
  wheels(xs: number[], z0: number, half: number, r: number, w = 0.25): void {
    for (const x of xs) for (const s of [-1, 1]) this.wheel(x, z0 + s * half, r, w);
  }
  /** Rust patches on a panel that faces across (z) at the given spots, the darker ones smaller. */
  rust(x: number, y: number, z: number, side: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const s = 0.12 + 0.22 * ((i * 7) % 5) / 4;
      this.box(x + (t - 0.5) * 2.2 + ((i * 3) % 2) * 0.3, y + ((i * 5) % 3) * 0.25, z + side * 0.012, s * 1.4, s, 0.02, RUST[i % RUST.length]);
    }
  }
  /** A race bike with no rider, in one colour, standing on the ground at (x, y, z) facing +x (turned by ry). */
  bike(x: number, y: number, z: number, colour: number, cls = '250cc', ry = 0): void {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry);
    // The youth model's wheelbase is 1.3 m to the adult's 1.46 m, so a youth bike is built that much shorter.
    const length = BIKE_LENGTH * (modelFor(cls) === 'youth' ? 1.3 / 1.46 : 1);
    for (const m of raceBikeParts({ brand: 'hondmoto', cls, gear: null as never }, length, { rider: false, colours: brandFromColour(colour) })) {
      m.position.applyQuaternion(q).add(new THREE.Vector3(x * U, y * U, z * U));
      m.quaternion.premultiply(q);
      this.parts.push(m);
    }
  }
  /** A bike lifted on a paddock stand under its engine. */
  bikeOnStand(x: number, z: number, colour: number, cls = '250cc', ry = 0): void {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry);
    const p = new THREE.Vector3(-0.05 * U, 0, 0).applyQuaternion(q);
    const m = this.box(x + p.x / U, 0, z + p.z / U, 0.45, 0.33, 0.3, STEEL);
    m.rotation.y = ry;
    this.bike(x, 0.33, z, colour, cls, ry);
  }
  /** A folding table with two chairs beside it. */
  table(x: number, z: number): void {
    this.box(x, 0.7, z, 1.2, 0.05, 0.7, TABLE);
    for (const [sx, sz] of [[-0.5, -0.28], [0.5, -0.28], [-0.5, 0.28], [0.5, 0.28]]) this.box(x + sx, 0, z + sz, 0.04, 0.7, 0.04, STEEL);
    for (const sz of [-0.8, 0.8]) {
      this.box(x, 0.45, z + sz, 0.45, 0.04, 0.45, DARK);
      this.box(x, 0.45, z + sz + Math.sign(sz) * 0.2, 0.45, 0.5, 0.04, DARK);
    }
  }
  /**
   * An awning out from a vehicle's side: the canvas from the wall at z0 out across +z, sloping down
   * from hWall to hEdge, on poles at the outer corners (and every few metres), a valance in the
   * vehicle's colour; `sides` closes both ends with canvas walls and lays a mat (three-sided).
   */
  awning(x0: number, x1: number, z0: number, out: number, hWall: number, hEdge: number, colour: number, sides = false): void {
    const l = x1 - x0;
    const xc = (x0 + x1) / 2;
    const span = Math.hypot(out, hWall - hEdge);
    this.box(xc, (hWall + hEdge) / 2 - 0.03, z0 + out / 2, l, 0.06, span, CANVAS, 0, Math.atan2(hWall - hEdge, out));
    this.box(xc, hEdge - 0.25, z0 + out - 0.03, l, 0.25, 0.04, shade(colour, 0.9));
    const n = Math.max(2, Math.ceil(l / 4.5) + 1);
    for (let i = 0; i < n; i++) this.box(x0 + 0.1 + (l - 0.2) * (i / (n - 1)), 0, z0 + out - 0.1, 0.06, hEdge - 0.1, 0.06, STEEL);
    if (sides) {
      // End walls: canvas from the vehicle's side to the outer edge, cut to the roof's slope so nothing shows through.
      const shape = new THREE.Shape([[0, 0], [out, 0], [out, hEdge - 0.04], [0, hWall - 0.04]].map(([u, y]) => new THREE.Vector2(u * U, y * U)));
      for (const x of [x0, x1]) {
        const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04 * U, bevelEnabled: false }), this.mat(CANVAS));
        wall.rotation.y = -Math.PI / 2;
        wall.position.set((x + 0.02) * U, 0, z0 * U);
        this.parts.push(wall);
      }
      this.box(xc, 0, z0 + out / 2, l, 0.03, out, MAT);
    }
  }
}

type Setup = string | undefined;

function rustyTruck(b: Build, col: number, setup: Setup): void {
  const ox = 0.3;
  const dark = shade(col, 0.8);
  b.box(ox, 0.35, 0, 4.6, 0.3, 1.5, CHASSIS);
  b.box(ox + 1.75, 0.6, 0, 1.4, 0.55, 1.85, col);
  b.box(ox + 2.42, 0.62, 0, 0.1, 0.45, 1.5, CHROME);
  b.box(ox + 0.5, 0.6, 0, 1.3, 1.25, 1.85, col);
  b.box(ox + 0.5, 1.2, 0, 1.0, 0.5, 1.88, GLASS);
  b.box(ox + 1.12, 1.1, 0, 0.08, 0.6, 1.7, GLASS, 0.4);
  b.box(ox - 1.3, 0.85, 0, 2.3, 0.08, 1.85, dark);
  for (const s of [-1, 1]) b.box(ox - 1.3, 0.85, s * 0.88, 2.3, 0.5, 0.08, col);
  b.box(ox - 0.18, 0.85, 0, 0.08, 0.5, 1.85, col);
  const bikes = setup === 'bike1' ? 1 : setup === 'bike2' ? 2 : 0;
  if (bikes) b.box(ox - 2.75, 0.85, 0, 0.6, 0.06, 1.85, col);
  else b.box(ox - 2.42, 0.85, 0, 0.08, 0.5, 1.85, col);
  b.wheels([ox + 1.6, ox - 1.5], 0, 0.8, 0.36);
  for (const s of [-1, 1]) {
    b.rust(ox - 1.3, 0.9, s * 0.92, s, 4);
    b.rust(ox + 0.7, 0.7, s * 0.925, s, 3);
  }
  b.rust(ox + 1.75, 1.15, 0, 1, 3);
  const bikeCol = col === 0xd8d4c8 ? 0x3b86da : 0xc21c15;
  for (let i = 0; i < bikes; i++) b.bike(ox - 1.5, 0.93, bikes === 2 ? (i ? 0.45 : -0.45) : 0, i ? 0xa0c33e : bikeCol);
}

function rustyVan(b: Build, col: number, setup: Setup, bz: number): void {
  b.box(0, 0.3, bz, 4.2, 0.25, 1.4, CHASSIS);
  b.box(-0.55, 0.5, bz, 3.3, 1.6, 1.8, col);
  b.box(1.6, 0.5, bz, 1.0, 0.8, 1.75, col);
  b.box(2.1, 0.55, bz, 0.08, 0.4, 1.5, CHROME);
  b.box(1.18, 1.2, bz, 0.08, 0.75, 1.6, GLASS, 0.4);
  b.box(0.55, 1.3, bz, 1.0, 0.5, 1.84, GLASS);
  b.wheels([1.4, -1.4], bz, 0.8, 0.34);
  for (const s of [-1, 1]) {
    b.rust(-0.6, 0.6, bz + s * 0.9, s, 5);
    b.rust(-0.6, 1.5, bz + s * 0.9, s, 2);
  }
  const open = setup === 'doors_open' || setup === 'bike_out';
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05 * U, 1.5 * U, 0.88 * U).translate(0, 0, (-s * 0.44) * U), b.mat(shade(col, 0.95)));
    door.position.set(-2.2 * U, (0.55 + 0.75) * U, (bz + s * 0.9) * U);
    door.rotation.y = open ? s * 1.9 : 0;
    b.parts.push(door);
  }
  if (setup === 'bike_out') b.bike(-0.4, 0, bz + 1.95, 0x3b86da);
}

function mxVan(b: Build, col: number, setup: Setup, bz: number, long: boolean): void {
  const L = long ? 6.9 : 5.0;
  const H = long ? 2.6 : 2.3;
  const x0 = -L / 2;
  const x1 = L / 2;
  b.box(0, 0.3, bz, L - 0.2, 0.25, 1.6, CHASSIS);
  b.box((x0 + x1 - 1.2) / 2, 0.5, bz, L - 1.2, H - 0.5, 1.95, col);
  b.box(x1 - 0.6, 0.5, bz, 1.2, 0.9, 1.9, col);
  b.box(x1 - 1.05, 1.35, bz, 0.1, 0.8, 1.75, GLASS, 0.45);
  b.box(x1 - 1.75, 1.35, bz, 1.0, 0.6, 1.99, GLASS);
  b.box(x1, 0.4, bz, 0.1, 0.4, 1.9, CHASSIS);
  b.box(x0, 0.4, bz, 0.1, 0.4, 1.9, CHASSIS);
  for (const s of [-1, 1]) b.box(x0, 0.9, bz + s * 0.8, 0.04, 0.3, 0.2, 0xc02020);
  b.box(0, 0.55, bz, L - 1.3, 0.35, 1.97, shade(col, 0.8));
  b.wheels([x1 - 0.9, x0 + (long ? 1.6 : 0.9)], bz, 0.85, 0.36);
  if (setup === 'awning' || setup === 'awning_bikes') {
    b.awning(x0 + 0.1, x1 - 1.3, bz + 0.98, 2.5, H - 0.1, H - 0.4, col);
    if (setup === 'awning_bikes') {
      b.bikeOnStand(x0 + 1.3, bz + 2.2, 0xc21c15);
      b.bikeOnStand(x1 - 2.5, bz + 2.2, long ? 0xecbe2a : 0x3b86da);
      if (long) b.table(x0 + 3.5, bz + 2.3);
    }
  }
}

function motorhome(b: Build, col: number, setup: Setup, bz: number, long: boolean): void {
  if (long) {
    b.box(0, 0.3, bz, 11.6, 0.25, 1.9, CHASSIS);
    b.box(0, 0.5, bz, 11.8, 2.9, 2.4, col);
    b.box(0, 0.55, bz, 11.8, 0.5, 2.42, shade(col, 0.7));
    b.box(5.9, 1.4, bz, 0.08, 1.6, 2.2, GLASS, 0.12);
    b.box(0.5, 1.9, bz, 9.5, 0.9, 2.44, GLASS);
    b.box(-5.3, 1.7, bz, 0.6, 1.1, 2.44, GLASS);
    b.box(5.95, 0.4, bz, 0.12, 0.5, 2.3, CHASSIS);
    b.wheels([4.2, -3.0, -4.3], bz, 1.0, 0.45, 0.3);
    if (setup === 'awning' || setup === 'awning_bikes') {
      b.awning(-5.6, 4.5, bz + 1.2, 2.8, 2.6, 2.3, col);
      if (setup === 'awning_bikes') {
        b.bikeOnStand(-4.0, bz + 2.6, 0xc21c15);
        b.bikeOnStand(-1.5, bz + 2.6, 0x3b86da);
        b.bikeOnStand(1.0, bz + 2.6, 0xa0c33e);
        b.table(3.4, bz + 2.6);
      }
    }
    return;
  }
  b.box(0, 0.3, bz, 6.8, 0.3, 1.8, CHASSIS);
  b.box(-0.8, 0.6, bz, 5.4, 2.4, 2.25, col);
  b.box(-0.8, 0.65, bz, 5.4, 0.4, 2.27, shade(col, 0.75));
  b.box(2.7, 0.55, bz, 1.6, 1.0, 2.05, col);
  b.box(3.5, 0.45, bz, 0.1, 0.5, 2.0, CHASSIS);
  b.box(3.0, 1.5, bz, 0.1, 0.9, 1.9, GLASS, 0.5);
  b.box(2.5, 2.0, bz, 1.3, 0.9, 2.15, col);
  b.box(2.4, 1.55, bz, 0.9, 0.5, 2.1, GLASS);
  for (const s of [-1, 1]) {
    b.box(-2.5, 1.6, bz + s * 1.125, 1.0, 0.7, 0.03, GLASS);
    b.box(0, 1.6, bz + s * 1.125, 1.2, 0.7, 0.03, GLASS);
  }
  b.wheels([2.3, -1.6], bz, 0.95, 0.38);
  if (setup === 'awning' || setup === 'awning_bikes') {
    b.awning(-3.3, 1.7, bz + 1.13, 2.5, 2.5, 2.25, col);
    if (setup === 'awning_bikes') {
      b.bikeOnStand(-2.2, bz + 2.4, 0xc21c15);
      b.bikeOnStand(0.6, bz + 2.4, 0xecbe2a);
    }
  }
}

function hauler(b: Build, col: number, setup: Setup, bz: number): void {
  // Tractor unit.
  b.box(8.2, 0.5, bz, 5.0, 0.4, 2.2, CHASSIS);
  b.box(9.5, 1.1, bz, 2.4, 2.6, 2.5, col);
  b.box(9.5, 1.1, bz, 2.42, 0.9, 2.52, DARK);
  b.box(10.7, 2.2, bz, 0.06, 1.0, 2.3, GLASS, 0.08);
  b.box(9.6, 2.3, bz, 1.2, 0.8, 2.54, GLASS);
  b.box(10.75, 0.6, bz, 0.15, 0.6, 2.4, DARK);
  b.box(10.72, 1.3, bz, 0.06, 0.7, 1.8, 0x3a3a40);
  b.box(9.1, 3.7, bz, 1.4, 0.5, 2.3, col, 0.3);
  b.box(8.3, 1.3, bz + 1.25, 0.15, 2.0, 0.15, CHROME);
  b.wheels([9.9, 7.0, 5.9], bz, 1.05, 0.5, 0.35);
  // Trailer: the box body on its chassis, the lower band in the team's dark blue.
  b.box(-1.5, 0.7, bz, 17.5, 0.3, 2.2, CHASSIS);
  b.box(-1.5, 1.0, bz, 17.5, 3.0, 2.55, col);
  b.box(-1.5, 1.0, bz, 17.52, 1.0, 2.57, DARK);
  b.box(-1.5, 3.9, bz, 17.52, 0.12, 2.57, shade(col, 0.85));
  b.box(-10.3, 0.5, bz, 0.1, 0.3, 2.2, DARK);
  for (const s of [-1, 1]) b.box(-10.26, 1.2, bz + s * 1.1, 0.04, 0.4, 0.2, 0xc02020);
  b.wheels([-6.3, -7.6, -8.9], bz, 1.05, 0.5, 0.35);
  for (const x of [6.0, 6.5]) b.box(x, 0, bz - 0.9, 0.1, 0.7, 0.1, STEEL);
  if (setup === 'awning' || setup === 'awning_bikes') {
    b.awning(-10.0, 7.0, bz + 1.28, 4.0, 3.6, 3.2, col, true);
    if (setup === 'awning_bikes') {
      const cols = [0xc21c15, 0x3b86da, 0xa0c33e, 0xecbe2a, 0xef6c18];
      for (let i = 0; i < 5; i++) b.bikeOnStand(-8.0 + i * 3.0, bz + 3.3, cols[i]);
      b.table(-3.5, bz + 2.0);
      b.table(3.5, bz + 2.0);
    }
  }
}

/** The meshes of a paddock vehicle, in the item's own frame (its centre, on the ground, x along its length). Empty for other scenery. */
export function paddockParts(def: SceneryDef, it: SceneryItem, i: number): THREE.Mesh[] {
  const b = new Build();
  const col = hexNum(paddockColour(def, it, i), hexNum(def.color, 0x888888));
  const setup = paddockSetup(def, it, i);
  const variant = paddockVariant(def, it, i);
  const d = (it.h ?? def.h) / U;
  const bz = (bodyW: number) => -(d - bodyW) / 2;
  switch (def.id) {
    case 'rusty_truck': rustyTruck(b, col, setup); break;
    case 'rusty_van': rustyVan(b, col, setup, bz(1.8)); break;
    case 'mx_van': mxVan(b, col, setup, bz(1.95), false); break;
    case 'mx_van_long': mxVan(b, col, setup, bz(1.95), true); break;
    case 'motorhome': motorhome(b, col, setup, bz(2.25), false); break;
    case 'motorhome_long': motorhome(b, col, setup, bz(2.4), true); break;
    case 'hauler': hauler(b, col, setup, bz(2.55)); break;
    case 'bike_stand': b.bikeOnStand(0, 0, col, variant === 'youth' ? '65cc' : '250cc'); break;
    default: break;
  }
  return b.parts;
}
