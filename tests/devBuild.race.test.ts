import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { completeRaceDay, completeSxNight } from '../src/core/devBuild';
import { entryFee, playerEntrant, RaceDay } from '../src/core/raceDay';
import { SupercrossNight } from '../src/core/supercross';
import { content } from './raceHelpers';

// DEV ONLY, v2.1DevOnly (Boss, 5 Nov 2026): "Complete Race Day" wins every race of the day.

const venue = (id: string) => content.tracks.venues.find((v) => v.id === id)!;
const me = () => playerEntrant(content, newCareerState(content.bikes, content.story, content.bikes.brands[0].id), 'Test');

describe('v2.1DevOnly Complete Race Day', () => {
  it('runs every moto of a race day with the player first, then gives a 1st overall', () => {
    const v = venue('venue-farmland');
    const day = new RaceDay(content, v, me(), 9, entryFee(content, v, {}));
    completeRaceDay(day, 'steady', false);
    expect(day.done).toBe(true);
    for (const m of day.motos) expect(m.results[0].player).toBe(true);
    expect(day.dayResult().overall[0].player).toBe(true);
  });

  it('runs a Supercross night with the player winning their heat and the Main', () => {
    const v = venue('venue-riverside');
    const sx = new SupercrossNight(content, v, me(), 7, entryFee(content, v, {}));
    completeSxNight(sx, 'steady', false);
    expect(sx.done).toBe(true);
    expect(sx.main.results![0].player).toBe(true);
    expect(sx.playerWins).toBe(1);
  });
});
