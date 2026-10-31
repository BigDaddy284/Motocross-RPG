// The rider's house: the wardrobe and the storage chest (Spec 17; Areas 2 to 8 plan). Boss, 30 Oct
// 2026: buying the Area 2 Starter terrace unlocks the wardrobe, and with it the clothing rack at
// Phoenix MX in every area from Mountain Town on; every house bought later is a home in that town
// that reaches the one shared storage. Numbers and the outfits live in data/house.json.
import { pence, type CareerState } from './career';
import { SPARE, roomFor, fullMessage, type ShopsData, type SparePart } from './shops';
import type { Schema } from './validate';

export interface OutfitDef {
  id: string;
  name: string;
  /** Pounds. */
  price: number;
  /** The character sheet for each rider (m or f); a rider with no sheet here can't buy it. `start` has none: it is the rider's own look. */
  sheets: Record<string, string>;
  desc?: string;
}

export interface HouseData {
  outfits: OutfitDef[];
  rack: { needs: string; shops: string[] };
  storage: { base: number; perExtraHouse: number };
}

/** What the save keeps about the rider's clothes: the look on now, the one they started with, and the outfits owned. */
export interface RiderLook {
  look: string;
  startLook?: string;
  outfits?: string[];
}

export const START_OUTFIT = 'start';

/** m or f from a look's sheet name (player-m-start-a, player-f-mxgear...). */
export const riderGender = (look: string): string => (look.match(/^player-([mf])-/)?.[1] ?? 'm');

/** The sheet an outfit puts on this rider, or null when it isn't made for them. */
export function outfitSheet(outfit: OutfitDef, rider: RiderLook): string | null {
  if (outfit.id === START_OUTFIT) return rider.startLook ?? rider.look;
  return outfit.sheets[riderGender(rider.startLook ?? rider.look)] ?? null;
}

export const ownsOutfit = (rider: RiderLook, id: string): boolean => id === START_OUTFIT || (rider.outfits ?? []).includes(id);

/** The outfit the rider is wearing now. */
export function wornOutfit(data: HouseData, rider: RiderLook): OutfitDef {
  return data.outfits.find((o) => o.id !== START_OUTFIT && outfitSheet(o, rider) === rider.look) ?? data.outfits.find((o) => o.id === START_OUTFIT)!;
}

/** Whether the rack is open to this rider: it needs the wardrobe (the Area 2 house). */
export const rackOpen = (data: HouseData, flags: Record<string, boolean>): boolean => !!flags[data.rack.needs];

/** Why the rider can't buy this outfit at the rack, or null. */
export function outfitProblem(data: HouseData, outfit: OutfitDef, career: CareerState, rider: RiderLook, flags: Record<string, boolean>): string | null {
  if (!rackOpen(data, flags)) return 'Nothing on the rack is for sale until you have a wardrobe to hang it in.';
  if (outfit.id === START_OUTFIT) return "Those are your own clothes.";
  if (ownsOutfit(rider, outfit.id)) return 'You have that one.';
  if (!outfitSheet(outfit, rider)) return "They don't do that one in your size.";
  if (career.money < pence(outfit.price)) return `It's £${outfit.price}. You can't afford it.`;
  return null;
}

/** Buys an outfit from the rack into the wardrobe (it isn't put on here). */
export function buyOutfit(data: HouseData, outfit: OutfitDef, career: CareerState, rider: RiderLook, flags: Record<string, boolean>): { ok: boolean; message: string } {
  const problem = outfitProblem(data, outfit, career, rider, flags);
  if (problem) return { ok: false, message: problem };
  career.money -= pence(outfit.price);
  rider.startLook ??= rider.look;
  (rider.outfits ??= []).push(outfit.id);
  return { ok: true, message: `${outfit.name}: yours, hanging in the wardrobe.` };
}

/** Puts an owned outfit on at the wardrobe: the rider's look changes to its sheet. */
export function wearOutfit(outfit: OutfitDef, rider: RiderLook): { ok: boolean; message: string } {
  if (!ownsOutfit(rider, outfit.id)) return { ok: false, message: "That's not in your wardrobe." };
  const sheet = outfitSheet(outfit, rider);
  if (!sheet) return { ok: false, message: "It doesn't fit." };
  rider.startLook ??= rider.look;
  rider.look = sheet;
  return { ok: true, message: outfit.id === START_OUTFIT ? 'Back in your own clothes.' : `${outfit.name} on.` };
}

// ---- the storage chest ----

/** Houses bought so far (core/areas.ts houseFlag: house.N). */
export const housesOwned = (flags: Record<string, boolean>): number => Object.keys(flags).filter((f) => /^house\.\d+$/.test(f) && flags[f]).length;

/** How many spares the shared storage holds for this many houses. */
export const storageLimit = (data: HouseData, flags: Record<string, boolean>): number => {
  const n = housesOwned(flags);
  return n ? data.storage.base + data.storage.perExtraHouse * (n - 1) : 0;
};

export const stored = (career: CareerState): SparePart[] => (career.storage ??= []);

/** Puts a bag spare into the chest. */
export function storeSpare(data: HouseData, career: CareerState, index: number, flags: Record<string, boolean>): { ok: boolean; message: string } {
  const part = career.bag[index]?.part;
  if (!part) return { ok: false, message: 'Nothing to put away.' };
  if (part.owner) return { ok: false, message: `That's ${part.owner.name}'s, not yours to put away.` };
  if (stored(career).length >= storageLimit(data, flags)) return { ok: false, message: `The chest is full: ${storageLimit(data, flags)} parts. Buy another house for more room.` };
  career.bag.splice(index, 1);
  stored(career).push(part);
  return { ok: true, message: 'Put away.' };
}

/** Takes a stored spare back into the bag. */
export function takeSpare(shops: ShopsData, career: CareerState, index: number): { ok: boolean; message: string } {
  const part = stored(career)[index];
  if (!part) return { ok: false, message: 'Nothing there.' };
  if (!roomFor(shops, career, null)) return { ok: false, message: fullMessage(shops) };
  stored(career).splice(index, 1);
  career.bag.push({ id: SPARE, part });
  return { ok: true, message: 'In your bag.' };
}

// ---- content checks ----

const ID = /^[a-z0-9_.-]+$/;

export const HOUSE_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    outfits: { type: 'array', minItems: 1, items: { type: 'object', optional: ['desc'], fields: { id: { type: 'string', pattern: ID }, name: { type: 'string', nonEmpty: true }, price: { type: 'number', min: 0 }, sheets: { type: 'record', values: { type: 'string', pattern: ID } }, desc: { type: 'string' } } } },
    rack: { type: 'object', fields: { needs: { type: 'string', pattern: ID }, shops: { type: 'array', items: { type: 'string', pattern: ID } } } },
    storage: { type: 'object', fields: { base: { type: 'number', integer: true, min: 1 }, perExtraHouse: { type: 'number', integer: true, min: 0 } } },
  },
};

/** Cross-checks: the start outfit exists, every sheet is a character sheet, and every rack shop a shop. */
export function checkHouse(file: string, data: HouseData, c: { sheets: string[]; shops: string[] }): { file: string; field: string; message: string }[] {
  const errors: { file: string; field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  if (!data.outfits.some((o) => o.id === START_OUTFIT)) err('outfits', `no "${START_OUTFIT}" outfit (the rider's own clothes)`);
  data.outfits.forEach((o, i) => {
    for (const [g, sheet] of Object.entries(o.sheets)) {
      if (!['m', 'f'].includes(g)) err(`outfits[${i}].sheets.${g}`, 'a sheet is for m or f');
      if (!c.sheets.includes(sheet)) err(`outfits[${i}].sheets.${g}`, `no character sheet "${sheet}"`);
    }
    if (o.id !== START_OUTFIT && !Object.keys(o.sheets).length) err(`outfits[${i}].sheets`, 'an outfit for sale needs a sheet for m or f');
  });
  data.rack.shops.forEach((s, i) => !c.shops.includes(s) && err(`rack.shops[${i}]`, `no shop "${s}" in shops.json`));
  return errors;
}
