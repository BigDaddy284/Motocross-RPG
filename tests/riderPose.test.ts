import { describe, expect, it } from 'vitest';
import { easePoses, poseTargets, type PoseInput } from '../src/core/riderPose';

// The solo rider's poses (Boss, 3 Nov 2026: "Study images and video refs of solo motocross riders
// over jumps, bumps, fast corners slow corners").
const base: PoseInput = { turn: 0, speed: 10, accel: 0, section: 'straight', jump: null, gate: false, wheelie: 0, off: false };
const pose = (i: Partial<PoseInput>) => poseTargets({ ...base, ...i });

describe("the solo rider's pose", () => {
  it('sits at rest cruising a straight, and stands up fast or over rough ground', () => {
    expect(pose({})).toEqual({});
    expect(pose({ speed: 20 }).Stand).toBeCloseTo(0.6);
    for (const section of ['whoops', 'rollers', 'braking_bumps']) expect(pose({ section }).Stand).toBe(1);
  });

  it('sits with the inside leg out through slow corners and leans in stood up on berms and fast ones', () => {
    expect(Object.keys(pose({ turn: 0.4, speed: 7, section: 'flat_corner' }))).toEqual(['CornerRight']);
    expect(Object.keys(pose({ turn: -0.4, speed: 7, section: 'hairpin' }))).toEqual(['CornerLeft']);
    expect(Object.keys(pose({ turn: 0.4, speed: 9, section: 'berm' }))).toEqual(['BermRight']);
    expect(Object.keys(pose({ turn: -0.3, speed: 18, section: 'flat_corner' }))).toEqual(['BermLeft']);
  });

  it('gets back on the brakes and forward on the gas', () => {
    expect(pose({ accel: -6 }).Brake).toBe(1);
    expect(pose({ accel: 4.5, speed: 8 }).Accelerate).toBe(1);
  });

  it('compresses into a jump, rides the air neutral and soaks up the landing', () => {
    expect(pose({ jump: 'takeoff' })).toEqual({ Takeoff: 1 });
    expect(pose({ jump: 'air', turn: 0.4 })).toEqual({ Air: 1 });
    expect(pose({ jump: 'land' })).toEqual({ Land: 1 });
  });

  it('has its feet down at the gate, sits back in a wheelie and has no pose off the bike', () => {
    expect(pose({ gate: true })).toEqual({ Start: 1 });
    expect(pose({ wheelie: 0.3 })).toEqual({ Wheelie: 1 });
    expect(pose({ off: true, jump: 'air' })).toEqual({});
  });

  it('blends at most two poses, never past a full pose, and eases between them', () => {
    const w = pose({ turn: 0.4, speed: 7, accel: -6, section: 'braking_bumps' });
    expect(Object.keys(w).length).toBe(2);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    let now = {};
    now = easePoses(now, { Stand: 1 }, 0.1);
    expect(now).toHaveProperty('Stand');
    expect((now as { Stand: number }).Stand).toBeGreaterThan(0.2);
    expect((now as { Stand: number }).Stand).toBeLessThan(0.6);
    for (let k = 0; k < 40; k++) now = easePoses(now, { Brake: 1 }, 0.1);
    expect(now).toEqual({ Brake: expect.closeTo(1, 2) });
  });
});
