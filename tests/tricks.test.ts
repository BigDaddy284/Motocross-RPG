import { describe, expect, it } from 'vitest';
import { TrackSurface } from '../src/core/trackSurface';
import { TRICK_JUMP, trickPose, type Trick } from '../src/core/tricks';
import { content, race } from './raceHelpers';

/** Every trick thrown in a race, by rider, read off the riders' flights over the whole race. */
function tricksIn(dir: ReturnType<typeof race>['dir']): { by: Map<string, Trick[]>; bails: { id: string; t: number; land: number }[] } {
  const by = new Map<string, Trick[]>();
  const bails: { id: string; t: number; land: number }[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < 400; t += 0.2) {
    for (const p of dir.poses(t)) {
      p.flight?.hops.forEach((h, i) => {
        const tr = p.flight!.tricks?.[i];
        const key = `${p.id}|${Math.floor(p.dist)}|${h[0]}`;
        if (!tr || seen.has(key)) return;
        seen.add(key);
        by.set(p.id, [...(by.get(p.id) ?? []), tr]);
        if (tr.bail) bails.push({ id: p.id, t, land: Math.floor(p.dist) + h[1] });
      });
    }
  }
  return { by, bails };
}

describe('whips and scrubs over the jumps (Boss, 30 Oct 2026)', () => {
  for (const id of ['farmland', 'arena-supercross', 'challenge-industrial', 'longmoor-endurance']) {
    it(`the showman throws tricks at every race on ${id}, and only good jumpers do`, () => {
      for (const seed of [3, 41]) {
        const { dir } = race(id, seed);
        const { by } = tricksIn(dir);
        expect(dir.showman).not.toBeNull();
        expect(dir.profiles.get(dir.showman!)!.player).toBeFalsy();
        expect(by.get(dir.showman!)?.length ?? 0).toBeGreaterThan(0);
        for (const who of by.keys()) if (who !== dir.showman) expect(dir.profiles.get(who)!.jump).toBeGreaterThanOrEqual(TRICK_JUMP);
      }
    }, 20000);
  }

  it('a trick gone wrong ends in a crash or a sketchy landing where it lands', () => {
    let bails = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { dir } = race('farmland', seed);
      for (const b of tricksIn(dir).bails) {
        bails++;
        // Just after the landing the rider is down or wobbling, not riding away clean.
        let worst = 'riding';
        for (let t = b.t; t < b.t + 40; t += 0.1) {
          const p = dir.poses(t).find((q) => q.id === b.id)!;
          if (Math.abs(p.dist - b.land) < 0.01 && (p.state === 'crashed' || p.state === 'remount' || p.state === 'wobble')) worst = p.state;
        }
        expect(worst).not.toBe('riding');
      }
    }
    expect(bails).toBeGreaterThan(0);
  }, 30000);

  it('a whip and a scrub come back straight for the landing, and a bail lands crossed up', () => {
    for (const kind of ['whip', 'scrub'] as const) {
      const t: Trick = { kind, dir: 1, size: 1 };
      const peak = Math.max(...Array.from({ length: 21 }, (_, i) => Math.abs(trickPose(t, i / 20).roll)));
      expect(peak).toBeGreaterThan(0.8);
      expect(Math.abs(trickPose(t, 0.95).roll)).toBeLessThan(0.15 * peak);
      expect(Math.abs(trickPose({ ...t, bail: true }, 1).roll)).toBeGreaterThan(0.5 * peak);
      // Thrown right, it lays over to the right with the nose turned right.
      const mid = trickPose(t, kind === 'whip' ? 0.45 : 0.1);
      expect(mid.roll).toBeGreaterThan(0);
      expect(mid.yaw).toBeLessThan(0);
    }
    // A whip leaves the lip straight; a scrub is already laid over on the face.
    expect(trickPose({ kind: 'whip', dir: 1, size: 1 }, 0).roll).toBe(0);
    expect(trickPose({ kind: 'scrub', dir: 1, size: 1 }, 0).roll).toBeGreaterThan(0.5);
  });

  it('a scrub flies lower than the same hop jumped', () => {
    const track = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    const s = new TrackSurface(track);
    const { dir } = race('farmland', 3);
    const hops = new Map<string, [number, number]>();
    for (let t = 0; t < 200; t += 0.2) for (const p of dir.poses(t)) for (const h of p.flight?.hops ?? []) hops.set(h.join(), h);
    expect(hops.size).toBeGreaterThan(0);
    let lower = 0;
    for (const hop of hops.values()) {
      const mid = (hop[0] + hop[1]) / 2;
      const jumped = s.flightY(mid, 0, { hops: [hop], launch: 1 })!;
      const scrubbed = s.flightY(mid, 0, { hops: [hop], launch: 1, tricks: [{ kind: 'scrub', dir: 1, size: 1 }] })!;
      // Never higher, and lower wherever the face would have thrown it up (not where it only just clears what is under it).
      expect(scrubbed).toBeLessThanOrEqual(jumped + 1e-9);
      if (scrubbed < jumped - 1e-6) lower++;
    }
    expect(lower).toBeGreaterThan(0);
  });
});
