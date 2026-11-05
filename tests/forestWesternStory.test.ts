import { describe, expect, it } from 'vitest';
import { advanceStory, chainDone, currentStep, matchStory, newCareerState, openChains } from '../src/core/career';
import { storyGoal } from '../src/core/waymarks';
import { checkContent } from '../src/core/content';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The Forest Town and Western Works intros and their coaches' storylines (Boss, 4 Nov 2026: "Storylines:
// intro chains and character storylines (follow Area 3 pattern)"). Each intro walks the rider round the
// town like Beach Town's: Manny's news, Paul's parts order to Lee, the area's works and one pass there, a
// round of the area's fitness, the coach, then the Local Champion opens the tracks. Then the coach's own
// chain: two lessons at the practice yard, their story, and a part from their racing days.
const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const story = content.story;
const items = content.items;

function career() {
  const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
  c.story.step = story.steps.length;
  return c;
}

/** Does the current step the way the game does: talk to its NPC, or use its equipment once. */
function play(c: ReturnType<typeof career>, flags: Record<string, boolean>, expectId: string) {
  const step = currentStep(story, c)!;
  expect(step?.id).toBe(expectId);
  const ev = step.on.talk ? { talk: step.on.talk } : { use: step.on.use!, map: step.on.map!, object: `${step.on.map}:drill:${step.on.use}` };
  expect(matchStory(story, c, ev)?.kind, expectId).toBe('ready');
  expect(advanceStory(story, c, flags, items, 'use' in ev ? ev.object : undefined)).toBe(true);
  return step;
}

const AREAS = [
  { n: 4, town: 'area4-forest-town', intro: 'area4', coach: 'gus', coachName: 'Gus Fernley', sprite: 'npc-23-forest-coach',
    job: 'job.a4.works', start: 'fork_stand', fitness: ['train.yoga', 'Woodland yoga retreat'],
    lessons: [['gf_berm', 'train.berm_corner'], ['gf_roots', 'train.root_ruts']], yard: 'Forest practice loop',
    talks: ['gf_story', 'gf_gift'], gift: { slot: 'shock', grade: 5 }, done: 'gus.done', story: 'Borne kids' },
  { n: 5, town: 'area5-western-works', intro: 'area5', coach: 'vera', coachName: 'Vera Flint', sprite: 'npc-25-quarry-coach',
    job: 'job.a5.frame', start: 'frame_jig', fitness: ['train.rowing', 'Canal rowing club'],
    lessons: [['vf_rocks', 'train.rock_garden'], ['vf_shadow', 'train.shadow_passing']], yard: 'Quarry practice ground',
    talks: ['vf_story', 'vf_gift'], gift: { slot: 'wheels_tyres', grade: 6 }, done: 'vera.done', story: 'Louie Borne' },
] as const;

for (const A of AREAS) {
  describe(`Area ${A.n} intro and ${A.coachName}'s storyline (Boss, 4 Nov 2026)`, () => {
    const start = () => {
      const c = career();
      const flags: Record<string, boolean> = { [`area.${A.n}.open`]: true, tutorial_done: true };
      openChains(story, c, flags);
      return { c, flags };
    };

    it(`${A.coachName} coaches at the practice yard in their own sprite`, () => {
      expect(content.npcs.find((n) => n.id === `npc.a${A.n}.yard_coach`)).toMatchObject({ name: A.coachName, sprite: A.sprite, map: A.town });
    });

    it('the intro shows the town and its facilities, then the coach takes over once the tracks are open', () => {
      const { c, flags } = start();
      for (const id of ['news', 'shops', 'errand', 'works']) play(c, flags, `a${A.n}_${id}`);
      // The works pass is the shift's start object: done when a pass is finished.
      const pass = play(c, flags, `a${A.n}_works_pass`);
      expect(pass.on).toEqual({ use: 'job.shift', map: `int-a${A.n}-tool-shop` });
      const job = content.world.jobs.find((j) => j.id === A.job)!;
      expect(job.start).toBe(A.start);
      // Every station of the shift is a machine in the new inside.
      const inside = maps.get(`int-a${A.n}-tool-shop`)!;
      for (const s of job.stations) expect(inside.objects.some((o) => o.type === 'interact' && o.name === s.object), s.object).toBe(true);
      // A round of the area's fitness, at its training spot in town.
      // The gym coach runs it, so the marker is on them, not a hidden spot by the door (Boss, 4 Nov 2026).
      expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: A.town, npc: `npc.a${A.n}.gym_coach` });
      const fit = play(c, flags, `a${A.n}_fitness`);
      expect(fit.on.use).toBe(A.fitness[0]);
      play(c, flags, `a${A.n}_training`);
      play(c, flags, `a${A.n}_champion`);
      expect(flags[`area${A.n}.intro_done`]).toBe(true);
      expect(currentStep(story, c)!.id).toBe(A.lessons[0][0]);
    });

    it("the coach's two lessons are rounds at the practice yard, the markers point there, then the story and a gift", () => {
      const { c, flags } = start();
      for (const s of story.chains!.find((x) => x.id === A.intro)!.steps) play(c, flags, s.id);
      for (const [id, use] of A.lessons) {
        const step = currentStep(story, c)!;
        expect(step.on.use).toBe(use);
        // The coach runs the lesson, so the marker is on them (Boss, 4 Nov 2026).
        expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: A.town, npc: `npc.a${A.n}.yard_coach` });
        // The area's fitness is not the lesson.
        expect(matchStory(story, c, { use: A.fitness[0], map: A.town, object: 'x' })).toBeNull();
        play(c, flags, id);
      }
      play(c, flags, A.talks[0]);
      expect(content.dialogue[`story.${A.coach === 'gus' ? 'gf' : 'vf'}.story`].lines.map((l) => l.text).join(' ')).toContain(A.story);
      const bag = c.bag.length;
      play(c, flags, A.talks[1]);
      expect(c.bag.length).toBe(bag + 1);
      expect(c.bag.at(-1)!.part).toMatchObject(A.gift);
      expect(flags[A.done]).toBe(true);
      expect(chainDone(story, c, A.coach)).toBe(true);
    });
  });
}
