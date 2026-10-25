import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore } from '../src/core/settings';
import { MemoryStore } from '../src/core/storage';

describe('SettingsStore', () => {
  it('applies and saves a change at once', () => {
    const store = new MemoryStore();
    const s = new SettingsStore(store);
    let seen = 0;
    s.onChange((v) => (seen = v.audio.music));
    s.update('audio', 'music', 25);
    expect(seen).toBe(25);
    expect(new SettingsStore(store).get().audio.music).toBe(25);
  });

  it('restores defaults', () => {
    const s = new SettingsStore(new MemoryStore());
    s.update('display', 'zoom', 150);
    s.restoreDefaults();
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills settings added in a later build with their defaults and ignores bad values', () => {
    const store = new MemoryStore();
    store.set('settings', JSON.stringify({ audio: { music: 10, master: 'loud' }, display: { zoom: 999 } }));
    const s = new SettingsStore(store).get();
    expect(s.audio.music).toBe(10);
    expect(s.audio.master).toBe(DEFAULT_SETTINGS.audio.master);
    expect(s.display.zoom).toBe(200);
    expect(s.gameplay).toEqual(DEFAULT_SETTINGS.gameplay);
  });

  it('keeps the zoom control choice, defaulting to the slider and ignoring unknown values', () => {
    const store = new MemoryStore();
    expect(new SettingsStore(store).get().display.zoomControl).toBe('slider');
    new SettingsStore(store).update('display', 'zoomControl', 'buttons');
    expect(new SettingsStore(store).get().display.zoomControl).toBe('buttons');
    store.set('settings', JSON.stringify({ display: { zoomControl: 'joystick' } }));
    expect(new SettingsStore(store).get().display.zoomControl).toBe('slider');
  });
});
