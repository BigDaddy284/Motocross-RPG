import { describe, expect, it } from 'vitest';
import { TRACK_RANGE, trackAtRest, trackStep, type TrackState } from '../src/core/modModels';

// TV cameras and camera operators (Track parts) follow one rider a lap (Boss, 3 Nov 2026: "Cams
// following riders should pick 1 rider per lap not every rider, as they bounce back and forth
// when there's a group of riders").
describe('a camera following a rider', () => {
  const at = { x: 0, z: 0 };
  const near = (x: number) => ({ x, z: 0 });
  const far = { x: TRACK_RANGE * 3, z: 0 };

  it('stays on its rider in a group, even when another is nearer', () => {
    let s: TrackState = trackAtRest();
    const group = [near(5), near(2), near(8)];
    const first = trackStep(s, at, group, () => 2);
    expect(first.aim).toBe(2);
    s = first;
    // The group moves on and rider 1 is nearest, but the camera keeps rider 2.
    for (const g of [[near(1), near(0.5), near(3)], [near(-2), near(-1), near(0)], [near(-6), near(-4), near(-3)]]) {
      const n = trackStep(s, at, g, () => 0);
      expect(n.aim).toBe(2);
      s = n;
    }
  });

  it('rests until its rider comes, and takes a new one for the next lap once they have gone', () => {
    let s = trackStep(trackAtRest(), at, [near(3), far], () => 1);
    expect(s.aim).toBe(-1);
    expect(s.rider).toBe(1);
    s = trackStep(s, at, [far, near(4)], () => 0);
    expect(s.aim).toBe(1);
    s = trackStep(s, at, [near(2), far], () => 0);
    // Rider 1 has gone by: rider 0 is the camera's for the next lap. They are still going by, so the
    // camera doesn't swing back to them this pass, only when they come round again.
    expect(s.rider).toBe(0);
    expect(s.aim).toBe(-1);
    s = trackStep(s, at, [near(-6), far], () => 1);
    expect(s.aim).toBe(-1);
    s = trackStep(s, at, [far, far], () => 1);
    expect(s.aim).toBe(-1);
    s = trackStep(s, at, [near(9), far], () => 1);
    expect(s.aim).toBe(0);
  });

  it('rests with no riders', () => {
    expect(trackStep(trackAtRest(), at, [], () => 0).aim).toBe(-1);
  });
});
