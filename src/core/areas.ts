// The eight areas (Spec 18.1; Areas 2 to 8 plan, Boss 30 and 31 Oct 2026). Area 1 is always open;
// Area N opens when the flag area.N.open is set, by winning the main championship of Area N − 1
// (Spec 18.2, Round 108). data/areas.json says what each area is made of: its town map, the field
// its riders race in and their skill level there, its house, the motor Nicholls sells there, and
// its weather (Spec 10.5: rain arrives in Area 2). Pure rules, no graphics.

import type { CareerState } from './career';
import type { VehiclesData } from './vehicles';
import type { ContentError, Schema } from './validate';

export const AREA_COUNT = 8;

/** The flag that opens an area (Area 1 needs none). */
export const areaFlag = (area: number) => `area.${area}.open`;

/** How many areas are open to the rider, counting up from Area 1 until one is shut. */
export function openAreas(flags: Record<string, boolean>): number {
  let n = 1;
  while (n < AREA_COUNT && flags[areaFlag(n + 1)]) n++;
  return n;
}

export interface HouseDef {
  name: string;
  /** Pounds. */
  price: number;
  /** The door object on the area's town map, locked until the house is bought (its unlock is the house flag). */
  door: string;
  /** Flags set with the house: wardrobe for the Area 2 Starter terrace (Boss, 30 Oct 2026). */
  unlocks?: string[];
}

export interface MotorDef {
  /** A vehicles.json design. */
  design: string;
  /** Pounds; the old motor goes in part exchange (Boss, 31 Oct 2026). */
  price: number;
  /** The Nicholls Used Motors NPC in this area who sells it. */
  npc: string;
}

export interface AreaDef {
  n: number;
  name: string;
  /** The town map. */
  map: string;
  /** The riders.json field its race days draw from. */
  field: string;
  /** The intro chain (story.json chains) that opens the area's tracks. */
  intro?: string;
  house?: HouseDef;
  motor?: MotorDef;
  /** The odds of each kind of weather (racing.json weather) on a race day at the area's tracks. */
  weather?: Record<string, number>;
  /** What tools/gen-area.mjs stamps the town with: the names of its batch facility, fitness venue, drill yard and venues. */
  town?: { works: string; worksBoss: string; fitness: string; fitnessCoach?: string; yard: string; venues?: Record<string, string> };
}

export interface AreasData {
  areas: AreaDef[];
}

export const areaDef = (data: AreasData, n: number): AreaDef | undefined => data.areas.find((a) => a.n === n);

/** The area a town map belongs to, or undefined (a venue or interior is placed by its venue or door). */
export const areaOfMap = (data: AreasData, mapId: string): AreaDef | undefined => data.areas.find((a) => a.map === mapId);

/** The flag for a house owned. */
export const houseFlag = (area: number) => `house.${area}`;

export type Result = { ok: true; message: string } | { ok: false; message: string };

/** Buys the area's house: money off, the house flag and whatever it unlocks set. */
export function buyHouse(area: AreaDef, career: CareerState, flags: Record<string, boolean>): Result {
  const house = area.house;
  if (!house) return { ok: false, message: 'Nothing for sale here.' };
  if (flags[houseFlag(area.n)]) return { ok: false, message: `The ${house.name.toLowerCase()} is already yours.` };
  const price = Math.round(house.price * 100);
  if (career.money < price) return { ok: false, message: `You're short: the ${house.name.toLowerCase()} is £${house.price}.` };
  career.money -= price;
  flags[houseFlag(area.n)] = true;
  for (const f of house.unlocks ?? []) flags[f] = true;
  return { ok: true, message: `The ${house.name.toLowerCase()} is yours. Your things are moved in, and the shared storage reaches every house you own.` };
}

/** Why the rider can't buy the area's motor, or null. */
export function motorProblem(vehicles: VehiclesData, area: AreaDef, career: CareerState, van: { design: string } | null): string | null {
  const motor = area.motor;
  if (!motor) return 'No motor for sale here.';
  if (!van) return 'Get your first motor at Nicholls in Home Town first.';
  const designs = vehicles.designs.map((d) => d.id);
  if (designs.indexOf(van.design) >= designs.indexOf(motor.design)) return `You already have a motor as good as the ${vehicles.designs.find((d) => d.id === motor.design)?.name ?? motor.design}.`;
  if (career.money < Math.round(motor.price * 100)) return `You're short: it's £${motor.price} with your old motor in part exchange.`;
  return null;
}

/** Buys the area's motor: the old one goes in part exchange, the new design takes its parking spot. */
export function buyMotor(vehicles: VehiclesData, area: AreaDef, career: CareerState, van: { design: string }): Result {
  const problem = motorProblem(vehicles, area, career, van);
  if (problem) return { ok: false, message: problem };
  career.money -= Math.round(area.motor!.price * 100);
  van.design = area.motor!.design;
  return { ok: true, message: `The ${vehicles.designs.find((d) => d.id === van.design)?.name ?? van.design} is yours. It's parked where the old one stood.` };
}

/** The weather for a race day, drawn from the area's odds (Spec 10.5); 'dry' where an area has none. */
export function rollWeather(area: AreaDef | undefined, rng: () => number): string {
  const odds = Object.entries(area?.weather ?? {});
  const total = odds.reduce((a, [, w]) => a + w, 0);
  if (!total) return 'dry';
  let roll = rng() * total;
  for (const [kind, w] of odds) {
    roll -= w;
    if (roll < 0) return kind;
  }
  return odds[odds.length - 1][0];
}

const ID = /^[a-z0-9_.-]+$/;

export const AREAS_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    areas: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        optional: ['intro', 'house', 'motor', 'weather', 'town'],
        fields: {
          n: { type: 'number', integer: true, min: 1, max: AREA_COUNT },
          name: { type: 'string', nonEmpty: true },
          map: { type: 'string', pattern: ID },
          field: { type: 'string', pattern: ID },
          intro: { type: 'string', pattern: ID },
          house: {
            type: 'object',
            optional: ['unlocks'],
            fields: { name: { type: 'string', nonEmpty: true }, price: { type: 'number', min: 0 }, door: { type: 'string', nonEmpty: true }, unlocks: { type: 'array', items: { type: 'string', pattern: ID } } },
          },
          motor: { type: 'object', fields: { design: { type: 'string', pattern: ID }, price: { type: 'number', min: 0 }, npc: { type: 'string', pattern: ID } } },
          weather: { type: 'record', values: { type: 'number', min: 0 } },
          town: {
            type: 'object',
            optional: ['fitnessCoach', 'venues'],
            fields: { works: { type: 'string', nonEmpty: true }, worksBoss: { type: 'string', nonEmpty: true }, fitness: { type: 'string', nonEmpty: true }, fitnessCoach: { type: 'string', nonEmpty: true }, yard: { type: 'string', nonEmpty: true }, venues: { type: 'record', values: { type: 'string', nonEmpty: true } } },
          },
        },
      },
    },
  },
};

/** Cross-checks: areas 1..n in order, maps and doors exist, fields, chains, motors, NPCs and weather kinds are known. */
export function checkAreas(
  file: string,
  data: AreasData,
  c: { fields: Record<string, unknown>; chains: string[]; designs: string[]; npcs: string[]; weather: string[] },
  maps: Map<string, { objects: { type: string; name: string; props: Record<string, unknown> }[] }>,
): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  data.areas.forEach((a, i) => {
    const at = (f: string) => `areas[${i}].${f}`;
    if (a.n !== i + 1) err(at('n'), `areas go in order from 1: expected ${i + 1}`);
    const m = maps.get(a.map);
    if (!m) err(at('map'), `no map "${a.map}"`);
    if (!c.fields[a.field]) err(at('field'), `no field "${a.field}" in riders.json`);
    if (a.intro && !c.chains.includes(a.intro)) err(at('intro'), `no chain "${a.intro}" in story.json`);
    if (a.house && m) {
      const door = m.objects.find((o) => o.type === 'door' && o.name === a.house!.door);
      if (!door) err(at('house.door'), `no door "${a.house.door}" on ${a.map}`);
      else if (door.props.unlock !== houseFlag(a.n)) err(at('house.door'), `the door "${a.house.door}" should be locked with unlock "${houseFlag(a.n)}"`);
    }
    if (a.motor) {
      if (!c.designs.includes(a.motor.design)) err(at('motor.design'), `no design "${a.motor.design}" in vehicles.json`);
      if (!c.npcs.includes(a.motor.npc)) err(at('motor.npc'), `no NPC "${a.motor.npc}"`);
    }
    for (const k of Object.keys(a.weather ?? {})) if (!c.weather.includes(k)) err(at(`weather.${k}`), `no weather "${k}" in racing.json`);
  });
  return errors;
}
