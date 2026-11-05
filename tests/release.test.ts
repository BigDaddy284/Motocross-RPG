import { describe, expect, it } from 'vitest';
import { AREA_COUNT, areaFlag, lastReleasedArea, openReleasedAreas, roadFlag } from '../src/core/areas';
import { newCareerState, type CareerState } from '../src/core/career';
import { champById, enter, finishChampionship } from '../src/core/championship';
import { checkContent } from '../src/core/content';
import { PLAYER_ID } from '../src/core/raceDay';
import { loadManifest, loadMaps, rawContent } from './helpers';

// v1.5 released Areas 1 and 2 only (Boss, 1 Nov 2026). v2.0 lifts the cap (Boss, 5 Nov 2026: "remove any
// message stating coming **** and tie it back to the relevant champs ... nothing is release locked anymore,
// just champs locked as intended").
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

const allText = () => [
  ...Object.values(content.dialogue).flatMap((d) => d.lines.map((l) => l.text)),
  ...JSON.stringify(content.story).match(/"text":"[^"]*"/g)!,
];

describe('no release cap in v2.0 (Boss, 5 Nov 2026)', () => {
  it('releases every area', () => {
    expect(content.areas.release).toBeUndefined();
    expect(lastReleasedArea(content.areas)).toBe(AREA_COUNT);
  });

  it('winning the Chain Cup starts the road to Beach Town', () => {
    const career = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    const flags: Record<string, boolean> = {};
    expect(winArea2(career, flags, lastReleasedArea(content.areas)).position).toBe(1);
    expect(flags['trophy.area2.main']).toBe(true);
    expect(flags[roadFlag(3, 'won')]).toBe(true);
    expect(flags[areaFlag(3)]).toBeUndefined();
  });

  it('a save that won the Chain Cup under the v1.5 cap gets its road to Beach Town when it loads', () => {
    const career = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    const flags: Record<string, boolean> = {};
    winArea2(career, flags, 2);
    expect(flags[roadFlag(3, 'won')]).toBeUndefined();
    expect(openReleasedAreas(content.areas, content.championships, career, flags)).toEqual([3]);
    expect(flags[roadFlag(3, 'won')]).toBe(true);
  });

  it('has no "coming in December / February" or "being built" lines left', () => {
    expect(allText().filter((t) => /\b(20\d\d|under construction|being built|coming soon|later build)\b/i.test(t))).toEqual([]);
  });

  it('has Manny in Home Town tie the road to Mountain Town to the Sprocket Cup', () => {
    const npc = content.npcs.find((n) => n.id === 'npc.news')!;
    expect(npc.dialogue).toBe('news.area2_soon');
    expect(content.dialogue['news.area2_soon'].lines.map((l) => l.text).join(' ')).toContain('until you win the Sprocket Cup');
  });
});
