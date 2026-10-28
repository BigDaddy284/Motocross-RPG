import type { BikesData } from './career';
import { mixSeed, seededRng, type LapTrace, type MessageDef, type MistakeOutcome, type MotoSim, type TrackDef, type TrackSection } from './race';
import { riderProfile, type RiderProfile } from './riderProfile';
import { lapGeom, lapMetres, sectionTurns, START_PAD, startGeom, type StartGeom } from './trackGeom';

// The rider AI for the race screen (GDD 11.1): every rider rides the lap on their own, the way
// Super Off Road's CPU drivers follow a racing line, but for motocross. The race simulation
// (race.ts) is the referee: it says when each rider reaches the end of each section, who passes
// whom, and who makes a mistake or crashes. The AI acts that out between those moments: it picks
// a line through each section, swings out to pass and tucks in when blocked, brakes into corners
// and drives out of them, leaves the ground on jumps, goes down and remounts in a crash, and
// keeps clear of the rider beside it. It always reaches the end of a section exactly when the
// referee says, so what you watch is the result the simulation gave. Its only random numbers are
// for the line-up before the start, drawn from a seed made of the track and the gate order: the
// same race always looks the same, at any playback speed.

export type RiderState = 'grid' | 'riding' | 'air' | 'wobble' | 'crashed' | 'remount' | 'retired' | 'finished' | 'waiting';

export interface RiderPose {
  id: string;
  /** Distance round the race in laps (1.5 = halfway round lap 2). */
  dist: number;
  /** Across the track: -1 is the left edge as the rider sees it, 1 the right. Past 1 is off the track. */
  lane: number;
  /** Height above the ground in metres (jumps, whoops). */
  air: number;
  /** Height of the ground itself in metres (hills), for the view. */
  elev: number;
  state: RiderState;
  /** Speed in metres per second, for wheel spin, dust and lean. */
  speed: number;
}

interface Seg {
  lap: number;
  si: number;
  t0: number;
  t1: number;
  d0: number;
  d1: number;
  mistake?: { outcome: MistakeOutcome['id']; lost: number };
  pass?: string;
  blocked?: string;
}

const CORNERS = new Set(['first_corner', 'flat_corner', 'berm', 'rutted_corner', 'hairpin', 'fast_sweeper']);
const BIG_JUMPS = new Set(['tabletop', 'double', 'step_up']);
/** Default jump face and hill heights in metres, when a section doesn't set one. */
export const DEFAULT_HEIGHTS: Record<string, number> = { tabletop: 2.5, double: 3.5, step_up: 3, rhythm: 1.5, whoops: 0.6, uphill: 6, downhill: 6 };
/** Where on a big jump the bike is in the air, as a share of the section. */
const TAKEOFF = 0.3;
const LANDING = 0.72;
/** Riders closer than this many metres, on near lines, ease apart. */
const ROOM = 5;
/** Seconds the whole field stands still at the gate, with the start board out, before it drops. */
export const START_HOLD = 5;
/** Seconds the line-up takes, from the start procedure opening to the last rider stopping in their slot. */
export const LINE_UP = 6;

/** The line-up for a field: LINE_UP for up to two rows, half a second more for each rider on a third, so nobody hurries. */
export function lineUpTime(riders: number): number {
  return LINE_UP + 0.5 * Math.max(0, riders - 2 * ROW_SIZE);
}
/** How fast finishers ride their cool-down after the flag, in metres a second. */
const COOL_DOWN = 4;
/** How far apart finishers ride their cool-down in single file, in grid units: three bike lengths (BIKE_LENGTH, trackSurface), room for the inside of a hairpin. */
const COOL_GAP = 1.1 * 3;

/** A finisher's cool-down: when and where they took the flag, how fast, and the edge they ride down. */
interface Finish {
  id: string;
  t1: number;
  d1: number;
  v: number;
  cruise: number;
  from: number;
  edge: number;
}
/** Gates in a start row, and the most riders the start takes (two rows; Boss, 28 Oct 2026: 16 looks cleaner than 20). */
export const ROW_SIZE = 8;
export const MAX_GRID = 16;
/** How far behind the front row the race view draws the second row, in grid units (RaceView: BIKE_LENGTH × 1.4). */
const ROW_GAP = 1.1 * 1.4;

/**
 * One rider riding up to their slot before the start: race times (negative), how far back they
 * set off (grid units behind their slot, along the start straight) and how far off their lane
 * line (a share of the half-width) they start, easing onto it.
 */
interface LineUpMove {
  t0: number;
  t1: number;
  back: number;
  side: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);
/** The ids in a seeded random order (its own draws, so the line-up's other draws stay as they were). */
const shuffled = (ids: string[], seed: number) => {
  const rnd = seededRng(mixSeed(seed, 1));
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export class RaceDirector {
  private readonly segs = new Map<string, Seg[]>();
  private readonly out = new Map<string, number>();
  private readonly pulled = new Map<string, number>();
  private readonly turns: number[];
  private readonly metres: number;
  private readonly gateLane = new Map<string, number>();
  private readonly gateRow = new Map<string, number>();
  /** The start straight; riders line up at its gate, at race distance start.from. */
  readonly start: StartGeom;
  /**
   * Seconds before the gate drops that the start procedure begins: riders still to line up roll
   * into their slots (`prep`), then everyone holds still for START_HOLD. Race time runs from
   * -prestart to 0 at the gate drop. 0 in practice, which has no line-up.
   */
  readonly prestart: number;
  /** Seconds the riders still to line up take to roll into their slots. */
  readonly prep: number;
  /** Riders already in their slot when the start procedure begins. */
  readonly lined = new Set<string>();
  /** The order riders reach their slots: the front row in pick order, then each row behind in pick order. Empty in practice. */
  readonly arrival: string[] = [];
  private readonly moves = new Map<string, LineUpMove>();
  private readonly lapUnits: number;
  private finishCache: { key: string; plan: Map<string, Finish> } | null = null;

  constructor(
    readonly track: TrackDef,
    readonly profiles: Map<string, RiderProfile>,
    /** Each rider's gate on lap 1, best first. */
    private readonly gates: Map<string, number>,
    /** Laps in the race, or null for practice. */
    readonly laps: number | null,
    /** The order riders picked their gates, which is the order they ride up to the start. Left out, a shuffle drawn from the track and the gates. */
    pickOrder?: string[],
  ) {
    const g = lapGeom(track.path);
    this.turns = sectionTurns(track, g);
    this.metres = lapMetres(track);
    this.lapUnits = g.total;
    this.start = startGeom(track, g);
    // Each rider's gate is their slot: gates 1 to 8 (0 to 7 here) are the front row, from the inside
    // of the first corner outwards, gates 9 to 16 the second row and 17 to 24 the third, each
    // straight behind the gate eight before it. A field of 8 or fewer is one row spread across the start.
    const order = [...gates.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const firstTurn = this.turns.find((t) => t !== 0) || 1;
    const n = order.length;
    if (n > MAX_GRID) throw new Error(`${n} riders, but the start has ${MAX_GRID} gates`);
    const used = new Set<number>();
    for (const [id, gate] of gates) {
      if (!Number.isInteger(gate) || gate < 0 || gate >= Math.max(n, 1) || used.has(gate)) throw new Error(`${id} has gate ${gate + 1}, which is not a free gate of the ${n}`);
      used.add(gate);
    }
    const perRow = n > ROW_SIZE ? ROW_SIZE : n;
    const step = perRow > 1 ? 1.8 / (perRow - 1) : 0;
    for (const [id, gate] of gates) {
      this.gateRow.set(id, Math.floor(gate / ROW_SIZE));
      this.gateLane.set(id, firstTurn * (perRow > 1 ? 0.9 - step * (gate % ROW_SIZE) : 0));
    }
    for (const id of profiles.keys()) this.segs.set(id, []);

    // The line-up, for a race. Riders reach their slots in the order they picked their gates, front
    // row first, as at a real start, so the gate fills unevenly: the first few (4 for a full field)
    // are already there, and the rest ride up from just behind the start pad over about LINE_UP seconds, several moving at once, each at their own pace from their own spot, in their
    // own lane, so nobody touches. A second-row rider only sets off once the front-row rider in their
    // lane has stopped in their slot, so they never ride through it. Then the field holds still.
    if (laps === null || n < 2) {
      this.prep = 0;
      this.prestart = 0;
      return;
    }
    let seed = 2166136261;
    for (const ch of `${track.id}|${order.join(',')}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    const rnd = seededRng(seed >>> 0);
    const k = Math.min(n, clamp(Math.round(n * 0.25), 4, ROW_SIZE));
    const gateOf = (id: string) => gates.get(id)!;
    const byGate = new Map(order.map((id) => [gateOf(id), id]));
    // Pick order, the front row first: a second-row rider stops in the slot the front-row rider of
    // their lane rides through, so the second row rolls in once the front row is in.
    const picks = pickOrder?.filter((id) => gates.has(id)).length === n ? pickOrder.filter((id) => gates.has(id)) : shuffled(order, seed >>> 0);
    const arrival = this.arrival;
    const rows = Math.ceil(n / ROW_SIZE);
    for (let row = 0; row < rows; row++) arrival.push(...picks.filter((id) => this.startRow(id) === row));
    for (const id of arrival.slice(0, k)) this.lined.add(id);
    // Riders drift onto their lane line from the same side, so neighbours never close up.
    const drift = rnd() < 0.5 ? -1 : 1;
    // Each rider's own draws, made once, so the plan can be tightened without changing who does what.
    const movers = arrival.slice(k).map((id) => ({ id, r: [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()] }));
    const build = (tight: number) => {
      const plan = new Map<string, LineUpMove>();
      let prev = 0;
      for (const { id, r } of movers) {
        const row = this.startRow(id);
        // Just clear of the pad (START_PAD behind the gate, plus room for the bike), the second row
        // about as far back as the front-row rider of their lane started.
        const ahead = row ? byGate.get(gateOf(id) - ROW_SIZE) : undefined;
        const fm = ahead ? plan.get(ahead) : undefined;
        const back = Math.max(START_PAD + 0.6 - row * ROW_GAP + r[0] * 1.2 * tight, fm ? fm.back - ROW_GAP + 1.35 + r[1] * 0.4 : -Infinity);
        // Each at their own easy pace: a top speed of 1.9 to 2.3 grid units a second.
        const ride = (1.5 * back) / (1.9 + r[2] * 0.4);
        // Arrive after the rider who picked before, and set off only once the lane ahead is filled.
        const laneFree = ahead ? (fm ? fm.t1 : 0) + 0.15 + r[3] * 0.3 * tight : 0;
        const t1 = Math.max(prev + 0.08 + r[4] * 0.3 * tight, ride + r[5] * 0.4 * tight, laneFree + ride);
        plan.set(id, { t0: t1 - ride, t1, back, side: drift * (0.01 + r[6] * 0.03) });
        prev = t1;
      }
      return { plan, prev };
    };
    // Tighten the gaps until it fits in LINE_UP without anyone hurrying (at most a fifth quicker).
    const lineUp = lineUpTime(n);
    let { plan, prev } = build(1);
    for (let tight = 0.8; prev > lineUp * 1.2 && tight >= 0; tight -= 0.2) ({ plan, prev } = build(tight));
    // Stretch or squeeze the whole plan so the last rider stops at LINE_UP: every rider keeps their
    // order and the second row still waits on the front.
    this.prep = plan.size ? lineUp : 0;
    this.prestart = this.prep + START_HOLD;
    const scale = prev > 0 ? lineUp / prev : 1;
    for (const [id, m] of plan) this.moves.set(id, { ...m, t0: -this.prestart + m.t0 * scale, t1: Math.min(-START_HOLD, -this.prestart + m.t1 * scale) });
  }

  /**
   * Where a rider is before the gate drops: in their slot, or rolling up to it from behind the
   * start pad. Slots are at the gate (race distance start.from); the race view sets the second
   * row back a bike length.
   */
  private lineUp(id: string, t: number): RiderPose {
    const lane = this.gateLane.get(id) ?? 0;
    const m = this.moves.get(id);
    if (!m || t >= m.t1) return { id, dist: this.start.from, lane, air: 0, elev: 0, state: 'grid', speed: 0 };
    const k = clamp((t - m.t0) / (m.t1 - m.t0), 0, 1);
    const left = 1 - smooth(k);
    // Speed from the eased ride, in metres per second.
    const speed = k > 0 && k < 1 ? ((6 * k * (1 - k) * m.back) / (m.t1 - m.t0)) * (this.metres / this.lapUnits) : 0;
    return { id, dist: this.start.from - (m.back * left) / this.lapUnits, lane: lane + m.side * left, air: 0, elev: 0, state: 'grid', speed };
  }

  /** True once every rider is in their slot and still (from START_HOLD seconds before the gate drops). */
  linedUp(t: number): boolean {
    return [...this.moves.values()].every((m) => t >= m.t1);
  }

  /** Which start row a rider lines up in: 0 at the gate, 1 just behind it, 2 behind that. */
  startRow(id: string): number {
    return this.gateRow.get(id) ?? 0;
  }

  /** A rider's gate, from 0 (gate 1). */
  gateOf(id: string): number {
    return this.gates.get(id) ?? 0;
  }

  /** Takes in a lap from the simulation. Call it in lap order, as the race screen does. */
  addLap(trace: LapTrace): void {
    for (const [id, times] of Object.entries(trace.times)) {
      const list = this.segs.get(id);
      if (!list) continue;
      for (let i = 1; i < times.length; i++) {
        list.push({ lap: trace.lap, si: trace.secs[i - 1], t0: times[i - 1], t1: times[i], d0: trace.marks[i - 1], d1: trace.marks[i] });
      }
    }
    for (const e of trace.events) {
      if (e.kind === 'retire') {
        this.out.set(e.rider, e.t);
        continue;
      }
      if (e.kind === 'breakdown') continue;
      const seg = this.segs.get(e.rider)?.find((s) => s.lap === trace.lap && s.si === e.section);
      if (!seg) continue;
      if (e.kind === 'mistake') {
        // Two mistakes in one section show as one, with the time of both.
        const lost = (seg.mistake?.lost ?? 0) + e.lost;
        const worse = seg.mistake && rank(seg.mistake.outcome) > rank(e.outcome) ? seg.mistake.outcome : e.outcome;
        seg.mistake = { outcome: worse, lost };
      } else if (e.kind === 'pass') seg.pass = e.other;
      else if (e.kind === 'failedPass') seg.blocked = e.other;
    }
  }

  /** Takes back the latest lap, to be replaced by the same lap run again (MotoSim.redoLap). */
  dropLap(trace: LapTrace): void {
    for (const list of this.segs.values()) while (list.length && list[list.length - 1].lap === trace.lap) list.pop();
    for (const e of trace.events) if (e.kind === 'retire' && this.out.get(e.rider) === e.t) this.out.delete(e.rider);
  }

  /** The player pulled off (the pit board's "It's over, bike blown"), at race time t. */
  retire(id: string, t: number): void {
    if (!this.pulled.has(id)) this.pulled.set(id, t);
  }

  /** Where every rider is, and what they are doing, at race time t (seconds from the gate drop). */
  poses(t: number): RiderPose[] {
    const poses: RiderPose[] = [];
    for (const [id, list] of this.segs) poses.push(this.pose(id, list, t));
    this.coolDown(poses);
    this.keepApart(poses);
    return poses;
  }

  private pose(id: string, list: Seg[], t: number, pulled = true): RiderPose {
    if (pulled) {
      const off = this.pulledOff(id, list, t);
      if (off) return off;
    }
    const p = this.profiles.get(id)!;
    if (!list.length || t <= list[0].t0) return this.lineUp(id, t);
    // The section the rider is in now: the first one that ends after t.
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t1 <= t) lo = mid + 1;
      else hi = mid;
    }
    if (lo >= list.length) return this.afterLast(id, p, list, t);
    const seg = list[lo];
    const prev = lo > 0 ? list[lo - 1] : null;
    const sec = this.section(seg.si);
    const dur = Math.max(1e-6, seg.t1 - seg.t0);
    const s = t - seg.t0;

    // Riding time and any time lost to a mistake, which happens part way through the section.
    const lost = Math.min(seg.mistake?.lost ?? 0, dur * 0.95);
    const ride = dur - lost;
    const at = this.mistakeAt(p, seg);
    let tau: number;
    let stopped = false;
    if (s < at * ride) tau = s / ride;
    else if (s < at * ride + lost) {
      tau = at;
      stopped = true;
    } else tau = (s - lost) / ride;
    tau = clamp(tau, 0, 1);

    const c = this.warp(p, sec.type);
    const u = clamp(tau - (c * Math.sin(2 * Math.PI * tau)) / (2 * Math.PI), 0, 1);
    const dist = seg.d0 + u * (seg.d1 - seg.d0);
    const speed = stopped ? 0 : (((seg.d1 - seg.d0) * this.metres) / Math.max(1e-6, ride)) * (1 - c * Math.cos(2 * Math.PI * tau));

    // Line: from the last section's line into this one's, quicker for a nimble rider on a good bike.
    const from = prev ? this.target(id, p, prev) : (this.gateLane.get(id) ?? 0);
    const to = this.target(id, p, seg);
    let lane = from + (to - from) * smooth(u / (0.2 + 0.35 * (1 - p.agility)));
    lane += p.wobble * 0.08 * Math.sin(t * 1.3 + p.seed * 40);

    let state: RiderState = 'riding';
    if (stopped && seg.mistake) {
      const crash = seg.mistake.outcome === 'minor_crash' || seg.mistake.outcome === 'serious_crash';
      if (crash) {
        state = s - at * ride < lost * 0.6 ? 'crashed' : 'remount';
        // A crashed bike slides towards the outside of the track.
        lane += (this.turn(seg.si) ? -this.turn(seg.si) : 1) * 0.25 * smooth((s - at * ride) / 0.6);
      } else state = 'wobble';
    }

    const { air, elev } = this.height(p, sec.type, sec.height, u, stopped);
    if (air > 0.05 && state === 'riding') state = 'air';
    return { id, dist, lane: clamp(lane, -1, 1), air, elev, state, speed };
  }

  /** After the rider's last section: finished, out of the race, or waiting for the next lap. */
  private afterLast(id: string, p: RiderProfile, list: Seg[], t: number): RiderPose {
    const last = list[list.length - 1];
    const side = p.seed < 0.5 ? -1 : 1;
    const outAt = this.out.get(id);
    if (outAt !== undefined && outAt <= t + 1e-9) {
      // Pulled off the track where they stopped.
      return { id, dist: last.d1, lane: side * (1 + 0.45 * smooth((t - Math.max(outAt, last.t1)) / 2)), air: 0, elev: 0, state: 'retired', speed: 0 };
    }
    if (this.laps !== null && last.d1 >= this.laps - 1e-9) {
      // A cool-down after the flag: ease off to a steady slow ride down one edge of the track and
      // keep rolling round, so finishers never park on the track where the riders behind are still
      // racing to the line (they all used to stop in a heap 40 m past it).
      const f = this.finishes().get(id)!;
      const dt = t - f.t1;
      return { id, dist: this.coolDist(f, t), lane: f.from + (f.edge * 0.7 - f.from) * smooth(dt / 3), air: 0, elev: 0, state: 'finished', speed: f.cruise + (f.v - f.cruise) * Math.exp(-dt / 2) };
    }
    return { id, dist: last.d1, lane: this.target(id, p, last), air: 0, elev: 0, state: 'waiting', speed: 0 };
  }

  /**
   * How each finisher rides their cool-down: from the line they crossed on to one edge, the edge
   * they were nearer, unless a rider who finished just before is still close ahead on it and the
   * other edge is clearer. Worked out in finishing order, again whenever the laps change.
   */
  private finishes(): Map<string, Finish> {
    const key = [...this.segs.values()].map((l) => l.length).join(',');
    if (this.finishCache?.key === key) return this.finishCache.plan;
    const plan = new Map<string, Finish>();
    const all: Finish[] = [];
    if (this.laps !== null) {
      for (const [id, list] of this.segs) {
        const last = list.at(-1);
        if (!last || last.d1 < this.laps - 1e-9) continue;
        const p = this.profiles.get(id)!;
        const v = ((last.d1 - last.d0) * this.metres) / Math.max(1e-6, last.t1 - last.t0);
        const from = this.target(id, p, last) + p.wobble * 0.08 * Math.sin(last.t1 * 1.3 + p.seed * 40);
        all.push({ id, t1: last.t1, d1: last.d1, v, cruise: Math.min(v, COOL_DOWN), from, edge: from >= 0 ? 1 : -1 });
      }
    }
    all.sort((a, b) => a.t1 - b.t1);
    const lastOn = new Map<number, Finish>();
    for (const f of all) {
      // How far past the line the last finisher down each edge is when this one crosses.
      const room = (edge: number) => {
        const lead = lastOn.get(edge);
        return lead ? this.coolDist(lead, f.t1) - f.d1 : Infinity;
      };
      if (room(f.edge) < COOL_GAP * 3 / this.lapUnits && room(-f.edge) > room(f.edge)) f.edge = -f.edge;
      lastOn.set(f.edge, f);
      plan.set(f.id, f);
    }
    this.finishCache = { key, plan };
    return plan;
  }

  /** Where a finisher is at time t on their cool-down, left to themselves. */
  private coolDist(f: Finish, t: number): number {
    const dt = Math.max(0, t - f.t1);
    return f.d1 + (f.cruise * dt + (f.v - f.cruise) * 2 * (1 - Math.exp(-dt / 2))) / this.metres;
  }

  /**
   * Riders cooling down ride in single file down each edge, COOL_GAP apart: one who took the flag
   * just behind another on the same edge eases off behind them instead of riding through them.
   * Each is held at the lesser of where they would be and where the rider ahead allows, but never
   * back over the line, so nobody ever rolls backwards.
   */
  private coolDown(poses: RiderPose[]): void {
    const plan = this.finishes();
    const gap = COOL_GAP / this.lapUnits;
    const done = poses.filter((q) => q.state === 'finished' && plan.has(q.id)).sort((a, b) => plan.get(a.id)!.t1 - plan.get(b.id)!.t1);
    const ahead = new Map<number, RiderPose>();
    for (const q of done) {
      const f = plan.get(q.id)!;
      const lead = ahead.get(f.edge);
      if (lead) q.dist = Math.min(q.dist, Math.max(f.d1, lead.dist - gap));
      ahead.set(f.edge, q);
    }
  }

  /** The line a rider aims for through a section: their own taste, the section's line, and any pass. */
  private target(id: string, p: RiderProfile, seg: Seg): number {
    const own = this.ownLine(id, p, seg);
    const other = seg.pass ?? seg.blocked;
    if (!other) return own;
    const op = this.profiles.get(other);
    const oseg = this.segs.get(other)?.find((s) => s.lap === seg.lap && s.si === seg.si);
    const theirs = op && oseg ? this.ownLine(other, op, oseg) : 0;
    if (seg.blocked) return clamp(theirs + (own >= theirs ? 0.2 : -0.2), -0.95, 0.95);
    // Pass on whichever side has more room, swinging wider the keener the rider.
    const swing = 0.65 + 0.35 * p.aggression;
    return clamp(theirs >= 0 ? theirs - swing : theirs + swing, -0.95, 0.95);
  }

  private ownLine(id: string, p: RiderProfile, seg: Seg): number {
    if (seg.si < 0) return this.gateLane.get(id) ?? 0;
    const sec = this.section(seg.si);
    const turn = this.turn(seg.si);
    if (CORNERS.has(sec.type) && turn) {
      const lines: Record<string, number> = { inside: 1, middle: 0, outside: -1 };
      const pref = sec.line ? 0.6 * (lines[sec.line] ?? 0) + 0.4 * p.line : p.line;
      // Positive lane is the rider's right, so the inside of a right-hand turn.
      return clamp(pref * 0.75 * turn, -0.9, 0.9);
    }
    return clamp(p.lane * 0.8, -0.9, 0.9);
  }

  /**
   * How speed changes through a section, from -0.6 (slow in the middle: braking in, driving out of
   * a corner) to 0.6 (fastest in the middle: a straight).
   */
  private warp(p: RiderProfile, type: string): number {
    if (CORNERS.has(type)) return -(type === 'hairpin' ? 0.6 : type === 'fast_sweeper' ? 0.25 : 0.5) * (1 - 0.6 * p.cornerSpeed);
    if (type === 'straight' || type === 'start_gate' || type === 'downhill') return 0.15 + 0.35 * p.drive;
    if (type === 'uphill') return -0.1 * (1 - p.drive);
    if (type === 'whoops' || type === 'braking_bumps') return -0.2 * (1 - p.skim);
    return 0;
  }

  /** The section ridden in a stretch; -1 is the start straight, ridden as a start. */
  private section(si: number): Pick<TrackSection, 'type' | 'height' | 'line'> {
    return si < 0 ? { type: 'start_gate' } : this.track.sections[si];
  }

  private turn(si: number): number {
    return si < 0 ? 0 : this.turns[si];
  }

  /** Where in a section a mistake happens: on landing for a jump, otherwise part way through. */
  private mistakeAt(p: RiderProfile, seg: Seg): number {
    if (!seg.mistake) return 1;
    const type = this.section(seg.si).type;
    if (BIG_JUMPS.has(type)) return LANDING;
    return 0.35 + 0.3 * frac(p.seed * 7 + seg.si * 0.37 + seg.lap * 0.13);
  }

  private height(p: RiderProfile, type: string, set: number | undefined, u: number, stopped: boolean): { air: number; elev: number } {
    const h = set ?? DEFAULT_HEIGHTS[type] ?? 0;
    let air = 0;
    let elev = 0;
    if (!stopped) {
      if (BIG_JUMPS.has(type) && u > TAKEOFF && u < LANDING) {
        const x = (u - TAKEOFF) / (LANDING - TAKEOFF);
        air = h * (1 - 0.5 * p.scrub) * 4 * x * (1 - x);
      } else if (type === 'rhythm') {
        // Three jumps in a row.
        const x = (u * 3) % 1;
        if (x > 0.1 && x < 0.75) air = h * (1 - 0.4 * p.scrub) * 4 * ((x - 0.1) / 0.65) * (1 - (x - 0.1) / 0.65);
      } else if (type === 'whoops') air = h * (1 - p.skim) * Math.abs(Math.sin(u * Math.PI * 10));
      else if (type === 'braking_bumps') air = 0.15 * (1 - p.skim) * Math.abs(Math.sin(u * Math.PI * 14));
    }
    if (type === 'uphill' || type === 'downhill') elev = h * Math.sin(Math.PI * u);
    return { air, elev };
  }

  /** The player pulled off part way round: they stop where they are, not at the end of the lap. */
  private pulledOff(id: string, list: Seg[], t: number): RiderPose | null {
    const at = this.pulled.get(id);
    if (at === undefined || t < at) return null;
    const where = this.pose(id, list, at, false);
    const side = where.lane >= 0 ? 1 : -1;
    return { ...where, lane: side * Math.max(Math.abs(where.lane), 1 + 0.45 * smooth((t - at) / 2)), air: 0, state: 'retired', speed: 0 };
  }

  /** Riders side by side ease apart so they don't ride through each other. */
  private keepApart(poses: RiderPose[]): void {
    const racing = poses.filter((q) => q.state !== 'grid' && q.state !== 'retired').sort((a, b) => b.dist - a.dist);
    for (let i = 0; i < racing.length; i++) {
      for (let j = i + 1; j < racing.length; j++) {
        const a = racing[i];
        const b = racing[j];
        const gap = (a.dist - b.dist) * this.metres;
        if (gap > ROOM) break;
        const dl = b.lane - a.lane;
        if (Math.abs(dl) >= 0.5) continue;
        const push = (0.5 - Math.abs(dl)) * 0.5 * (1 - gap / ROOM);
        const dir = dl === 0 ? (frac(this.profiles.get(b.id)!.seed * 13) < 0.5 ? -1 : 1) : Math.sign(dl);
        // The rider behind gives most of the room, but a rider cooling down after the flag gives
        // way to anyone still racing.
        const give = a.state === 'finished' && b.state !== 'finished' ? 0.2 : 0.7;
        b.lane = clamp(b.lane + dir * push * give, -1, 1);
        a.lane = clamp(a.lane - dir * push * (1 - give), -1, 1);
      }
    }
  }
}

/** A director for a moto: every rider's profile from their skills, bike and message at the start. */
export function directorFor(sim: MotoSim, bikes: BikesData, messages: MessageDef[], pickOrder?: string[]): RaceDirector {
  const ceiling = bikes.classes.find((c) => c.id === sim.classId)?.ceiling ?? 1;
  const profiles = new Map<string, RiderProfile>();
  const gates = new Map<string, number>();
  for (const r of sim.riders) {
    profiles.set(r.e.id, riderProfile(r.e, r.stats, ceiling, messages.find((m) => m.id === r.message)));
    gates.set(r.e.id, r.e.gate);
  }
  return new RaceDirector(sim.track, profiles, gates, sim.totalLaps, pickOrder);
}

function rank(o: MistakeOutcome['id']): number {
  return ['small', 'big', 'minor_crash', 'serious_crash'].indexOf(o);
}

/** Height of the ground in metres at lap fraction f (hills), for the race view. */
export function groundElev(track: TrackDef, bounds: number[], f: number): number {
  const at = f - Math.floor(f);
  let si = 0;
  while (si < track.sections.length - 1 && bounds[si + 1] <= at) si++;
  const sec = track.sections[si];
  if (sec.type !== 'uphill' && sec.type !== 'downhill') return 0;
  const u = (at - bounds[si]) / Math.max(1e-9, bounds[si + 1] - bounds[si]);
  return (sec.height ?? DEFAULT_HEIGHTS[sec.type]) * Math.sin(Math.PI * u);
}
