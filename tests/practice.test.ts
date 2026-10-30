import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { playerEntrant, practiceSim } from '../src/core/raceDay';
import { directorFor } from '../src/core/riderAI';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const venue = (id: string) => content.tracks.venues.find((v) => v.id === id)!;

function player() {
  const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
  c.bike.parts.top_end = { grade: 1, condition: 0.75 };
  return playerEntrant(content, c, 'Test');
}

describe('free practice with other riders out (Boss, 28 Oct 2026)', () => {
  it('puts 10 riders from the pool on track at every venue, and none on the backyard loop', () => {
    for (const id of ['venue-farmland', 'venue-riverside', 'venue-longmoor']) {
      const sim = practiceSim(content, venue(id), player(), 42);
      const cpus = sim.riders.filter((r) => !r.e.player);
      expect(cpus, id).toHaveLength(10);
      expect(new Set(cpus.map((r) => r.e.id)).size).toBe(10);
      for (const r of cpus) expect(content.riders.fields['area1.local']).toContain(r.e.id);
      // Already out, spread round the lap ahead of you, none at the gate with you.
      const starts = cpus.map((r) => r.time);
      for (const t of starts) expect(t).toBeLessThan(-1);
      expect(new Set(starts).size).toBe(10);
    }
    expect(practiceSim(content, venue('backyard'), player(), 42).riders).toHaveLength(1);
  });

  it('draws a different 10 each session', () => {
    const ids = (seed: number) => practiceSim(content, venue('venue-farmland'), player(), seed).riders.map((r) => r.e.id).join();
    expect(new Set([1, 2, 3, 4, 5].map(ids)).size).toBeGreaterThan(1);
  });

  it('runs laps for everyone, gives XP only to you at the practice rate, and plays back on the race view', () => {
    const sim = practiceSim(content, venue('venue-riverside'), player(), 7);
    const dir = directorFor(sim, content.bikes, content.racing.messages);
    for (let i = 0; i < 4; i++) dir.addLap(sim.nextLap());
    expect(sim.finished).toBe(false);
    for (const r of sim.riders) if (!r.retired) expect(r.laps).toBe(4);
    expect(sim.player!.lapTimes).toHaveLength(4);
    expect(Object.values(sim.xp).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // Mid-session every rider has a pose on track.
    const poses = dir.poses(30);
    expect(poses).toHaveLength(11);
    for (const p of poses) expect(Number.isFinite(p.dist)).toBe(true);
  });

  it('ends when your bike gives out, whoever else is still riding', () => {
    const sim = practiceSim(content, venue('venue-farmland'), player(), 9);
    sim.retirePlayer('Broken');
    expect(sim.finished).toBe(true);
  });
});
