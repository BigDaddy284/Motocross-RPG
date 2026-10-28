import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { Travel } from '../src/core/travel';
import { goalObjects, nextHop, storyGoal } from '../src/core/waymarks';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const content = checkContent(rawContent(), loadManifest(), maps).content!;
const travel = new Travel(maps, content.world.locks);
const hop = (from: string, to: string, flags: Record<string, boolean> = {}) => nextHop(maps, content.world, travel, flags, from, to);

describe('tutorial markers (Boss, 28 Oct 2026)', () => {
  it('marks the NPC or equipment of every step, and there is a way to it from Home Town', () => {
    const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    // Flags as the chain sets them, so a step behind a story lock is still reachable once it's open.
    const flags: Record<string, boolean> = {};
    content.story.steps.forEach((step, i) => {
      c.story = { step: i, used: [] };
      const goal = storyGoal(content, maps, c);
      expect(goal, step.id).not.toBeNull();
      const map = maps.get(goal!.map)!;
      if (goal!.kind === 'object') expect(goalObjects(map, goal!.action, []).length, step.id).toBeGreaterThan(0);
      else expect(goal!.npc).toBe(step.on.talk);
      if (goal!.map !== 'area1-home-town') expect(hop('area1-home-town', goal!.map, flags), step.id).not.toBeNull();
      for (const f of step.effects?.flags ?? []) flags[f] = true;
    });
    c.story = { step: content.story.steps.length, used: [] };
    expect(storyGoal(content, maps, c)).toBeNull();
  });

  it('points at the building door, the way out of a building, or the road to another area', () => {
    const garage = hop('area1-home-town', 'int-home-local-garage')!;
    expect(garage.kind).toBe('door');
    expect(new Set(garage.via.map((o) => o.name))).toEqual(new Set(['Local garage']));
    expect(garage.via.length).toBeGreaterThan(1);

    const out = hop('int-home-local-garage', 'int-home-bike-shop')!;
    expect(out).toMatchObject({ kind: 'exit', to: 'area1-home-town' });

    const iz = hop('area1-home-town', 'int-iz-engine-rebuilder')!;
    expect(iz).toMatchObject({ kind: 'exit', to: 'area1-industrial-zone' });
    expect(iz.via[0].name).toBe('To the Industrial Zone');
    expect(hop('int-iz-engine-rebuilder', 'int-home-local-garage')).toMatchObject({ kind: 'exit', to: 'area1-industrial-zone' });
  });

  it("doesn't send the rider down a road that is still shut", () => {
    expect(hop('area1-home-town', 'area1-venue-farmland')).toBeNull();
    expect(hop('area1-home-town', 'area1-venue-farmland', { van_loaded: true })).toMatchObject({ kind: 'exit', to: 'area1-venue-farmland' });
  });

  it('marks only the stands still to do on a step that needs two', () => {
    const map = maps.get('int-home-local-garage')!;
    const both = goalObjects(map, 'workshop.bike', []);
    expect(both).toHaveLength(2);
    const o = both[0];
    expect(goalObjects(map, 'workshop.bike', [`${map.id}:${o.name}:${o.x},${o.y}`])).toEqual([both[1]]);
  });
});
