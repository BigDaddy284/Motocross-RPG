import { describe, expect, it } from 'vitest';
import { areaFlag, lastReleasedArea, openReleasedAreas } from '../src/core/areas';
import { newCareerState, type CareerState } from '../src/core/career';
import { champById, enter, finishChampionship } from '../src/core/championship';
import { checkContent } from '../src/core/content';
import { PLAYER_ID } from '../src/core/raceDay';
import { loadManifest, loadMaps, rawContent } from './helpers';

// v1.5 releases Areas 1 and 2 only (Boss, 1 Nov 2026: "stops Area progress at Area 2. The player can
// win all the champs but Manny says Area 3 coming Feb 2027… so we can release Areas 1 at a time").
const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const points = content.racing.points;
const area2 = champById(content.championships, 'area2.main')!;

function winArea2(career: CareerState, flags: Record<string, boolean>, lastArea: number) {
  const active = enter(career, content, area2, 1);
  for (const v of area2.rounds) {
    const m: Record<string, number | null> = { [PLAYER_ID]: 1 };
    active.field.forEach((id, i) => (m[id] = i + 2));
    active.rounds.push({ venue: v, qualifying: [], motos: [m, m] });
  }
  return finishChampionship(career, flags, area2, points, lastArea);
}

describe('area release cap (Boss, 1 Nov 2026)', () => {
  it('releases Areas 1 and 2 in this build', () => {
    expect(lastReleasedArea(content.areas)).toBe(2);
    expect(area2.opens).toBe(3);
  });

  it('winning the Area 2 Championship gives the trophy but does not open Area 3', () => {
    const career = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    const flags: Record<string, boolean> = {};
    const fin = winArea2(career, flags, lastReleasedArea(content.areas));
    expect(fin.position).toBe(1);
    expect(flags['trophy.area2.main']).toBe(true);
    expect(flags[areaFlag(3)]).toBeUndefined();
    // Loading again in this build opens nothing.
    expect(openReleasedAreas(content.areas, content.championships, career, flags)).toEqual([]);
    // A later build that releases Area 3 starts its road from the win already made: Joseph, Bill and Manny open it.
    expect(openReleasedAreas({ ...content.areas, release: { lastArea: 3 } }, content.championships, career, flags)).toEqual([3]);
    expect(flags['road.3.won']).toBe(true);
    expect(flags[areaFlag(3)]).toBeUndefined();
    expect(openReleasedAreas({ ...content.areas, release: { lastArea: 3 } }, content.championships, career, flags)).toEqual([]);
  });

  it("has Manny tell you Area 3 is coming in February 2027 once Area 2 is won, in Mountain Town (he has left Home Town by then: Boss, 4 Nov 2026)", () => {
    expect(content.npcs.find((n) => n.id === 'npc.news')!.hideIf).toBe('area.2.open');
    for (const id of ['npc.a2.news']) {
      const npc = content.npcs.find((n) => n.id === id)!;
      expect(npc.talk?.find((t) => t.if === 'trophy.area2.main')?.dialogue, id).toBe('news.area3_feb2027');
    }
    expect(content.dialogue['news.area3_feb2027'].lines.map((l) => l.text).join(' ')).toContain('February 2027');
  });

  it('has Manny in Home Town say the Area 2 road opens by the time you win the Sprocket Cup, not December (Boss, 4 Nov 2026: championship names in all dialogue)', () => {
    const npc = content.npcs.find((n) => n.id === 'npc.news')!;
    expect(npc.dialogue).toBe('news.area2_soon');
    const text = content.dialogue['news.area2_soon'].lines.map((l) => l.text).join(' ');
    expect(text).toContain('the Sprocket Cup');
    expect(text).not.toMatch(/December/);
  });
});
