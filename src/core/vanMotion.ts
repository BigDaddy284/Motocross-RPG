import { Track, cabLine, flipPose, lineLength, restPlace, type Place, type Pt } from './vanPath';
import type { Move, VanPose } from './vehicles';

// How fast the van goes along its line (Boss, 25 Oct 2026: "driving needs more fluid movement").
// Moves handed over by the scene queue up on one track (vanPath.ts); the van speeds up to cruising
// speed, slows for corners ahead, and brakes to stop exactly at the end of the last move. Nothing
// here changes where the van may go; the grid already decided that.

export interface MotionTuning {
  /** Cruising speed in tiles a second. */
  cruise: number;
  /** Tiles a second gained per second. */
  accel: number;
  /** Tiles a second lost per second when braking. */
  brake: number;
}

export function tuningFor(stepMs: number): MotionTuning {
  const cruise = 1000 / stepMs;
  return { cruise, accel: cruise / 0.65, brake: cruise / 0.4 };
}

/** Top speed through each kind of move, as a share of cruising speed. */
const LIMIT: Record<Move['kind'], number> = { forward: 1, turn: 0.55, uturn: 0.4, reverse: 0.35, backturn: 0.3 };

const backing = (m: Move) => m.kind === 'reverse' || m.kind === 'backturn';

interface Leg {
  move: Move;
  from: VanPose;
  /** Backing up: driven as the flipped van (vanPath.ts) going forward. */
  back: boolean;
  /** The leading end's line and its length. */
  line: Pt[];
  size: number;
  /** Leading-end distance along the track where the leg starts and ends, once it's on the track. */
  s0?: number;
  s1?: number;
}

export class Motion {
  private track: Track;
  /** The track runs the other way: the van is backing up, its back end leading. */
  private flipped = false;
  private legs: Leg[] = [];
  /** Leading-end distance along the track now. */
  private s: number;
  speed = 0;

  constructor(
    private readonly tune: MotionTuning,
    private readonly length: number,
    rest: VanPose,
  ) {
    this.track = new Track(rest, length);
    this.s = this.track.start;
  }

  get moving(): boolean {
    return this.legs.length > 0;
  }

  /** Starts afresh with the van at rest on a pose. */
  rest(p: VanPose): void {
    this.track = new Track(p, this.length);
    this.flipped = false;
    this.s = this.track.start;
    this.legs = [];
    this.speed = 0;
  }

  /**
   * Queues a move that starts where the last queued one ends. It goes on the track now if the van
   * will still be going the same way; after a change of direction it waits until the van stops
   * and turns the track round.
   */
  push(move: Move, from: VanPose): void {
    const back = backing(move);
    const L = this.length;
    const line = back ? cabLine(flipPose(from, L), move.kind === 'reverse' ? 'forward' : 'turn', flipPose(move.to, L)) : cabLine(from, move.kind, move.to);
    const leg: Leg = { move, from, back, line, size: lineLength(line) };
    this.legs.push(leg);
    if (this.legs.every((l) => l.back === this.flipped)) this.lay(leg);
  }

  /** Puts a leg on the track, after everything already there. */
  private lay(leg: Leg): void {
    const prev = this.legs[this.legs.indexOf(leg) - 1];
    leg.s0 = prev?.s1 ?? this.s;
    this.track.extendFrom(leg.s0, leg.line);
    leg.s1 = this.track.end;
    leg.size = leg.s1 - leg.s0;
  }

  /** Turns the track round for backing up (or for setting off forward again) and lays the legs that way. */
  private turnRound(): void {
    this.track = this.track.flipped(this.s);
    this.s = this.track.end;
    this.flipped = !this.flipped;
    for (const l of this.legs) {
      if (l.back !== this.flipped) break;
      this.lay(l);
    }
  }

  /** Distance left over every queued move. */
  remaining(): number {
    let r = 0;
    this.legs.forEach((l, i) => (r += i === 0 && l.s1 !== undefined ? l.s1 - this.s : l.size));
    return r;
  }

  /** Distance needed to stop from the current speed. */
  stoppingDistance(): number {
    return (this.speed * this.speed) / (2 * this.tune.brake);
  }

  /** The highest speed allowed now: slow enough for the corners ahead, to stop at the end, and to stop before backing up. */
  private allowed(): number {
    const { cruise, brake } = this.tune;
    const first = this.legs[0];
    let best = cruise * LIMIT[first.move.kind];
    let ahead = first.s1! - this.s;
    for (let i = 1; i < this.legs.length; i++) {
      const l = this.legs[i];
      // A change of direction means stopping first.
      if (l.back !== this.legs[i - 1].back) return Math.min(best, Math.sqrt(2 * brake * ahead));
      best = Math.min(best, Math.sqrt((cruise * LIMIT[l.move.kind]) ** 2 + 2 * brake * ahead));
      ahead += l.size;
    }
    return Math.min(best, Math.sqrt(2 * brake * ahead));
  }

  /** Moves on by `dt` seconds. Returns the moves finished, in order, with where each started. */
  step(dt: number): Leg[] {
    const done: Leg[] = [];
    if (!this.legs.length) {
      this.speed = 0;
      return done;
    }
    if (this.legs[0].s1 === undefined) this.turnRound();
    const target = this.allowed();
    if (this.speed < target) this.speed = Math.min(target, this.speed + this.tune.accel * dt);
    else this.speed = Math.max(target, this.speed - this.tune.brake * dt);
    // Never creep to a halt short of the end.
    let go = Math.max(this.speed, this.tune.cruise * 0.06) * dt;
    while (this.legs.length && go > 0) {
      const l = this.legs[0];
      const left = l.s1! - this.s;
      if (go < left) {
        this.s += go;
        go = 0;
      } else {
        this.s = l.s1!;
        go -= left;
        done.push(this.legs.shift()!);
        // Changing direction: stopped here, the rest of this frame is spent changing gear.
        if (this.legs[0] && this.legs[0].s1 === undefined) {
          this.speed = 0;
          go = 0;
        }
      }
    }
    if (!this.legs.length) this.speed = 0;
    this.track.trimBefore(this.s);
    return done;
  }

  /** Where the van is drawn now. */
  place(): Place {
    const b = this.track.body(this.s);
    return { x: b.x, y: b.y, angle: this.flipped ? (b.angle + 180) % 360 : b.angle };
  }
}

export { restPlace };
export type { Place };
