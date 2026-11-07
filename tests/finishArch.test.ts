import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { archPlace, archSpan, footprints, sceneryIssues } from '../src/core/trackClearance';
import { FLAGGER_ITEM, sxArch, towerFlagman } from '../src/core/finishCrew';
import { ARCH_GAP, ARCH_MODELS, limitsFor, modelRole } from '../src/core/modModels';
import { LIP_AT } from '../src/core/trackSurface';
import { DEFAULT_TRACK_WIDTH, type TrackPartsData } from '../src/core/trackParts';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The finish arch spans the track's width and stands on the finish line (Boss, 28 Oct 2026).
const raw = rawContent();
const content = checkContent(raw, loadManifest(), loadMaps()).content!;
const parts = raw.trackParts as TrackPartsData;

describe('finish arch', () => {
  it('spans the track: its posts stand just outside the lips, whatever width the item was saved with', () => {
    for (const w of [2.6, 3.0, 3.4]) {
      const inner = archSpan(w) - 1.0;
      expect(inner).toBeGreaterThan(w * LIP_AT);
      expect(inner - w * LIP_AT).toBeLessThan(2);
    }
    const farmland = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    const arch = footprints(parts, farmland).find((f) => f.type === 'finish_arch')!;
    expect(arch.w).toBeCloseTo(archSpan(farmland.width ?? DEFAULT_TRACK_WIDTH), 9);
  });

  it('stands on the finish line, square to the track, on every track that has one', () => {
    for (const t of content.tracks.tracks) {
      for (const it of (t.scenery ?? []).filter((s) => s.type === 'finish_arch')) {
        const at = archPlace(t)!;
        expect([it.x, it.y]).toEqual([at.x, at.y]);
        expect(((it.rot ?? 0) - at.rot + 360) % 180).toBe(0);
        expect(it.w).toBeUndefined();
      }
    }
  });
});

// The supercross finish (Boss, 1 Nov 2026): a finish-line jump at a supercross kind of track is the
// stadium gantry, with the flag man up in its scaffold tower, so no other flag man can be placed.
describe('supercross finish arch', () => {
  const sx = content.tracks.tracks.find((t) => t.kind === 'stadium' && (t.scenery ?? []).some((s) => s.type === 'flagger'))!;
  const jump = { ...sx, sections: sx.sections.map((s, i) => (i === 0 ? { ...s, type: 'tabletop', finish: true as const } : s)) };

  it('is built at supercross, EnduroCross and No-Turn tracks, only with a finish-line jump', () => {
    expect(sxArch(sx)).toBe(false);
    expect(sxArch(jump)).toBe(true);
    expect(towerFlagman(jump)).toBe(true);
    expect(sxArch({ kind: 'outdoor', sections: jump.sections })).toBe(false);
    expect(sxArch({ kind: 'no_turn', sections: jump.sections })).toBe(true);
  });

  it('refuses a placed flag man there, and only there', () => {
    const flaggerErrors = (t: typeof sx) => sceneryIssues(parts, t).filter((p) => p.level === 'error' && t.scenery![p.i].type === FLAGGER_ITEM);
    expect(flaggerErrors(sx)).toEqual([]);
    expect(flaggerErrors(jump).length).toBe((sx.scenery ?? []).filter((s) => s.type === FLAGGER_ITEM).length);
    expect(flaggerErrors(jump)[0].message).toMatch(/own flag man up in its tower/);
  });

  it('takes Boss\'s arch models by name, with their own limits', () => {
    expect(modelRole(ARCH_MODELS.sx, parts.scenery)).toBe('arch');
    expect(modelRole(ARCH_MODELS.mx, parts.scenery)).toBe('arch');
    expect(limitsFor('arch').long).toBeGreaterThanOrEqual(ARCH_GAP + 4);
  });
});
