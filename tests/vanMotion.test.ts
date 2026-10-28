import { describe, expect, it } from 'vitest';
import { checkContent, type Content } from '../src/core/content';
import { Grid } from '../src/core/grid';
import { applyMapState } from '../src/core/mapState';
import { Motion, tuningFor } from '../src/core/vanMotion';
import { FOLD, angleGap, flipPose, restPlace, sweep } from '../src/core/vanPath';
import { DriveMap, backTurnOptions, planDrive, uturnLanes, type Move, type VanPose } from '../src/core/vehicles';
import { loadManifest, loadMaps, rawContent } from './helpers';

// Smooth van driving (Boss, 25 Oct 2026): the van drives grid moves as one continuous trip and
// comes to rest exactly on the grid.

const manifest = loadManifest();
const maps = loadMaps();
const content = checkContent(rawContent(), manifest, maps).content as Content;
const HOME = 'area1-home-town';
const FRAME = 1 / 60;

function homeMap(): DriveMap {
  const map = maps.get(HOME)!;
  const grid = Grid.fromMap(map);
  applyMapState(map, grid, { van_owned: true, van_loaded: true, tutorial_done: true, roadworks_done: true });
  return new DriveMap(map, grid, content.vehicles);
}

/** Drives a list of moves frame by frame and reports the worst frame-to-frame change. */
function drive(length: number, start: VanPose, moves: Move[], stepMs = 250) {
  const tune = tuningFor(stepMs);
  const m = new Motion(tune, length, start);
  let pose = start;
  for (const mv of moves) {
    m.push(mv, pose);
    pose = mv.to;
  }
  let prev = m.place();
  let fastest = 0;
  let sharpest = 0;
  let t = 0;
  const finished: Move[] = [];
  while (m.moving && t < 300) {
    for (const leg of m.step(FRAME)) finished.push(leg.move);
    t += FRAME;
    const p = m.place();
    fastest = Math.max(fastest, Math.hypot(p.x - prev.x, p.y - prev.y) / FRAME / tune.cruise);
    sharpest = Math.max(sharpest, angleGap(prev.angle, p.angle));
    prev = p;
  }
  const rest = restPlace(pose, length);
  return { fastest, sharpest, finished, off: Math.hypot(prev.x - rest.x, prev.y - rest.y), offAngle: angleGap(prev.angle, rest.angle), seconds: t };
}

describe('van driving', () => {
  const dm = homeMap();
  const routes: [number, VanPose, { x: number; y: number }][] = [
    [2, { x: 20, y: 13, heading: 'east' }, { x: 37, y: 20 }],
    [2, { x: 45, y: 13, heading: 'east' }, { x: 10, y: 12 }],
    [3, { x: 35, y: 11, heading: 'west' }, { x: 37, y: 20 }],
    [5, { x: 45, y: 13, heading: 'east' }, { x: 10, y: 12 }],
    [9, { x: 28, y: 14, heading: 'west' }, { x: 37, y: 20 }],
    [9, { x: 45, y: 13, heading: 'east' }, { x: 10, y: 12 }],
  ];

  for (const [length, start, goal] of routes) {
    it(`a ${length}-tile van drives ${start.x},${start.y} ${start.heading} to ${goal.x},${goal.y} without a jump, ending on its pose`, () => {
      const plan = planDrive(dm, start, length, goal)!;
      expect(plan).not.toBeNull();
      const r = drive(length, start, plan);
      expect(r.finished).toEqual(plan);
      // Never faster than cruising speed, never more than a few degrees of turn a frame.
      expect(r.fastest).toBeLessThanOrEqual(1.01);
      expect(r.sharpest).toBeLessThanOrEqual(6);
      // Within the small amount the van eases the last bit when it pulls up (VanView).
      expect(r.off + r.offAngle / 45).toBeLessThanOrEqual(0.6 + 1e-9);
    });
  }

  it('drives forward, then backs round a corner into a side road without a jump', () => {
    // Forward a tile, then back the Factory Hauler round into the side road.
    const start: VanPose = { x: 30, y: 13, heading: 'west' };
    const ahead: Move = { kind: 'forward', to: { x: 29, y: 13, heading: 'west' } };
    // The back leads south into the side road, so the van ends up facing north out of it.
    const back = backTurnOptions(dm, ahead.to, 9, 'south', 1)[0];
    expect(back?.kind).toBe('backturn');
    expect(back.to.heading).toBe('north');
    const r = drive(9, start, [ahead, back]);
    expect(r.finished).toEqual([ahead, back]);
    expect(r.fastest).toBeLessThanOrEqual(1.01);
    expect(r.sharpest).toBeLessThanOrEqual(6);
  });

  it('turning a van end for end twice gives the same van', () => {
    const p: VanPose = { x: 30, y: 21, heading: 'east' };
    for (const L of [2, 3, 5, 9]) {
      expect(flipPose(p, L)).toEqual({ x: 31 - L, y: 21, heading: 'west' });
      expect(flipPose(flipPose(p, L), L)).toEqual(p);
    }
  });

  it('a long van needs a wide road to turn round, and never folds up doing it', () => {
    expect([2, 3, 5, 9].map(uturnLanes)).toEqual([1, 2, 3, 5]);
    const solid = () => false;
    // A Factory Hauler can't turn round into the next lane: its ends would meet.
    expect(sweep({ x: 40, y: 21, heading: 'east' }, 'uturn', { x: 32, y: 22, heading: 'west' }, 9, solid).clear).toBe(false);
    expect(sweep({ x: 40, y: 21, heading: 'east' }, 'uturn', { x: 32, y: 26, heading: 'west' }, 9, solid).clear).toBe(true);
    expect(FOLD).toBeGreaterThan(0);
  });

  it('a held key keeps the van at cruising speed between tiles', () => {
    const tune = tuningFor(250);
    const m = new Motion(tune, 2, { x: 10, y: 21, heading: 'east' });
    let pose: VanPose = { x: 10, y: 21, heading: 'east' };
    let slowest = Infinity;
    for (let f = 0; f < 240; f++) {
      // Like the van asks the scene: keep enough road queued not to need to brake.
      while (m.remaining() < m.stoppingDistance() + 0.5) {
        const to = { x: pose.x + 1, y: pose.y, heading: 'east' as const };
        m.push({ kind: 'forward', to }, pose);
        pose = to;
      }
      m.step(FRAME);
      if (f > 60) slowest = Math.min(slowest, m.speed);
    }
    expect(slowest).toBeCloseTo(tune.cruise, 6);
  });
});
