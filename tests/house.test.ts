import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { START_OUTFIT, awardOutfit, buyOutfit, championsKit, checkHouse, housesOwned, legendsPickDue, pickOptions, raceKit, outfitProblem, outfitSheet, ownsOutfit, rackOpen, riderGender, storageLimit, storeSpare, stored, takeSpare, wearOutfit, wornOutfit, type RiderLook } from '../src/core/house';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { SPARE } from '../src/core/shops';
import { loadManifest, loadMaps, rawContent } from './helpers';
import { BRAND_COLOURS, GEAR_SETS, kitFor, outfitGear } from '../src/world/raceBike';

const manifest = loadManifest();
const content = checkContent(rawContent(), manifest, loadMaps()).content!;
const { bikes, story, house: data, shops, championships } = content;
const fresh = () => ({ ...newCareerState(bikes, story, 'yamamoto', () => 0.5), money: 20000 });
const rider = (look = 'player-f-start-a'): RiderLook => ({ look });
const kit = data.outfits.find((o) => o.id === 'mxgear')!;
const noHelmet = data.outfits.find((o) => o.id === 'mx_nohelmet')!;

describe('the wardrobe and the Phoenix MX clothing rack (Boss, 30 Oct 2026: the Area 2 house unlocks the wardrobe)', () => {
  it('reads m or f from the start look and gives each outfit the right sheet, or none', () => {
    expect(riderGender('player-f-start-b')).toBe('f');
    expect(riderGender('player-m-mxgear')).toBe('m');
    expect(outfitSheet(kit, rider('player-m-start-a'))).toBe('player-m-mxgear');
    expect(outfitSheet(kit, rider('player-f-start-b'))).toBe('player-f-mxgear');
    expect(outfitSheet(noHelmet, rider('player-f-start-a'))).toBeNull();
    // Once dressed in kit, the rider's own clothes are still the start look.
    const r: RiderLook = { look: 'player-f-mxgear', startLook: 'player-f-start-a', outfits: ['mxgear'] };
    expect(outfitSheet(data.outfits.find((o) => o.id === START_OUTFIT)!, r)).toBe('player-f-start-a');
    expect(wornOutfit(data, r).id).toBe('mxgear');
    expect(wornOutfit(data, rider()).id).toBe(START_OUTFIT);
  });

  it('sells nothing until the wardrobe flag, then an outfit once, in the rider’s size, for its price', () => {
    const career = fresh();
    const r = rider();
    expect(rackOpen(data, {})).toBe(false);
    expect(outfitProblem(data, kit, career, r, {})).toMatch(/wardrobe/);
    const flags = { wardrobe: true };
    expect(outfitProblem(data, kit, career, r, flags)).toBeNull();
    expect(outfitProblem(data, noHelmet, career, r, flags)).toMatch(/size/);
    expect(outfitProblem(data, kit, { ...career, money: 100 }, r, flags)).toMatch(/afford/);
    expect(buyOutfit(data, kit, career, r, flags).ok).toBe(true);
    expect(career.money).toBe(20000 - 6000);
    expect(ownsOutfit(r, 'mxgear')).toBe(true);
    expect(r.startLook).toBe('player-f-start-a');
    expect(r.look).toBe('player-f-start-a');
    expect(outfitProblem(data, kit, career, r, flags)).toMatch(/have that/);
    expect(data.rack.shops).toContain('shop.a2.garage');
    expect(data.rack.shops).not.toContain('shop.garage');
  });

  it('puts an owned outfit on at the wardrobe and takes it off again', () => {
    const r: RiderLook = { look: 'player-m-start-b', outfits: ['mxgear'] };
    expect(wearOutfit(noHelmet, r).ok).toBe(false);
    expect(wearOutfit(kit, r).ok).toBe(true);
    expect(r.look).toBe('player-m-mxgear');
    expect(r.startLook).toBe('player-m-start-b');
    expect(wearOutfit(data.outfits.find((o) => o.id === START_OUTFIT)!, r).ok).toBe(true);
    expect(r.look).toBe('player-m-start-b');
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', ...r }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career: fresh(), van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.rider).toEqual({ name: 'A', ...r });
    expect(parseSave(JSON.stringify({ ...save, rider: { name: 'A', look: 'x', outfits: [1] } }))).toBeNull();
  });
});

// The champion's offer brings the sponsor's kit with the free bike, up to Area 4 (Boss, 31 Oct 2026).
describe("the champion's kit", () => {
  it('comes with the area championships up to Area 4, never later, and is never on the rack', () => {
    const champ = (id: string) => championships.championships.find((c) => c.id === id)!;
    const kit = championsKit(data, champ('area1.main'))!;
    expect(kit.id).toBe('champion_kit');
    expect(kit.award).toBe(true);
    expect(championsKit(data, champ('area4.main'))?.id).toBe('champion_kit');
    expect(championsKit(data, champ('area5.main'))).toBeNull();
    const local = championships.championships.find((c) => !c.milestone)!;
    expect(championsKit(data, local)).toBeNull();
    const career = { ...newCareerState(bikes, story, 'yamamoto', () => 0.5), money: 100_000 };
    expect(outfitProblem(data, kit, career, rider('player-m-start-a'), { wardrobe: true })).toMatch(/champion's offer/);
  });

  it('hangs in the wardrobe once, in the rider’s size, and can be put on there', () => {
    const kit = championsKit(data, championships.championships.find((c) => c.id === 'area2.main')!)!;
    const r = rider('player-f-start-b');
    expect(awardOutfit(kit, r).ok).toBe(true);
    expect(r.outfits).toEqual(['champion_kit']);
    expect(r.startLook).toBe('player-f-start-b');
    expect(awardOutfit(kit, r).ok).toBe(false);
    expect(wearOutfit(kit, r).ok).toBe(true);
    expect(r.look).toBe('player-f-champion-kit'); // its own gold and black sheet (Boss, 1 Nov 2026)
  });

  it('content check: the kit must be an award outfit that exists', () => {
    const sheets = Object.keys(manifest.characters.sheets);
    const shopIds = shops.shops.map((s) => s.id);
    const bad = JSON.parse(JSON.stringify(data));
    bad.kit.outfit = 'mxgear';
    expect(checkHouse('h', bad, { sheets, shops: shopIds }).map((e) => e.field)).toEqual(['kit.outfit']);
    bad.kit.outfit = 'moon';
    expect(checkHouse('h', bad, { sheets, shops: shopIds }).map((e) => e.field)).toEqual(['kit.outfit']);
  });
});

describe('the house storage chest (Spec 17; every house reaches the one shared chest)', () => {
  it('holds 10 spares with one house and 10 more a house, never a lent part, and hands them back into a bag with room', () => {
    const career = fresh();
    expect(storageLimit(data, {})).toBe(0);
    expect(housesOwned({ 'house.2': true, 'house.4': true, 'house.x': true })).toBe(2);
    expect(storageLimit(data, { 'house.2': true })).toBe(10);
    expect(storageLimit(data, { 'house.2': true, 'house.3': true, 'house.5': true })).toBe(30);
    const flags = { 'house.2': true };
    career.bag.push({ id: SPARE, part: { slot: 'forks', class: '50cc', grade: 2, condition: 0.9 } });
    career.bag.push({ id: SPARE, part: { slot: 'shock', class: '50cc', grade: 2, condition: 0.9, owner: { errand: 'e', name: 'Kyle' } } });
    expect(storeSpare(data, career, career.bag.length - 1, flags).ok).toBe(false);
    const i = career.bag.findIndex((b) => b.part?.slot === 'forks');
    expect(storeSpare(data, career, i, {}).ok).toBe(false);
    expect(storeSpare(data, career, i, flags).ok).toBe(true);
    expect(stored(career)).toHaveLength(1);
    expect(career.bag.some((b) => b.part?.slot === 'forks')).toBe(false);
    for (let k = 0; k < 9; k++) stored(career).push({ slot: 'brakes', class: '50cc', grade: 1, condition: 1 });
    career.bag.push({ id: SPARE, part: { slot: 'frame', class: '50cc', grade: 1, condition: 1 } });
    expect(storeSpare(data, career, career.bag.length - 1, flags).message).toMatch(/full/);
    expect(takeSpare(shops, career, 0).ok).toBe(true);
    expect(career.bag.at(-1)!.part!.slot).toBe('forks');
    // A full bag can't take one.
    while (career.bag.filter((b) => b.part).length < shops.spareLimit) career.bag.push({ id: SPARE, part: { slot: 'brakes', class: '50cc', grade: 1, condition: 1 } });
    expect(takeSpare(shops, career, 0).ok).toBe(false);
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags, stats: { playSeconds: 0 }, career, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))?.career.storage).toHaveLength(9);
    expect(parseSave(JSON.stringify({ ...save, career: { ...career, storage: [{ slot: 'forks' }] } }))).toBeNull();
  });

  it('content check: a missing start outfit, an unknown sheet and an unknown rack shop', () => {
    const sheets = Object.keys(manifest.characters.sheets);
    const shopIds = shops.shops.map((s) => s.id);
    expect(checkHouse('h', data, { sheets, shops: shopIds })).toEqual([]);
    const bad = JSON.parse(JSON.stringify(data));
    bad.outfits = bad.outfits.filter((o: { id: string }) => o.id !== START_OUTFIT);
    bad.outfits[0].sheets.m = 'player-m-ghost';
    bad.rack.shops.push('shop.moon');
    expect(checkHouse('h', bad, { sheets, shops: shopIds }).map((e) => e.field)).toEqual(['outfits', 'outfits[0].sheets.m', 'rack.shops[7]']);
  });
});

describe('sponsor and legend kit picks (Boss, 5 Nov 2026: "lock em in")', () => {
  const house = content.house;
  it('has five sponsor kits and five legend kits, each an award with a men\'s and women\'s sheet', () => {
    expect(house.picks!.sponsor).toHaveLength(5);
    expect(house.picks!.legends.outfits).toHaveLength(5);
    for (const id of [...house.picks!.sponsor, ...house.picks!.legends.outfits]) {
      const o = house.outfits.find((x) => x.id === id)!;
      expect(o.award, id).toBe(true);
      for (const sex of ['m', 'f']) expect(loadManifest().characters.sheets[o.sheets[sex]], `${id} ${sex}`).toBeDefined();
    }
  });
  it('offers only the kits not owned yet, and the legends pick once after the trophy', () => {
    const rider = { look: 'player-f-start-a' } as RiderLook;
    expect(pickOptions(house, house.picks!.sponsor, rider)).toHaveLength(5);
    awardOutfit(house.outfits.find((o) => o.id === house.picks!.sponsor[1])!, rider);
    expect(pickOptions(house, house.picks!.sponsor, rider).map((o) => o.id)).not.toContain(house.picks!.sponsor[1]);
    expect(legendsPickDue(house, {})).toBe(false);
    expect(legendsPickDue(house, { 'trophy.legends': true })).toBe(true);
    expect(legendsPickDue(house, { 'trophy.legends': true, [house.picks!.legends.done]: true })).toBe(false);
  });
});

describe('the kit you wear is the kit you race in (Boss, 6 Nov 2026: "the colour they chose or are wearing should be the replicated in the race view")', () => {
  it('races in the starter kit in your own clothes, and in the worn outfit\'s colours once one is on', () => {
    const r = rider('player-f-start-a');
    expect(raceKit(data, r)).toBeNull();
    expect(kitFor({ player: true }, 0, raceKit(data, r))).toEqual(GEAR_SETS['player-default']);
    for (const id of ['mxgear', 'champion_kit', 'sponsor_kit_b', 'super_kit_e']) {
      const o = data.outfits.find((x) => x.id === id)!;
      const me = rider('player-f-start-a');
      expect(awardOutfit(o, me).ok, id).toBe(true);
      expect(wearOutfit(o, me).ok, id).toBe(true);
      const k = raceKit(data, me)!;
      expect(k, id).toEqual(o.race!.f);
      expect(kitFor({ player: true }, 0, k), id).toEqual(outfitGear(k));
      expect(kitFor({ player: true }, 0, k), id).not.toEqual(GEAR_SETS['player-default']);
    }
  });

  it('gives every MX outfit race colours for each rider it is made for, matching its sprite', () => {
    for (const o of data.outfits.filter((x) => x.id !== START_OUTFIT)) {
      expect(Object.keys(o.race ?? {}).sort(), o.id).toEqual(Object.keys(o.sheets).sort());
    }
    // Spot checks against the sprites (art/characters/tools/make_characters.py).
    expect(data.outfits.find((o) => o.id === 'mxgear')!.race!.f.jersey).toBe('pink');
    expect(data.outfits.find((o) => o.id === 'champion_kit')!.race!.m.jersey).toBe('yellow');
    expect(data.outfits.find((o) => o.id === 'sponsor_kit_c')!.race!.m.jersey).toBe('lime');
  });

  it('the rack\'s MX kits race in the bike brand\'s colour, as they look about town (Boss, 2 Nov 2026)', () => {
    const me = rider('player-m-start-a');
    buyOutfit(data, kit, { ...fresh() }, me, { [data.rack.needs]: true });
    wearOutfit(kit, me);
    const k = raceKit(data, me)!;
    for (const brand of ['yamamoto', 'kwakmoto', 'sukimoto', 'hondmoto']) {
      const g = kitFor({ player: true, bike: { brand } }, 0, k);
      expect(g.jersey, brand).toBe(BRAND_COLOURS[brand].body);
      expect(g.helmet, brand).toBe(BRAND_COLOURS[brand].body);
    }
    // A sponsor's kit keeps its own colours on any bike.
    const lime = data.outfits.find((o) => o.id === 'sponsor_kit_c')!;
    expect(kitFor({ player: true, bike: { brand: 'yamamoto' } }, 0, lime.race!.m).jersey).toBe(outfitGear(lime.race!.m).jersey);
  });

  it('race colours for a rider with no sheet fail the checks', () => {
    const sheets = Object.keys(manifest.characters.sheets);
    const shopIds = shops.shops.map((s) => s.id);
    const bad = structuredClone(data);
    const o = bad.outfits.find((x) => x.id === 'mx_nohelmet')!;
    o.race!.f = o.race!.m;
    expect(checkHouse('h', bad, { sheets, shops: shopIds }).map((e) => e.field)).toEqual([`outfits[${bad.outfits.indexOf(o)}].race.f`]);
  });
});
