import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { careerRecords, challengeRuns, challengeWins, recordText, venueDays, venueWins } from '../src/core/records';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;

describe('records (Boss, 28 Oct 2026)', () => {
  it('shows wins out of attempts for tracks, championships and challenges, and nothing not yet tried', () => {
    const c = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    expect(careerRecords(content, c)).toEqual([]);
    c.counters[venueDays('venue-riverside')] = 26;
    c.counters[venueWins('venue-riverside')] = 3;
    c.counters[challengeRuns('home')] = 4;
    c.counters[challengeWins('home')] = 1;
    c.champs = { active: {}, done: { 'area1.local_champion': { runs: 35, wins: 35, best: 1 } } };
    const groups = careerRecords(content, c);
    expect(groups.map((g) => g.title)).toEqual(['Race days', 'Championships', 'Challenges']);
    expect(recordText(groups[0].lines[0])).toBe('Riverside Arena: wins 3/26');
    expect(groups[1].lines[0]).toMatchObject({ wins: 35, attempts: 35 });
    expect(recordText(groups[2].lines[0])).toBe("Mickey's challenge: wins 1/4");
  });
});
