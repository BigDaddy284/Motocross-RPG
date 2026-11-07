// A rider's planned ride round a lap (Boss, 4 Nov 2026: "i want fluid racing… no stutters, no
// instant slowdowns or stops unless that rider has crashed"; and on 3 Nov: "calculate a lap in
// advance and flow smoothly round the track gaining and losing speed realistically").
//
// The simulation (race.ts) says when each rider reaches the end of each section. Before this, the
// rider AI acted that out section by section, each with its own speed curve pinned to those times,
// and whatever it took to be on time at every mark: a short straight between two slow sections
// needed a burst of speed, a rider held up behind a wheel was capped to it. That read on screen as
// stutters. Now a whole lap is planned at once as a speed profile along the track: each section
// aims at the average speed the simulation's time implies, shaped by the rider's style (braking
// into and driving out of a corner, flat out down a straight), and the profile is then limited so
// the rider never speeds up faster than ACCEL, never brakes harder than BRAKE, holds their speed
// through the air and stops only for a crash. Each section's speed is adjusted until the plan
// takes the simulation's time through it as nearly as those limits allow, and the lap's times are
// then stretched to end exactly when the simulation says: the lap's start and finish are on time
// to the millisecond, and the marks between sections are crossed close to on time.

export interface PlanSection {
  /** Metres from the race start to the section's start and end. */
  s0: number;
  s1: number;
  /** When the simulation says the rider was at each end. */
  t0: number;
  t1: number;
  /** The rider's style through the section: positive is fastest in the middle, negative slowest (riderAI warp). */
  style: number;
  /** A mistake part way through: where (share of the section), the seconds it cost, and whether it is a crash (a stop) or a slip (a slow stretch). */
  mistake?: { at: number; lost: number; crash: boolean };
  /** Hops flown through the section, as shares of it: speed is held through each. */
  hops: [number, number][];
  /** A sprint's wait at the start line: stood at the start for the whole time. */
  queue?: boolean;
  /** A sprint's return lane: rolled down at an even speed from its start, whatever the speed over the line before it (the queue keeps riders apart there). */
  even?: boolean;
}

export type PieceKind = 'ride' | 'air' | 'slip' | 'stop' | 'queue';

export interface Piece {
  t0: number;
  t1: number;
  /** Metres from the race start at each end. */
  s0: number;
  s1: number;
  /** Speed at each end, in metres a second (speed changes evenly through a piece). */
  v0: number;
  v1: number;
  /** The section (index into the lap's list) the piece is in. */
  sec: number;
  kind: PieceKind;
}

export interface LapPlan {
  pieces: Piece[];
  /** Speed at the end of the lap, carried into the next. */
  vEnd: number;
  /** How much the lap's planned times were stretched to end when the simulation says (1 is not at all). */
  warp: number;
}

/** The most a rider speeds up, in metres a second a second. */
export const ACCEL = 5;
/** The most a rider brakes, in metres a second a second. */
export const BRAKE = 8;
/** How slow a slip (a wobble, not a crash) takes the rider, as a share of the section's pace. */
const SLIP_SPEED = 0.45;
/** The slow stretch after a slip, as a share of the section, and how far into it the rider is slowest (a slip on landing is braked for after the landing, not through the air). */
const SLIP_STRETCH = 0.3;
const SLIP_DIP = 0.1;
/** Knots are placed at most this far apart along the track, in metres. */
const KNOT_METRES = 6;
/** The speed a piece is given at the least, so no piece takes forever (the rider is always moving unless stopped). */
const CRAWL = 0.4;

interface Knot {
  s: number;
  /** Share of the section. */
  u: number;
  sec: number;
  /** The span from this knot to the next is flown. */
  air: boolean;
  /** The span from this knot to the next is the slow stretch after a slip. */
  slip: boolean;
  /** A crash: the rider stops here for the mistake's time, then starts again from nothing. */
  stop: number;
  /** The speed aimed at, as a share of the section's pace. */
  shape: number;
  v: number;
}

const styleShape = (c: number, u: number) => 1 + c * (1 - Math.cos(2 * Math.PI * u) - 6 * u * (1 - u));

/** The knots of a section: its ends, its hops' ends, its mistake, and no more than KNOT_METRES apart between. */
function knotsOf(sec: PlanSection, i: number): Knot[] {
  const L = sec.s1 - sec.s0;
  const cuts = new Set<number>([0, 1]);
  for (const [a, b] of sec.hops) { cuts.add(a); cuts.add(b); }
  // A mistake in the air happens on landing.
  const m = sec.mistake ? { ...sec.mistake } : undefined;
  if (m) for (const [a, b] of sec.hops) if (m.at > a && m.at < b) m.at = b;
  if (m) {
    cuts.add(m.at);
    if (!m.crash) { cuts.add(Math.min(1, m.at + SLIP_DIP)); cuts.add(Math.min(1, m.at + SLIP_STRETCH)); }
  }
  const fixed = [...cuts].filter((u) => u >= 0 && u <= 1).sort((a, b) => a - b);
  const us: number[] = [];
  for (let k = 0; k < fixed.length; k++) {
    us.push(fixed[k]);
    if (k + 1 < fixed.length) {
      const gap = (fixed[k + 1] - fixed[k]) * L;
      const n = Math.ceil(gap / KNOT_METRES);
      for (let j = 1; j < n; j++) us.push(fixed[k] + ((fixed[k + 1] - fixed[k]) * j) / n);
    }
  }
  const inHop = (u: number) => sec.hops.some(([a, b]) => u >= a - 1e-9 && u < b - 1e-9);
  const inSlip = (u: number) => !!m && !m.crash && u >= m.at - 1e-9 && u < Math.min(1, m.at + SLIP_STRETCH) - 1e-9;
  return us.map((u) => {
    const stop = m && m.crash && Math.abs(u - m.at) < 1e-9 ? m.lost : 0;
    let shape = styleShape(sec.style, u);
    if (m && !m.crash && Math.abs(u - Math.min(1, m.at + SLIP_DIP)) < 1e-9) shape = SLIP_SPEED;
    return { s: sec.s0 + u * L, u, sec: i, air: inHop(u), slip: inSlip(u), stop, shape, v: 0 };
  });
}

/**
 * Plans a lap: the sections in order (the first starting where the last lap ended), the speed
 * the rider arrives at (0 at the gate), and the speed to aim for at the lap's end (the next lap's
 * first section is not known yet; the caller gives this lap's own first section's pace).
 */
export function planLap(secs: PlanSection[], vStart: number, vEndAim: number): LapPlan {
  if (!secs.length) return { pieces: [], vEnd: vStart, warp: 1 };
  // Knots along the lap; a section's end knot is the next one's start (and belongs to it, as the
  // span from a knot to the next is that knot's section's).
  const knots: Knot[] = [];
  for (let i = 0; i < secs.length; i++) {
    const ks = knotsOf(secs[i], i);
    if (knots.length) knots.pop();
    knots.push(...ks);
  }
  // Each section's pace: its length over the simulation's time through it, less a crash's stop.
  const pace = secs.map((sec) => {
    const ride = sec.t1 - sec.t0 - (sec.mistake?.crash ? sec.mistake.lost : 0);
    return Math.max(CRAWL, (sec.s1 - sec.s0) / Math.max(0.05, ride));
  });
  const base = [...pace];
  const n = knots.length;
  const last = n - 1;
  const times = (): number[] => {
    // The plan's time through each section.
    const out = secs.map(() => 0);
    for (let k = 0; k < last; k++) {
      const a = knots[k];
      const b = knots[k + 1];
      const v = Math.max(CRAWL, (a.v + b.v) / 2);
      out[a.sec] += (b.s - a.s) / v;
    }
    return out;
  };
  // The lap's times are stretched at the end to end when the simulation says, which scales its
  // speeds by the same; the start speed is pre-scaled by the stretch found so far, so the lap
  // starts at exactly the speed the last one ended on.
  let w0 = 1;
  const limit = () => {
    // Aim: the section's pace shaped by the rider's style; the lap's end as asked.
    for (let k = 0; k < n; k++) {
      const q = knots[k];
      // A crash is sudden: the rider arrives at it at whatever speed they were doing.
      q.v = secs[q.sec].queue ? 0 : q.stop > 0 ? Infinity : pace[q.sec] * q.shape;
    }
    knots[last].v = Math.min(knots[last].v, vEndAim);
    knots[0].v = vStart * w0;
    // Then within reach: no speeding up faster than ACCEL, no braking harder than BRAKE, speed held
    // through the air, from nothing after a crash (and no braking into one: a crash is sudden).
    // Both passes only ever lower speeds, so a few rounds settle it.
    // The start speed is given (the last lap's end), so where it is more than the first knots
    // ask for, they are raised instead: the rider brakes down to pace as hard as BRAKE allows.
    for (let round = 0; round < 6; round++) {
      for (let k = 1; k < n; k++) {
        const a = knots[k - 1];
        const b = knots[k];
        const from = a.stop > 0 ? 0 : a.v;
        const ds = b.s - a.s;
        const acc = a.air ? 0 : ACCEL;
        const brake = a.air ? 0 : BRAKE;
        b.v = Math.min(b.v, Math.sqrt(from * from + 2 * acc * ds));
        if (b.stop === 0 && !secs[b.sec].queue) b.v = Math.max(b.v, Math.sqrt(Math.max(0, from * from - 2 * brake * ds)));
      }
      for (let k = last - 1; k >= 1; k--) {
        const a = knots[k];
        const b = knots[k + 1];
        // No braking into a crash, and after one the rider starts again from nothing.
        if (b.stop > 0 || a.stop > 0) continue;
        const ds = b.s - a.s;
        const brake = a.air ? 0 : BRAKE;
        const acc = a.air ? 0 : ACCEL;
        a.v = Math.min(a.v, Math.sqrt(b.v * b.v + 2 * brake * ds));
        if (!secs[a.sec].queue) a.v = Math.max(a.v, Math.sqrt(Math.max(0, b.v * b.v - 2 * acc * ds)));
      }
    }
    for (const q of knots) if (secs[q.sec].even) q.v = pace[q.sec];
  };
  // Adjust each section's pace until the plan takes the simulation's time through it, as nearly
  // as the limits allow (a section they stop the rider matching stays short of it; the lap's
  // stretch below makes that up).
  const wants = secs.map((sec) => {
    const m = sec.mistake;
    return sec.queue ? 0 : Math.max(0.05, sec.t1 - sec.t0 - (m?.crash ? m.lost : 0));
  });
  const wantLap = wants.reduce((a, b) => a + b, 0);
  for (let it = 0; it < 16; it++) {
    limit();
    const got = times();
    let worst = 0;
    // Each section towards its own time, then the whole lap towards its total (a section the
    // limits stop from matching leaves the rest to make its time up), so the stretch below stays
    // small and the lap's end speed carries into the next lap unchanged.
    const lapF = got.reduce((a, b) => a + b, 0) / Math.max(0.05, wantLap);
    for (let i = 0; i < secs.length; i++) {
      if (secs[i].queue) continue;
      const f = got[i] / wants[i];
      worst = Math.max(worst, Math.abs(f - 1), Math.abs(lapF - 1));
      pace[i] = Math.min(base[i] * 2.5, Math.max(base[i] * 0.4, pace[i] * Math.pow(f, 0.7) * Math.pow(lapF, 0.5)));
    }
    if (worst < 0.001) break;
  }
  // The pieces, timed from the lap's start, then each stretch between the times that are pinned
  // (the lap's start and end, and a sprint queue's wait, which stands for exactly the
  // simulation's time) stretched to end exactly when the simulation says.
  let pieces: Piece[] = [];
  let warp = 1;
  const build = () => {
  limit();
  pieces = [];
  warp = 1;
  let t = secs[0].t0;
  for (let k = 0; k < last; k++) {
    const a = knots[k];
    const b = knots[k + 1];
    const sec = secs[a.sec];
    if (sec.queue) {
      const prev = pieces[pieces.length - 1];
      if (!prev || prev.kind !== 'queue' || prev.sec !== a.sec) pieces.push({ t0: t, t1: t, s0: a.s, s1: a.s, v0: 0, v1: 0, sec: a.sec, kind: 'queue' });
      continue;
    }
    if (a.stop > 0) {
      pieces.push({ t0: t, t1: t + a.stop, s0: a.s, s1: a.s, v0: 0, v1: 0, sec: a.sec, kind: 'stop' });
      t += a.stop;
    }
    const v0 = a.stop > 0 ? 0 : a.v;
    const v1 = b.v;
    const dt = (b.s - a.s) / Math.max(CRAWL, (v0 + v1) / 2);
    pieces.push({ t0: t, t1: t + dt, s0: a.s, s1: b.s, v0, v1, sec: a.sec, kind: a.air ? 'air' : a.slip ? 'slip' : 'ride' });
    t += dt;
  }
  const stretch = (from: number, to: number, simFrom: number, simTo: number) => {
    if (to <= from) return;
    // A crash's stop lasts exactly its time; the riding between is stretched.
    let stops = 0;
    for (let i = from; i < to; i++) if (pieces[i].kind === 'stop') stops += pieces[i].t1 - pieces[i].t0;
    const t0 = pieces[from].t0;
    const t1 = pieces[to - 1].t1;
    const w = (simTo - simFrom - stops) / Math.max(1e-6, t1 - t0 - stops);
    warp = Math.max(warp, Math.max(w, 1 / w));
    let t = simFrom;
    for (let i = from; i < to; i++) {
      const p = pieces[i];
      const dur = p.kind === 'stop' ? p.t1 - p.t0 : (p.t1 - p.t0) * w;
      p.t0 = t;
      p.t1 = t + dur;
      t += dur;
      if (p.kind !== 'stop') { p.v0 /= w; p.v1 /= w; }
    }
    pieces[to - 1].t1 = simTo;
  };
  let from = 0;
  let simFrom = secs[0].t0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.kind !== 'queue') continue;
    const sec = secs[p.sec];
    stretch(from, i, simFrom, sec.t0);
    p.t0 = sec.t0;
    p.t1 = sec.t1;
    from = i + 1;
    simFrom = sec.t1;
  }
  stretch(from, pieces.length, simFrom, secs[secs.length - 1].t1);
  };
  for (let round = 0; round < 4; round++) {
    build();
    const first = pieces.find((p) => p.kind !== 'queue');
    if (!first || vStart <= 0) break;
    // The stretch the lap's first stretch got: aim the start speed so it comes out as vStart.
    const got = first.v0 / vStart;
    if (Math.abs(got - 1) < 0.001) break;
    w0 /= got;
  }
  return { pieces, vEnd: pieces.length ? pieces[pieces.length - 1].v1 : vStart, warp };
}

/** Where a piece has the rider at time t: metres from the race start and speed. */
export function alongPiece(p: Piece, t: number): { s: number; v: number } {
  if (p.kind === 'stop' || p.kind === 'queue') return { s: p.s0, v: 0 };
  const dur = Math.max(1e-9, p.t1 - p.t0);
  const k = Math.max(0, Math.min(1, (t - p.t0) / dur));
  const acc = (p.v1 - p.v0) / dur;
  const tau = k * dur;
  return { s: Math.min(p.s1, p.s0 + p.v0 * tau + 0.5 * acc * tau * tau), v: p.v0 + acc * tau };
}
