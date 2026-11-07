import { describe, expect, it } from 'vitest';
import { advanceStory, chainDone, currentStep, matchStory, newCareerState, openChains } from '../src/core/career';
import { storyGoal } from '../src/core/waymarks';
import { checkContent } from '../src/core/content';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The Highlands, The City and Capital intros and their coaches' storylines (Boss, 4 Nov 2026: "ok can you
// now do the same for are 6 and 7", after Forest Town and Western Works, then "Can you now do the same for
// the last Area, Area 8"). Each intro walks the rider round the
// town: Manny's news, Paul's parts order to Lee, the area's works and one pass there on the new machines,
// a round of the area's fitness, the coach, then the Local Champion opens the tracks. Then the coach's own
// chain: lessons at the practice track, their story, and a part from their racing days. The Hill practice
// track has one drill, so Fraser's two lessons are both Repetition laps, with the story between them.
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
  { n: 6, town: 'area6-highlands', intro: 'area6', coach: 'fraser', key: 'fd', coachName: 'Fraser Dunn', sprite: 'npc-27-hill-coach',
    gym: 'npc-26-cycling-coach', job: 'job.a6.works', start: 'shaft_lathe', fitness: ['train.cycling', 'Hill cycling club'],
    yard: 'Hill practice track', chain: [['fd_reps', 'train.repetition_laps'], ['fd_story'], ['fd_wind', 'train.repetition_laps'], ['fd_gift']],
    gift: { slot: 'drivetrain', grade: 6 }, done: 'fraser.done', story: 'James' },
  { n: 7, town: 'area7-the-city', intro: 'area7', coach: 'remi', key: 'rc', coachName: 'Remi Castell', sprite: 'npc-29-arena-coach',
    gym: 'npc-28-sensei', job: 'job.a7.intake_exhaust', start: 'pipe_bender', fitness: ['train.dojo', 'City dojo'],
    yard: 'Indoor arena practice', chain: [['rc_rhythm', 'train.sx_rhythm'], ['rc_launch', 'train.drag_launch'], ['rc_story'], ['rc_gift']],
    gift: { slot: 'forks', grade: 7 }, done: 'remi.done', story: 'Harvey' },
  // Area 8, Capital (Boss, 4 Nov 2026: "Can you now do the same for the last Area, Area 8").
  { n: 8, town: 'area8-capital', intro: 'area8', coach: 'morgan', key: 'mh', coachName: 'Morgan Hale', sprite: 'npc-31-national-coach',
    gym: 'npc-30-recovery-coach', job: 'job.a8.works', start: 'cnc_mill', fitness: ['train.ice_bath', 'Recovery centre'],
    yard: 'National training ground', chain: [['mh_jumps', 'train.pro_jump_timing'], ['mh_gate', 'train.pro_gate'], ['mh_story'], ['mh_gift']],
    gift: { slot: 'frame', grade: 8 }, done: 'morgan.done', story: 'Neal' },
] as const;

for (const A of AREAS) {
  describe(`Area ${A.n} intro and ${A.coachName}'s storyline (Boss, 4 Nov 2026)`, () => {
    const start = () => {
      const c = career();
      const flags: Record<string, boolean> = { [`area.${A.n}.open`]: true, tutorial_done: true };
      openChains(story, c, flags);
      return { c, flags };
    };

    it(`${A.coachName} coaches at the practice track, and the fitness coach has a sprite of their own`, () => {
      expect(content.npcs.find((n) => n.id === `npc.a${A.n}.yard_coach`)).toMatchObject({ name: A.coachName, sprite: A.sprite, map: A.town });
      expect(content.npcs.find((n) => n.id === `npc.a${A.n}.gym_coach`)).toMatchObject({ sprite: A.gym, map: A.town });
    });

    it('the intro shows the town and its facilities, then the coach takes over once the tracks are open', () => {
      const { c, flags } = start();
      for (const id of ['news', 'shops', 'errand', 'works']) play(c, flags, `a${A.n}_${id}`);
      const pass = play(c, flags, `a${A.n}_works_pass`);
      expect(pass.on).toEqual({ use: 'job.shift', map: `int-a${A.n}-tool-shop` });
      const job = content.world.jobs.find((j) => j.id === A.job)!;
      expect(job.start).toBe(A.start);
      // Every station of the shift is a machine in the new inside, and the start is the shift's object.
      const inside = maps.get(`int-a${A.n}-tool-shop`)!;
      for (const s of job.stations) expect(inside.objects.some((o) => o.type === 'interact' && o.name === s.object), s.object).toBe(true);
      expect(inside.objects.find((o) => o.name === A.start)?.props.action).toBe('job.shift');
      // The gym coach runs it, so the marker is on them, not a hidden spot by the door (Boss, 4 Nov 2026).
      expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: A.town, npc: `npc.a${A.n}.gym_coach` });
      const fit = play(c, flags, `a${A.n}_fitness`);
      expect(fit.on.use).toBe(A.fitness[0]);
      play(c, flags, `a${A.n}_training`);
      play(c, flags, `a${A.n}_champion`);
      expect(flags[`area${A.n}.intro_done`]).toBe(true);
      expect(currentStep(story, c)!.id).toBe(A.chain[0][0]);
    });

    it("the coach's lessons are rounds at the practice track, the markers point there, then the story and a gift", () => {
      const { c, flags } = start();
      for (const s of story.chains!.find((x) => x.id === A.intro)!.steps) play(c, flags, s.id);
      const bag = c.bag.length;
      for (const [id, use] of A.chain) {
        const step = currentStep(story, c)!;
        if (use) {
          expect(step.on.use).toBe(use);
          // The coach runs the lesson, so the marker is on them (Boss, 4 Nov 2026).
          expect(storyGoal(content, maps, c)).toMatchObject({ kind: 'npc', map: A.town, npc: `npc.a${A.n}.yard_coach` });
          // The area's fitness is not the lesson.
          expect(matchStory(story, c, { use: A.fitness[0], map: A.town, object: 'x' })).toBeNull();
        } else {
          expect(step.on.talk).toBe(`npc.a${A.n}.yard_coach`);
        }
        play(c, flags, id);
      }
      expect(content.dialogue[`story.${A.key}.story`].lines.map((l) => l.text).join(' ')).toContain(A.story);
      expect(c.bag.length).toBe(bag + 1);
      expect(c.bag.at(-1)!.part).toMatchObject(A.gift);
      expect(flags[A.done]).toBe(true);
      expect(chainDone(story, c, A.coach)).toBe(true);
    });
  });
}
