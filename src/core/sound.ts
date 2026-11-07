import type { BakedMap, Tile } from './mapTypes';
import type { Settings } from './settings';

// The rules behind the game's sound (Boss, 7 Nov 2026: "let's go with them all", the sounds from
// the demo page tools/audio-demo.html). Everything here is pure so it is tested; the sounds
// themselves are made in code by src/audio/ with the Web Audio API, no audio files.

export type Channel = 'music' | 'engines' | 'crowd' | 'effects';
export const CHANNELS: Channel[] = ['music', 'engines', 'crowd', 'effects'];

/**
 * The gain of the master and each channel from the Audio settings (0 to 100). Sliders are heard
 * on a square law so the bottom half of a slider still does something; Mute all silences the lot.
 */
export function mixGains(audio: Settings['audio']): { master: number } & Record<Channel, number> {
  const g = (v: number) => Math.max(0, Math.min(100, v)) ** 2 / 10000;
  return {
    master: audio.muted ? 0 : g(audio.master) * 1.2,
    music: g(audio.music) * 1.3,
    engines: g(audio.engines) * 1.3,
    crowd: g(audio.crowd) * 1.3,
    effects: g(audio.effects) * 1.3,
  };
}

/** An engine sound by kind (src/audio/synth.ts BIKES). */
export type EngineKind = '50cc' | '65cc' | '85cc' | '125cc' | '250f' | '450f' | 'sidecar' | 'van';

/** The engine that a racing class rides (bikes.json classes). */
export function engineForClass(cls: string | undefined): EngineKind {
  if (!cls) return '250f';
  if (cls === 'sidecar') return 'sidecar';
  if (cls.startsWith('50')) return '50cc';
  if (cls.startsWith('65')) return '65cc';
  if (cls.startsWith('85')) return '85cc';
  if (cls.startsWith('125')) return '125cc';
  if (cls.startsWith('450')) return '450f';
  return '250f';
}

export type Footing = 'grass' | 'hard' | 'gravel' | 'wood';

/** Interiors with hard floors: the garages, shops and works; rooms and houses are wooden floors. */
const HARD_ROOMS = /garage|shop|tyre|van-office|works|unit|factory|gym|store/;

/**
 * What the player walks on at a tile, from the ground art there (the top ground layer with a
 * picture), for the footsteps.
 */
export function footingAt(map: BakedMap, tile: Tile): Footing {
  if (map.kind === 'interior') return HARD_ROOMS.test(map.id) ? 'hard' : 'wood';
  const i = tile.y * map.width + tile.x;
  for (let l = map.ground.length - 1; l >= 0; l--) {
    const img = map.ground[l].cells[i];
    if (img === undefined || img < 0) continue;
    const name = (map.images[img] ?? '').split('/').slice(-2).join('/');
    if (/boardwalk|pier/.test(name)) return 'wood';
    if (/gravel|dust/.test(name)) return 'gravel';
    if (/street|road|paving|pavement|concrete|apron|slab|mark-|path|doorstep|embankment|oil-stain|canal/.test(name)) return 'hard';
    return 'grass';
  }
  return 'grass';
}

export type Ambience = 'town' | 'industrial' | 'countryside' | 'beach' | 'city';

/** The background sound of a map: none indoors. */
export function ambienceFor(map: Pick<BakedMap, 'id' | 'kind'>): Ambience | null {
  if (map.kind === 'interior') return null;
  const id = map.id;
  if (/industrial|western-works/.test(id)) return 'industrial';
  if (/beach/.test(id)) return 'beach';
  if (/city|capital/.test(id)) return 'city';
  if (/forest|highlands|mountain/.test(id)) return 'countryside';
  return 'town';
}

/** Rain on screen for a weather id (racing.json weather): its loop, or none. */
export function rainFor(weather: string | undefined): 'rainLight' | 'rainHeavy' | null {
  if (weather === 'light_rain') return 'rainLight';
  if (weather === 'heavy_rain') return 'rainHeavy';
  return null;
}

/** Top of each gear in metres per second: the engine climbs through a gear, then drops at the change. */
const GEARS = [7, 13, 19, 26, 34];

/**
 * How the engine sounds at a speed: rpm as a share of the bike's range (0 idle, 1 the limiter) and
 * throttle (0 to 1). In the air the revs flare and the throttle is shut; down after a crash it idles.
 */
export function engineNote(speed: number, accel: number, air: boolean, down: boolean): { rpm: number; throttle: number } {
  if (down) return { rpm: 0.05, throttle: 0 };
  const v = Math.max(0, speed);
  let lo = 0;
  let gear = 0;
  while (gear < GEARS.length - 1 && v > GEARS[gear]) lo = GEARS[gear++];
  const hi = GEARS[gear];
  const k = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  let rpm = gear === 0 ? 0.08 + 0.82 * k : 0.55 + 0.4 * k;
  let throttle = accel > 0.3 ? 1 : accel < -1 ? 0.1 : 0.55;
  if (v < 0.5) throttle = 0;
  if (air) {
    rpm = Math.min(1, rpm + 0.15);
    throttle = 0.25;
  }
  return { rpm, throttle };
}

/** One rider as the race sounds see them (riderAI RiderPose, the fields that matter). */
export interface SoundRider {
  id: string;
  dist: number;
  air: number;
  speed: number;
  hidden?: boolean;
  down?: { t: number; lost: number };
}

export type RaceCue =
  | { kind: 'board' }
  | { kind: 'gateDrop' }
  | { kind: 'landing'; near: number; size: number }
  | { kind: 'crash'; near: number; big: boolean };

/** Race seconds of the start board's moves (startOfficial.ts BOARD_UP, BOARD_SIDEWAYS). */
export const BOARD_CUES = [-5, -3];
/** How far round the lap (laps) a rider is still heard from the camera's rider. */
export const HEAR_LAPS = 0.06;
/** A landing from this high (metres) or more makes a thud. */
const LANDING_AIR = 0.6;
/** A crash costing this many seconds or more is a big one. */
const BIG_CRASH = 4;

/**
 * The race sounds that happen between two frames: the start board, the gate drop, landings and
 * crashes near the rider the camera follows (`near` 1 right there, 0 at the edge of hearing).
 */
export function raceCues(prev: Map<string, SoundRider>, now: SoundRider[], clock0: number, clock1: number, focus: string | null, gate: boolean): RaceCue[] {
  const out: RaceCue[] = [];
  if (gate) {
    for (const t of BOARD_CUES) if (clock0 < t && clock1 >= t) out.push({ kind: 'board' });
    if (clock0 < 0 && clock1 >= 0) out.push({ kind: 'gateDrop' });
  }
  if (clock1 <= 0) return out;
  const f = now.find((r) => r.id === focus) ?? now[0];
  if (!f) return out;
  for (const r of now) {
    const p = prev.get(r.id);
    if (!p || r.hidden) continue;
    const near = 1 - Math.abs(r.dist - f.dist) / HEAR_LAPS;
    if (near <= 0) continue;
    if (p.air >= LANDING_AIR && r.air < 0.05 && !r.down) out.push({ kind: 'landing', near, size: Math.min(1, p.air / 4) });
    if (r.down && (!p.down || r.down.t < p.down.t)) out.push({ kind: 'crash', near, big: r.down.lost >= BIG_CRASH });
  }
  return out;
}

/** How loud the rest of the field is around the camera's rider: 0 alone, 1 in the thick of the pack. */
export function packLevel(riders: SoundRider[], focus: string | null): number {
  const f = riders.find((r) => r.id === focus) ?? riders[0];
  if (!f) return 0;
  let sum = 0;
  for (const r of riders) {
    if (r.id === f.id || r.hidden) continue;
    const near = 1 - Math.abs(r.dist - f.dist) / HEAR_LAPS;
    if (near > 0) sum += near * Math.min(1, r.speed / 8 + 0.3);
  }
  return Math.min(1, sum / 4);
}
