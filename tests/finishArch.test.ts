import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { archPlace, archSpan, footprints } from '../src/core/trackClearance';
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
      expect(inner - w * LIP_AT).toBeLessThan(1);
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
