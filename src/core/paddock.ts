// Paddock vehicles placed as scenery: old trucks and vans, MX vans and motorhomes with their awnings
// out, the factory hauler and a bike on a stand. Each has a design (variant), a set-up (action: what
// is out beside it) and a colour from its definition in trackParts.json; an item that names none
// gets one picked for it, the same every time from its place in the track's list, as the cheering
// fans get their shirts (cheer.ts). The race view builds them (world/paddock.ts) and the track
// editor mirrors this file.
import type { SceneryItem } from './race';
import type { SceneryDef } from './trackParts';

export const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** True for a definition with options: a paddock vehicle. */
export function isPaddock(def: SceneryDef | undefined): boolean {
  return !!def && !!(def.variants || def.setups || def.colours);
}

function pick(list: [string, string][] | undefined, chosen: string | undefined, i: number, salt: number): string | undefined {
  if (!list?.length) return undefined;
  if (chosen !== undefined && list.some(([id]) => id === chosen)) return chosen;
  return list[Math.floor(hash(i * salt + 17) * list.length)][0];
}
/** The design: the item's own when it is one the definition offers, else picked for it. */
export function paddockVariant(def: SceneryDef, it: SceneryItem, i: number): string | undefined {
  return pick(def.variants, it.variant, i, 3);
}
/** The set-up (what is out beside it): the item's own, else picked for it. */
export function paddockSetup(def: SceneryDef, it: SceneryItem, i: number): string | undefined {
  return pick(def.setups, it.action, i, 5);
}
/** The colour: the item's own, else one of the definition's, else the definition's colour. */
export function paddockColour(def: SceneryDef, it: SceneryItem, i: number): string {
  if (it.color) return it.color;
  if (def.colours?.length) return def.colours[Math.floor(hash(i * 7 + 3) * def.colours.length)];
  return def.color;
}

/**
 * The factory hauler's words, by its colour (Boss, 1 Nov 2026): a hauler in a bike brand's colour
 * is that brand's factory team (bikes.json brands), any other colour a plain factory team. A
 * hauler model shows them on its material named Text.
 */
export const HAULER_ITEM = 'hauler';
export const HAULER_BRANDS: Readonly<Record<string, string>> = { '#2a4a90': 'Yamamoto', '#c82828': 'Hondmoto', '#2a8a40': 'Kwakmoto', '#e8c020': 'Sukimoto' };
export const FACTORY_TEAM = 'FACTORY RACING TEAM';
export function haulerWords(colour: string): string {
  const brand = HAULER_BRANDS[colour.toLowerCase()];
  return brand ? `${brand.toUpperCase()} FACTORY RACING` : FACTORY_TEAM;
}

/**
 * Which set-ups a part of a vehicle model shows in (Boss, 1 Nov 2026): a Blender custom property
 * `setups` on the object, set-up ids split by commas ("awning,awning_bikes"), exported as glTF
 * extras. A part without one is always shown.
 */
export function showsInSetup(setups: unknown, setup: string | undefined): boolean {
  if (typeof setups !== 'string' || !setups.trim()) return true;
  return setups.split(',').map((x) => x.trim()).includes(setup ?? '');
}
