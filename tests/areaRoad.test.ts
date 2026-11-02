import { describe, expect, it } from 'vitest';
import { areaFlag, roadFlag, roadWaiting } from '../src/core/areas';
import { afterTask } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { storyGoals } from '../src/core/waymarks';
import { newCareerState } from '../src/core/career';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;

/** The NPC's line set for these flags, as WorldScene.talkRule picks it. */
const rule = (id: string, f: Record<string, boolean>) =>
  content.npcs.find((n) => n.id === id)!.talk?.find((t) => (t.if === undefined || f[t.if]) && (t.unless === undefined || !f[t.unless]));

describe('the road to the next area: Joseph, Bill, then Manny (Boss, 2 Nov 2026)', () => {
  const towns = content.areas.areas;
  for (let n = 1; n <= 7; n++) {
    it(`Area ${n} champion: Joseph at every venue, Bill, then Manny in ${towns[n - 1].name} opens Area ${n + 1}`, () => {
      // Everything before: the opening tasks, and each earlier area opened, won and its bike collected.
      const f: Record<string, boolean> = { tutorial_done: true, 'told.bike_care': true, 'told.iz_challenge': true, first_race_done: true, first_race_finished: true, [roadFlag(n + 1, 'won')]: true };
      for (let a = 1; a <= n; a++) {
        Object.assign(f, { [`badge.area${a}`]: true, [`trophy.area${a}.main`]: true });
        if (a > 1) f[areaFlag(a)] = true;
        if (a < n) f[`class.${content.championships.championships.find((c) => c.id === `area${a}.main`)!.milestone}`] = true;
      }
      // Joseph holds the rider at the track, at each venue.
      expect(roadWaiting(f)).toBe(n + 1);
      for (const j of ['npc.track_official', 'npc.track_official_riverside', 'npc.track_official_longmoor']) {
        expect(rule(j, f)?.sets, j).toBe(roadFlag(n + 1, 'told'));
      }
      expect(afterTask(content.story, f)?.talk).toBe('npc.track_official');
      f[roadFlag(n + 1, 'told')] = true;
      expect(roadWaiting(f)).toBeNull();
      // Bill about the bike.
      expect(rule('npc.bike_shop_owner', f)?.sets).toBe(roadFlag(n + 1, 'bill'));
      expect(afterTask(content.story, f)?.talk).toBe('npc.bike_shop_owner');
      f[roadFlag(n + 1, 'bill')] = true;
      // Manny in the town just won opens the road.
      const manny = content.npcs.find((x) => x.name === 'Manny Festo' && x.map === towns[n - 1].map)!;
      expect(rule(manny.id, f)?.sets).toBe(areaFlag(n + 1));
      expect(afterTask(content.story, f)?.talk).toBe(manny.id);
      f[areaFlag(n + 1)] = true;
      expect(rule(manny.id, f)?.sets).toBeUndefined();
      expect(rule('npc.bike_shop_owner', f)?.sets).toBeUndefined();
    });
  }

  it("points at the Joseph on the venue you're at, not another venue's", () => {
    const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    c.story = { step: content.story.steps.length, used: [] };
    const f = { tutorial_done: true, first_race_done: true, first_race_finished: true, 'badge.area1': true, 'trophy.area1.main': true, [roadFlag(2, 'won')]: true, 'told.bike_care': true, 'told.iz_challenge': true };
    expect(storyGoals(content, maps, c, f, null, 'venue-supercross')).toMatchObject([{ kind: 'npc', map: 'venue-supercross', npc: 'npc.track_official_riverside' }]);
    expect(storyGoals(content, maps, c, f, null, 'venue-enduro')).toMatchObject([{ map: 'venue-enduro' }]);
    expect(storyGoals(content, maps, c, f)).toMatchObject([{ map: 'venue-motocross' }]);
  });
});
