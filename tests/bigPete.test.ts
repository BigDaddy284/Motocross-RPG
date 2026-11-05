import { describe, expect, it } from 'vitest';
import { advanceStory, chainDone, currentStep, matchStory, newCareerState, openChains } from '../src/core/career';
import { storyGoal } from '../src/core/waymarks';
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

// Big Pete's storyline and the Beach Town intro (Boss, 3 Nov 2026: "setup Big Petes story line and the
// players storyline that introduces them to the new area the facilities"): the intro walks the rider
// round the shops, a Brake works pass, a round on the agility ladder, Big Pete and the Local Champion;
// then Pete's own chain, two lessons on his sand track, his story, and watching at the Motocross Venue,
// where he teaches whips and scrubs.
describe("Big Pete's storyline (Boss, 3 Nov 2026)", () => {
  const story = content.story;
  const items = content.items;
  const start = () => {
    const c = career();
    c.story.step = story.steps.length;
    const flags: Record<string, boolean> = { 'area.3.open': true, tutorial_done: true };
    openChains(story, c, flags);
    return { c, flags };
  };
  /** Does the current step the way the game does: talk to its NPC, or use its equipment once. */
  const play = (c: ReturnType<typeof career>, flags: Record<string, boolean>, expectId: string) => {
    const step = currentStep(story, c)!;
    expect(step?.id).toBe(expectId);
    const ev = step.on.talk ? { talk: step.on.talk } : { use: step.on.use!, map: step.on.map!, object: `${step.on.map}:drill:${step.on.use}` };
    expect(matchStory(story, c, ev)?.kind, expectId).toBe('ready');
    expect(advanceStory(story, c, flags, items, 'use' in ev ? ev.object : undefined)).toBe(true);
    return step;
  };

  it('the intro shows the town and its facilities, then Big Pete takes over once the tracks are open', () => {
    const { c, flags } = start();
    for (const id of ['a3_news', 'a3_shops', 'a3_errand', 'a3_works']) play(c, flags, id);
    // The Brake works pass is the shift's start object: done when a pass is finished, at the disc lathe.
    const pass = play(c, flags, 'a3_works_pass');
    expect(pass.on).toEqual({ use: 'job.shift', map: 'int-a3-tool-shop' });
    expect(content.world.jobs.find((j) => j.id === 'job.a3.brakes')!.start).toBe('disc_lathe');
    // A round on the agility ladder: the drill's training spot on the beach.
    // The agility coach runs it, so the marker is on them (Boss, 4 Nov 2026).
    expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: 'area3-beach-town', npc: 'npc.a3.gym_coach' });
    play(c, flags, 'a3_fitness');
    expect(flags['met.big_pete']).toBeUndefined();
    play(c, flags, 'a3_training');
    expect(flags['met.big_pete']).toBe(true);
    play(c, flags, 'a3_champion');
    expect(flags['area3.intro_done']).toBe(true);
    expect(flags.rider_trainer_tricks).toBeUndefined();
    expect(currentStep(story, c)!.id).toBe('bp_timing');
  });

  it("Pete's two lessons are rounds on his sand track, the markers point there, then his story and the venue", () => {
    const { c, flags } = start();
    for (const s of story.chains!.find((x) => x.id === 'area3')!.steps) play(c, flags, s.id);
    for (const id of ['bp_timing', 'bp_whoops']) {
      expect(currentStep(story, c)!.on.use).toMatch(/^train\./);
      // Pete runs his lessons from the kiosk, so the marker is on him (Boss, 4 Nov 2026).
      expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: 'area3-beach-town', npc: 'npc.a3.yard_coach' });
      // Another drill, or the agility ladder, is not the lesson.
      expect(matchStory(story, c, { use: 'train.agility_ladder', map: 'area3-beach-town', object: 'x' })).toBeNull();
      play(c, flags, id);
    }
    play(c, flags, 'bp_story');
    expect(content.dialogue['story.bp.story'].lines.map((l) => l.text).join(' ')).toContain('Aidan Borne');
    // The last step is Big Pete at the Motocross Venue, shown there now he has been met.
    const watch = currentStep(story, c)!;
    expect(watch.id).toBe('bp_watch');
    expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: 'venue-motocross', name: 'Big Pete' });
    expect(npcsOnMap(content, maps.get('venue-motocross')!, flags).some((p) => p.npc.id === watch.on.talk)).toBe(true);
    play(c, flags, 'bp_watch');
    expect(flags.rider_trainer_tricks).toBe(true);
    expect(chainDone(story, c, 'bigpete')).toBe(true);
    expect(currentStep(story, c)).toBeNull();
  });
});
