import Phaser from 'phaser';
import type { DrillScene } from '../core/training';
import { ensureAnims } from './Character';
import { standlessBike } from './VanView';

// The pictures on the left of a drill's round (Boss, 29 Oct 2026), one per scene (core/training.ts
// DRILL_SCENES; Boss, 3 Nov 2026: "all the fitness ones need different graphics like for the
// weights, not all doing pushups"). The HUD runs the game's timing and tells the picture what
// happened; a picture only draws it. Everything is drawn into `vis`, a 370 by 220 box centred on
// (0, -10).

export interface DrillWho {
  player: string;
  coach?: string;
  level?: number;
  /** The player's bike, for the riding pictures. */
  bike?: { model: 'youth' | 'adult'; brand: string };
}

interface Picture {
  /** Called every frame, even while the HUD waits between goes. */
  tick?(dt: number): void;
}
export interface RepsPicture extends Picture {
  rep(ok: boolean): void;
}
export type ReactOutcome = 'good' | 'jumped' | 'slow' | 'asleep';
export interface ReactPicture extends Picture {
  /** A new go: the moment to react comes in `holdMs`. */
  reset(holdMs: number): void;
  press(how: ReactOutcome): void;
}
export type PaceState = 'on' | 'slow' | 'fast';
export interface PacePicture extends Picture {
  /** `run` is laps done so far (fractional), `speed` 0 to 1. */
  move(run: number, speed: number, state: PaceState): void;
}

// ---- the words each picture's game uses ----

export const REPS_WORDS: Partial<Record<DrillScene, { count: string; finish: (good: number, tries: number) => string }>> = {
  pushups: { count: 'Good reps', finish: (g, t) => `${g} good reps out of ${t}.` },
  bench: { count: 'Clean lifts', finish: (g, t) => `${g} clean lifts out of ${t}.` },
  attack: { count: 'Bumps cleared', finish: (g, t) => `${g} bumps cleared in the attack position, out of ${t}.` },
  yoga: { count: 'Poses held', finish: (g, t) => `${g} poses held on the breath, out of ${t}.` },
};

export interface ReactWords {
  tally: string;
  good: string;
  jumped: string;
  slow: string;
  asleep: string;
  pops: [string, string, string];
  finish: (good: number, goes: number, jumped: number) => string;
}
export const REACT_WORDS: Partial<Record<DrillScene, ReactWords>> = {
  gate: {
    tally: 'Good starts',
    good: 'Good start!',
    jumped: 'Jumped it: wait for the drop',
    slow: 'Slow',
    asleep: 'Asleep at the gate',
    pops: ['Go!', 'Too early', 'Late'],
    finish: (g, n, j) => `${g} good starts out of ${n}${j ? `, ${j} jumped` : ''}.`,
  },
  ruts: {
    tally: 'Clean ruts',
    good: 'Locked in the rut!',
    jumped: 'Too early: washed out',
    slow: 'Late: cross-rutted',
    asleep: 'Missed the rut',
    pops: ['In!', 'Washed out', 'Cross-rut'],
    finish: (g, n, j) => `${g} clean ruts out of ${n}${j ? `, ${j} washed out` : ''}.`,
  },
  jump: {
    tally: 'Clean jumps',
    good: 'Clean take-off!',
    jumped: 'Too early: cased it',
    slow: 'Late: overjumped',
    asleep: 'Rolled it',
    pops: ['Sent it!', 'Cased', 'Overjumped'],
    finish: (g, n, j) => `${g} clean jumps out of ${n}${j ? `, ${j} cased` : ''}.`,
  },
  roots: {
    tally: 'Roots cleared',
    good: 'Light front, over the root!',
    jumped: 'Too early: deflected off it',
    slow: 'Late: stalled in the rut',
    asleep: 'Hit the root square',
    pops: ['Over!', 'Deflected', 'Stalled'],
    finish: (g, n, j) => `${g} roots cleared out of ${n}${j ? `, ${j} deflected` : ''}.`,
  },
  rocks: {
    tally: 'Rocks cleared',
    good: 'Front up, over the rock!',
    jumped: 'Too early: stalled on the face',
    slow: 'Late: bashed the bash plate',
    asleep: 'Ploughed into the rock',
    pops: ['Over!', 'Stalled', 'Bash!'],
    finish: (g, n, j) => `${g} rocks cleared out of ${n}${j ? `, ${j} stalled` : ''}.`,
  },
};

export const PACE_WORDS: Partial<Record<DrillScene, { unit: [string, string]; on: string; fast: string; slow: string }>> = {
  track: { unit: ['lap', 'laps'], on: 'On pace', fast: 'Too fast, ease off', slow: 'Too slow, push on' },
  ladder: { unit: ['run', 'runs'], on: 'Quick feet', fast: 'Too fast, you will trip', slow: 'Too slow, quicken up' },
  cones: { unit: ['run', 'runs'], on: 'Braking right', fast: 'Too hot into the cone', slow: 'Too slow, carry speed' },
  whoops: { unit: ['section', 'sections'], on: 'Skimming', fast: 'Too fast, it is bucking', slow: 'Too slow, the wheel drops in' },
  berm: { unit: ['corner pair', 'corner pairs'], on: 'Carrying speed', fast: 'Too hot, running wide', slow: 'Too slow, it bogs in the berm' },
  rowing: { unit: ['split', 'splits'], on: 'Stroke rate on', fast: 'Too fast, you will fade', slow: 'Too slow, pull harder' },
  shadow: { unit: ['pass', 'passes'], on: 'Right on the wheel', fast: 'Too close, back off', slow: 'Dropping back, close up' },
};

// ---- the rider on the bike, side on ----

/** The bike's middle bottom (where it meets the ground) in each bike picture and its ride frames. */
const BIKE_FOOT: Record<'youth' | 'adult', [number, number]> = { adult: [33, 93], youth: [32, 92] };
/** From the bike's middle bottom to under each wheel, in picture pixels. */
const WHEEL_X = 19;
const RIDE_SCALE = 2;
type Pose = 0 | 1 | 2; // seated, attack, soaked up low

interface Rider {
  c: Phaser.GameObjects.Container;
  pose(p: Pose): void;
}

/** The player's bike (its stand off) with them on it, facing right; the container sits on the ground under the bike's middle. */
function rideOn(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, x: number, y: number): Rider {
  const model = who.bike?.model ?? 'adult';
  const brand = who.bike?.brand ?? 'hondmoto';
  const [fx, fy] = BIKE_FOOT[model];
  const c = scene.add.container(x, y).setScale(RIDE_SCALE);
  const key = standlessBike(scene, model, brand, 'east');
  // Both pictures from their top left corner: the youth bike's picture is narrower than the rider's frame.
  if (key) c.add(scene.add.image(-fx, -fy, key).setOrigin(0, 0));
  const rideKey = `chr:${who.player}:ride`;
  const row = model === 'youth' ? 3 : 0;
  const body = scene.textures.exists(rideKey) ? scene.add.sprite(-fx, -fy, rideKey, row).setOrigin(0, 0) : null;
  if (body) c.add(body);
  vis.add(c);
  return { c, pose: (p) => body?.active && body.setFrame(row + p) };
}

/** Ground drawn side on across the box, from its height function (pixels up from the base line). */
function drawGround(g: Phaser.GameObjects.Graphics, base: number, h: (x: number) => number, fill: number, edge: number, under = 0): void {
  g.clear();
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: -185, y: 100 }];
  for (let x = -185; x <= 185; x += 4) pts.push({ x, y: base - h(x) });
  pts.push({ x: 185, y: 100 });
  g.fillStyle(fill).fillPoints(pts, true);
  if (under) g.fillStyle(under).fillRect(-185, base + 8, 370, 100 - base - 8);
  g.lineStyle(3, edge);
  g.beginPath();
  g.moveTo(-185, base - h(-185));
  for (let x = -181; x <= 185; x += 4) g.lineTo(x, base - h(x));
  g.strokePath();
}

/** Sky and a far bank behind the riding pictures. */
function backdrop(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, sky: number, bank: number): void {
  vis.add(scene.add.rectangle(0, -10, 366, 216, sky));
  vis.add(scene.add.rectangle(0, 64, 366, 68, bank));
  const g = scene.add.graphics();
  g.fillStyle(bank);
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: -183, y: 40 }];
  const hill = (x: number) => 10 - 14 * Math.sin(x / 47) - 8 * Math.sin(x / 19 + 1);
  for (let x = -183; x < 183; x += 10) pts.push({ x, y: hill(x) });
  pts.push({ x: 183, y: hill(183) }, { x: 183, y: 98 }, { x: -183, y: 98 });
  g.fillPoints(pts, true);
  vis.add(g);
}

/** The coach standing by, when the drill has one. */
function coachBy(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, x: number, y: number, facing: 'down' | 'left' | 'right' = 'down'): void {
  if (!who.coach || !scene.textures.exists(`chr:${who.coach}:act`)) return;
  ensureAnims(scene, who.coach);
  vis.add(scene.add.sprite(x, y, `chr:${who.coach}:act`, 0).setOrigin(0.5, 1).play(`${who.coach}:idle-${facing}`));
}

const DIRT = 0x8a6a45;
const DIRT_EDGE = 0x5e4229;
const DIRT_DEEP = 0x6e5236;
const SKY = 0x9cc7e4;
const HILL = 0x6f9a52;
// Forest Town's darker woods and Western Works' quarry stone, for the Area 4 and 5 pictures.
const FOREST = 0x4f7f3e;
const FOREST_DARK = 0x3c6a30;
const STONE = 0xa39c8e;
const GRIT = 0x8d8576;
const GRIT_EDGE = 0x5f584c;
const GRIT_DEEP = 0x77705f;

// ---- reps ----

export function repsPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): RepsPicture {
  if (kind === 'bench') return benchPicture(scene, vis, who);
  if (kind === 'attack') return attackPicture(scene, vis, who);
  if (kind === 'yoga') return yogaPicture(scene, vis, who);
  return pushupPicture(scene, vis, who);
}

/** The exercise mat in the bedroom, and the rider on it in their push-up frames. */
function pushupPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  vis.add(scene.add.rectangle(0, 70, 320, 14, 0x3b6ea8).setStrokeStyle(2, 0x2a4f7a));
  const fitKey = `chr:${who.player}:fit`;
  const RIDER_X = 10;
  const rider = scene.textures.exists(fitKey) ? scene.add.sprite(RIDER_X, 66, fitKey, 0).setOrigin(0.5, 1).setScale(3) : null;
  if (rider) vis.add(rider);
  const pose = { d: 0 };
  const show = () => rider?.active && rider.setFrame(pose.d > 0.5 ? 1 : 0);
  show();
  return {
    rep(ok) {
      scene.tweens.killTweensOf(pose);
      if (rider) {
        rider.x = RIDER_X;
        scene.tweens.killTweensOf(rider);
      }
      if (ok) {
        // A full rep: down to the floor and back up.
        scene.tweens.add({ targets: pose, d: 1, duration: 150, hold: 140, yoyo: true, ease: 'Sine.easeInOut', onUpdate: show, onComplete: show });
      } else {
        // A miss: the arms give, a shake, and back up.
        scene.tweens.add({ targets: pose, d: 0.45, duration: 160, yoyo: true, hold: 120, onUpdate: show, onComplete: show });
        if (rider) scene.tweens.add({ targets: rider, x: RIDER_X + 3, duration: 40, yoyo: true, repeat: 3 });
      }
    },
  };
}

/**
 * The gym's bench press: the rider on the bench under the rack, bar locked out. A clean lift
 * lowers the bar to the chest and presses it back up; a miss stalls half way and shakes.
 */
function benchPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  // Rubber floor, a plate tree and dumbbell rack along the wall.
  vis.add(scene.add.rectangle(0, -42, 366, 140, 0x4a5262));
  vis.add(scene.add.rectangle(0, 74, 366, 48, 0x2b2f38));
  vis.add(scene.add.rectangle(0, 50, 366, 4, 0x1c1f26));
  const wall = scene.add.graphics();
  wall.fillStyle(0x30343e).fillRect(-170, -2, 90, 8).fillRect(-166, 6, 6, 44).fillRect(-90, 6, 6, 44);
  for (let i = 0; i < 5; i++) wall.fillStyle(0x1d2027).fillRoundedRect(-166 + i * 17, -14, 14, 12, 3);
  wall.fillStyle(0x30343e).fillRect(130, -40, 6, 90);
  for (const [y, r] of [[-30, 16], [-2, 13], [22, 10]] as const) wall.fillStyle(0x1d2027).fillCircle(133, y, r).fillStyle(0x5a6070).fillCircle(133, y, 3);
  vis.add(wall);
  // The bench and its rack upright with the J-hooks, at the head end.
  const g = scene.add.graphics();
  // The upright stands behind the lifter, under the bar at lock-out, its J-hooks either side of the bar.
  g.fillStyle(0x8c8c8c).fillRect(-1, -56, 8, 146).fillRect(-12, 86, 30, 5);
  g.fillStyle(0xb5483a).fillRect(-5, -46, 16, 5).fillRect(-5, -10, 16, 5);
  g.fillStyle(0x6a6a6a).fillRect(-50, 70, 6, 20).fillRect(48, 70, 6, 20).fillRect(-54, 88, 112, 3);
  g.fillStyle(0x1c1c1c).fillRoundedRect(-68, 60, 130, 12, 4);
  g.fillStyle(0x3a3a46).fillRoundedRect(-66, 61, 126, 6, 3);
  vis.add(g);
  const liftKey = `chr:${who.player}:lift`;
  // The lift frames have the back on the bench top 7 pixels above their bottom.
  const lifter = scene.textures.exists(liftKey) ? scene.add.sprite(-20, 66 + 7 * 2.5, liftKey, 2).setOrigin(0.5, 1).setScale(2.5) : null;
  if (lifter) vis.add(lifter);
  const LX = lifter?.x ?? 0;
  const pose = { d: 0 };
  // 0 is locked out, 1 is the bar on the chest.
  const show = () => lifter?.active && lifter.setFrame(pose.d > 0.66 ? 0 : pose.d > 0.33 ? 1 : 2);
  return {
    rep(ok) {
      scene.tweens.killTweensOf(pose);
      if (lifter) {
        scene.tweens.killTweensOf(lifter);
        lifter.x = LX;
      }
      pose.d = 0;
      if (ok) {
        scene.tweens.add({ targets: pose, d: 1, duration: 170, hold: 80, yoyo: true, ease: 'Sine.easeInOut', onUpdate: show, onComplete: show });
      } else {
        // Down to the chest, stuck half way up with a shake, then the spotter's hand helps it home.
        scene.tweens.chain({
          targets: pose,
          tweens: [
            { d: 1, duration: 170, ease: 'Sine.easeIn' },
            { d: 0.5, duration: 160, onUpdate: show },
            { d: 0, duration: 200, delay: 140, ease: 'Sine.easeOut' },
          ],
          onUpdate: show,
          onComplete: show,
        });
        if (lifter) scene.tweens.add({ targets: lifter, x: LX + 2, duration: 40, yoyo: true, repeat: 4, delay: 330 });
      }
    },
  };
}

/**
 * Attack position over the bumps: the rider rolls over a line of bumps, seated. A good press
 * stands them up and forward, and the bike floats over the next one; a miss leaves them sat down
 * and the bike bucks.
 */
function attackPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  backdrop(scene, vis, SKY, HILL);
  const BASE = 70;
  const GAP = 120;
  const SPEED = 0.11;
  const bump = (x: number, s: number) => {
    const u = ((((x + s) % GAP) + GAP) % GAP) - GAP / 2;
    return Math.abs(u) < 26 ? 11 * (0.5 + 0.5 * Math.cos((u / 26) * Math.PI)) : 0;
  };
  const ground = scene.add.graphics();
  vis.add(ground);
  coachBy(scene, vis, who, 140, BASE - 2);
  const r = rideOn(scene, vis, who, -40, BASE);
  let s = 0;
  let stand = 0;
  let buck = 0;
  const draw = () => drawGround(ground, BASE, (x) => bump(x, s), DIRT, DIRT_EDGE, DIRT_DEEP);
  draw();
  return {
    tick(dt) {
      s += dt * SPEED;
      stand = Math.max(0, stand - dt);
      buck *= Math.pow(0.992, dt);
      draw();
      // Standing soaks up most of each bump; sat down, the bike follows it all.
      const soak = stand > 0 ? 0.35 : 1;
      const xf = r.c.x + WHEEL_X * RIDE_SCALE;
      const xr = r.c.x - WHEEL_X * RIDE_SCALE;
      const hf = bump(xf, s) * soak;
      const hb = bump(xr, s) * soak;
      r.c.y = BASE - Math.max(hf, hb, (hf + hb) / 2);
      r.c.rotation = Math.atan2(hb - hf, xf - xr) - buck;
      r.pose(stand > 0 ? 1 : buck > 0.05 ? 2 : 0);
    },
    rep(ok) {
      if (ok) stand = 650;
      else {
        stand = 0;
        buck = 0.32;
      }
    },
  };
}

/**
 * Forest Town's woods behind a riding picture (Area 4), in the Area 2 and 3 pictures' style: the
 * same sky, a darker green hill, and a few round trees along it (Boss, 4 Nov 2026: "the same style
 * you have done the others").
 */
function woods(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  backdrop(scene, vis, SKY, FOREST);
  const g = scene.add.graphics();
  const hill = (x: number) => 10 - 14 * Math.sin(x / 47) - 8 * Math.sin(x / 19 + 1);
  for (const [x, r] of [[-150, 15], [-118, 11], [-40, 13], [70, 16], [100, 11], [150, 14]] as const) {
    const y = hill(x) + 4;
    g.fillStyle(0x5e4229).fillRect(x - 2, y - r, 4, r);
    g.fillStyle(FOREST_DARK).fillCircle(x, y - r - r * 0.6, r);
  }
  vis.add(g);
}

/**
 * Yoga on the deck by Forest Town's pond: the rider flows mountain, warrior, seated. A held pose
 * steps to the next one and breathes; a miss wobbles and stays.
 */
function yogaPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  // The studio by the pond, like the gym pictures: a pale wall, a window onto the woods, a sprung
  // wooden floor and the mat.
  vis.add(scene.add.rectangle(0, -42, 366, 140, 0xc9d6c0));
  const g = scene.add.graphics();
  g.fillStyle(0x8a6a45).fillRect(-150, -96, 110, 66);
  g.fillStyle(0x9cc7e4).fillRect(-146, -92, 102, 40);
  g.fillStyle(FOREST).fillRect(-146, -52, 102, 18);
  g.fillStyle(FOREST_DARK).fillCircle(-124, -56, 9).fillCircle(-96, -60, 11).fillCircle(-66, -55, 8);
  g.fillStyle(0x8a6a45).fillRect(-97, -92, 4, 58);
  g.fillStyle(0xc89a5e).fillRect(-183, 28, 366, 70);
  g.lineStyle(1, 0xb08450);
  for (let y = 38; y < 98; y += 12) g.lineBetween(-183, y, 183, y);
  g.fillStyle(0x7a5aa8).fillRoundedRect(-80, 66, 160, 8, 3);
  // A fern in its pot by the wall.
  g.fillStyle(0xa0522d).fillRect(98, 14, 18, 16);
  g.fillStyle(0x4f8a3a).fillEllipse(100, 8, 22, 10).fillEllipse(114, 6, 22, 10).fillEllipse(107, 0, 14, 14);
  vis.add(g);
  coachBy(scene, vis, who, 150, 72, 'left');
  const key = `chr:${who.player}:yoga`;
  const X = -10;
  const Y = 74;
  const body = scene.textures.exists(key) ? scene.add.sprite(X, Y, key, 0).setOrigin(0.5, 1).setScale(2.2) : null;
  if (body) vis.add(body);
  let pose = 0;
  return {
    rep(ok) {
      if (!body?.active) return;
      scene.tweens.killTweensOf(body);
      body.setRotation(0).setPosition(X, Y).setScale(2.2);
      if (ok) {
        // Into the next pose, and a slow breath in it.
        pose = (pose + 1) % 3;
        body.setFrame(pose);
        scene.tweens.add({ targets: body, scaleY: 2.27, duration: 260, yoyo: true, ease: 'Sine.easeInOut' });
      } else {
        // Lost the balance: a wobble about the feet, and the pose stays.
        scene.tweens.add({ targets: body, rotation: 0.09, duration: 70, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      }
    },
  };
}

// ---- react ----

export function reactPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): ReactPicture {
  if (kind === 'ruts') return rutPicture(scene, vis, who);
  if (kind === 'jump') return jumpPicture(scene, vis, who);
  if (kind === 'roots') return obstaclePicture(scene, vis, who, 'roots');
  if (kind === 'rocks') return obstaclePicture(scene, vis, who, 'rocks');
  return gatePicture(scene, vis);
}

/** The gate drop: the front wheel at the gate, close up. The gate holds, then falls. */
function gatePicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): ReactPicture {
  // Dirt, the gate's frame, the gate bar and the wheel behind it.
  vis.add(scene.add.rectangle(0, 60, 370, 70, 0x7a5a3a));
  vis.add(scene.add.rectangle(0, 95, 370, 20, 0x5e4229));
  const wheel = scene.add.circle(40, 20, 44, 0x1c1c1c).setStrokeStyle(6, 0x3a3a3a);
  const hub = scene.add.circle(40, 20, 14, 0x9a9a9a);
  const post = scene.add.rectangle(-120, 10, 12, 110, 0x8c8c8c);
  const gate = scene.add.rectangle(-40, -25, 170, 14, 0xd9d9d9).setOrigin(0, 0.5);
  const light = scene.add.circle(-120, -60, 10, 0xc0392b);
  vis.add([wheel, hub, post, gate, light]);
  let since = 0;
  return {
    reset(hold) {
      since = -hold;
      gate.setAngle(0);
      light.setFillStyle(0xc0392b);
    },
    tick(dt) {
      since += dt;
      if (since < 0) return;
      // The gate falls flat over about a quarter of a second.
      gate.setAngle(Math.min(90, (since / 250) * 90));
      light.setFillStyle(0x27ae60);
    },
    press() {},
  };
}

/** Pixels a second the riding pictures' ground goes by at. */
const ROLL = 0.13;
const RIDER_X = -70;

/**
 * Rut riding: a rut comes in along the ground; the press is the moment the front wheel drops in.
 * Good, the bike sinks into the rut and tracks it; early, it slides off the edge and washes out;
 * late, the front wheel hits the rut's edge and the bike kicks across it.
 */
function rutPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): ReactPicture {
  backdrop(scene, vis, SKY, HILL);
  const BASE = 66;
  const DEPTH = 9;
  const LEN = 300;
  const back = scene.add.graphics();
  vis.add(back);
  coachBy(scene, vis, who, 150, BASE - 4);
  const r = rideOn(scene, vis, who, RIDER_X, BASE);
  const front = scene.add.graphics();
  vis.add(front);
  const dust = scene.add.graphics();
  vis.add(dust);
  const wheelAt = RIDER_X + WHEEL_X * RIDE_SCALE;
  let since = -99999;
  let how: ReactOutcome | null = null;
  let t = 0;
  // Where the rut starts on screen: under the front wheel at the moment.
  const start = () => wheelAt - since * ROLL;
  // A strip of the rut from x to x + w, kept inside the box.
  const strip = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(-183, x);
    const x1 = Math.min(183, x + w);
    if (x1 > x0) g.fillRect(x0, y, x1 - x0, h);
  };
  const draw = () => {
    const a = start();
    back.clear();
    back.fillStyle(DIRT).fillRect(-185, BASE, 370, 100 - BASE);
    back.fillStyle(DIRT_DEEP).fillRect(-185, BASE + 14, 370, 100 - BASE - 14);
    back.lineStyle(3, DIRT_EDGE).lineBetween(-185, BASE, 185, BASE);
    // The groove seen from a little above, and its entry: a dark slot along the top of the ground.
    // The rut's far wall and the groove seen from a little above: a raised lip of lighter dirt with
    // the dark slot along the top of the ground, and its entry cut in.
    strip(back.fillStyle(0xa58257), a - 6, BASE - 9, LEN + 12, 4);
    strip(back.fillStyle(0x3e2a18), a, BASE - 6, LEN, 7);
    if (a > -165 && a < 183) back.fillStyle(0x3e2a18).fillTriangle(a - 18, BASE, a, BASE - 6, a, BASE + 1);
    // The near wall of the rut, drawn in front of the wheels.
    front.clear();
    strip(front.fillStyle(DIRT), a, BASE, LEN, DEPTH + 4);
    strip(front.fillStyle(0xa58257), a, BASE, LEN, 2);
  };
  const reset = () => {
    how = null;
    t = 0;
    r.c.setRotation(0).setY(BASE);
    r.pose(0);
    dust.clear();
  };
  return {
    reset(hold) {
      since = -hold;
      reset();
    },
    tick(dt) {
      since += dt;
      t += dt;
      draw();
      const a = start();
      const over = wheelAt >= a && RIDER_X - WHEEL_X * RIDE_SCALE <= a + LEN;
      if (how === 'good') {
        // Dropped in: down into the groove and tracking it, stood up.
        r.c.y = BASE + (over ? Math.min(DEPTH, t / 12) : 0);
        r.c.rotation = 0;
        r.pose(1);
      } else if (how === 'jumped') {
        // Washed out: the front slides off the edge and the bike lies over a little.
        r.c.y = BASE + Math.min(4, t / 30);
        r.c.rotation = Math.min(0.22, t / 900) * Math.sin(t / 60);
        r.pose(2);
        dust.clear().fillStyle(0xc8a878, 0.7);
        for (let i = 0; i < 5; i++) dust.fillCircle(RIDER_X - 30 - i * 9 - (t / 20) % 9, BASE - 6 - ((i * 7) % 12), 4 + i);
      } else if (how === 'slow' || how === 'asleep') {
        // Late: the wheel hits the rut's edge and the bike kicks up and across it.
        const kick = Math.max(0, 1 - t / 500);
        r.c.y = BASE - 10 * Math.sin(Math.min(1, t / 250) * Math.PI) * (how === 'slow' ? 1 : 0.4);
        r.c.rotation = -0.3 * kick * Math.sin(t / 50) * (how === 'slow' ? 1 : 0.4);
        r.pose(how === 'slow' ? 2 : 0);
      } else {
        r.c.y = BASE;
        r.pose(0);
      }
    },
    press(o) {
      how = o;
      t = 0;
    },
  };
}

/**
 * Jump timing: a tabletop comes in; the press is the take-off at the lip. Good, the bike clears the
 * table and lands on the down ramp; early, it cases the table; late, it overjumps to the flat.
 */
function jumpPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): ReactPicture {
  backdrop(scene, vis, SKY, HILL);
  const BASE = 78;
  const FACE = 70;
  const TALL = 34;
  const TABLE = 130;
  const DOWN = 90;
  const ground = scene.add.graphics();
  vis.add(ground);
  coachBy(scene, vis, who, -150, BASE - 2);
  const r = rideOn(scene, vis, who, RIDER_X, BASE);
  const wheelAt = RIDER_X + WHEEL_X * RIDE_SCALE;
  let since = -99999;
  let how: ReactOutcome | null = null;
  let t = 0;
  let fromY = 0;
  // The lip on screen: under the front wheel at the moment.
  const lip = () => wheelAt - since * ROLL;
  const h = (x: number) => {
    const u = x - lip();
    if (u < -FACE || u > TABLE + DOWN) return 0;
    if (u < 0) return TALL * Math.pow((u + FACE) / FACE, 1.6);
    if (u <= TABLE) return TALL;
    return TALL * (1 - (u - TABLE) / DOWN);
  };
  const under = () => Math.max(h(r.c.x + WHEEL_X * RIDE_SCALE), h(r.c.x - WHEEL_X * RIDE_SCALE));
  // How long each take-off stays in the air, and how high.
  const AIR: Record<'good' | 'jumped' | 'slow', [number, number]> = { good: [1150, 70], jumped: [650, 36], slow: [1700, 92] };
  return {
    reset(hold) {
      since = -hold;
      how = null;
      t = 0;
      r.c.setRotation(0).setY(BASE);
      r.pose(0);
    },
    tick(dt) {
      since += dt;
      t += dt;
      drawGround(ground, BASE, h, DIRT, DIRT_EDGE, DIRT_DEEP);
      const flying = how && how !== 'asleep' ? AIR[how] : null;
      if (flying && t < flying[0]) {
        const k = t / flying[0];
        const land = under();
        r.c.y = BASE - (fromY + (land - fromY) * k) - flying[1] * 4 * k * (1 - k);
        // Nose up off the lip, level in the air; late, the nose stays high.
        r.c.rotation = how === 'slow' ? -0.35 * (1 - k) - 0.1 : -0.25 * (1 - k * 1.6) * (k < 0.6 ? 1 : 0.4);
        r.pose(1);
        return;
      }
      const ground_ = under();
      // Landed (or rolled it): back on the ground, a jolt for a case or an overjump.
      const jolt = flying && how !== 'good' ? Math.max(0, 1 - (t - flying[0]) / 350) : 0;
      r.c.y = BASE - ground_ + 3 * jolt * Math.sin(t / 30);
      const xf = r.c.x + WHEEL_X * RIDE_SCALE;
      const xr = r.c.x - WHEEL_X * RIDE_SCALE;
      r.c.rotation = Math.atan2(h(xr) - h(xf), xf - xr);
      r.pose(jolt > 0 ? 2 : flying ? 1 : 0);
    },
    press(o) {
      how = o;
      t = 0;
      fromY = under();
    },
  };
}

/**
 * A root across the trail in Forest Town's woods, or a rock in Western Works' quarry, coming in to
 * the front wheel; the press lifts the front at the moment it meets it. Good, the front lifts and
 * the bike rolls over; early, the front comes down onto it (deflects off the root, stalls on the
 * rock's face); late, the root stops the bike in its rut, or the rock bashes the bash plate.
 */
function obstaclePicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: 'roots' | 'rocks'): ReactPicture {
  const BASE = 70;
  const rocky = kind === 'rocks';
  if (rocky) quarry(scene, vis);
  else woods(scene, vis);
  const TALL = rocky ? 24 : 10;
  const WIDE = rocky ? 34 : 18;
  const back = scene.add.graphics();
  vis.add(back);
  coachBy(scene, vis, who, 160, BASE - 2, 'left');
  const r = rideOn(scene, vis, who, RIDER_X, BASE);
  const fx = scene.add.graphics();
  vis.add(fx);
  const wheelAt = RIDER_X + WHEEL_X * RIDE_SCALE;
  let since = -99999;
  let how: ReactOutcome | null = null;
  let t = 0;
  // Once something goes wrong the ground stops rolling under the bike for a moment.
  let held = 0;
  const at = () => wheelAt - since * ROLL + held;
  const h = (x: number) => {
    const u = (x - at()) / WIDE;
    if (Math.abs(u) > 1) return 0;
    return rocky ? TALL * Math.sqrt(1 - u * u) * (u < 0 ? 1 : 0.85) : TALL * Math.cos((u * Math.PI) / 2);
  };
  const draw = () => {
    // The ground like the other riding pictures, with the root or rock in it.
    const a = at();
    if (rocky) drawGround(back, BASE, () => 0, GRIT, GRIT_EDGE, GRIT_DEEP);
    else drawGround(back, BASE, () => 0, DIRT, DIRT_EDGE, DIRT_DEEP);
    if (a < -220 || a > 220) return;
    if (rocky) {
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let x = a - WIDE; x <= a + WIDE; x += 2) pts.push({ x, y: BASE - h(x) });
      pts.push({ x: a + WIDE, y: BASE + 2 });
      pts.push({ x: a - WIDE, y: BASE + 2 });
      back.fillStyle(0xb3ac9e).fillPoints(pts, true);
      back.fillStyle(0xcfc9bc).fillEllipse(a - 6, BASE - TALL + 6, WIDE * 0.9, 6);
      back.lineStyle(3, GRIT_EDGE).strokePoints(pts, false);
    } else {
      // The root across the trail, a hump of bark with a lighter top.
      back.fillStyle(0x5e3f22).fillEllipse(a, BASE - TALL / 2 + 1, WIDE * 2, TALL + 2);
      back.fillStyle(0x8a6040).fillEllipse(a - 3, BASE - TALL + 3, WIDE * 1.1, 4);
    }
  };
  const level = () => {
    const xf = r.c.x + WHEEL_X * RIDE_SCALE;
    const xr = r.c.x - WHEEL_X * RIDE_SCALE;
    return { y: BASE - Math.max(h(xf), h(xr)), rot: Math.atan2(h(xr) - h(xf), xf - xr) };
  };
  return {
    reset(hold) {
      since = -hold;
      how = null;
      t = 0;
      held = 0;
      r.c.setRotation(0).setY(BASE).setX(RIDER_X);
      r.pose(0);
      fx.clear();
    },
    tick(dt) {
      since += dt;
      t += dt;
      fx.clear();
      if (how === 'good') {
        // Front light: a wheelie over it, and the back wheel rolls through.
        const lift = Math.max(0, Math.sin(Math.min(1, t / 520) * Math.PI));
        const l = level();
        r.c.y = l.y - 4 * lift;
        r.c.rotation = -0.3 * lift + l.rot * (1 - lift);
        r.pose(1);
      } else if (how === 'jumped') {
        // Early: the front comes down onto it and kicks off sideways (root) or stops (rock).
        const k = Math.max(0, 1 - t / 600);
        if (rocky && t < 600) held += dt * ROLL;
        const l = level();
        r.c.y = l.y;
        r.c.rotation = l.rot + (rocky ? 0.12 * k : 0.2 * k * Math.sin(t / 45));
        r.c.x = RIDER_X + (rocky ? 0 : 6 * k * Math.sin(t / 70));
        r.pose(2);
      } else if (how === 'slow' || how === 'asleep') {
        // Late: the bike stops dead at it, nose down, then bumps over.
        const stop = t < 700;
        if (stop) held += dt * ROLL;
        const k = Math.max(0, 1 - t / 700);
        const l = level();
        r.c.y = l.y + (rocky ? 2 * k * Math.sin(t / 25) : 0);
        r.c.rotation = l.rot + 0.1 * k;
        r.pose(how === 'slow' ? 2 : 0);
        if (rocky && t < 260) {
          // Sparks off the bash plate.
          fx.fillStyle(0xffd060);
          for (let i = 0; i < 6; i++) fx.fillCircle(wheelAt - 18 - i * 5, BASE - 4 - ((i * 11) % 14) - (t / 20) * (i % 3), 2);
        }
      } else {
        const l = level();
        r.c.y = l.y;
        r.c.rotation = l.rot;
        r.pose(0);
      }
      draw();
    },
    press(o) {
      how = o;
      t = 0;
    },
  };
}

// ---- pace ----

export function pacePicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): PacePicture {
  if (kind === 'ladder') return ladderPicture(scene, vis, who);
  if (kind === 'cones') return conesPicture(scene, vis, who);
  if (kind === 'whoops') return whoopsPicture(scene, vis, who);
  if (kind === 'berm') return bermPicture(scene, vis, who);
  if (kind === 'rowing') return rowingPicture(scene, vis, who);
  if (kind === 'shadow') return shadowPicture(scene, vis, who);
  return trackPicture(scene, vis, who);
}

/** The running track: green infield, red lanes with white lines, the coach watching from the middle. */
function trackPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  const RX = 150;
  const RY = 66;
  const TY = 16;
  const g = scene.add.graphics().setY(TY);
  g.fillStyle(0x4f8a3a).fillEllipse(0, 0, (RX + 26) * 2, (RY + 26) * 2);
  g.lineStyle(34, 0xb5483a).strokeEllipse(0, 0, RX * 2, RY * 2);
  g.lineStyle(2, 0xf2efe6).strokeEllipse(0, 0, (RX - 17) * 2, (RY - 17) * 2).strokeEllipse(0, 0, (RX + 17) * 2, (RY + 17) * 2).strokeEllipse(0, 0, RX * 2, RY * 2);
  g.fillStyle(0x6aa84f).fillEllipse(0, 0, (RX - 18) * 2, (RY - 18) * 2);
  // The start and finish line at 6 o'clock, in front of the coach: a lap counts as the rider crosses it.
  g.lineStyle(3, 0xf2efe6).lineBetween(0, RY - 17, 0, RY + 17);
  vis.add(g);
  const hasCoach = !!who.coach && scene.textures.exists(`chr:${who.coach}:act`);
  if (hasCoach) {
    ensureAnims(scene, who.coach!);
    vis.add(scene.add.sprite(0, TY + 16, `chr:${who.coach}:act`, 0).setOrigin(0.5, 1).play(`${who.coach}:idle-down`));
  }
  ensureAnims(scene, who.player);
  const runner = scene.add.sprite(0, 0, `chr:${who.player}:walk`, 0).setOrigin(0.5, 0.95).setScale(0.85);
  vis.add(runner);
  let dir = '';
  return {
    move(run, speed, state) {
      // Anticlockwise from the line at the bottom, the way a running track is run.
      const ang = -Math.PI / 2 + run * Math.PI * 2;
      const x = RX * Math.cos(ang);
      const y = RY * Math.sin(-ang);
      const dx = -Math.sin(ang) * RX;
      const dy = -Math.cos(ang) * RY;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      runner.setPosition(x, TY + y);
      // The far side of the track draws behind the coach, the near side in front.
      vis.bringToTop(runner);
      if (y < 0 && hasCoach) vis.moveDown(runner);
      if (d !== dir) {
        dir = d;
        runner.play(`${who.player}:walk-${d}`);
      }
      runner.anims.timeScale = 0.6 + speed * 1.2;
      runner.setTint(state === 'on' ? 0xffffff : 0xffc8b8);
    },
  };
}

/**
 * The agility ladder on the gym floor, from above: the rider runs its length and back, feet
 * quick between the rungs, the coach at the far end.
 */
function ladderPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  const g = scene.add.graphics();
  // A sprung gym floor, its boards, a court line, and the ladder laid on it.
  g.fillStyle(0xc89a5e).fillRect(-183, -118, 366, 216);
  g.lineStyle(1, 0xb08450);
  for (let y = -110; y < 98; y += 14) g.lineBetween(-183, y, 183, y);
  g.lineStyle(3, 0x2f6fb0).lineBetween(-183, -70, 183, -70);
  const L = 140;
  const Y0 = 6;
  const Y1 = 42;
  g.lineStyle(4, 0xe8c020).lineBetween(-L, Y0, L, Y0).lineBetween(-L, Y1, L, Y1);
  for (let x = -L; x <= L; x += 28) g.lineStyle(4, 0xe8c020).lineBetween(x, Y0, x, Y1);
  g.fillStyle(0xf28a2e).fillTriangle(-L - 26, Y1 + 4, -L - 18, Y1 - 12, -L - 10, Y1 + 4).fillTriangle(L + 10, Y1 + 4, L + 18, Y1 - 12, L + 26, Y1 + 4);
  vis.add(g);
  coachBy(scene, vis, who, 160, -12, 'left');
  ensureAnims(scene, who.player);
  const runner = scene.add.sprite(-L, Y1 + 2, `chr:${who.player}:walk`, 0).setOrigin(0.5, 0.95);
  vis.add(runner);
  let dir = '';
  return {
    move(run, speed, state) {
      // Down the ladder and back is one run.
      const p = run - Math.floor(run);
      const out = p < 0.5;
      const k = out ? p * 2 : 2 - p * 2;
      runner.setX(-L + 2 * L * k);
      // A little hop at each rung, quicker with the feet.
      runner.setY(Y1 + 2 - Math.abs(Math.sin(k * Math.PI * 10)) * 4 * speed);
      const d = out ? 'right' : 'left';
      if (d !== dir) {
        dir = d;
        runner.play(`${who.player}:walk-${d}`);
      }
      runner.anims.timeScale = 0.6 + speed * 1.6;
      runner.setTint(state === 'on' ? 0xffffff : 0xffc8b8);
    },
  };
}

/**
 * Cone braking, side on: a line of cones goes by. On pace the rider carries speed and brakes
 * square at each one; too fast the bike dives on the front with the back wheel skipping, too slow
 * they sit down and roll.
 */
function conesPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  backdrop(scene, vis, SKY, HILL);
  const BASE = 70;
  const GAP = 150;
  const PER_LAP = 3;
  const ground = scene.add.graphics();
  vis.add(ground);
  const cones = scene.add.graphics();
  vis.add(cones);
  const r = rideOn(scene, vis, who, RIDER_X + 20, BASE);
  const dust = scene.add.graphics();
  vis.add(dust);
  let last = 0;
  return {
    move(run, speed, state) {
      const s = run * PER_LAP * GAP;
      ground.clear();
      ground.fillStyle(DIRT).fillRect(-185, BASE, 370, 100 - BASE);
      ground.lineStyle(3, DIRT_EDGE).lineBetween(-185, BASE, 185, BASE);
      // Tyre marks going by, so the speed shows.
      ground.lineStyle(2, DIRT_DEEP);
      for (let x = -185 - (s % 40); x < 185; x += 40) ground.lineBetween(Math.max(-183, x), BASE + 12, Math.min(183, x + 18), BASE + 12);
      cones.clear();
      for (let x = -185 + GAP - (s % GAP); x < 174; x += GAP) {
        if (x < -174) continue;
        cones.fillStyle(0x1c1c1c).fillRect(x - 11, BASE - 2, 22, 4);
        cones.fillStyle(0xf28a2e).fillTriangle(x - 9, BASE - 1, x, BASE - 28, x + 9, BASE - 1);
        cones.fillStyle(0xf2efe6).fillRect(x - 5, BASE - 15, 10, 4);
      }
      const dive = state === 'fast' ? 0.1 : 0;
      const wob = state === 'fast' ? 0.04 * Math.sin(s / 6) : 0;
      r.c.setRotation(dive + wob).setY(BASE);
      r.pose(state === 'on' ? 1 : state === 'fast' ? 2 : 0);
      dust.clear();
      if (state !== 'slow' && s - last > 0) {
        dust.fillStyle(0xc8a878, state === 'fast' ? 0.8 : 0.45);
        for (let i = 0; i < 4; i++) dust.fillCircle(r.c.x - 46 - i * 10 - (s % 10), BASE - 5 - ((i * 5) % 9), 3 + i * speed);
      }
      last = s;
    },
  };
}

/**
 * Whoops in the sand, side on: on pace the rider skims the tops, stood up; too slow the wheels
 * drop into every hole and the rider soaks it up low; too fast the bike starts to buck.
 */
function whoopsPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  backdrop(scene, vis, 0xa9d3ea, 0xd7c48c);
  // The sea behind the dunes at Beach Town.
  vis.add(scene.add.rectangle(0, 14, 366, 10, 0x4f93c2));
  const BASE = 74;
  const W = 64;
  const TALL = 14;
  const PER_LAP = 8;
  const ground = scene.add.graphics();
  vis.add(ground);
  coachBy(scene, vis, who, 150, BASE - TALL);
  const r = rideOn(scene, vis, who, RIDER_X + 10, BASE);
  const spray = scene.add.graphics();
  vis.add(spray);
  let follow = 1;
  let bucking = 0;
  return {
    move(run, speed, state) {
      const s = run * PER_LAP * W;
      const h = (x: number) => TALL * (0.5 + 0.5 * Math.cos(((x + s) / W) * Math.PI * 2));
      drawGround(ground, BASE, h, 0xe0c88a, 0xb09858, 0xcdb273);
      // How much of each whoop the bike follows: skimming takes the tops only.
      const want = state === 'on' ? 0.12 : state === 'slow' ? 1 : 0.55;
      follow += (want - follow) * 0.08;
      bucking += ((state === 'fast' ? 1 : 0) - bucking) * 0.06;
      const xf = r.c.x + WHEEL_X * RIDE_SCALE;
      const xr = r.c.x - WHEEL_X * RIDE_SCALE;
      const top = (x: number) => TALL - (TALL - h(x)) * follow;
      const hf = top(xf);
      const hb = top(xr);
      r.c.y = BASE - Math.max(hf, hb);
      r.c.rotation = Math.atan2(hb - hf, xf - xr) + bucking * 0.18 * Math.sin(s / 11);
      r.pose(state === 'on' ? 1 : state === 'slow' ? 2 : 1);
      spray.clear();
      if (speed > 0.5) {
        spray.fillStyle(0xf0dca0, 0.8);
        for (let i = 0; i < 5; i++) spray.fillCircle(xr - 10 - i * 8 - (s % 8), r.c.y - 4 - ((i * 7) % 14), 2 + (i % 3));
      }
    },
  };
}


/** Western Works' quarry behind a riding picture (Area 5), in the earlier pictures' style: the same sky, a stone bank and the works' two chimneys far off. */
function quarry(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  backdrop(scene, vis, SKY, STONE);
  const g = scene.add.graphics();
  g.fillStyle(0x8a7f78).fillRect(110, -62, 8, 50).fillRect(130, -52, 7, 40);
  g.fillStyle(0xe4e8ea).fillCircle(114, -68, 6).fillCircle(121, -76, 8).fillCircle(133, -58, 5);
  vis.add(g);
}

/**
 * Berm and flat corner, side on in Forest Town's yard: a banked berm and a flat turn marked by a
 * flag come by in turn. On pace the rider rides up the berm's face stood up and roosts out of it,
 * and brakes square for the flat one; too fast the bike runs wide over the top and slides; too slow
 * it bogs low in the berm.
 */
function bermPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  woods(scene, vis);
  const BASE = 74;
  const GAP = 220;
  const ground = scene.add.graphics();
  vis.add(ground);
  const marks = scene.add.graphics();
  vis.add(marks);
  coachBy(scene, vis, who, 150, BASE - 2, 'left');
  const r = rideOn(scene, vis, who, RIDER_X + 10, BASE);
  const roost = scene.add.graphics();
  vis.add(roost);
  let climb = 0;
  let lean = 0;
  return {
    move(run, speed, state) {
      // One berm and one flat corner each corner pair.
      const s = run * 2 * GAP;
      const bermH = (x: number) => {
        const u = ((((x + s) % (GAP * 2)) + GAP * 2) % (GAP * 2)) - GAP;
        return Math.abs(u) < 70 ? 30 * Math.pow(Math.cos((u / 70) * (Math.PI / 2)), 2) : 0;
      };
      drawGround(ground, BASE, bermH, DIRT, DIRT_EDGE, DIRT_DEEP);
      // The flat corner's flag, half way between berms.
      marks.clear();
      for (let x = -(s % (GAP * 2)); x < 185; x += GAP * 2) {
        if (x < -176) continue;
        marks.fillStyle(0xdedad0).fillRect(x - 1, BASE - 40, 3, 40);
        marks.fillStyle(0xe8c020).fillTriangle(x + 2, BASE - 40, x + 20, BASE - 34, x + 2, BASE - 28);
      }
      // How much of the berm's face the bike rides: on pace all of it, slow it stays low.
      const want = state === 'slow' ? 0.4 : 1;
      climb += (want - climb) * 0.08;
      lean += ((state === 'fast' ? 1 : 0) - lean) * 0.06;
      const xf = r.c.x + WHEEL_X * RIDE_SCALE;
      const xr = r.c.x - WHEEL_X * RIDE_SCALE;
      const hf = bermH(xf) * climb;
      const hb = bermH(xr) * climb;
      // Too fast it skips over the top and the back steps out.
      const over = lean * Math.max(hf, hb) * 0.4;
      r.c.y = BASE - Math.max(hf, hb) - over;
      r.c.rotation = Math.atan2(hb - hf, xf - xr) + lean * 0.12 * Math.sin(s / 9);
      r.pose(state === 'on' ? 1 : state === 'slow' ? 0 : 2);
      roost.clear();
      if (Math.max(hf, hb) > 6 && speed > 0.35) {
        roost.fillStyle(0xc8a878, state === 'slow' ? 0.4 : 0.85);
        for (let i = 0; i < 7; i++) roost.fillCircle(xr - 12 - i * 9 - (s % 9), r.c.y - 6 - i * 3 - ((i * 5) % 7), 2 + (i % 3));
      }
    },
  };
}

/**
 * The rowing machine in Western Works' gym, the canal through the window: the rider rows catch,
 * drive, finish and back, the flywheel spins and the monitor shows the stroke rate. On pace it
 * reads in the green; too fast it reads high and the rider tires, too slow it drops.
 */
function rowingPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  // The works gym, drawn like Mountain Town's: a plain wall with the works' red stripe, a framed
  // print of the canal and a rubber floor.
  vis.add(scene.add.rectangle(0, -42, 366, 140, 0x4a5262));
  vis.add(scene.add.rectangle(0, 74, 366, 48, 0x2b2f38));
  vis.add(scene.add.rectangle(0, 50, 366, 4, 0x1c1f26));
  const g = scene.add.graphics();
  g.fillStyle(0x8e4a36).fillRect(-183, -20, 366, 8);
  g.fillStyle(0x30343e).fillRect(-40, -96, 96, 60);
  g.fillStyle(0x9cc7e4).fillRect(-36, -92, 88, 30);
  g.fillStyle(0x6f9a52).fillRect(-36, -62, 88, 8);
  g.fillStyle(0x4f7f8f).fillRect(-36, -54, 88, 14);
  g.fillStyle(0x2f6b3a).fillRect(-10, -58, 40, 6);
  vis.add(g);
  coachBy(scene, vis, who, -150, 74, 'right');
  // The machine: the rail, the footplate and the flywheel housing at the front.
  const S = 2.4;
  const X0 = -110;
  const Y0 = 76;
  const m = scene.add.graphics();
  m.fillStyle(0x9aa0a8).fillRect(X0 + 10 * S, Y0 - 6 * S, 64 * S, 3 * S);
  m.fillStyle(0x7a808a).fillRect(X0 + 8 * S, Y0 - 4 * S, 3 * S, 4 * S).fillRect(X0 + 84 * S, Y0 - 5 * S, 4 * S, 5 * S);
  m.fillStyle(0x6a707a).fillRoundedRect(X0 + 74 * S, Y0 - 24 * S, 20 * S, 20 * S, 6);
  // The footplate, angled, and the seat under the hips (the frames keep the hips in one place).
  m.fillStyle(0x8a9098).fillTriangle(X0 + 66 * S, Y0 - 6 * S, X0 + 72 * S, Y0 - 16 * S, X0 + 74 * S, Y0 - 6 * S);
  m.fillStyle(0xb5483a).fillRoundedRect(X0 + 32 * S, Y0 - 10 * S, 16 * S, 4 * S, 3);
  vis.add(m);
  const wheel = scene.add.graphics().setPosition(X0 + 84 * S, Y0 - 14 * S);
  wheel.lineStyle(3, 0xd0d4d8);
  for (let i = 0; i < 3; i++) wheel.lineBetween(-Math.cos((i * Math.PI) / 3) * 18, -Math.sin((i * Math.PI) / 3) * 18, Math.cos((i * Math.PI) / 3) * 18, Math.sin((i * Math.PI) / 3) * 18);
  wheel.strokeCircle(0, 0, 19);
  vis.add(wheel);
  const key = `chr:${who.player}:row`;
  const body = scene.textures.exists(key) ? scene.add.sprite(X0, Y0 - 1 * S, key, 0).setOrigin(0, 1).setScale(S) : null;
  const cord = scene.add.graphics();
  vis.add(cord);
  if (body) vis.add(body);
  // The monitor on its arm, with the stroke rate.
  const mon = scene.add.graphics();
  mon.fillStyle(0x7a808a).fillRect(X0 + 82 * S, Y0 - 40 * S, 3 * S, 18 * S);
  mon.fillStyle(0x1c1f26).fillRoundedRect(X0 + 70 * S, Y0 - 56 * S, 30 * S, 18 * S, 4);
  vis.add(mon);
  const rate = scene.add.text(X0 + 85 * S, Y0 - 47 * S, '', { fontFamily: 'monospace', fontSize: '22px', color: '#7be07b' }).setOrigin(0.5);
  vis.add(rate);
  // Each frame's hands, where the cord meets the handle (frame pixels): catch, drive, finish.
  const HANDS: [number, number][] = [[67, 46], [56, 44], [48, 40]];
  const STROKES = 6;
  let spin = 0;
  let last = 0;
  return {
    move(run, speed, state) {
      // Catch, drive, finish, then back along the rail to the catch.
      const p = (run * STROKES) % 1;
      const f = p < 0.18 ? 0 : p < 0.36 ? 1 : p < 0.6 ? 2 : p < 0.8 ? 1 : 0;
      body?.active && body.setFrame(f);
      spin += Math.max(0, run - last) * 60 * (0.6 + speed);
      last = run;
      wheel.setRotation(spin);
      cord.clear().lineStyle(2, 0x1c1c1c);
      const [hx, hy] = HANDS[f];
      cord.lineBetween(X0 + hx * S, Y0 - 1 * S - (64 - hy) * S, wheel.x - 4, wheel.y);
      rate.setText(String(Math.round(18 + speed * 16)));
      rate.setColor(state === 'on' ? '#7be07b' : '#f0a060');
    },
  };
}

/**
 * Shadow passing in Western Works' quarry, side on: a pro rider runs ahead and the player follows
 * their line. On pace they sit right on the pro's back wheel and, at the end of each pass, draw
 * alongside and by; too fast they tag the back wheel and shake; too slow the gap opens.
 */
function shadowPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  quarry(scene, vis);
  const BASE = 78;
  const ground = scene.add.graphics();
  vis.add(ground);
  // The pro: in the champion's kit on a different bike from the player's, a shade back in the haze.
  const brands = ['yamamoto', 'kwakmoto', 'sukimoto', 'hondmoto'];
  const mine = who.bike?.brand ?? 'hondmoto';
  const kit = ['player-m-champion-kit', 'player-f-champion-kit'].find((k) => k !== who.player && scene.textures.exists(`chr:${k}:ride`)) ?? who.player;
  const pro = rideOn(scene, vis, { ...who, player: kit, bike: { model: 'adult', brand: brands.find((b) => b !== mine) ?? 'yamamoto' } }, 40, BASE - 6);
  for (const o of pro.c.list) (o as Phaser.GameObjects.Image).setTint?.(0xc4c4cc);
  const me = rideOn(scene, vis, who, -60, BASE);
  const dust = scene.add.graphics();
  vis.add(dust);
  let gap = 90;
  return {
    move(run, speed, state) {
      const s = run * 900;
      drawGround(ground, BASE - 10, () => 0, GRIT, GRIT_EDGE, GRIT_DEEP);
      // Through each pass: follow, then draw alongside and by over its last fifth.
      const p = run % 1;
      const want = state === 'fast' ? 52 : state === 'slow' ? 170 : p > 0.8 ? -40 - (p - 0.8) * 300 : 74;
      gap += (want - gap) * 0.05;
      const proX = 40 + Math.sin(s / 140) * 6;
      pro.c.x = proX;
      me.c.x = proX - gap;
      const tag = state === 'fast' && gap < 60;
      me.c.rotation = tag ? 0.06 * Math.sin(s / 4) : 0;
      pro.c.y = BASE - 6 + Math.sin(s / 30);
      me.c.y = BASE + Math.sin(s / 30 + 1);
      pro.pose(1);
      me.pose(state === 'on' ? 1 : state === 'fast' ? 2 : 0);
      // The pro's dust in the player's face.
      dust.clear().fillStyle(0xc8a878, 0.45);
      for (let i = 0; i < 4; i++) dust.fillCircle(pro.c.x - 50 - i * 10 - (s % 10), BASE - 14 - ((i * 5) % 9), 3 + i * speed);
    },
  };
}
