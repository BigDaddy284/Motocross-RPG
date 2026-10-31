import { describe, expect, it } from 'vitest';
import { areaFlag, openAreas } from '../src/core/areas';
import { newCareerState, pence } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { SPARE, fitSpare, shopStock, type ShopDef } from '../src/core/shops';
import { buyTools, diyFitProblem, diyRepair, diyRepairQuote, nextVersion, ownedVersion, toolsFor } from '../src/core/tools';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { bikes, story, shops, skills, tools } = content;
const fresh = () => newCareerState(bikes, story, 'yamamoto', () => 0.5);
const set = (id: string) => tools.sets.find((s) => s.id === id)!;

describe('areas', () => {
  it('count up from Area 1 until one is shut', () => {
    expect(openAreas({})).toBe(1);
    expect(openAreas({ [areaFlag(2)]: true })).toBe(2);
    expect(openAreas({ [areaFlag(2)]: true, [areaFlag(4)]: true })).toBe(2);
  });
});

describe("J's Tools and DIY repairs (Spec 8.5, 17.2a; Boss, 30 Oct 2026)", () => {
  it('four sets cover every slot, three versions each at the plan\'s areas and grades', () => {
    expect(tools.sets.map((s) => s.id)).toEqual(['tools.bodywork', 'tools.wheels', 'tools.engine', 'tools.suspension']);
    expect(set('tools.bodywork').versions.map((v) => [v.area, v.price, v.grade])).toEqual([[1, 300, 3], [4, 1800, 6], [7, 12000, 9]]);
    expect(set('tools.wheels').versions.map((v) => [v.area, v.grade])).toEqual([[2, 4], [5, 6], [8, 9]]);
    expect(set('tools.engine').versions[0]).toMatchObject({ area: 3, price: 3000, grade: 5 });
    expect(set('tools.suspension').versions[0]).toMatchObject({ area: 4, price: 1500, grade: 5 });
    expect(shops.shops.find((s) => s.id === 'shop.tools')).toMatchObject({ name: "J's Tools", npc: 'npc.tool_shop_owner', tools: true });
    expect(content.npcs.find((n) => n.id === 'npc.tool_shop_owner')?.name).toBe('Jason Styles');
  });

  it('a set is bought once, version by version as the areas open, and replaces the one below', () => {
    const career = fresh();
    const flags: Record<string, boolean> = {};
    const body = set('tools.bodywork');
    career.money = pence(300);
    expect(nextVersion(career, flags, body)).toMatchObject({ version: { id: 'tools.bodywork.1' }, open: true });
    expect(buyTools(career, flags, body).ok).toBe(true);
    expect(career.money).toBe(0);
    expect(ownedVersion(career, body)?.id).toBe('tools.bodywork.1');
    // Pro bodywork tools come with Area 4.
    career.money = pence(5000);
    expect(nextVersion(career, flags, body)).toMatchObject({ version: { id: 'tools.bodywork.pro' }, open: false });
    expect(buyTools(career, flags, body)).toMatchObject({ ok: false, message: expect.stringContaining('Area 4') });
    flags[areaFlag(2)] = flags[areaFlag(3)] = flags[areaFlag(4)] = true;
    expect(buyTools(career, flags, body).ok).toBe(true);
    expect(career.tools).toEqual({ 'tools.bodywork': 'tools.bodywork.pro' });
    // Wheel and brake tools wait for Area 2 in a fresh career.
    expect(buyTools(fresh(), {}, set('tools.wheels')).ok).toBe(false);
  });

  it('with the right set a part is repaired for nothing, one grade down, up to the set\'s grade, with Mechanical Engineer XP', () => {
    const career = fresh();
    career.bike.parts.bodywork = { grade: 3, condition: 0.4 };
    expect(diyRepairQuote(shops, tools, career, 'bodywork', career.bike.parts.bodywork)).toMatchObject({ ok: false, reason: expect.stringContaining("J's Tools") });
    expect(diyRepairQuote(shops, tools, career, 'top_end', { grade: 2, condition: 0.5 })).toMatchObject({ ok: false, reason: expect.stringContaining("J's Tools") });
    career.tools = { 'tools.bodywork': 'tools.bodywork.1' };
    expect(diyRepairQuote(shops, tools, career, 'bodywork', career.bike.parts.bodywork)).toEqual({ ok: true, grade: 2 });
    expect(diyRepairQuote(shops, tools, career, 'bodywork', { grade: 4, condition: 0.4 })).toMatchObject({ ok: false, reason: expect.stringContaining('Grade 3') });
    expect(diyRepairQuote(shops, tools, career, 'frame', { grade: 1, condition: 0.4 })).toMatchObject({ ok: false });
    const money = career.money;
    const r = diyRepair(shops, tools, bikes, skills, career, 'bodywork');
    expect(r.ok).toBe(true);
    expect(career.money).toBe(money);
    expect(career.bike.parts.bodywork).toEqual({ grade: 2, condition: 1 });
    expect(career.skills.xp.bodywork).toBe(tools.xp.repair);
    expect(toolsFor(tools, career, 'frame')?.set.id).toBe('tools.bodywork');
  });

  it('fitting a spare yourself needs the set for its slot, and is then free', () => {
    const career = fresh();
    career.bag.push({ id: SPARE, part: { slot: 'bodywork', class: '50cc', grade: 2, condition: 0.9 } });
    expect(diyFitProblem(tools, career, career.bag[0].part!)).toContain("J's Tools");
    career.tools = { 'tools.bodywork': 'tools.bodywork.1' };
    expect(diyFitProblem(tools, career, career.bag[0].part!)).toBeNull();
    const bench: ShopDef = { id: 'diy', name: 'Your tools', npc: '', map: 'int-home-rented-room', actions: [], greeting: '', repairs: true, fitFee: 0, diy: true };
    const money = career.money;
    expect(fitSpare(shops, bikes, bench, career, 0).ok).toBe(true);
    expect(career.money).toBe(money);
    expect(career.bike.parts.bodywork).toEqual({ grade: 2, condition: 0.9 });
  });

  it('Moto78 sells a stock Grade 1 frame of your brand, never a higher grade (Boss, 30 Oct 2026)', () => {
    const career = fresh();
    const bikeShop = shops.shops.find((s) => s.id === 'shop.bike')!;
    const frames = shopStock(shops, bikeShop, career, '50cc').filter((s) => s.slot === 'frame');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ grade: 1, price: pence(400), always: true });
    expect(bikeShop.sells?.stockOnly).toEqual(['frame']);
  });

  it('Lee Stocky runs the tyre shop and races as the ex Area Champion', () => {
    expect(content.npcs.find((n) => n.id === 'npc.tyre_specialist')).toMatchObject({ name: 'Lee Stocky', rider: 'cpu.r14' });
    expect(shops.shops.find((s) => s.id === 'shop.tyres')?.name).toBe("Lee's T's & Wheels");
    expect(content.riders.riders.find((r) => r.id === 'cpu.r14')).toMatchObject({ level: 13, tag: 'Ex Area Champion' });
  });
});
