// What the race view still builds from boxes, in metres scaled so a race bike's wheelbase is
// BIKE_LENGTH grid units, as the race view's bikes are: a race bike on a stand (in each of its
// designs), and the people and stands the moving figures and the sprint start are made of
// (trackside.ts). The paddock vehicles and the rest of the scenery are the game's own models in
// public/assets/models (Boss, 2 Nov 2026: "I want the models you made to become the built in models").
import * as THREE from 'three';
import { paddockColour, paddockVariant } from '../core/paddock';
import type { SceneryItem } from '../core/race';
import type { SceneryDef } from '../core/trackParts';
import { BIKE_LENGTH } from '../core/trackSurface';
import { brandFromColour, modelFor, MODELS, raceBikeParts } from './raceBike';

/** Grid units per metre: the adult race bike's 1.46 m wheelbase is BIKE_LENGTH apart. */
export const U = BIKE_LENGTH / 1.46;

export const STEEL = 0x8a8c90;
/** Shirts for the people built beside the track, picked by hash. */
export const SHIRTS = [0xe04040, 0x4080e0, 0xf0c030, 0x40b060, 0xf0f0f0, 0xe07030, 0x9060c0, 0x30b0c0, 0x202428];
const TROUSERS = [0x2a3a5a, 0x4a4a50, 0x6a5040, 0x3a5a3a];
const SKIN = [0xe0b090, 0xc08860, 0x8a5a3a, 0xf0d0b0];

export const hexNum = (s: string, fallback: number) => (/^#[0-9a-f]{6}$/i.test(s) ? parseInt(s.slice(1), 16) : fallback);
export const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 0xff) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const Y = new THREE.Vector3(0, 1, 0);
const hash01 = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** How a person stands: on their feet, sat (on a seat 0.45 m up), kneeling, or lying on their front. */
export type Pose = 'stand' | 'sit' | 'kneel' | 'lie' | 'floor';
/** Where their arms are: by their sides, held out in front (holding something), or up. */
export type Arms = 'down' | 'forward' | 'up';
export interface Person { pose?: Pose; arms?: Arms; shirt?: number; trousers?: number; skin?: number; /** A box held in front of the face: length (along z), height, width. */ held?: [number, number, number, number]; }

/** Builds an item's meshes, in grid units, from sizes given in metres: x along its length (front at +x), y up, z across. */
export class Build {
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

  /** A cylinder standing on y (axis up): centre x, z, bottom y, radius r, height h. */
  cyl(x: number, y: number, z: number, r: number, h: number, c: number, n = 12, rTop = r): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop * U, r * U, h * U, n), this.mat(c));
    m.position.set(x * U, (y + h / 2) * U, z * U);
    this.parts.push(m);
    return m;
  }

  /** A thin pole: centre x, z, bottom y, height h. */
  pole(x: number, y: number, z: number, h: number, c = STEEL, t = 0.06): THREE.Mesh {
    return this.box(x, y, z, t, h, t, c);
  }
  /** Runs fn, then turns everything it built by ry about the point (cx, cz). */
  turned(cx: number, cz: number, ry: number, fn: () => void): void {
    const n = this.parts.length;
    fn();
    if (!ry) return;
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry);
    const c = new THREE.Vector3(cx * U, 0, cz * U);
    for (const m of this.parts.slice(n)) {
      m.position.sub(c).applyQuaternion(q).add(c);
      m.quaternion.premultiply(q);
    }
  }
  /**
   * A person about 1.75 m tall facing +z with their feet (or seat) at (x, 0, z), turned by ry, in the
   * proportions of the cheering fans' figure: box legs, body, head and arms.
   */
  person(x: number, z: number, ry: number, k: number, o: Person = {}): void {
    const shirt = o.shirt ?? SHIRTS[Math.floor(hash01(k * 13 + 5) * SHIRTS.length)];
    const trousers = o.trousers ?? TROUSERS[Math.floor(hash01(k * 17 + 9) * TROUSERS.length)];
    const skin = o.skin ?? SKIN[Math.floor(hash01(k * 19 + 11) * SKIN.length)];
    const pose = o.pose ?? 'stand';
    const arms = o.arms ?? 'down';
    this.turned(x, z, ry, () => {
      if (pose === 'lie') {
        // On their front, feet at -z, head towards +z and propped up.
        for (const sx of [-0.11, 0.11]) this.box(x + sx, 0.08, z - 0.75, 0.14, 0.16, 0.8, trousers);
        this.box(x, 0.08, z - 0.05, 0.46, 0.26, 0.68, shirt);
        this.box(x, 0.2, z + 0.42, 0.24, 0.24, 0.24, skin);
        for (const sx of [-0.3, 0.3]) this.box(x + sx, 0.08, z + 0.2, 0.1, 0.1, 0.6, skin);
        if (o.held) this.box(x, 0.22, z + 0.62 + o.held[0] / 2, o.held[2], o.held[1], o.held[0], o.held[3]);
        return;
      }
      let y = 0.8;
      if (pose === 'floor') {
        // Sat on the ground, legs out in front.
        y = 0.1;
        for (const sx of [-0.11, 0.11]) this.box(x + sx, 0, z + 0.3, 0.14, 0.14, 0.62, trousers);
      } else if (pose === 'stand') for (const sx of [-0.11, 0.11]) this.box(x + sx, 0, z, 0.14, 0.8, 0.16, trousers);
      else if (pose === 'sit') {
        y = 0.45;
        for (const sx of [-0.11, 0.11]) {
          this.box(x + sx, 0.4, z + 0.22, 0.14, 0.14, 0.5, trousers);
          this.box(x + sx, 0, z + 0.4, 0.14, 0.42, 0.14, trousers);
        }
      } else {
        y = 0.5;
        for (const sx of [-0.11, 0.11]) {
          this.box(x + sx, 0, z - 0.25, 0.14, 0.14, 0.55, trousers);
          this.box(x + sx, 0, z, 0.14, 0.5, 0.14, trousers);
        }
      }
      this.box(x, y, z, 0.46, 0.68, 0.26, shirt);
      this.box(x, y + 0.7, z, 0.24, 0.24, 0.24, skin);
      for (const sx of [-0.3, 0.3]) {
        if (arms === 'up') this.box(x + sx, y + 0.5, z, 0.1, 0.7, 0.1, skin);
        else if (arms === 'forward') this.box(x + sx, y + 0.45, z + 0.3, 0.1, 0.1, 0.6, skin);
        else this.box(x + sx, y - 0.05, z, 0.1, 0.7, 0.1, skin);
      }
      if (o.held) this.box(x, y + 0.6, z + 0.14 + o.held[0] / 2, o.held[2], o.held[1], o.held[0], o.held[3]);
    });
  }

  /**
   * A race bike with no rider, in one colour, standing on the ground at (x, y, z) facing +x (turned by
   * ry). `model` is one of raceBike's MODELS (adult, youth, mini, pitbike, enduro, twinshock) or a
   * racing class, which picks the adult or youth model as a race does.
   */
  bike(x: number, y: number, z: number, colour: number, model = 'adult', ry = 0): void {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry);
    const key = MODELS[model] ? model : modelFor(model);
    // Each model is built to its own wheelbase (the adult's 1.46 m is BIKE_LENGTH), so a mini is a mini.
    const length = BIKE_LENGTH * (MODELS[key].wb / 1.46);
    for (const m of raceBikeParts({ brand: 'hondmoto', cls: '250cc', gear: null as never }, length, { rider: false, colours: brandFromColour(colour), model: key })) {
      m.position.applyQuaternion(q).add(new THREE.Vector3(x * U, y * U, z * U));
      m.quaternion.premultiply(q);
      this.parts.push(m);
    }
  }
  /** A bike lifted on a paddock stand under its engine. */
  bikeOnStand(x: number, z: number, colour: number, model = 'adult', ry = 0): void {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry);
    const p = new THREE.Vector3(-0.05 * U, 0, 0).applyQuaternion(q);
    const lift = MODELS[model]?.wb && MODELS[model].wb < 1.2 ? 0.26 : 0.33;
    const n = this.parts.length;
    const m = this.box(x + p.x / U, 0, z + p.z / U, 0.45, lift, 0.3, STEEL);
    m.rotation.y = ry;
    this.bike(x, lift, z, colour, model, ry);
    // Tagged, so the race view can swap the stand and bike for Boss's models (RaceView.standBikes; Boss, 1 Nov 2026).
    const tag: StandBike = { x, z, colour, design: MODELS[model] ? model : modelFor(model), ry };
    for (const part of this.parts.slice(n)) part.userData.standBike = tag;
  }

}

export type Setup = string | undefined;

/** A bike on a stand built into an item (a van's awning, a pit tent, the bike on a stand itself), in metres in the item's frame: its meshes carry it as userData.standBike. */
export interface StandBike {
  x: number;
  z: number;
  colour: number;
  /** The bike's design (raceBike MODELS): adult, youth, mini, pitbike, enduro or twinshock. */
  design: string;
  /** Its turn about the vertical, the bike's nose along +x at 0. */
  ry: number;
}

/** The meshes of a bike on a stand item, in the item's own frame (its centre, on the ground, x along its length). Empty for other scenery. */
export function paddockParts(def: SceneryDef, it: SceneryItem, i: number): THREE.Mesh[] {
  const b = new Build();
  const col = hexNum(paddockColour(def, it, i), hexNum(def.color, 0x888888));
  const variant = paddockVariant(def, it, i);
  // The vehicles are the game's own models now (public/assets/models; Boss, 2 Nov 2026), so only
  // the bike on a stand, in its many designs, is still built here.
  if (def.id === 'bike_stand') b.bikeOnStand(0, 0, col, variant ?? 'adult');
  return b.parts;
}
