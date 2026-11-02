import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_HEIGHTS } from '../src/core/jumps';
import { LOG_DIRT, PIPE_MUD, sectionShape, STACK_AT, TYRE_MUD, TYRE_ROWS } from '../src/core/trackSurface';

// Endurocross obstacles (Boss, 1 Nov 2026): a concrete pipe, a tyre bed, a tyre wall and a log
// stack, in the Enduro group beside the rocks, roots and logs.
const NEW = ['pipe', 'tyre_bed', 'tyre_wall', 'log_stack'];
const racing = JSON.parse(readFileSync('public/data/racing.json', 'utf8'));
const setup = JSON.parse(readFileSync('public/data/setup.json', 'utf8'));
const modifiers = JSON.parse(readFileSync('public/data/modifiers.json', 'utf8'));
const editor = readFileSync('tools/track-editor.html', 'utf8');

const peak = (type: string) => Math.max(...Array.from({ length: 401 }, (_, i) => sectionShape(type, i / 400)));

describe('endurocross obstacles', () => {
  it('are sections the simulation, the setup sliders, the modifiers and the editor all know', () => {
    for (const t of NEW) {
      expect(racing.sections[t], t).toBeDefined();
      expect(setup.sectionKinds[t], t).toBe('whoops');
      expect(modifiers.sections.rough, t).toContain(t);
      expect(DEFAULT_HEIGHTS[t], t).toBeGreaterThan(0);
      expect(editor, t).toContain(`'${t}'`);
    }
  });

  it('rise and fall within their section, the obstacle at the full height and the mud lower', () => {
    for (const t of NEW) {
      expect(sectionShape(t, 0), t).toBe(0);
      expect(sectionShape(t, 1), t).toBe(0);
    }
    expect(peak('pipe')).toBeCloseTo(1, 2);
    expect(sectionShape('pipe', 0.5 + 0.14)).toBeLessThan(PIPE_MUD);
    expect(sectionShape('pipe', 0.5 + 0.14)).toBeGreaterThan(0.2);
    for (const at of TYRE_ROWS) expect(sectionShape('tyre_wall', at)).toBeCloseTo(1, 2);
    expect(sectionShape('tyre_wall', 0.5)).toBe(0);
    expect(sectionShape('tyre_wall', TYRE_ROWS[0] + 0.1)).toBeLessThan(TYRE_MUD);
    for (const at of STACK_AT) expect(sectionShape('log_stack', at)).toBeCloseTo(0.7, 2);
    expect(sectionShape('log_stack', 0.5)).toBe(0);
    expect(peak('tyre_bed')).toBeCloseTo(1, 2);
    // Logs now stand proud of the dirt packed against them.
    expect(peak('logs')).toBeCloseTo(LOG_DIRT, 2);
    expect(peak('log_step')).toBeCloseTo(LOG_DIRT, 2);
  });
});
