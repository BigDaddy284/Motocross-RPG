import { describe, expect, it } from 'vitest';
import {
  advanceStory,
  bikeProblem,
  bikeStats,
  formatMoney,
  jobPay,
  journal,
  matchStory,
  newCareerState,
  pence,
  type CareerState,
  type StoryStep,
} from '../src/core/career';
import { checkContent } from '../src/core/content';
import { Grid } from '../src/core/grid';
import { applyMapState, clearedPatches, hiddenSprites } from '../src/core/mapState';
import { Travel } from '../src/core/travel';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const { bikes, story, items, world } = content;

/** Plays one step the way the world scene does, using the first object with the step's action. */
function play(state: CareerState, flags: Record<string, boolean>, step: StoryStep): void {
  if (step.on.talk) {
    expect(matchStory(story, state, { talk: step.on.talk })?.kind, step.id).toBe('ready');
    advanceStory(story, state, flags, items);
    return;
  }
  const map = maps.get(step.on.map!)!;
  const objects = map.objects.filter((o) => o.props.action === step.on.use);
  for (let i = 0; i < (step.times ?? 1); i++) {
    const object = `${map.id}:${objects[i].name}:${objects[i].x},${objects[i].y}`;
    expect(matchStory(story, state, { use: step.on.use!, map: map.id, object })?.kind, step.id).toBe('ready');
    advanceStory(story, state, flags, items, object);
  }
}

describe('starter bikes', () => {
  it('have every part at the starter grade, 50–80% condition, and a broken top end', () => {
    const bike = newCareerState(bikes, story, 'kwakmoto', () => 0.5).bike;
    expect(Object.keys(bike.parts).sort()).toEqual(bikes.slots.map((s) => s.id).sort());
    for (const [slot, p] of Object.entries(bike.parts)) {
      expect(p.grade).toBe(1);
      if (slot === 'top_end') expect(p.condition).toBe(0);
      else expect(p.condition).toBe(0.65);
    }
    expect(bikeProblem(bikes, bike)).toMatch(/top end is broken/);
  });

  it('all four brands have the same overall total but lean different ways', () => {
    const totals = bikes.brands.map((b) => {
      const bike = newCareerState(bikes, story, b.id, () => 1).bike;
      bike.parts.top_end.condition = 1;
      return Object.values(bikeStats(bikes, bike)).reduce((a, v) => a + v, 0);
    });
    expect(bikes.brands).toHaveLength(4);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(3); // rounding only
    const best = bikes.brands.map((b) => Object.entries(b.lean).sort((x, y) => y[1] - x[1])[0][0]);
    expect(new Set(best).size).toBe(4);
  });

  it('a broken part keeps only 10% of its stats', () => {
    const bike = newCareerState(bikes, story, 'hondmoto', () => 1).bike;
    const broken = bikeStats(bikes, bike).power;
    bike.parts.top_end.condition = 1;
    expect(bikeStats(bikes, bike).power).toBeGreaterThan(broken);
  });
});

describe('the opening chain', () => {
  it('runs from a broken bike to the van, leaving the rider £80 short (Spec 14.1)', () => {
    const state = newCareerState(bikes, story, 'yamamoto');
    const flags: Record<string, boolean> = {};
    expect(state.money).toBe(pence(150));
    const vanStep = story.steps.findIndex((s) => s.id === 'buy_van');
    for (const step of story.steps.slice(0, vanStep)) play(state, flags, step);
    expect(state.bike.parts.top_end.condition).toBeGreaterThan(0);
    expect(bikeProblem(bikes, state.bike)).toBeNull();
    expect(state.bag).toEqual([]);
    expect(flags.tutorial_done && flags.roadworks_done).toBe(true);
    expect(state.money).toBe(pence(520));

    const notYet = matchStory(story, state, { talk: 'npc.van_seller' });
    expect(notYet).toMatchObject({ kind: 'notReady', short: pence(80) });

    state.money += pence(80); // shifts
    for (const step of story.steps.slice(vanStep)) play(state, flags, step);
    expect(state.money).toBe(0);
    expect(flags.van_owned && flags.van_loaded).toBe(true);
    expect(journal(story, state, flags)).toBe(story.after![0].text);
    expect(journal(story, state, { ...flags, first_race_done: true })).toBe(story.after![1].text);
    expect(journal(story, state, { ...flags, first_race_done: true, first_race_finished: true })).toBe(story.done);
  });

  it('fitting the top end costs £90 and leaves about £30 once the £120 is paid', () => {
    const state = newCareerState(bikes, story, 'sukimoto');
    const flags = {};
    for (const step of story.steps.slice(0, 3)) play(state, flags, step);
    expect(state.money - pence(150)).toBe(pence(30));
  });

  it('ignores talk and use that are not the current step', () => {
    const state = newCareerState(bikes, story, 'sukimoto');
    expect(matchStory(story, state, { talk: 'npc.van_seller' })).toBeNull();
    expect(matchStory(story, state, { use: 'workshop.fit_tune', map: 'int-home-local-garage', object: 'x' })).toBeNull();
  });

  it('a multi-use step needs different objects and counts them in the journal', () => {
    const state = newCareerState(bikes, story, 'sukimoto');
    state.story.step = story.steps.findIndex((s) => s.id === 'service_bikes');
    const ev = { use: 'workshop.bike', map: 'int-home-local-garage', object: 'stand-a' };
    advanceStory(story, state, {}, items, ev.object);
    expect(journal(story, state)).toMatch(/\(1 of 2\)$/);
    expect(matchStory(story, state, ev)?.kind).toBe('alreadyUsed');
    expect(advanceStory(story, state, {}, items, 'stand-b')).toBe(true);
  });

  it('only the opening chain NPCs talk before it is done (GDD 4.2)', () => {
    const inChain = new Set(story.steps.slice(0, story.steps.findIndex((s) => s.id === 'tutorial_end') + 1).flatMap((s) => (s.on.talk ? [s.on.talk] : [])));
    for (const n of content.npcs) {
      // Route marshals only give directions (they replace the world map screen), so they always answer.
      if (inChain.has(n.id) || n.guide) expect(n.quietUntil, n.id).toBeUndefined();
      else expect(n.quietUntil, n.id).toBe('tutorial_done');
    }
  });
});

describe('money', () => {
  it('shows whole pounds plainly and pence when there are any', () => {
    expect(formatMoney(pence(600))).toBe('£600');
    expect(formatMoney(pence(0.75) * 3)).toBe('£2.25');
  });

  it('a shift batch pays £10–£25, like the early repeatable jobs (Spec 14.1)', () => {
    for (const j of world.jobs) {
      const batch = j.batch * j.pay;
      expect(batch, j.id).toBeGreaterThanOrEqual(10);
      expect(batch, j.id).toBeLessThanOrEqual(25);
    }
  });
});

describe('roadworks and the venue route', () => {
  const home = maps.get('area1-home-town')!;
  const travel = new Travel(maps, world.locks);
  const exit = home.objects.find((o) => o.name === 'To the venue route')!;

  it('block the west road until the opening chain clears them', () => {
    const blocked = Grid.fromMap(home);
    applyMapState(home, blocked, {});
    expect(blocked.isFree(1, 20)).toBe(false);
    expect(hiddenSprites(home, {}).size).toBe(0);

    const flags = { roadworks_done: true };
    const open = Grid.fromMap(home);
    applyMapState(home, open, flags);
    for (const [x, y] of [[1, 20], [2, 20], [1, 21], [2, 21]]) expect(open.isFree(x, y), `${x},${y}`).toBe(true);
    const gone = [...hiddenSprites(home, flags)].map((s) => home.images[s.img]);
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.every((p) => p.includes('/roadworks/'))).toBe(true);
    expect(clearedPatches(home, flags).length).toBeGreaterThan(0);
  });

  it('opens the venue road only once the van is loaded', () => {
    expect(travel.resolve(home, exit, { roadworks_done: true, van_owned: true })?.kind).toBe('blocked');
    expect(travel.resolve(home, exit, { roadworks_done: true, van_owned: true, van_loaded: true })?.kind).toBe('route');
  });

  it('every venue map has a road back out', () => {
    for (const d of world.places) {
      const m = maps.get(d.map)!;
      if (m.id === 'area1-home-town') continue;
      const out = m.objects.find((o) => o.type === 'exit')!;
      expect(travel.resolve(m, out, {})?.kind, m.id).toBe('route');
    }
  });
});

describe('testing pay boost', () => {
  it('triples shift pay while testing (review before Final v1)', () => {
    const fab = world.jobs.find((j) => j.id === 'job.fabrication')!;
    expect(world.testPayMultiplier).toBe(3);
    expect(jobPay(world, fab)).toBe(225);
    expect(jobPay({ ...world, testPayMultiplier: undefined }, fab)).toBe(75);
  });
});
