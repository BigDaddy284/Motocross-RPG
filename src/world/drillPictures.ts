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
};

export const PACE_WORDS: Partial<Record<DrillScene, { unit: [string, string]; on: string; fast: string; slow: string }>> = {
  track: { unit: ['lap', 'laps'], on: 'On pace', fast: 'Too fast, ease off', slow: 'Too slow, push on' },
  ladder: { unit: ['run', 'runs'], on: 'Quick feet', fast: 'Too fast, you will trip', slow: 'Too slow, quicken up' },
  cones: { unit: ['run', 'runs'], on: 'Braking right', fast: 'Too hot into the cone', slow: 'Too slow, carry speed' },
  whoops: { unit: ['section', 'sections'], on: 'Skimming', fast: 'Too fast, it is bucking', slow: 'Too slow, the wheel drops in' },
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

// ---- reps ----

export function repsPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): RepsPicture {
  if (kind === 'bench') return benchPicture(scene, vis, who);
  if (kind === 'attack') return attackPicture(scene, vis, who);
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

// ---- react ----

export function reactPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): ReactPicture {
  if (kind === 'ruts') return rutPicture(scene, vis, who);
  if (kind === 'jump') return jumpPicture(scene, vis, who);
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

// ---- pace ----

export function pacePicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): PacePicture {
  if (kind === 'ladder') return ladderPicture(scene, vis, who);
  if (kind === 'cones') return conesPicture(scene, vis, who);
  if (kind === 'whoops') return whoopsPicture(scene, vis, who);
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
