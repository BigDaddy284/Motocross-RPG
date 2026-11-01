import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { checkContent, npcsOnMap } from '../src/core/content';
import { coachedFee, playerEntrant, practiceFee, practiceSim, venueClassFor } from '../src/core/raceDay';
import { loadManifest, loadMaps, rawContent } from './helpers';

// Big Pete (Boss, 1 Nov 2026): met on the Beach Town story, then at every venue across the gate
// from Joseph, offering coached practice for twice the practice fee and +25% practice XP.
const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const venue = (id: string) => content.tracks.venues.find((v) => v.id === id)!;
const VENUE_MAPS = ['venue-motocross', 'venue-supercross', 'venue-enduro'];

function career() {
  const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
  c.bike.parts.top_end = { grade: 1, condition: 0.75 };
  return c;
}

const xpTotal = (xp: Record<string, number>) => Object.values(xp).reduce((a, b) => a + b, 0);

describe('Big Pete, trainer at every venue (Boss, 1 Nov 2026)', () => {
  it('keeps his Beach Town sand track and his story step sets met.big_pete', () => {
    expect(content.npcs.find((n) => n.id === 'npc.a3.yard_coach')).toMatchObject({ name: 'Big Pete', sprite: 'npc-21-big-pete', map: 'area3-beach-town' });
    const step = content.story.chains!.find((c) => c.id === 'area3')!.steps.find((s) => s.id === 'a3_training')!;
    expect(step.effects?.flags).toContain('met.big_pete');
    expect(content.dialogue['story.a3.training'].lines.map((l) => l.text).join(' ')).toContain('James Nestor');
  });

  it('is at no venue until met, then at every venue map across the gate from Joseph', () => {
    for (const id of VENUE_MAPS) {
      const map = maps.get(id)!;
      const pete = (flags: Record<string, boolean>) => npcsOnMap(content, map, flags).find((p) => p.npc.name === 'Big Pete');
      expect(pete({}), id).toBeUndefined();
      const p = pete({ 'met.big_pete': true })!;
      expect(p, id).toBeDefined();
      expect(p.npc.trainer).toEqual({ feeTimes: 2, xpTimes: 1.25 });
      const joseph = npcsOnMap(content, map, {}).find((q) => q.npc.name === 'Joseph Halden')!;
      expect(p.y).toBe(joseph.y);
      expect(p.x).toBeLessThan(joseph.x);
    }
  });

  it('charges twice the practice fee', () => {
    const v = venue('venue-farmland');
    const fee = practiceFee(content, v, venueClassFor(content, v, career()));
    expect(fee).toBeGreaterThan(0);
    expect(coachedFee(fee, { feeTimes: 2 })).toBe(fee * 2);
  });

  it('gives +25% practice XP on the same laps', () => {
    const run = (xpTimes: number) => {
      const sim = practiceSim(content, venue('venue-farmland'), playerEntrant(content, career(), 'T'), 11, true, xpTimes);
      for (let i = 0; i < 3; i++) sim.nextLap();
      return { xp: xpTotal(sim.xp), laps: sim.player!.lapTimes };
    };
    const solo = run(1);
    const coached = run(1.25);
    expect(coached.laps).toEqual(solo.laps);
    expect(coached.xp).toBeCloseTo(solo.xp * 1.25, 6);
  });
});
