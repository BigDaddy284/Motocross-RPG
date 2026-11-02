import { describe, expect, it } from 'vitest';
import { DRONE_FOLLOW, DRONE_LEASH, DRONE_PICKUP, DRONE_REST, droneAtHome, droneStep, type DroneState, livePart } from '../src/core/modModels';

// The drone pilot's drone (Boss, 2 Nov 2026): "have the drone follow a random rider for half a lap or
// something then return to pilot ready for when the bikes come past next and a new random rider is followed".
describe('drone', () => {
  const home = { x: 0, z: 0 };
  const run = (s: DroneState, secs: number, riders: (t: number) => { x: number; z: number }[], pick = () => 0.5, t0 = 0) => {
    let st = s;
    for (let t = 0; t < secs; t += 0.05) st = droneStep(st, 0.05, home, riders(t0 + t), pick);
    return st;
  };

  it('is a live part by name', () => {
    expect(livePart('Drone')).toBe('Drone');
    expect(livePart('Drone.001')).toBe('Drone');
  });

  it('waits at home while no rider is near', () => {
    const s = run(droneAtHome(home), 5, () => [{ x: 100, z: 0 }]);
    expect(s.mode).toBe('home');
    expect([s.x, s.z]).toEqual([0, 0]);
  });

  it('picks a rider at random from those coming by, and follows them', () => {
    const riders = [{ x: 200, z: 0 }, { x: 5, z: 0 }, { x: 8, z: 2 }];
    expect(droneStep(droneAtHome(home), 0.05, home, riders, () => 0).rider).toBe(1);
    expect(droneStep(droneAtHome(home), 0.05, home, riders, () => 0.99).rider).toBe(2);
    // A rider riding away at 15 grid units a second is caught up with.
    const s = run(droneAtHome(home), 3, (t) => [{ x: 5 + 15 * t, z: 0 }]);
    expect(s.mode).toBe('follow');
    expect(Math.abs(s.x - (5 + 15 * 3))).toBeLessThan(1);
  });

  it('comes home after following a while, or when the rider is far off, and waits before the next', () => {
    const slow = (t: number) => [{ x: Math.min(DRONE_PICKUP - 1 + 2 * t, 60), z: 0 }];
    const s = run(droneAtHome(home), DRONE_FOLLOW + 0.2, slow);
    expect(s.mode).toBe('back');
    const fast = (t: number) => [{ x: 10 + 30 * t, z: 0 }];
    const f = run(droneAtHome(home), (DRONE_LEASH + 20) / 30, fast);
    expect(f.mode).not.toBe('follow');
    const back = run(s, 5, () => []);
    expect(back.mode).toBe('home');
    expect(Math.hypot(back.x, back.z)).toBeLessThan(1e-6);
    // Home again, it waits DRONE_REST before taking the next rider coming by.
    const near = () => [{ x: 3, z: 0 }];
    const justHome = droneStep({ ...back, t: 0 }, 0.05, home, near(), () => 0.5);
    expect(justHome.mode).toBe('home');
    expect(run({ ...back, t: 0 }, DRONE_REST + 0.2, near).mode).toBe('follow');
  });

  it('goes home when its rider is gone', () => {
    const s = droneStep({ mode: 'follow', rider: 2, t: 1, x: 5, z: 0 }, 0.05, home, [{ x: 5, z: 0 }], () => 0);
    expect(s.mode).toBe('back');
  });
});
