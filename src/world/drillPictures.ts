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
  laps: { count: 'Laps on the time', finish: (g, t) => `${g} laps on the time, out of ${t}.` },
  dojo: { count: 'Clean strikes', finish: (g, t) => `${g} clean strikes out of ${t}.` },
  rhythm: { count: 'Clean take-offs', finish: (g, t) => `${g} clean take-offs through the rhythm, out of ${t}.` },
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
  launch: {
    tally: 'Good launches',
    good: 'Good launch!',
    jumped: 'Jumped the lights: red light',
    slow: 'Slow off the line',
    asleep: 'Missed the green',
    pops: ['Gone!', 'Red light', 'Late'],
    finish: (g, n, j) => `${g} good launches out of ${n}${j ? `, ${j} red lights` : ''}.`,
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
  climb: { unit: ['climb', 'climbs'], on: 'Steady on the climb', fast: 'Too hard, you will blow up', slow: 'Too easy, push on' },
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
const GRIT = 0x8d8576;
const GRIT_EDGE = 0x5f584c;
const GRIT_DEEP = 0x77705f;

// ---- reps ----

export function repsPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, kind: DrillScene): RepsPicture {
  if (kind === 'bench') return benchPicture(scene, vis, who);
  if (kind === 'attack') return attackPicture(scene, vis, who);
  if (kind === 'yoga') return yogaPicture(scene, vis, who);
  if (kind === 'laps') return lapsPicture(scene, vis, who);
  if (kind === 'dojo') return dojoPicture(scene, vis, who);
  if (kind === 'rhythm') return rhythmPicture(scene, vis, who);
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
  gym(scene, vis);
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

/** The gym: rubber floor, a plate tree and dumbbell rack along the wall (the bench press and the rowing machine). */
function gym(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  vis.add(scene.add.rectangle(0, -42, 366, 140, 0x4a5262));
  vis.add(scene.add.rectangle(0, 74, 366, 48, 0x2b2f38));
  vis.add(scene.add.rectangle(0, 50, 366, 4, 0x1c1f26));
  const wall = scene.add.graphics();
  wall.fillStyle(0x30343e).fillRect(-170, -2, 90, 8).fillRect(-166, 6, 6, 44).fillRect(-90, 6, 6, 44);
  for (let i = 0; i < 5; i++) wall.fillStyle(0x1d2027).fillRoundedRect(-166 + i * 17, -14, 14, 12, 3);
  wall.fillStyle(0x30343e).fillRect(130, -40, 6, 90);
  for (const [y, r] of [[-30, 16], [-2, 13], [22, 10]] as const) wall.fillStyle(0x1d2027).fillCircle(133, y, r).fillStyle(0x5a6070).fillCircle(133, y, 3);
  vis.add(wall);
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

/** The hill line every riding backdrop shares (see `backdrop`). */
const hillAt = (x: number) => 10 - 14 * Math.sin(x / 47) - 8 * Math.sin(x / 19 + 1);
/** A shape kept inside the picture's box: its points pulled in to the box's sides. */
function boxPoly(g: Phaser.GameObjects.Graphics, pts: Phaser.Types.Math.Vector2Like[]): void {
  g.fillPoints(pts.map((p) => ({ x: Math.max(-183, Math.min(183, p.x!)), y: p.y })), true);
}
/** An ellipse kept inside the picture's box. */
function boxOval(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 20; i++) pts.push({ x: x + (w / 2) * Math.cos((i / 20) * Math.PI * 2), y: y + (h / 2) * Math.sin((i / 20) * Math.PI * 2) });
  boxPoly(g, pts);
}
/** A circle kept inside the picture's box: shrunk at the sides, left out if it would not show. */
function boxCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  const rr = Math.min(r, x + 183, 183 - x);
  if (rr > 2) g.fillCircle(x, y, rr);
}

/**
 * Forest Town's woods behind a riding picture (Area 4), in the Area 2 and 3 pictures' style
 * (Boss, 4 Nov 2026: "your art work from area 2 is prefered"): the same sky, the hill in a deeper
 * green, a soft line of round treetops along its crest and two nearer trees at the sides.
 */
function woods(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  backdrop(scene, vis, SKY, FOREST);
  const g = scene.add.graphics();
  // The treeline: overlapping round tops along the crest, a lighter top on each.
  // The treeline, the hill's own edge filled in under it first so no sky shows between the tops.
  for (let x = -178; x < 183; x += 13) {
    const r = 11 + 5 * Math.abs(Math.sin(x * 0.37));
    g.fillStyle(FOREST_DARK);
    boxCircle(g, x, hillAt(x) + 2 - r * 0.4, r);
  }
  for (let x = -178; x < 183; x += 13) {
    const r = 11 + 5 * Math.abs(Math.sin(x * 0.37));
    g.fillStyle(0x5f9148);
    boxCircle(g, x - r * 0.3, hillAt(x) + 2 - r * 0.75, r * 0.45);
  }
  g.fillStyle(FOREST).fillRect(-183, 30, 366, 68);
  // Two nearer trees, one at each side, trunk and round crown.
  for (const [x, r] of [[-150, 22], [154, 20]] as const) {
    g.fillStyle(0x5e4229).fillRect(x - 4, 10, 8, 56);
    g.fillStyle(FOREST_DARK);
    boxCircle(g, x, 2, r);
    boxCircle(g, x - r * 0.6, 12, r * 0.7);
    boxCircle(g, x + r * 0.6, 12, r * 0.7);
    g.fillStyle(0x5f9148);
    boxCircle(g, x - r * 0.35, -r * 0.3, r * 0.45);
  }
  vis.add(g);
}

/**
 * Yoga in Forest Town's studio, drawn like the Area 2 and 3 gym pictures: a warm wall, a big window
 * onto the woods, the sprung wooden floor of the ladder gym and a mat. The rider faces the front
 * and flows warrior, tree, seated; a held pose steps to the next one and breathes, a miss wobbles
 * and stays.
 */
function yogaPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  vis.add(scene.add.rectangle(0, -42, 366, 140, 0xe4d8c0));
  const g = scene.add.graphics();
  // The window: the riding pictures' sky, hill and treetops in a wooden frame.
  const W = { x: -150, y: -100, w: 150, h: 84 };
  g.fillStyle(SKY).fillRect(W.x, W.y, W.w, W.h);
  g.fillStyle(FOREST);
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: W.x, y: W.y + W.h }];
  for (let x = W.x; x <= W.x + W.w; x += 6) pts.push({ x, y: W.y + 50 + 6 * Math.sin(x / 19) });
  pts.push({ x: W.x + W.w, y: W.y + W.h });
  g.fillPoints(pts, true);
  for (let x = W.x + 6; x < W.x + W.w; x += 14) {
    g.fillStyle(FOREST_DARK).fillCircle(x, W.y + 48 + 6 * Math.sin(x / 19), 8 + 3 * Math.abs(Math.sin(x)));
  }
  g.lineStyle(6, 0x8a6a45).strokeRect(W.x, W.y, W.w, W.h);
  g.lineStyle(4, 0x8a6a45).lineBetween(W.x + W.w / 2, W.y, W.x + W.w / 2, W.y + W.h);
  g.fillStyle(0x8a6a45).fillRect(W.x - 6, W.y + W.h, W.w + 12, 6);
  // A plant in its pot and a rolled mat against the wall.
  g.fillStyle(0xa0522d).fillRect(96, -2, 22, 22);
  g.fillStyle(0x7a3e22).fillRect(94, -4, 26, 5);
  g.fillStyle(0x4f8a3a).fillEllipse(100, -10, 26, 10).fillEllipse(116, -12, 26, 10).fillEllipse(108, -20, 14, 20);
  g.fillStyle(0x3a8a8a).fillRoundedRect(36, -14, 14, 36, 6);
  // The floor, and the mat the rider stands on.
  g.fillStyle(0xc89a5e).fillRect(-183, 22, 366, 76);
  g.fillStyle(0xa87a44).fillRect(-183, 20, 366, 4);
  g.lineStyle(1, 0xb08450);
  for (let y = 34; y < 98; y += 12) g.lineBetween(-183, y, 183, y);
  g.fillStyle(0x5b3f8a).fillRoundedRect(-112, 70, 184, 12, 4);
  g.fillStyle(0x7a5aa8).fillRoundedRect(-110, 70, 180, 8, 3);
  vis.add(g);
  coachBy(scene, vis, who, 140, 78, 'left');
  const key = `chr:${who.player}:yoga`;
  const X = -20;
  const Y = 78;
  const S = 1.9;
  const body = scene.textures.exists(key) ? scene.add.sprite(X, Y, key, 0).setOrigin(0.5, 1).setScale(S) : null;
  if (body) vis.add(body);
  let pose = 0;
  return {
    rep(ok) {
      if (!body?.active) return;
      scene.tweens.killTweensOf(body);
      body.setRotation(0).setPosition(X, Y).setScale(S);
      if (ok) {
        // Into the next pose, and a slow breath in it.
        pose = (pose + 1) % 3;
        body.setFrame(pose);
        scene.tweens.add({ targets: body, scaleY: S * 1.03, duration: 260, yoyo: true, ease: 'Sine.easeInOut' });
      } else {
        // Lost the balance: a wobble about the feet, and the pose stays.
        scene.tweens.add({ targets: body, rotation: 0.07, duration: 70, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
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
  if (kind === 'launch') return launchPicture(scene, vis, who);
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
    // Gravel or fallen leaves going by under the wheels, so the ground moves as it does in the ruts.
    const roll = since * ROLL - held;
    for (let x = -176 - (((roll % 29) + 29) % 29); x < 176; x += 29) {
      if (x < -176) continue;
      const k = Math.abs(Math.round(x + roll)) % 3;
      if (rocky) back.fillStyle(0x6f685c).fillRect(x, BASE + 6 + k * 5, 5, 3);
      else back.fillStyle(k === 1 ? 0xb5782e : 0x9a6a34).fillEllipse(x, BASE + 7 + k * 5, 7, 3);
    }
    if (a < -220 || a > 220) return;
    if (rocky) {
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let x = a - WIDE; x <= a + WIDE; x += 2) pts.push({ x, y: BASE - h(x) });
      pts.push({ x: a + WIDE, y: BASE + 2 });
      pts.push({ x: a - WIDE, y: BASE + 2 });
      // The rock: grey stone, lit from the top left, a dark side and a crack.
      const inBox = pts.map((p) => ({ x: Math.max(-183, Math.min(183, p.x!)), y: p.y }));
      boxPoly(back.fillStyle(0x9d968a), pts);
      boxPoly(back.fillStyle(0x857e72), [{ x: a + 4, y: BASE + 2 }, { x: a + WIDE, y: BASE + 2 }, { x: a + WIDE * 0.55, y: BASE - TALL * 0.7 }]);
      boxOval(back.fillStyle(0xc4bdb0), a - 8, BASE - TALL + 7, WIDE * 0.8, 7);
      if (a > -176 && a < 176) back.lineStyle(2, 0x5f584c).lineBetween(a - 2, BASE - TALL + 5, a + 5, BASE - TALL * 0.4);
      back.lineStyle(3, GRIT_EDGE).strokePoints(inBox.slice(0, -2), false);
      // A couple of small stones beside it.
      back.fillStyle(0x9d968a);
      if (a - WIDE - 16 > -183) back.fillEllipse(a - WIDE - 10, BASE, 12, 7);
      if (a + WIDE + 17 < 183) back.fillEllipse(a + WIDE + 12, BASE + 1, 9, 5);
    } else {
      // The root: a twisting bar of bark across the trail, its ends going into the ground.
      boxOval(back.fillStyle(0x4e3420), a, BASE - TALL / 2 + 1, WIDE * 2 + 4, TALL + 4);
      boxOval(back.fillStyle(0x7a5232), a, BASE - TALL / 2, WIDE * 2, TALL);
      boxOval(back.fillStyle(0x9c7048), a - 4, BASE - TALL + 3, WIDE * 1.2, 3);
      if (a > -170 && a < 170) back.lineStyle(1, 0x4e3420).lineBetween(a - 8, BASE - TALL + 2, a - 3, BASE - 1).lineBetween(a + 6, BASE - TALL + 2, a + 10, BASE - 1);
      back.fillStyle(0x4e3420);
      if (a - WIDE - 13 > -183) back.fillEllipse(a - WIDE - 6, BASE + 4, 14, 6);
      if (a + WIDE + 12 < 183) back.fillEllipse(a + WIDE + 6, BASE + 3, 12, 5);
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
  if (kind === 'climb') return climbPicture(scene, vis, who);
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


/**
 * Western Works behind a riding picture (Area 5), in the same style: the sky, the hill in a dry
 * olive green, and the works on the crest, a brick shed with a saw-tooth roof and two chimneys
 * smoking.
 */
function quarry(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  vis.add(scene.add.rectangle(0, -10, 366, 216, SKY));
  const g = scene.add.graphics();
  // The works first, so the hill covers its foot.
  g.fillStyle(0x8e4a36).fillRect(52, -22, 92, 30);
  g.fillStyle(0x6e3828);
  for (let x = 52; x < 144; x += 23) g.fillTriangle(x, -22, x + 23, -22, x + 23, -36);
  g.fillStyle(0xbfd0d8);
  for (let x = 60; x < 140; x += 16) g.fillRect(x, -14, 8, 7);
  g.fillStyle(0x7a3c2c).fillRect(100, -78, 9, 58).fillRect(124, -64, 8, 44);
  g.fillStyle(0x5a2c20).fillRect(98, -80, 13, 4).fillRect(122, -66, 12, 4);
  g.fillStyle(0xe8ecee).fillCircle(106, -88, 6).fillCircle(113, -98, 8).fillCircle(124, -108, 10);
  g.fillStyle(0xe8ecee).fillCircle(129, -73, 5).fillCircle(135, -82, 7);
  vis.add(g);
  const bank = 0x8a9a5a;
  vis.add(scene.add.rectangle(0, 64, 366, 68, bank));
  const h = scene.add.graphics();
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: -183, y: 40 }];
  for (let x = -183; x < 183; x += 10) pts.push({ x, y: hillAt(x) });
  pts.push({ x: 183, y: hillAt(183) }, { x: 183, y: 98 }, { x: -183, y: 98 });
  h.fillStyle(bank).fillPoints(pts, true);
  vis.add(h);
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
 * The rowing machine in Western Works' gym, the same gym as the bench press: the rider rows catch,
 * drive, finish and back, the flywheel spins and the monitor shows the stroke rate. On pace it
 * reads in the green; too fast it reads high and the rider tires, too slow it drops.
 */
function rowingPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  // The same gym as the bench press (Boss, 4 Nov 2026: in the Area 2 and 3 style).
  gym(scene, vis);
  coachBy(scene, vis, who, 162, 74, 'left');
  // The machine: the rail, the footplate and the flywheel housing at the front.
  const S = 2.4;
  const X0 = -150;
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
  // The pro: in the champion's kit on a different bike from the player's, on the far side of the line.
  const brands = ['yamamoto', 'kwakmoto', 'sukimoto', 'hondmoto'];
  const mine = who.bike?.brand ?? 'hondmoto';
  const kit = ['player-m-champion-kit', 'player-f-champion-kit'].find((k) => k !== who.player && scene.textures.exists(`chr:${k}:ride`)) ?? who.player;
  const pro = rideOn(scene, vis, { ...who, player: kit, bike: { model: 'adult', brand: brands.find((b) => b !== mine) ?? 'yamamoto' } }, 40, BASE - 6);
  const me = rideOn(scene, vis, who, -60, BASE);
  const dust = scene.add.graphics();
  vis.add(dust);
  let gap = 90;
  return {
    move(run, speed, state) {
      const s = run * 900;
      drawGround(ground, BASE - 10, () => 0, DIRT, DIRT_EDGE, DIRT_DEEP);
      // Tyre marks going by, as in the cone braking picture.
      ground.lineStyle(2, DIRT_DEEP);
      for (let x = -185 - (s % 40); x < 185; x += 40) ground.lineBetween(Math.max(-183, x), BASE + 10, Math.min(183, x + 18), BASE + 10);
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

// ---- Areas 6 and 7 (Boss, 4 Nov 2026: drawn like the Area 2 and 3 pictures) ----

/** A hill across the picture along the shared hill line, in its own colour. */
function bankHill(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, bank: number): void {
  vis.add(scene.add.rectangle(0, 64, 366, 68, bank));
  const g = scene.add.graphics();
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: -183, y: 40 }];
  for (let x = -183; x < 183; x += 10) pts.push({ x, y: hillAt(x) });
  pts.push({ x: 183, y: hillAt(183) }, { x: 183, y: 98 }, { x: -183, y: 98 });
  g.fillStyle(bank).fillPoints(pts, true);
  vis.add(g);
}

const HEATHER = 0x7d8a4e;

/** The Highlands behind a picture (Area 6): the sky, far blue mountains with snow on the tops, and the heather hill. */
function highlands(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  vis.add(scene.add.rectangle(0, -10, 366, 216, SKY));
  const g = scene.add.graphics();
  const peaks: [number, number, number][] = [[-120, -62, 90], [-20, -78, 110], [100, -56, 96], [170, -40, 50]];
  for (const [x, top, half] of peaks) {
    const l = Math.max(-183, x - half);
    const r = Math.min(183, x + half);
    g.fillStyle(0x8496ae).fillTriangle(l, 20, x, top, r, 20);
    // Snow on the top third.
    const k = 0.32;
    g.fillStyle(0xf2f4f6).fillTriangle(x - half * k, top + (20 - top) * k, x, top, x + half * k, top + (20 - top) * k);
  }
  g.fillStyle(0x8496ae).fillRect(-183, 10, 366, 12);
  vis.add(g);
  bankHill(scene, vis, HEATHER);
  // Patches of purple heather on the hill.
  const h = scene.add.graphics();
  h.fillStyle(0x8a5a86);
  for (const [x, w] of [[-150, 40], [-70, 26], [20, 46], [120, 34]] as const) h.fillEllipse(x, hillAt(x) + 12, w, 8);
  h.fillStyle(0xa070a0);
  for (const [x, w] of [[-146, 18], [26, 20], [124, 14]] as const) h.fillEllipse(x, hillAt(x) + 10, w, 4);
  vis.add(h);
}

/** The City behind a picture (Area 7): the sky and a skyline of towers with lit windows. */
function city(scene: Phaser.Scene, vis: Phaser.GameObjects.Container): void {
  vis.add(scene.add.rectangle(0, -10, 366, 216, SKY));
  const g = scene.add.graphics();
  const towers: [number, number, number, number][] = [
    [-183, 30, -30, 0x6b7487], [-150, 26, -62, 0x5c6578], [-118, 34, -20, 0x737c8f], [-80, 22, -80, 0x535c6f],
    [-52, 30, -44, 0x6b7487], [-16, 40, -10, 0x5c6578], [30, 24, -70, 0x535c6f], [60, 34, -36, 0x737c8f],
    [100, 28, -90, 0x5c6578], [134, 30, -28, 0x6b7487], [160, 23, -54, 0x535c6f],
  ];
  for (const [x, w, top, col] of towers) {
    const r = Math.min(183, x + w);
    g.fillStyle(col).fillRect(x, top, r - x, 60 - top);
    g.fillStyle(0xf0d890);
    for (let y = top + 6; y < 50; y += 9) for (let wx = x + 4; wx < r - 4; wx += 7) if ((wx * 7 + y * 3) % 5 < 2) g.fillRect(wx, y, 3, 4);
  }
  vis.add(g);
}

/** The player on a pedal bike, facing right, drawn under their riding frames (the climb). */
function pedalOn(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho, x: number, y: number) {
  const model = who.bike?.model ?? 'adult';
  const [fx, fy] = BIKE_FOOT[model];
  const c = scene.add.container(x, y).setScale(RIDE_SCALE);
  const g = scene.add.graphics();
  c.add(g);
  const rideKey = `chr:${who.player}:ride`;
  const row = model === 'youth' ? 3 : 0;
  const body = scene.textures.exists(rideKey) ? scene.add.sprite(-fx, -fy, rideKey, row).setOrigin(0, 0) : null;
  if (body) c.add(body);
  vis.add(c);
  // Where the rider meets the bike, in the container (make_exercises.py BIKES, less the foot).
  const at = model === 'youth' ? { grip: [6, -28], seat: [-10, -17], peg: [-4, -3] } : { grip: [9, -41], seat: [-11, -29], peg: [-3, -10] };
  const r = model === 'youth' ? 9 : 12;
  const draw = (turn: number) => {
    g.clear();
    const R = [-18, -r];
    const F = [18, -r];
    const B = [at.peg[0], at.peg[1] + 2];
    const S = [at.seat[0] - 1, at.seat[1] + 4];
    const H = [at.grip[0] - 2, at.grip[1] + 6];
    const Hb = [at.grip[0] + 1, at.grip[1] + 13];
    // Wheels: tyre, rim and spokes that turn.
    for (const w of [R, F]) {
      g.lineStyle(2.4, 0x1c1c22).strokeCircle(w[0], w[1], r - 1);
      g.lineStyle(0.8, 0xb8bcc4).strokeCircle(w[0], w[1], r - 2.6);
      for (let i = 0; i < 4; i++) {
        const a = turn + (i * Math.PI) / 4;
        g.lineBetween(w[0] - Math.cos(a) * (r - 3), w[1] - Math.sin(a) * (r - 3), w[0] + Math.cos(a) * (r - 3), w[1] + Math.sin(a) * (r - 3));
      }
    }
    // The frame in the bike's brand colour.
    const col = { hondmoto: 0xc8322a, yamamoto: 0x2a5fc8, kwakmoto: 0x5fb82a, sukimoto: 0xe0c020 }[who.bike?.brand ?? 'hondmoto'] ?? 0xc8322a;
    g.lineStyle(2.6, col);
    g.lineBetween(B[0], B[1], S[0], S[1]).lineBetween(S[0], S[1] + 1, H[0], H[1] + 1).lineBetween(Hb[0], Hb[1], B[0], B[1]);
    g.lineBetween(B[0], B[1], R[0], R[1]).lineBetween(S[0], S[1] + 2, R[0], R[1]);
    g.lineStyle(2.2, 0x3a3a42).lineBetween(H[0], H[1], Hb[0], Hb[1]).lineBetween(Hb[0], Hb[1], F[0], F[1]);
    // Bars, saddle, and the crank going round.
    g.lineStyle(1.6, 0x2a2a30).lineBetween(H[0], H[1], at.grip[0], at.grip[1] + 1).lineBetween(at.grip[0], at.grip[1] + 1, at.grip[0] + 3, at.grip[1] + 1);
    g.fillStyle(0x1c1c22).fillEllipse(S[0], S[1] - 1, 8, 2.6);
    g.lineStyle(1, 0x6a6e76).strokeCircle(B[0], B[1], 3);
    const ca = turn * 0.7;
    g.lineStyle(1.4, 0x9aa0a8).lineBetween(B[0], B[1], B[0] + Math.cos(ca) * 5, B[1] + Math.sin(ca) * 5);
  };
  draw(0);
  return { c, draw, pose: (p: Pose) => body?.active && body.setFrame(row + p) };
}

/**
 * The hill climb ride in the Highlands, side on: the road climbs to the right past the heather.
 * On pace the rider sits and spins steadily; too hard they stand and the bike sways; too easy the
 * pedals barely turn.
 */
function climbPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): PacePicture {
  highlands(scene, vis);
  const BASE = 84;
  const SLOPE = 0.12;
  const rise = (x: number) => SLOPE * (x + 185);
  const ground = scene.add.graphics();
  vis.add(ground);
  const X = -40;
  const b = pedalOn(scene, vis, who, X, BASE - rise(X));
  b.c.setRotation(-Math.atan(SLOPE));
  let turn = 0;
  let last = 0;
  return {
    move(run, speed, state) {
      const s = run * 900;
      // The road: tarmac with a verge, and its white middle line going by.
      drawGround(ground, BASE, rise, 0x5c5e66, 0x7d8a4e, 0x4a4c54);
      ground.lineStyle(2, 0xf2efe6);
      for (let x = -183 - (s % 44); x < 170; x += 44) {
        const x0 = Math.max(-183, x);
        const x1 = Math.min(183, x + 18);
        if (x1 > x0) ground.lineBetween(x0, BASE - rise(x0) + 8, x1, BASE - rise(x1) + 8);
      }
      turn += Math.max(0, run - last) * 90 * (0.4 + speed);
      last = run;
      b.draw(turn);
      const sway = state === 'fast' ? 0.05 * Math.sin(s / 8) : 0;
      b.c.setRotation(-Math.atan(SLOPE) + sway);
      b.pose(state === 'fast' ? 1 : 0);
    },
  };
}

/**
 * Repetition laps at the Highlands yard, side on: the rider comes past the timing beam each lap and
 * the board shows the lap times. A press on the time is the same lap again, in green; a miss is a
 * slower one in red, and the bike twitches off line.
 */
function lapsPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  highlands(scene, vis);
  const BASE = 72;
  const ground = scene.add.graphics();
  vis.add(ground);
  // The timing beam either side of the track, and the lap board on its post.
  const post = scene.add.graphics();
  post.fillStyle(0xdedad0).fillRect(-6, BASE - 46, 4, 46);
  post.fillStyle(0x2a2a30).fillRect(-9, BASE - 52, 10, 8);
  post.fillStyle(0xd84a3a).fillCircle(-4, BASE - 48, 2);
  post.fillStyle(0x8a8a90).fillRect(118, -30, 5, BASE + 30);
  post.fillStyle(0x1c1f26).fillRoundedRect(58, -108, 122, 80, 5);
  vis.add(post);
  const title = scene.add.text(119, -102, 'LAP TIMES', { fontFamily: 'monospace', fontSize: '14px', color: '#c8c8c8' }).setOrigin(0.5, 0);
  const lines = [0, 1, 2].map((i) => scene.add.text(68, -84 + i * 17, '', { fontFamily: 'monospace', fontSize: '15px', color: '#7be07b' }));
  vis.add([title, ...lines]);
  coachBy(scene, vis, who, 150, BASE + 22, 'left');
  const r = rideOn(scene, vis, who, -70, BASE);
  const beam = scene.add.graphics();
  vis.add(beam);
  const laps: { t: number; ok: boolean }[] = [];
  const BEST = 62.4;
  let s = 0;
  let flash = 0;
  let flashOk = true;
  let wob = 0;
  const show = () => {
    const recent = laps.slice(-3);
    lines.forEach((l, i) => {
      const lap = recent[i];
      if (!lap) return l.setText('');
      const n = laps.length - recent.length + i + 1;
      const m = Math.floor(lap.t / 60);
      const sec = (lap.t - m * 60).toFixed(1).padStart(4, '0');
      l.setText(`L${n}  ${m}:${sec}`).setColor(lap.ok ? '#7be07b' : '#f0a060');
    });
  };
  show();
  return {
    tick(dt) {
      s += dt * 0.12;
      flash = Math.max(0, flash - dt);
      wob = Math.max(0, wob - dt);
      ground.clear();
      drawGround(ground, BASE, () => 0, DIRT, DIRT_EDGE, DIRT_DEEP);
      ground.lineStyle(2, DIRT_DEEP);
      for (let x = -183 - (s % 40); x < 183; x += 40) ground.lineBetween(Math.max(-183, x), BASE + 12, Math.min(183, x + 18), BASE + 12);
      // The bike rides on past the beam; the flash shows the lap going through it.
      beam.clear();
      if (flash > 0) {
        beam.lineStyle(2, flashOk ? 0x7be07b : 0xf0a060, flash / 400);
        beam.lineBetween(-4, BASE - 48, -4, BASE);
      }
      r.c.y = BASE + Math.sin(s / 9);
      r.c.rotation = wob > 0 ? 0.08 * Math.sin(wob / 30) : 0;
      r.pose(wob > 0 ? 2 : 1);
    },
    rep(ok) {
      const t = ok ? BEST + (Math.random() - 0.5) * 0.2 : BEST + 0.8 + Math.random() * 1.4;
      laps.push({ t, ok });
      flash = 400;
      flashOk = ok;
      if (!ok) wob = 500;
      show();
    },
  };
}

/**
 * The dojo in The City, side on: a heavy bag on its chain, and the rider in their guard. A clean
 * strike (punch, punch, kick, and round again) lands and swings the bag; a miss falls short and the
 * bag hangs still.
 */
function dojoPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  // Pale wood walls between dark posts, a scroll, and the tatami floor.
  vis.add(scene.add.rectangle(0, -42, 366, 140, 0xe2cfa4));
  const g = scene.add.graphics();
  g.fillStyle(0x6a4a2e);
  for (const x of [-150, -60, 90, 170]) g.fillRect(x - 4, -118, 8, 146);
  g.fillRect(-183, -112, 366, 7);
  g.fillStyle(0xf4efe2).fillRect(-122, -94, 40, 76);
  g.fillStyle(0x6a4a2e).fillRect(-126, -98, 48, 5).fillRect(-126, -20, 48, 5);
  g.fillStyle(0xc8322a).fillCircle(-102, -66, 10);
  g.fillStyle(0x2a2a2e).fillTriangle(-118, -34, -104, -52, -90, -34).fillTriangle(-106, -34, -96, -46, -86, -34);
  g.fillStyle(0xc8c48a).fillRect(-183, 28, 366, 70);
  g.lineStyle(3, 0x3f5a3a);
  g.lineBetween(-183, 28, 183, 28).lineBetween(-183, 62, 183, 62);
  for (const x of [-120, 0, 120]) g.lineBetween(x, 28, x, 62);
  for (const x of [-60, 60]) g.lineBetween(x, 62, x, 98);
  vis.add(g);
  coachBy(scene, vis, who, 140, 46, 'left');
  // The bag hangs from the beam; it turns about the top of its chain.
  const bag = scene.add.container(4, -105);
  const bg = scene.add.graphics();
  bg.lineStyle(2, 0x8a8e96).lineBetween(0, 0, 0, 36);
  bg.fillStyle(0x2a2a30).fillRoundedRect(-20, 34, 40, 96, 10);
  bg.fillStyle(0xb5322a).fillRoundedRect(-18, 36, 36, 92, 9);
  bg.fillStyle(0xd85a4a).fillRoundedRect(-14, 40, 8, 84, 4);
  bg.fillStyle(0x2a2a30).fillRect(-18, 56, 36, 4).fillRect(-18, 104, 36, 4);
  bag.add(bg);
  vis.add(bag);
  const key = `chr:${who.player}:dojo`;
  const X = -56;
  const Y = 86;
  const S = 2;
  const body = scene.textures.exists(key) ? scene.add.sprite(X, Y, key, 0).setOrigin(0.5, 1).setScale(S) : null;
  if (body) vis.add(body);
  const fx = scene.add.graphics();
  vis.add(fx);
  let n = 0;
  let swing = 0;
  let vel = 0;
  let hit = 0;
  return {
    tick(dt) {
      // The bag swings back to rest on its chain.
      vel += -swing * 0.00004 * dt - vel * 0.004 * dt;
      swing += vel * dt;
      bag.setRotation(swing);
      hit = Math.max(0, hit - dt);
      fx.clear();
      if (hit > 0) {
        fx.fillStyle(0xfff2a0, hit / 200);
        // Where the fist or the boot meets the bag's near side.
        const y = n % 3 === 0 ? 24 : 6;
        const x = -16;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          fx.fillTriangle(x + Math.cos(a) * 4, y + Math.sin(a) * 4, x + Math.cos(a + 0.3) * 14, y + Math.sin(a + 0.3) * 14, x + Math.cos(a - 0.3) * 14, y + Math.sin(a - 0.3) * 14);
        }
      }
    },
    rep(ok) {
      if (!body?.active) return;
      scene.tweens.killTweensOf(body);
      n += 1;
      const kick = n % 3 === 0;
      body.setFrame(kick ? 2 : 1).setX(X);
      // A kick steps in to reach the bag.
      scene.tweens.add({ targets: body, x: X + (kick ? 18 : 6) - (ok ? 0 : 12), duration: 90, yoyo: true, hold: 140, onComplete: () => body.active && body.setFrame(0) });
      if (ok) {
        vel += kick ? 0.0011 : 0.0007;
        hit = 200;
      }
    },
  };
}

/**
 * Supercross rhythm in The City's arena, side on: a run of jumps under the lights. A press on the
 * take-off sends the bike clean over to the next landing; a miss cases the face with a jolt.
 */
function rhythmPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): RepsPicture {
  // The arena at night: dark stands with the crowd's lights, and the lights' beams.
  vis.add(scene.add.rectangle(0, -10, 366, 216, 0x1c2232));
  const g = scene.add.graphics();
  g.fillStyle(0x2a3246).fillRect(-183, -40, 366, 80);
  g.fillStyle(0x323c54).fillRect(-183, -40, 366, 6);
  for (let y = -30; y < 36; y += 9) for (let x = -180; x < 180; x += 7) {
    const k = (x * 13 + y * 7) & 7;
    if (k < 3) g.fillStyle([0xf0d890, 0xd84a3a, 0x7ab0e0][k]).fillRect(x, y, 2, 2);
  }
  g.fillStyle(0xffffff, 0.07).fillTriangle(-140, -118, -170, 60, -90, 60).fillTriangle(60, -118, 20, 60, 110, 60);
  g.fillStyle(0xf2f4f6).fillCircle(-140, -112, 5).fillCircle(60, -112, 5);
  g.fillStyle(0x2a3246).fillRect(-183, 36, 366, 8);
  g.fillStyle(0xdedad0).fillRect(-183, 38, 366, 2);
  vis.add(g);
  const BASE = 82;
  const GAP = 120;
  const TALL = 26;
  const ground = scene.add.graphics();
  vis.add(ground);
  const r = rideOn(scene, vis, who, -50, BASE);
  let s = 0;
  const h = (x: number) => {
    const u = ((((x + s) % GAP) + GAP) % GAP) - GAP / 2;
    return Math.abs(u) < 40 ? TALL * Math.pow(Math.cos((u / 40) * (Math.PI / 2)), 1.4) : 0;
  };
  const under = () => Math.max(h(r.c.x + WHEEL_X * RIDE_SCALE), h(r.c.x - WHEEL_X * RIDE_SCALE));
  let air = 0;
  let airFor = 0;
  let airTall = 0;
  let fromY = 0;
  let jolt = 0;
  let cased = false;
  return {
    tick(dt) {
      s += dt * 0.16;
      drawGround(ground, BASE, h, DIRT, DIRT_EDGE, DIRT_DEEP);
      const land = under();
      if (air > 0) {
        air = Math.max(0, air - dt);
        const k = 1 - air / airFor;
        r.c.y = BASE - (fromY + (land - fromY) * k) - airTall * 4 * k * (1 - k);
        r.c.rotation = -0.2 * (1 - 2 * k);
        r.pose(1);
        if (air === 0 && cased) jolt = 300;
        return;
      }
      jolt = Math.max(0, jolt - dt);
      r.c.y = BASE - land + (jolt > 0 ? 3 * Math.sin(jolt / 25) : 0);
      const xf = r.c.x + WHEEL_X * RIDE_SCALE;
      const xr = r.c.x - WHEEL_X * RIDE_SCALE;
      r.c.rotation = Math.atan2(h(xr) - h(xf), xf - xr);
      r.pose(jolt > 0 ? 2 : 0);
    },
    rep(ok) {
      fromY = under();
      cased = !ok;
      airFor = ok ? 720 : 420;
      airTall = ok ? 34 : 12;
      air = airFor;
    },
  };
}

/**
 * The drag launch on The City's No-Turn strip, side on: the rider on the line, the lights on their
 * post. The ambers come on through the hold and the green at the moment; a good launch lifts the
 * front and goes, a jumped one lights the red and stops, a late one bogs off the line.
 */
function launchPicture(scene: Phaser.Scene, vis: Phaser.GameObjects.Container, who: DrillWho): ReactPicture {
  city(scene, vis);
  const BASE = 74;
  const ground = scene.add.graphics();
  vis.add(ground);
  const tree = scene.add.container(90, BASE);
  const tg = scene.add.graphics();
  tg.fillStyle(0x8a8e96).fillRect(-3, -60, 6, 60);
  tg.fillStyle(0x1c1f26).fillRoundedRect(-13, -112, 26, 58, 4);
  tree.add(tg);
  const lamps = [-102, -88, -74, -60].map((y) => scene.add.circle(0, y, 5, 0x3a3a40));
  tree.add(lamps);
  vis.add(tree);
  const r = rideOn(scene, vis, who, RIDER_X, BASE);
  const smoke = scene.add.graphics();
  vis.add(smoke);
  const LINE = RIDER_X + WHEEL_X * RIDE_SCALE + 6;
  let since = -99999;
  let hold = 2000;
  let how: ReactOutcome | null = null;
  let t = 0;
  let gone = 0;
  const lights = () => {
    // Amber, amber, green, and the red at the foot for a jumped start.
    const on = [since > -hold * 0.66, since > -hold * 0.33, since >= 0 && how !== 'jumped', how === 'jumped'];
    const cols = [0xf0a020, 0xf0a020, 0x40d050, 0xe03a2a];
    lamps.forEach((l, i) => l.setFillStyle(on[i] ? cols[i] : 0x3a3a40));
  };
  const draw = () => {
    ground.clear();
    drawGround(ground, BASE, () => 0, 0x5c5e66, 0x3a3c44, 0x4a4c54);
    // The start line, and the strip's marks going by once the bike is away.
    const lx = LINE - gone;
    if (lx > -183 && lx < 183) ground.fillStyle(0xf2efe6).fillRect(lx - 2, BASE, 4, 26);
    ground.fillStyle(0x8a8c94);
    for (let x = -183 - (gone % 50); x < 176; x += 50) if (x > -183) ground.fillRect(x, BASE + 14, 20, 2);
    tree.setX(90 - gone);
    tree.setVisible(tree.x > -170);
  };
  return {
    reset(holdMs) {
      since = -holdMs;
      hold = holdMs;
      how = null;
      t = 0;
      gone = 0;
      r.c.setPosition(RIDER_X, BASE).setRotation(0);
      r.pose(1);
      smoke.clear();
      lights();
      draw();
    },
    tick(dt) {
      since += dt;
      t += dt;
      lights();
      smoke.clear();
      if (how === 'good' || how === 'slow' || (how === 'asleep' && t > 300)) {
        // Away: the strip goes by under the bike; a good launch lifts the front, a late one bogs.
        const tt = how === 'asleep' ? t - 300 : t;
        const a = how === 'good' ? 0.0011 : 0.0006;
        gone = 0.5 * a * tt * tt;
        r.c.x = RIDER_X + Math.min(40, gone * 0.25);
        r.c.rotation = how === 'good' ? -0.16 * Math.min(1, tt / 200) * Math.max(0, 1 - tt / 900) : 0;
        if (how === 'slow' && tt < 500) {
          smoke.fillStyle(0xd8d8dc, 0.6 * (1 - tt / 500));
          for (let i = 0; i < 4; i++) smoke.fillCircle(r.c.x - 46 - i * 9, BASE - 6 - i * 3, 5 + i * 2);
        }
      } else if (how === 'jumped') {
        // A lurch over the line, and stopped.
        r.c.x = RIDER_X + 10 * Math.min(1, t / 120);
        r.c.rotation = t < 200 ? 0.05 : 0;
      }
      draw();
    },
    press(o) {
      how = o;
      t = 0;
    },
  };
}
