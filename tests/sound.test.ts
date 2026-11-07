import { describe, expect, it } from 'vitest';
import type { BakedMap } from '../src/core/mapTypes';
import { DEFAULT_SETTINGS, SettingsStore } from '../src/core/settings';
import { ambienceFor, engineForClass, engineNote, footingAt, mixGains, packLevel, raceCues, rainFor, type SoundRider } from '../src/core/sound';
import { MemoryStore } from '../src/core/storage';

// The rules behind the game's sound (Boss, 7 Nov 2026: the demo page's sounds all went in).

const rider = (id: string, dist: number, more: Partial<SoundRider> = {}): SoundRider => ({ id, dist, air: 0, speed: 10, ...more });

describe('sound mix', () => {
  it('silences everything on Mute all and nothing at full volume', () => {
    const on = mixGains({ ...DEFAULT_SETTINGS.audio, master: 100, music: 100 });
    expect(on.master).toBeGreaterThan(1);
    expect(on.music).toBeGreaterThan(1);
    expect(mixGains({ ...DEFAULT_SETTINGS.audio, muted: true }).master).toBe(0);
    expect(mixGains({ ...DEFAULT_SETTINGS.audio, effects: 0 }).effects).toBe(0);
  });

  it('gives a slider at half way a quarter of the full gain', () => {
    const half = mixGains({ ...DEFAULT_SETTINGS.audio, crowd: 50 }).crowd;
    const full = mixGains({ ...DEFAULT_SETTINGS.audio, crowd: 100 }).crowd;
    expect(half / full).toBeCloseTo(0.25);
  });

  it('adds the Effects slider to settings saved before it existed', () => {
    const store = new MemoryStore();
    store.set('settings', JSON.stringify({ audio: { master: 40, music: 10, engines: 20, crowd: 30, muted: false } }));
    const s = new SettingsStore(store).get();
    expect(s.audio.effects).toBe(DEFAULT_SETTINGS.audio.effects);
    expect(s.audio.music).toBe(10);
  });
});

describe('engines', () => {
  it('rides each class on its own engine', () => {
    expect(engineForClass('50cc')).toBe('50cc');
    expect(engineForClass('85cc-big')).toBe('85cc');
    expect(engineForClass('125cc-youth')).toBe('125cc');
    expect(engineForClass('250f')).toBe('250f');
    expect(engineForClass('450f')).toBe('450f');
    expect(engineForClass('sidecar')).toBe('sidecar');
    expect(engineForClass(undefined)).toBe('250f');
  });

  it('climbs through each gear and drops at the change', () => {
    const top1 = engineNote(6.9, 2, false, false).rpm;
    const start2 = engineNote(7.1, 2, false, false).rpm;
    expect(top1).toBeGreaterThan(start2);
    expect(engineNote(12.9, 2, false, false).rpm).toBeGreaterThan(start2);
    expect(engineNote(10, 2, false, false).throttle).toBe(1);
    expect(engineNote(10, -3, false, false).throttle).toBeLessThan(0.5);
  });

  it('flares in the air and idles when down', () => {
    expect(engineNote(15, 0, true, false).rpm).toBeGreaterThan(engineNote(15, 0, false, false).rpm);
    expect(engineNote(15, 0, false, true)).toEqual({ rpm: 0.05, throttle: 0 });
    expect(engineNote(0, 0, false, false).throttle).toBe(0);
  });
});

describe('race cues', () => {
  it('turns the board at 5 and 3 seconds to go and drops the gate at 0', () => {
    const rs = [rider('p', 0)];
    expect(raceCues(new Map(), rs, -5.1, -4.9, 'p', true)).toEqual([{ kind: 'board' }]);
    expect(raceCues(new Map(), rs, -3.05, -2.95, 'p', true)).toEqual([{ kind: 'board' }]);
    expect(raceCues(new Map(), rs, -0.02, 0.01, 'p', true)).toEqual([{ kind: 'gateDrop' }]);
    expect(raceCues(new Map(), rs, -0.02, 0.01, 'p', false)).toEqual([]);
  });

  it('hears landings and crashes near the camera rider only', () => {
    const prev = new Map([rider('p', 1.5, { air: 2 }), rider('far', 1.9, { air: 2 }), rider('c', 1.51)].map((r) => [r.id, r]));
    const now = [rider('p', 1.5), rider('far', 1.9), rider('c', 1.51, { down: { t: 0.1, lost: 6 } })];
    const cues = raceCues(prev, now, 30, 30.02, 'p', true);
    expect(cues.map((c) => c.kind).sort()).toEqual(['crash', 'landing']);
    expect(cues.find((c) => c.kind === 'crash')).toMatchObject({ big: true });
    // The same crash next frame isn't heard again.
    const again = raceCues(new Map(now.map((r) => [r.id, r])), [rider('p', 1.5), rider('far', 1.9), rider('c', 1.51, { down: { t: 0.12, lost: 6 } })], 30.02, 30.04, 'p', true);
    expect(again).toEqual([]);
  });

  it('is loud in the pack and quiet alone', () => {
    const pack = [rider('p', 2), rider('a', 2.005), rider('b', 1.99), rider('c', 2.01), rider('d', 1.995)];
    expect(packLevel(pack, 'p')).toBeGreaterThan(0.6);
    expect(packLevel([rider('p', 2), rider('a', 2.5)], 'p')).toBe(0);
  });
});

describe('the world', () => {
  const map = (kind: BakedMap['kind'], id: string, images: string[], cells: number[]): BakedMap =>
    ({ id, title: id, kind, width: cells.length, height: 1, tileSize: 32, props: {}, images, ground: [{ name: 'Ground', cells }], sprites: [], blocked: ['.'.repeat(cells.length)], edgeWalls: [], objects: [] }) as BakedMap;

  it('walks on what the ground art shows', () => {
    const m = map('area', 'area1-home-town', ['tiles/terrain-common/grass-plain-1.png', 'tiles/roads/street-00000001.png', 'tiles/ground-edges/gravel-1.png', 'tiles/beach/boardwalk-v.png'], [0, 1, 2, 3, -1]);
    expect([0, 1, 2, 3, 4].map((x) => footingAt(m, { x, y: 0 }))).toEqual(['grass', 'hard', 'gravel', 'wood', 'grass']);
    expect(footingAt(map('interior', 'int-a2-rented-room', [], [-1]), { x: 0, y: 0 })).toBe('wood');
    expect(footingAt(map('interior', 'int-a2-local-garage', [], [-1]), { x: 0, y: 0 })).toBe('hard');
  });

  it('plays each place its own background, and none indoors', () => {
    expect(ambienceFor({ id: 'area1-home-town', kind: 'area' })).toBe('town');
    expect(ambienceFor({ id: 'area1-industrial-zone', kind: 'area' })).toBe('industrial');
    expect(ambienceFor({ id: 'area3-beach-town', kind: 'area' })).toBe('beach');
    expect(ambienceFor({ id: 'area6-highlands', kind: 'area' })).toBe('countryside');
    expect(ambienceFor({ id: 'area7-the-city', kind: 'area' })).toBe('city');
    expect(ambienceFor({ id: 'int-a2-bike-shop', kind: 'interior' })).toBeNull();
  });

  it('rains for the wet weathers', () => {
    expect(rainFor('light_rain')).toBe('rainLight');
    expect(rainFor('heavy_rain')).toBe('rainHeavy');
    expect(rainFor('dry')).toBeNull();
    expect(rainFor(undefined)).toBeNull();
  });
});
