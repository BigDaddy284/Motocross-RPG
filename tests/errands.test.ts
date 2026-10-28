import { describe, expect, it } from 'vitest';
import { newCareerState, pence, type CareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { errandStage, errandState, finishErrand, lentPart, repairLent, takeErrand } from '../src/core/errands';
import { dumpSpare, fitSpare, repairQuote, resaleValue, sellSpare } from '../src/core/shops';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { shops, bikes } = content;
const scrapyard = content.errands.errands.find((e) => e.id === 'scrapyard.repair')!;
const garage = shops.shops.find((s) => s.repairs && s.fitFee !== undefined)!;
const partsShop = shops.shops.find((s) => s.sells)!;

function rider(): CareerState {
  const c = newCareerState(bikes, content.story, 'hondmoto', () => 0.5);
  c.money = pence(500);
  return c;
}

describe('scrapyard errands (Boss, 28 Oct 2026)', () => {
  it("lends a worn part, Grade 2 or better and never broken, tagged as the scrapyard owner's", () => {
    for (let s = 0; s < 20; s++) {
      const c = rider();
      const r = takeErrand(shops, bikes, c, scrapyard, () => (s + 0.5) / 20);
      expect(r.ok).toBe(true);
      const p = c.bag[lentPart(c, scrapyard.id)].part!;
      expect(p.grade).toBeGreaterThanOrEqual(2);
      expect(p.condition).toBeGreaterThan(0);
      expect(p.condition).toBeLessThan(1);
      expect(p.owner).toMatchObject({ errand: scrapyard.id, name: 'the scrapyard owner' });
      expect(repairQuote(shops, p.slot, p, p.class).ok).toBe(true);
    }
  });

  it("can't be fitted, sold or dumped, and says whose it is", () => {
    const c = rider();
    takeErrand(shops, bikes, c, scrapyard, () => 0.5);
    const i = lentPart(c, scrapyard.id);
    const before = structuredClone(c);
    const fit = fitSpare(shops, bikes, garage, c, i);
    expect(fit.ok).toBe(false);
    expect(fit.message).toBe("I don't own this part. I'm trusted to fix it and take it back to the scrapyard owner.");
    expect(sellSpare(shops, partsShop, c, i).ok).toBe(false);
    expect(resaleValue(shops, partsShop, c, c.bag[i].part!)).toBeNull();
    expect(dumpSpare(c, i)).toBe(false);
    expect(c).toEqual(before);
  });

  it('one job at a time: offered, waiting, repaired at the garage, then paid the repair plus £5', () => {
    const c = rider();
    expect(errandStage(c, scrapyard)).toBe('offer');
    takeErrand(shops, bikes, c, scrapyard, () => 0.5);
    expect(takeErrand(shops, bikes, c, scrapyard).ok).toBe(false);
    expect(errandStage(c, scrapyard)).toBe('waiting');
    expect(finishErrand(c, scrapyard).ok).toBe(false);

    const i = lentPart(c, scrapyard.id);
    const p = c.bag[i].part!;
    const q = repairQuote(shops, p.slot, p, p.class);
    if (!q.ok) throw new Error(q.reason);
    const start = c.money;
    expect(repairLent(shops, bikes, c, i).ok).toBe(true);
    expect(c.money).toBe(start - q.cost);
    expect(p).toMatchObject({ grade: q.grade, condition: 1, owner: { paid: q.cost, repaired: true } });
    expect(repairLent(shops, bikes, c, i).ok).toBe(false);
    expect(errandStage(c, scrapyard)).toBe('ready');

    const r = finishErrand(c, scrapyard);
    expect(r.ok).toBe(true);
    expect(c.money).toBe(start + pence(5));
    expect(lentPart(c, scrapyard.id)).toBe(-1);
    expect(errandState(c)).toEqual({ active: null, done: { [scrapyard.id]: 1 } });
    // Repeatable straight away.
    expect(errandStage(c, scrapyard)).toBe('offer');
    expect(takeErrand(shops, bikes, c, scrapyard).ok).toBe(true);
  });

  it('needs room in the bag for the part', () => {
    const c = rider();
    while (c.bag.filter((b) => b.part).length < shops.spareLimit) c.bag.push({ id: 'spare', part: { slot: 'frame', class: '50cc', grade: 1, condition: 0.5 } });
    expect(takeErrand(shops, bikes, c, scrapyard).ok).toBe(false);
    expect(errandState(c).active).toBeNull();
  });

  it('keeps the job and the tagged part in a save', () => {
    const c = rider();
    takeErrand(shops, bikes, c, scrapyard, () => 0.5);
    const save = {
      version: SAVE_VERSION,
      savedAt: '2026-10-28T10:00:00.000Z',
      rider: { name: 'Rider', look: 'player-m-start-a' },
      position: { map: 'area1-home-town', x: 5, y: 19, facing: 'down' },
      flags: {},
      stats: { playSeconds: 1 },
      career: c,
      van: null,
      driving: false,
    };
    const back = parseSave(JSON.stringify(save));
    expect(back).not.toBeNull();
    expect(back!.career.errands).toEqual({ active: scrapyard.id, done: {} });
    expect(back!.career.bag[lentPart(back!.career, scrapyard.id)].part!.owner!.name).toBe('the scrapyard owner');
    // A broken tag is refused rather than loaded as the rider's own part.
    const bad = structuredClone(save);
    (bad.career.bag[lentPart(c, scrapyard.id)].part as { owner: unknown }).owner = { errand: 3 };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});
