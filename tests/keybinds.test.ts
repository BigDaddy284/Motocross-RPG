import { describe, expect, it } from 'vitest';
import { CONTROL_ACTIONS, actionFor, cleanControls, keyName, rebind } from '../src/core/keybinds';
import { DEFAULT_SETTINGS, SettingsStore } from '../src/core/settings';
import { MemoryStore } from '../src/core/storage';

// Rebinding keys in Settings > Controls (Boss, 5 Nov 2026: "Build it").
const d = DEFAULT_SETTINGS.controls;

describe('key rebinding', () => {
  it('lists every action once, each with a default key of its own', () => {
    expect(CONTROL_ACTIONS.map((a) => a.id).sort()).toEqual(Object.keys(d).sort());
    expect(new Set(Object.values(d)).size).toBe(Object.keys(d).length);
  });

  it('names keys from browser codes', () => {
    expect(keyName('KeyW')).toBe('W');
    expect(keyName('Digit3')).toBe('THREE');
    expect(keyName('Escape')).toBe('ESC');
    expect(keyName('F13')).toBeNull();
  });

  it('gives an action a new key, swapping with the action that had it', () => {
    const r = rebind(d, 'interact', 'F');
    expect(r).toMatchObject({ ok: true, controls: { ...d, interact: 'F' } });
    const s = rebind(d, 'interact', 'B');
    expect(s).toMatchObject({ ok: true, swapped: 'bag', controls: { interact: 'B', bag: 'E' } });
  });

  it('keeps the fixed keys to themselves', () => {
    expect(rebind(d, 'up', 'SPACE').ok).toBe(false);
    expect(rebind(d, 'up', 'UP').ok).toBe(false);
  });

  it('maps a press to its action, with the arrows, Space, Enter, Tab and I as extras', () => {
    const c = { ...d, up: 'Z' };
    expect(actionFor(c, 'Z')).toBe('up');
    expect(actionFor(c, 'UP')).toBe('up');
    expect(actionFor(c, 'SPACE')).toBe('interact');
    expect(actionFor(c, 'ENTER')).toBe('advance');
    expect(actionFor(c, 'TAB')).toBe('bag');
    expect(actionFor(c, 'Q')).toBeNull();
  });

  it('saves with the settings and cleans a bad save back to the defaults', () => {
    const store = new MemoryStore();
    const s = new SettingsStore(store);
    s.update('controls', 'interact', 'F');
    expect(new SettingsStore(store).get().controls.interact).toBe('F');
    store.set('settings', JSON.stringify({ controls: { interact: 'SPACE', up: 'E' } }));
    const c = new SettingsStore(store).get().controls;
    expect(c.interact).toBe('E');
    expect(new Set(Object.values(c)).size).toBe(Object.keys(c).length);
    expect(cleanControls({ ...d, up: 'NOPE' }, d)).toEqual(d);
  });
});
