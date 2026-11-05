import { describe, expect, it } from 'vitest';
import { WEATHER_LOOKS, weatherLook, wetShade } from '../src/core/weatherLook';
import { playerEntrant, RaceDay } from '../src/core/raceDay';
import { content } from './raceHelpers';
import { newCareerState } from '../src/core/career';

// The weather on the race screen (Boss, 5 Nov 2026): the light, rain, wet ground and puddles.
describe('how the weather looks', () => {
  it('has a look for every weather kind in racing.json, and a dry day for anything else', () => {
    for (const kind of Object.keys(content.racing.weather ?? {})) expect(WEATHER_LOOKS[kind], kind).toBeDefined();
    expect(weatherLook(undefined)).toBe(WEATHER_LOOKS.dry);
    expect(weatherLook('snow')).toBe(WEATHER_LOOKS.dry);
  });

  it('gets darker and wetter from dry to heavy rain, with rain only when it rains', () => {
    const order = ['dry', 'overcast', 'light_rain', 'heavy_rain'].map(weatherLook);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].sun).toBeLessThan(order[i - 1].sun);
      expect(order[i].wet).toBeGreaterThanOrEqual(order[i - 1].wet);
      expect(order[i].drops).toBeGreaterThanOrEqual(order[i - 1].drops);
    }
    expect(weatherLook('dry').drops + weatherLook('overcast').drops).toBe(0);
    expect(weatherLook('heavy_rain').drops).toBeGreaterThan(weatherLook('light_rain').drops);
  });

  it('darkens wet ground and leaves dry ground alone', () => {
    expect(wetShade(0xb07a45, 0)).toBe(0xb07a45);
    const wet = wetShade(0xb07a45, 1);
    expect((wet >> 16) & 255).toBeLessThan(0xb0);
    expect((wet >> 8) & 255).toBeLessThan(0x7a);
  });
});

describe('a set weather (the test ride, ?weather=)', () => {
  const career = newCareerState(content.bikes, content.story, content.bikes.brands[0].id);
  const venue = { id: 'test', name: 'Test', map: 'venue-motocross', track: 'farmland', class: '50cc', field: 'area1.local' };
  it('races in the weather it is given, and rolls it when none is', () => {
    for (const w of ['overcast', 'heavy_rain']) expect(new RaceDay(content, { ...venue, weather: w }, playerEntrant(content, career, 'Tester', 0, {}), 1, 0).weather).toBe(w);
    expect(new RaceDay(content, venue, playerEntrant(content, career, 'Tester', 0, {}), 1, 0).weather).toBe('dry');
    expect(new RaceDay(content, { ...venue, weather: 'snow' }, playerEntrant(content, career, 'Tester', 0, {}), 1, 0).weather).toBe('dry');
  });
});
