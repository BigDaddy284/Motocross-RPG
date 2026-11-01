import type { Bike, BikesData } from './career';
import { classDef, stockBike } from './classes';
import type { TrackDef } from './race';

// Sidecar racing (Boss, 1 Nov 2026). A sidecar outfit is a motorcycle with a chair on its left, a
// rider and a passenger. It is its own class (bikes.json "sidecar": true), brought in late in the
// game: no new venues, it races only on Motocross (outdoor) tracks, and once unlocked it opens
// championships across the land for its class. For now a TEST tick box at the Farmland race office
// races the player on a sidecar against 7 others (REMOVE BEFORE RELEASE, README "Before release").
//
// The start: 8 outfits on the gate, 4 on the front row and 4 on the back, each taking two gates.
// An outfit sits on an even gate (2, 4, 6 and 8 on the front row, 10, 12, 14 and 16 behind) and its
// chair covers the odd gate beside it, so only the even gates are offered when picking
// ("only even available", Boss, 1 Nov 2026). An outfit never whips or scrubs, whatever its rider's
// skill: the chair keeps it flat and straight in the air.

/** The sidecar class's id in bikes.json and racing.json. */
export const SIDECAR_CLASS = 'sidecar';
/** Outfits on the gate in a sidecar race: the player and 7 others. */
export const SIDECAR_FIELD = 8;
/** Outfits in a start row: each takes two of the row's 8 gates. */
export const SIDECAR_ROW = 4;
/** The venue whose race office has the TEST sidecar tick box (Boss, 1 Nov 2026). TEST ONLY, REMOVE BEFORE RELEASE. */
export const SIDECAR_TEST_VENUE = 'venue-farmland';

/**
 * The gates an outfit can line up on, from 0 (gate 1): the even gates, 2 to 16 as the riders see
 * them, front row first. The odd gate before each is under that outfit's chair.
 */
export const SIDECAR_GATES: readonly number[] = Array.from({ length: SIDECAR_FIELD }, (_, i) => 2 * i + 1);

/** How many gates a sidecar start spans: two for every outfit, two rows of 8. */
export const SIDECAR_GATE_COUNT = 2 * SIDECAR_FIELD;

/**
 * On track, the leftmost lane an outfit's bike rides (lanes run -1 at the left edge to 1 at the
 * right): its chair, about 1.1 m to the left, takes the rest (riderAI chairRoom).
 */
export const SIDECAR_LEFT = -0.5;
/** Metres out of the gate over which outfits ease from their gates into SIDECAR_LEFT to 1. */
export const SIDECAR_SETTLE = 30;
/** How far apart, in lanes, two outfits side by side keep: a bike and a chair's width (riderAI keepApart; solos keep 0.5). */
export const SIDECAR_ROOM = 0.7;

/** Whether an outfit can line up on this gate (from 0): an even gate as the riders count, not one under a chair. */
export function isSidecarGate(gate: number): boolean {
  return SIDECAR_GATES.includes(gate);
}

/** The gate (from 0) under the chair of the outfit on this gate: the odd gate beside it. */
export function chairGate(gate: number): number {
  return gate - 1;
}

/** Whether sidecars race on this track: Motocross (outdoor) tracks only, never stadium, endurance or enduro sprint. */
export function sidecarTrack(track: Pick<TrackDef, 'kind'>): boolean {
  return (track.kind ?? 'outdoor') === 'outdoor';
}

/** Whether a class is a sidecar class (ClassDef.sidecar). */
export function isSidecarClass(bikes: BikesData, cls: string): boolean {
  return !!classDef(bikes, cls)?.sidecar;
}

/**
 * The outfit the player borrows for a TEST sidecar race: a new stock sidecar in their own brand,
 * every part at 100%. It is lent for the day only; the rider's own bike is never touched.
 */
export function testSidecar(bikes: BikesData, brand: string): Bike {
  return stockBike(bikes, brand, SIDECAR_CLASS);
}
