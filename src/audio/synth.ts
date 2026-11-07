import type { Channel, EngineKind } from '../core/sound';

// The game's sounds, made in code with the Web Audio API (Boss, 7 Nov 2026: "let's go with them
// all"). The same recipes as the demo page tools/audio-demo.html, where each has its code (U1,
// E5, R8…); keep the two in step when a sound changes. No audio files, so it all plays offline.

export interface Stoppable {
  stop(): void;
}

/** The audio graph: one context, a master gain through a gentle compressor, a gain per channel. */
export class Synth {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly buses: Record<Channel, GainNode>;
  private readonly noise: AudioBuffer;
  private readonly curves = new Map<number, Float32Array<ArrayBuffer>>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const bus = () => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { music: bus(), engines: bus(), crowd: bus(), effects: bus() };
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  noiseSrc(loop = true): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  filt(type: BiquadFilterType, freq: number, Q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  gain(v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  pan(p: number): StereoPannerNode | null {
    if (!this.ctx.createStereoPanner) return null;
    const n = this.ctx.createStereoPanner();
    n.pan.value = p;
    return n;
  }

  osc(type: OscillatorType, f: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  }

  shaper(k: number): WaveShaperNode {
    let c = this.curves.get(k);
    if (!c) {
      const n = 1024;
      c = new Float32Array(new ArrayBuffer(n * 4));
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(k * x) / Math.tanh(k);
      }
      this.curves.set(k, c);
    }
    const s = this.ctx.createWaveShaper();
    s.curve = c;
    s.oversample = '2x';
    return s;
  }

  /** A percussive envelope: up to `peak` in `attack`, down over `decay`. */
  env(t: number, attack: number, peak: number, decay: number, out?: AudioNode): GainNode {
    const g = this.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    if (out) g.connect(out);
    return g;
  }
}

export function chain(...nodes: (AudioNode | null | undefined)[]): AudioNode {
  const ns = nodes.filter((n): n is AudioNode => !!n);
  for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
  return ns[ns.length - 1];
}

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export interface ToneOpts {
  t?: number;
  type?: OscillatorType;
  f?: number;
  f2?: number | null;
  glide?: number | null;
  dur?: number;
  a?: number;
  g?: number;
  bus?: Channel;
  out?: AudioNode;
  lp?: number | null;
  p?: number;
}

export function tone(s: Synth, o: ToneOpts): void {
  const t = o.t ?? s.now;
  const dur = o.dur ?? 0.2;
  const a = o.a ?? 0.005;
  const f = o.f ?? 440;
  const osc = s.osc(o.type ?? 'sine', f);
  osc.frequency.setValueAtTime(f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? dur));
  const e = s.env(t, a, o.g ?? 0.3, dur);
  chain(osc, o.lp ? s.filt('lowpass', o.lp) : null, e, s.pan(o.p ?? 0), o.out ?? s.buses[o.bus ?? 'effects']);
  osc.start(t);
  osc.stop(t + a + dur + 0.05);
}

export interface HissOpts {
  t?: number;
  dur?: number;
  a?: number;
  g?: number;
  type?: BiquadFilterType;
  f?: number;
  f2?: number | null;
  Q?: number;
  bus?: Channel;
  out?: AudioNode;
  p?: number;
}

export function hiss(s: Synth, o: HissOpts): void {
  const t = o.t ?? s.now;
  const dur = o.dur ?? 0.1;
  const a = o.a ?? 0.002;
  const src = s.noiseSrc(false);
  const fl = s.filt(o.type ?? 'bandpass', o.f ?? 1000, o.Q ?? 1);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const e = s.env(t, a, o.g ?? 0.3, dur);
  chain(src, fl, e, s.pan(o.p ?? 0), o.out ?? s.buses[o.bus ?? 'effects']);
  src.start(t, rnd(0, 2));
  src.stop(t + a + dur + 0.05);
}

/** A metallic hit: inharmonic partials. */
export function clang(s: Synth, t: number, base: number, g: number, dur: number, bus: Channel = 'effects', p = 0): void {
  for (const [r, a] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25], [13.3, 0.15]]) tone(s, { t, f: base * r, dur: dur / Math.sqrt(r), g: g * a, bus, p });
}

export function thump(s: Synth, t: number, f = 90, g = 0.8, dur = 0.3, bus: Channel = 'effects'): void {
  tone(s, { t, f, f2: f * 0.4, dur, g, bus });
}

// ---------- engines ----------

interface BikeSound {
  idle: number;
  max: number;
  /** Firings per crank turn: 1 for a two-stroke single, 0.5 for a four-stroke single, 2 for a four-cylinder. */
  fires: number;
  body: number;
  q: number;
  saw: number;
  sq: number;
  rasp: number;
  k: number;
  gain: number;
  sub?: boolean;
  clatter?: boolean;
}

/** One engine sound per class (demo E1 to E7) and the van (W15). */
export const BIKES: Record<EngineKind, BikeSound> = {
  '50cc': { idle: 2600, max: 12500, fires: 1, body: 2200, q: 2.2, saw: 0.5, sq: 0.15, rasp: 0.55, k: 2.5, gain: 0.5 },
  '65cc': { idle: 2300, max: 12500, fires: 1, body: 1900, q: 2.0, saw: 0.55, sq: 0.18, rasp: 0.55, k: 2.6, gain: 0.55 },
  '85cc': { idle: 2000, max: 12000, fires: 1, body: 1600, q: 1.8, saw: 0.6, sq: 0.2, rasp: 0.6, k: 2.8, gain: 0.6 },
  '125cc': { idle: 1800, max: 11500, fires: 1, body: 1400, q: 1.6, saw: 0.65, sq: 0.25, rasp: 0.65, k: 3.0, gain: 0.65 },
  '250f': { idle: 1800, max: 13500, fires: 0.5, body: 700, q: 1.0, saw: 0.5, sq: 0.6, rasp: 0.45, k: 3.5, gain: 0.75 },
  '450f': { idle: 1500, max: 11000, fires: 0.5, body: 500, q: 0.9, saw: 0.45, sq: 0.75, rasp: 0.5, k: 4.0, gain: 0.85 },
  sidecar: { idle: 1300, max: 9500, fires: 0.5, body: 380, q: 0.8, saw: 0.4, sq: 0.85, rasp: 0.55, k: 4.5, gain: 0.9, sub: true },
  van: { idle: 800, max: 4200, fires: 2, body: 300, q: 0.7, saw: 0.35, sq: 0.5, rasp: 0.8, k: 2.0, gain: 0.55, clatter: true },
};

/** A running engine: firing oscillators and combustion rasp through drive and an exhaust body. */
export class Engine implements Stoppable {
  readonly spec: BikeSound;
  readonly out: GainNode;
  readonly lp: BiquadFilterNode;
  readonly panner: StereoPannerNode | null;
  private readonly saw: OscillatorNode;
  private readonly sq: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly wob: OscillatorNode;
  private readonly wobG: GainNode;
  private readonly pre: GainNode;
  private readonly body: BiquadFilterNode;
  private readonly noise: AudioBufferSourceNode;
  private readonly knock: OscillatorNode | null = null;
  private readonly knockSrc: AudioBufferSourceNode | null = null;
  private level: number;
  stopped = false;

  constructor(private readonly s: Synth, kind: EngineKind, opts: { bus?: Channel; p?: number; level?: number } = {}) {
    const sp = (this.spec = BIKES[kind]);
    const t = s.now;
    this.level = opts.level ?? 1;
    this.saw = s.osc('sawtooth', 50);
    this.sq = s.osc('square', 50);
    this.sub = s.osc('triangle', 25);
    const am = s.gain(0);
    const amDepth = s.gain(sp.rasp);
    this.saw.connect(amDepth);
    amDepth.connect(am.gain);
    this.noise = s.noiseSrc();
    chain(this.noise, s.filt('bandpass', sp.body * 1.6, 0.8), am);
    this.wob = s.osc('sine', rnd(5, 9));
    this.wobG = s.gain(0);
    this.wob.connect(this.wobG);
    this.wobG.connect(this.saw.frequency);
    this.wobG.connect(this.sq.frequency);
    this.pre = s.gain(1);
    this.body = s.filt('peaking', sp.body, sp.q);
    this.body.gain.value = 9;
    this.lp = s.filt('lowpass', 1200, 0.6);
    this.out = s.gain(0);
    this.panner = s.pan(opts.p ?? 0);
    chain(this.saw, s.gain(sp.saw), this.pre);
    chain(this.sq, s.gain(sp.sq), this.pre);
    chain(this.sub, s.gain(sp.sub ? 0.5 : 0.12), this.pre);
    am.connect(this.pre);
    chain(this.pre, s.shaper(sp.k), this.body, this.lp, this.out, this.panner, s.buses[opts.bus ?? 'engines']);
    if (sp.clatter) {
      // Diesel knock: a click each firing.
      this.knock = s.osc('square', 50);
      const kg = s.gain(0);
      this.knockSrc = s.noiseSrc();
      this.knock.connect(kg.gain);
      chain(this.knockSrc, s.filt('bandpass', 2400, 3), kg, s.gain(0.25), this.out);
      this.knockSrc.start(t, rnd(0, 2));
    }
    for (const o of [this.saw, this.sq, this.sub, this.wob, this.knock]) o?.start(t);
    this.noise.start(t, rnd(0, 2));
    this.set(sp.idle, 0, 0.001);
    this.out.gain.setTargetAtTime(sp.gain * this.level * 0.45, t, 0.05);
  }

  /** rpm and throttle (0 to 1), eased over tc seconds from time t. */
  set(rpm: number, throttle: number, tc = 0.04, t = this.s.now): void {
    if (this.stopped) return;
    const sp = this.spec;
    const f = (rpm / 60) * sp.fires;
    this.saw.frequency.setTargetAtTime(f, t, tc);
    this.sq.frequency.setTargetAtTime(f * (sp.fires < 1 ? 1 : 2), t, tc);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, tc);
    this.knock?.frequency.setTargetAtTime(f, t, tc);
    this.wobG.gain.setTargetAtTime(f * (0.012 + 0.02 * (1 - throttle)), t, tc);
    const frac = (rpm - sp.idle) / (sp.max - sp.idle);
    this.pre.gain.setTargetAtTime(0.7 + throttle * 2.2 + frac * 0.6, t, tc);
    this.lp.frequency.setTargetAtTime(500 + frac * 2600 + throttle * 2400, t, tc);
    this.body.frequency.setTargetAtTime(sp.body * (0.85 + frac * 0.5), t, tc);
  }

  /** rpm as a share of the engine's range (0 idle, 1 the limiter). */
  setFrac(frac: number, throttle: number, tc = 0.04, t = this.s.now): void {
    this.set(this.spec.idle + frac * (this.spec.max - this.spec.idle), throttle, tc, t);
  }

  setLevel(level: number, tc = 0.05, t = this.s.now): void {
    if (this.stopped) return;
    this.level = level;
    this.out.gain.setTargetAtTime(this.spec.gain * level * 0.45, t, tc);
  }

  setPan(p: number): void {
    this.panner?.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), this.s.now, 0.1);
  }

  stop(t = this.s.now): void {
    if (this.stopped) return;
    this.stopped = true;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.08);
    for (const o of [this.saw, this.sq, this.sub, this.wob, this.knock, this.noise, this.knockSrc]) o?.stop(t + 0.6);
  }
}

/** A bike passing the camera (E9): high and loud coming, lower going, across the stereo. */
export function flyBy(s: Synth, kind: EngineKind, delay = 0, o: { rpm?: number; len?: number; from?: number; to?: number; level?: number } = {}): Engine {
  const len = o.len ?? 2.6;
  const from = o.from ?? -1;
  const to = o.to ?? 1;
  const e = new Engine(s, kind, { p: from, level: 0 });
  const sp = e.spec;
  const t0 = s.now + delay;
  const r = sp.idle + (o.rpm ?? 0.85) * (sp.max - sp.idle);
  e.set(r * 1.06, 1, 0.001, t0);
  e.set(r * 0.93, 0.9, 0.12, t0 + len / 2);
  e.out.gain.cancelScheduledValues(t0);
  e.out.gain.setValueAtTime(0.0001, t0);
  e.out.gain.exponentialRampToValueAtTime(sp.gain * (o.level ?? 1) * 0.5, t0 + len / 2);
  e.out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  e.lp.frequency.cancelScheduledValues(t0);
  e.lp.frequency.setValueAtTime(900, t0);
  e.lp.frequency.linearRampToValueAtTime(5000, t0 + len / 2);
  e.lp.frequency.linearRampToValueAtTime(700, t0 + len);
  if (e.panner) {
    e.panner.pan.setValueAtTime(from, t0);
    e.panner.pan.linearRampToValueAtTime(to, t0 + len);
  }
  setTimeout(() => e.stop(), (delay + len + 0.3) * 1000);
  return e;
}

// ---------- crowd ----------

/** The crowd along the track (R14), with cheers on top (R15). */
export class Crowd implements Stoppable {
  private readonly out: GainNode;
  private readonly src: AudioBufferSourceNode;
  private readonly lfos: OscillatorNode[] = [];
  stopped = false;

  constructor(private readonly s: Synth, level = 0.35) {
    this.out = s.gain(0);
    this.out.connect(s.buses.crowd);
    this.src = s.noiseSrc();
    for (const [f, a] of [[320, 0.9], [650, 0.8], [1150, 0.6], [2300, 0.25]]) {
      const g = s.gain(a);
      const lfo = s.osc('sine', rnd(0.15, 0.6));
      const lg = s.gain(a * 0.35);
      lfo.connect(lg);
      lg.connect(g.gain);
      lfo.start();
      this.lfos.push(lfo);
      chain(this.src, s.filt('bandpass', f, 1.4), g, this.out);
    }
    this.src.start(s.now, rnd(0, 2));
    this.level(level, 0.6);
  }

  level(v: number, tc = 0.3, t = this.s.now): void {
    if (!this.stopped) this.out.gain.setTargetAtTime(v * 0.5, t, tc);
  }

  cheer(strength = 1, dur = 3, rest = 0.35): void {
    if (this.stopped) return;
    const s = this.s;
    const t = s.now;
    this.level(0.5 + strength * 0.6, 0.15, t);
    this.level(rest, 0.8, t + dur * 0.6);
    const n = Math.round(4 + strength * 8);
    for (let i = 0; i < n; i++) {
      const at = t + rnd(0, dur * 0.7);
      const p = rnd(-0.8, 0.8);
      if (Math.random() < 0.45) {
        const f = rnd(1800, 2800);
        tone(s, { t: at, f, f2: f * rnd(1.15, 1.4), glide: 0.25, dur: rnd(0.35, 0.7), g: 0.05 * strength, bus: 'crowd', p });
      } else woo(s, at, p, strength);
    }
    clapping(s, t + 0.3, dur, strength * 0.7);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.s.now;
    this.out.gain.setTargetAtTime(0, t, 0.25);
    this.src.stop(t + 1.5);
    this.lfos.forEach((l) => l.stop(t + 1.5));
  }
}

function woo(s: Synth, t: number, p: number, strength: number): void {
  const f = rnd(180, 330);
  const o = s.osc('sawtooth', f);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * rnd(1.2, 1.5), t + 0.4);
  o.frequency.linearRampToValueAtTime(f * 0.9, t + 1.1);
  const vib = s.osc('sine', 5.5);
  const vg = s.gain(f * 0.03);
  vib.connect(vg);
  vg.connect(o.frequency);
  const mix = s.gain(1);
  const f1 = s.filt('bandpass', 700, 4);
  const f2 = s.filt('bandpass', 1150, 5);
  o.connect(f1);
  o.connect(f2);
  f1.connect(mix);
  f2.connect(mix);
  chain(mix, s.env(t, 0.15, 0.06 * strength, 1.1), s.pan(p), s.buses.crowd);
  o.start(t);
  vib.start(t);
  o.stop(t + 1.4);
  vib.stop(t + 1.4);
}

function clapping(s: Synth, t: number, dur: number, strength: number): void {
  const n = Math.round(dur * 40 * strength);
  for (let i = 0; i < n; i++) {
    const at = t + Math.random() * dur * (Math.random() < 0.5 ? 1 : 0.6);
    hiss(s, { t: at, dur: 0.03, f: rnd(900, 2200), Q: 1.5, g: rnd(0.04, 0.12) * strength, bus: 'crowd', p: rnd(-0.9, 0.9) });
  }
}

// ---------- loops ----------

/** A looping background (ambience, rain, the paddock): sources to stop and timers for its random bits. */
export class Loop implements Stoppable {
  readonly out: GainNode;
  readonly stops: { stop(when?: number): void }[] = [];
  private readonly timers: number[] = [];
  stopped = false;

  constructor(readonly s: Synth, build: (l: Loop) => void, bus: Channel = 'effects', level = 1) {
    this.out = s.gain(0);
    this.out.connect(s.buses[bus]);
    build(this);
    this.out.gain.setTargetAtTime(level, s.now, 0.4);
  }

  every(fn: () => void, minMs: number, maxMs: number): void {
    const go = () => {
      if (this.stopped) return;
      fn();
      this.timers.push(window.setTimeout(go, rnd(minMs, maxMs)));
    };
    this.timers.push(window.setTimeout(go, rnd(0, maxMs * 0.5)));
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.timers.forEach((t) => clearTimeout(t));
    const t = this.s.now;
    this.out.gain.setTargetAtTime(0, t, 0.3);
    this.stops.forEach((x) => x.stop(t + 1.5));
  }
}

function windBed(l: Loop, g = 0.5): void {
  const s = l.s;
  const src = s.noiseSrc();
  const lp = s.filt('lowpass', 500, 1.5);
  const lfo = s.osc('sine', 0.12);
  const lg = s.gain(300);
  lfo.connect(lg);
  lg.connect(lp.frequency);
  chain(src, lp, s.gain(g), l.out);
  src.start(s.now, rnd(0, 2));
  lfo.start();
  l.stops.push(src, lfo);
}

function bird(s: Synth, t: number, p: number, out: AudioNode): void {
  const kind = Math.floor(Math.random() * 3);
  const notes = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < notes; i++) {
    const at = t + i * rnd(0.09, 0.16);
    const f = rnd(2600, 4200);
    const o = s.osc('sine', f);
    if (kind === 0) {
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, at + 0.07);
    } else if (kind === 1) {
      o.frequency.setValueAtTime(f * 1.4, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, at + 0.08);
    } else {
      const v = s.osc('sine', 40);
      const vg = s.gain(400);
      v.connect(vg);
      vg.connect(o.frequency);
      v.start(at);
      v.stop(at + 0.12);
    }
    chain(o, s.env(at, 0.01, 0.05, 0.08), s.pan(p), out);
    o.start(at);
    o.stop(at + 0.15);
  }
}

function passingCar(s: Synth, level: number): void {
  const e = new Engine(s, 'van', { bus: 'effects', level, p: rnd(-1, 1) });
  e.set(2200, 0.5, 0.8);
  e.out.gain.setTargetAtTime(0, s.now + 1.5, 0.8);
  setTimeout(() => e.stop(), 4500);
}

export type LoopId = 'town' | 'industrial' | 'countryside' | 'beach' | 'city' | 'wind' | 'rainLight' | 'rainHeavy' | 'paddock';

/** The looping backgrounds: W1 to W6, a beach and a city made from the same parts, and R1. */
export function makeLoop(s: Synth, id: LoopId, engine: EngineKind = '250f'): Loop {
  const birds = (l: Loop, min: number, max: number) => l.every(() => bird(s, s.now, rnd(-0.8, 0.8), l.out), min, max);
  switch (id) {
    case 'town':
      return new Loop(s, (l) => {
        windBed(l, 0.12);
        birds(l, 1500, 4500);
        l.every(() => passingCar(s, 0.25), 7000, 14000);
        l.every(() => clang(s, s.now, rnd(700, 900), 0.015, 0.4), 6000, 15000);
      });
    case 'city':
      return new Loop(s, (l) => {
        windBed(l, 0.1);
        birds(l, 4000, 9000);
        l.every(() => passingCar(s, 0.3), 2500, 6000);
        const hum = s.noiseSrc();
        chain(hum, s.filt('lowpass', 250, 0.7), s.gain(0.12), l.out);
        hum.start();
        l.stops.push(hum);
      });
    case 'industrial':
      return new Loop(s, (l) => {
        const h = s.osc('sawtooth', 50);
        chain(h, s.filt('lowpass', 180), s.gain(0.15), l.out);
        h.start();
        l.stops.push(h);
        windBed(l, 0.2);
        l.every(() => {
          clang(s, s.now, rnd(150, 300), 0.05, 0.8);
          thump(s, s.now, 60, 0.12, 0.3);
        }, 2500, 6000);
        l.every(() => hiss(s, { dur: 0.6, a: 0.05, type: 'highpass', f: 2500, g: 0.04 }), 5000, 9000);
      });
    case 'countryside':
      return new Loop(s, (l) => {
        windBed(l, 0.15);
        birds(l, 900, 3200);
      });
    case 'beach':
      return new Loop(s, (l) => {
        windBed(l, 0.2);
        birds(l, 3000, 7000);
        const sea = s.noiseSrc();
        const lp = s.filt('lowpass', 700, 0.7);
        const g = s.gain(0.18);
        const swell = s.osc('sine', 0.09);
        const sg = s.gain(0.14);
        swell.connect(sg);
        sg.connect(g.gain);
        chain(sea, lp, g, l.out);
        sea.start();
        swell.start();
        l.stops.push(sea, swell);
      });
    case 'wind':
      return new Loop(s, (l) => windBed(l, 0.6), 'effects', 0.8);
    case 'rainLight':
      return new Loop(s, (l) => {
        const src = s.noiseSrc();
        chain(src, s.filt('highpass', 1800), s.gain(0.12), l.out);
        src.start();
        l.stops.push(src);
        l.every(() => hiss(s, { dur: 0.01, f: rnd(2500, 6000), Q: 3, g: rnd(0.03, 0.1), p: rnd(-1, 1), out: l.out }), 30, 120);
      });
    case 'rainHeavy':
      return new Loop(s, (l) => {
        const src = s.noiseSrc();
        chain(src, s.filt('bandpass', 1400, 0.5), s.gain(0.4), l.out);
        src.start();
        l.stops.push(src);
        l.every(() => {
          thump(s, s.now, rnd(40, 60), 0.2, 1.5);
          hiss(s, { dur: 1.8, a: 0.3, type: 'lowpass', f: 300, g: 0.2 });
        }, 9000, 16000);
      });
    case 'paddock':
      return new Loop(s, (l) => {
        const es = [0, 1, 2, 3].map((i) => new Engine(s, engine, { level: 0.3, p: -0.6 + i * 0.4 }));
        l.stops.push(...es);
        l.every(() => {
          const e = es[Math.floor(Math.random() * es.length)];
          const at = s.now;
          e.setFrac(rnd(0.3, 0.6), 0.9, 0.05, at);
          e.setFrac(0, 0, 0.2, at + rnd(0.2, 0.5));
        }, 500, 2200);
      });
  }
}

// ---------- music ----------

interface SongDef {
  bpm: number;
  /** Steps (sixteenths) to play once, for a sting; left out for a loop. */
  once?: number;
  play(step: number, t: number, out: AudioNode, sd: number): void;
}

/** A tune made of sixteenth-note steps, scheduled a little ahead of the clock. */
export class Song implements Stoppable {
  private step = 0;
  private next: number;
  private readonly out: GainNode;
  private readonly timer: number;
  stopped = false;

  constructor(private readonly s: Synth, private readonly def: SongDef) {
    this.next = s.now + 0.08;
    this.out = s.gain(0);
    this.out.connect(s.buses.music);
    this.out.gain.setTargetAtTime(0.8, s.now, 0.3);
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  private pump(): void {
    const sd = 60 / this.def.bpm / 4;
    // A tab in the background throttles timers: catch up without a burst of old notes.
    if (this.next < this.s.now) this.next = this.s.now + 0.05;
    while (this.next < this.s.now + 0.15) {
      this.def.play(this.step, this.next, this.out, sd);
      this.step++;
      this.next += sd;
      if (this.def.once && this.step >= this.def.once) {
        clearInterval(this.timer);
        window.setTimeout(() => this.stop(), 2500);
        break;
      }
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.s.now, 0.25);
  }
}

function mKick(s: Synth, t: number, out: AudioNode, g = 0.9): void {
  const o = s.osc('sine', 150);
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  o.connect(s.env(t, 0.002, g, 0.32, out));
  o.start(t);
  o.stop(t + 0.4);
}
function mSnare(s: Synth, t: number, out: AudioNode, g = 0.5): void {
  const src = s.noiseSrc(false);
  chain(src, s.filt('highpass', 1200), s.env(t, 0.001, g, 0.16, out));
  src.start(t, rnd(0, 2));
  src.stop(t + 0.2);
  const o = s.osc('sine', 190);
  o.connect(s.env(t, 0.001, g * 0.5, 0.08, out));
  o.start(t);
  o.stop(t + 0.12);
}
function mHat(s: Synth, t: number, out: AudioNode, g = 0.15, open = false): void {
  const src = s.noiseSrc(false);
  chain(src, s.filt('highpass', 7500), s.env(t, 0.001, g, open ? 0.18 : 0.04, out));
  src.start(t, rnd(0, 2));
  src.stop(t + 0.25);
}
interface NoteOpts {
  type?: OscillatorType;
  dur?: number;
  g?: number;
  lp?: number;
  lpEnd?: number;
  a?: number;
  detune?: number;
  voices?: number;
  drive?: number;
  p?: number;
}
function mSynth(s: Synth, t: number, out: AudioNode, midi: number, o: NoteOpts = {}): void {
  const dur = o.dur ?? 0.2;
  const a = o.a ?? 0.005;
  const voices = o.voices ?? 1;
  const e = s.env(t, a, o.g ?? 0.2, dur);
  const f = s.filt('lowpass', o.lp ?? 1800, 1.2);
  if (o.lpEnd) f.frequency.exponentialRampToValueAtTime(o.lpEnd, t + dur);
  let head: AudioNode = f;
  if (o.drive) {
    const sh = s.shaper(o.drive);
    f.connect(sh);
    head = sh;
  }
  chain(head, e, s.pan(o.p ?? 0), out);
  for (let v = 0; v < voices; v++) {
    const osc = s.osc(o.type ?? 'sawtooth', mtof(midi));
    osc.detune.value = (v - (voices - 1) / 2) * (o.detune ?? 0);
    osc.connect(f);
    osc.start(t);
    osc.stop(t + a + dur + 0.05);
  }
}
function power(s: Synth, t: number, out: AudioNode, root: number, dur: number, g = 0.12): void {
  for (const n of [root, root + 7, root + 12]) mSynth(s, t, out, n, { voices: 2, detune: 12, dur, g, lp: 2600, drive: 3 });
}

export type SongId = 'menu' | 'town' | 'race' | 'win' | 'lose';

/** M1 to M5. */
export function makeSong(s: Synth, id: SongId): Song {
  const defs: Record<SongId, SongDef> = {
    // M1: rock riff in E minor, Em C G D, the lead hook the second time round.
    menu: {
      bpm: 128,
      play(step, t, out, sd) {
        const bar = Math.floor(step / 16) % 8;
        const st = step % 16;
        const root = [40, 36, 43, 38][bar % 4];
        if (st === 0 || st === 6 || st === 8 || (st === 14 && bar % 2)) mKick(s, t, out);
        if (st === 4 || st === 12) mSnare(s, t, out);
        if (st % 2 === 0) mHat(s, t, out, st % 4 === 2 ? 0.12 : 0.07);
        if (st % 2 === 0) mSynth(s, t, out, root - 12, { dur: sd * 1.6, g: 0.28, lp: 700, lpEnd: 250 });
        if ([0, 3, 6, 10, 12].includes(st)) power(s, t, out, root + 12, st === 0 ? sd * 3 : sd * 1.6);
        if (bar >= 4) {
          const hooks: Record<number, number>[] = [{ 0: 64, 4: 67, 8: 69, 12: 71 }, { 0: 72, 4: 71, 8: 69, 12: 67 }, { 0: 71, 4: 74, 8: 71, 12: 67 }, { 0: 69, 4: 66, 8: 62, 12: 66 }];
          const n = hooks[bar % 4][st];
          if (n) mSynth(s, t, out, n + 12, { type: 'square', dur: sd * 3.5, g: 0.07, lp: 3200, a: 0.01 });
        }
      },
    },
    // M2: easy plucked arpeggios in G major, G Em C D.
    town: {
      bpm: 96,
      play(step, t, out, sd) {
        const bar = Math.floor(step / 16) % 4;
        const st = step % 16;
        const chords = [[55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57]][bar];
        if (st === 0 || st === 10) mKick(s, t, out, 0.45);
        if (st === 8) mSnare(s, t, out, 0.15);
        if (st % 2 === 1) mHat(s, t, out, 0.04);
        if (st === 0) for (const n of chords) mSynth(s, t, out, n, { type: 'triangle', dur: sd * 15, g: 0.05, lp: 1500, a: 0.2 });
        if (st % 2 === 0) {
          const arp = [chords[0] + 12, chords[1] + 12, chords[2] + 12, chords[1] + 12];
          mSynth(s, t, out, arp[(st / 2) % 4], { type: 'triangle', dur: 0.35, g: 0.12, lp: 4000 });
        }
        if (st === 0 || st === 8) mSynth(s, t, out, chords[0] - 12, { type: 'sine', dur: sd * 7, g: 0.22, lp: 600 });
        const mel = [[79, 0, 78, 76], [74, 0, 76, 0], [72, 74, 76, 79], [78, 0, 74, 0]][bar];
        if (st % 4 === 0 && mel[st / 4]) mSynth(s, t, out, mel[st / 4], { type: 'square', dur: sd * 3, g: 0.04, lp: 2500, a: 0.02 });
      },
    },
    // M3: driving sixteenths in A minor, Am F G E.
    race: {
      bpm: 150,
      play(step, t, out, sd) {
        const bar = Math.floor(step / 16) % 8;
        const st = step % 16;
        const root = [45, 41, 43, 40][bar % 4];
        if (st % 4 === 0) mKick(s, t, out);
        if (st === 4 || st === 12) mSnare(s, t, out, 0.55);
        if (bar >= 4 && st === 15) mSnare(s, t, out, 0.25);
        mHat(s, t, out, st % 2 ? 0.05 : 0.1);
        mSynth(s, t, out, root - 12 + (st % 4 === 2 ? 12 : 0), { dur: sd * 0.9, g: 0.25, lp: 900, lpEnd: 300 });
        if (st === 0 || st === 6 || st === 12) power(s, t, out, root + 12, sd * 2, 0.1);
        if (bar >= 2 && st % 2 === 0) {
          const arp = [0, 7, 12, 15, 12, 7, 3, 7];
          mSynth(s, t, out, root + 24 + arp[(st / 2) % 8], { type: 'square', dur: sd * 1.2, g: 0.035, lp: 3000, p: 0.3 });
        }
      },
    },
    // M4: a win.
    win: {
      bpm: 120,
      once: 24,
      play(step, t, out, sd) {
        const seq: Record<number, number[]> = { 0: [60], 2: [64], 4: [67], 6: [72], 8: [60, 64, 67, 72, 76] };
        for (const n of seq[step] ?? []) mSynth(s, t, out, n, { voices: 2, detune: 8, dur: step === 8 ? 2.2 : sd * 2, g: step === 8 ? 0.09 : 0.14, lp: 3000, a: 0.02 });
        if (step === 8) {
          mKick(s, t, out);
          clang(s, t, 1200, 0.05, 1.5, 'music');
        }
        if (step >= 8 && step < 20 && step % 2 === 0) mHat(s, t, out, 0.05, true);
      },
    },
    // M5: a bad day.
    lose: {
      bpm: 90,
      once: 20,
      play(step, t, out, sd) {
        const seq: Record<number, number> = { 0: 67, 2: 66, 4: 65, 8: 64 };
        if (seq[step]) mSynth(s, t, out, seq[step], { type: 'triangle', dur: step === 8 ? 1.8 : sd * 2, g: 0.18, lp: 1600, a: 0.02 });
        if (step === 8) for (const n of [48, 52, 55]) mSynth(s, t, out, n, { type: 'triangle', dur: 2, g: 0.07, lp: 900, a: 0.05 });
      },
    },
  };
  return new Song(s, defs[id]);
}

// ---------- one-shot effects ----------

export type SfxId =
  | 'hover' | 'click' | 'back' | 'toggleOn' | 'toggleOff' | 'slider' | 'error' | 'menuOpen' | 'menuClose' | 'notify' | 'coins' | 'till' | 'levelUp' | 'trophy' | 'save' | 'type'
  | 'stepGrass' | 'stepHard' | 'stepGravel' | 'stepWood' | 'doorOpen' | 'doorClose' | 'shopBell' | 'vanDoor' | 'ratchet' | 'impactGun' | 'welding' | 'grinder' | 'breath'
  | 'boardTurn' | 'gateDrop' | 'landing' | 'crash' | 'crashSmall' | 'roost' | 'mudSplash' | 'pitBoard' | 'lastLap' | 'airhorn' | 'rocket' | 'burst';

export interface SfxOpts {
  /** 0 to 1: how loud, for a sound heard from further off. */
  level?: number;
  pan?: number;
}

/** Each effect by id; the demo page's codes are in the comments. */
export function playSfx(s: Synth, id: SfxId, o: SfxOpts = {}): void {
  const t = s.now;
  const k = o.level ?? 1;
  const p = o.pan ?? 0;
  switch (id) {
    case 'hover': // U1
      return tone(s, { f: 2200, dur: 0.025, g: 0.06 });
    case 'click': // U2
      tone(s, { t, f: 880, f2: 660, dur: 0.06, g: 0.2, type: 'triangle' });
      return hiss(s, { t, dur: 0.012, f: 4000, g: 0.08 });
    case 'back': // U3
      tone(s, { t, f: 660, dur: 0.05, g: 0.15, type: 'triangle' });
      return tone(s, { t: t + 0.06, f: 440, dur: 0.08, g: 0.15, type: 'triangle' });
    case 'toggleOn': // U4
      return tone(s, { t, f: 520, f2: 1040, dur: 0.08, g: 0.15, type: 'triangle' });
    case 'toggleOff': // U5
      return tone(s, { t, f: 1040, f2: 520, dur: 0.08, g: 0.15, type: 'triangle' });
    case 'slider': // U6, one tick
      return tone(s, { f: 1400 + rnd(0, 700), dur: 0.02, g: 0.06 });
    case 'error': // U7
      for (const d of [0, 0.13]) tone(s, { t: t + d, f: 140, dur: 0.1, g: 0.18, type: 'square', lp: 900 });
      return;
    case 'menuOpen': // U8
      hiss(s, { dur: 0.22, f: 400, f2: 2400, Q: 2, g: 0.18, a: 0.05 });
      return tone(s, { f: 600, dur: 0.06, g: 0.06, type: 'triangle' });
    case 'menuClose': // U9
      return hiss(s, { dur: 0.2, f: 2400, f2: 400, Q: 2, g: 0.16, a: 0.03 });
    case 'notify': // U10
      tone(s, { t, f: mtof(84), dur: 0.35, g: 0.12 });
      return tone(s, { t: t + 0.12, f: mtof(88), dur: 0.5, g: 0.12 });
    case 'coins': // U11
      for (let i = 0; i < 5; i++) {
        const at = t + i * 0.06;
        const f = mtof(95 + (i % 2) * 4);
        tone(s, { t: at, f, dur: 0.25, g: 0.07 });
        tone(s, { t: at, f: f * 2.7, dur: 0.12, g: 0.03 });
      }
      return;
    case 'till': // U12
      hiss(s, { t, dur: 0.05, f: 2500, Q: 3, g: 0.2 });
      thump(s, t + 0.02, 140, 0.25, 0.08);
      clang(s, t + 0.12, 1700, 0.12, 1.1);
      return clang(s, t + 0.12, 2260, 0.07, 0.9);
    case 'levelUp': // U13
      [72, 76, 79, 84].forEach((n, i) => tone(s, { t: t + i * 0.08, f: mtof(n), dur: 0.3, g: 0.14, type: 'triangle' }));
      for (let i = 0; i < 10; i++) tone(s, { t: t + 0.32 + i * 0.035, f: mtof(96 + (i % 4) * 3), dur: 0.15, g: 0.04, p: rnd(-0.6, 0.6) });
      return;
    case 'trophy': // U14
      for (const [d, ns] of [[0, [67]], [0.15, [67]], [0.3, [67]], [0.45, [72, 76, 79]]] as [number, number[]][]) for (const n of ns) mSynth(s, t + d, s.buses.effects, n, { voices: 3, detune: 10, dur: d < 0.4 ? 0.13 : 1.6, g: 0.07, lp: 2800, a: 0.015 });
      return clang(s, t + 0.45, 1300, 0.05, 1.8);
    case 'save': // U15
      tone(s, { t, f: mtof(76), dur: 0.12, g: 0.1, type: 'triangle' });
      return tone(s, { t: t + 0.09, f: mtof(83), dur: 0.25, g: 0.1, type: 'triangle' });
    case 'type': // U16, one key
      return hiss(s, { dur: 0.015, f: rnd(2500, 4000), Q: 4, g: 0.12 });
    case 'stepGrass': // W7
      return hiss(s, { dur: 0.09, a: 0.01, type: 'lowpass', f: 1800, g: 0.22 * k, p });
    case 'stepHard': // W8
      hiss(s, { t, dur: 0.04, f: 3000, Q: 1.5, g: 0.16 * k, p });
      return thump(s, t, 110, 0.2 * k, 0.05);
    case 'stepGravel': // W9
      for (let i = 0; i < 7; i++) hiss(s, { t: t + rnd(0, 0.07), dur: 0.015, f: rnd(1500, 4500), Q: 3, g: 0.08 * k, p });
      return;
    case 'stepWood': // W10
      thump(s, t, 180, 0.3 * k, 0.08);
      return hiss(s, { t, dur: 0.05, f: 400, Q: 3, g: 0.12 * k });
    case 'doorOpen': { // W11
      hiss(s, { t, dur: 0.03, f: 2200, Q: 4, g: 0.2 });
      tone(s, { t, f: 900, dur: 0.03, g: 0.08, type: 'square', lp: 2000 });
      const o2 = s.osc('sawtooth', 160);
      o2.frequency.setValueAtTime(160, t + 0.08);
      o2.frequency.linearRampToValueAtTime(230, t + 0.5);
      o2.frequency.linearRampToValueAtTime(190, t + 0.7);
      chain(o2, s.filt('bandpass', 900, 6), s.env(t + 0.08, 0.1, 0.05, 0.6), s.buses.effects);
      o2.start(t + 0.08);
      o2.stop(t + 0.9);
      return;
    }
    case 'doorClose': // W12
      thump(s, t, 90, 0.5, 0.18);
      hiss(s, { t, dur: 0.08, f: 600, Q: 1, g: 0.15 });
      return hiss(s, { t: t + 0.07, dur: 0.03, f: 2400, Q: 4, g: 0.15 });
    case 'shopBell': // W13
      clang(s, t, 2100, 0.07, 1.2);
      return clang(s, t + 0.14, 2350, 0.05, 1.0);
    case 'vanDoor': // W14
      hiss(s, { t, dur: 0.6, f: 300, f2: 900, Q: 1, g: 0.12, a: 0.05 });
      thump(s, t + 0.6, 70, 0.7, 0.3);
      return clang(s, t + 0.6, 400, 0.05, 0.3);
    case 'ratchet': // W16
      for (let i = 0; i < 14; i++) {
        hiss(s, { t: t + i * 0.045, dur: 0.012, f: 3500, Q: 6, g: 0.15 });
        tone(s, { t: t + i * 0.045, f: 2600, dur: 0.01, g: 0.04, type: 'square' });
      }
      return;
    case 'impactGun': // W17
      for (let i = 0; i < 3; i++) {
        const at = t + i * 0.32;
        const o2 = s.osc('square', 55);
        chain(o2, s.filt('lowpass', 2400), s.env(at, 0.005, 0.12, 0.22), s.buses.effects);
        o2.start(at);
        o2.stop(at + 0.26);
        hiss(s, { t: at, dur: 0.2, type: 'highpass', f: 3000, g: 0.06 });
      }
      return;
    case 'welding': { // W18
      for (let i = 0; i < 90; i++) hiss(s, { t: t + i * 0.022 + rnd(0, 0.02), dur: rnd(0.005, 0.03), type: 'highpass', f: rnd(2000, 6000), g: rnd(0.03, 0.14) });
      const src = s.noiseSrc(false);
      chain(src, s.filt('bandpass', 5000, 1), s.env(t, 0.05, 0.05, 2), s.buses.effects);
      src.start(t);
      src.stop(t + 2.1);
      return;
    }
    case 'grinder': { // W19
      const o2 = s.osc('sawtooth', 300);
      o2.frequency.setValueAtTime(300, t);
      o2.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
      o2.frequency.setValueAtTime(1500, t + 1.6);
      o2.frequency.exponentialRampToValueAtTime(400, t + 2.3);
      const e = s.gain(0);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.05, t + 0.3);
      e.gain.setValueAtTime(0.05, t + 1.6);
      e.gain.linearRampToValueAtTime(0, t + 2.3);
      chain(o2, s.filt('bandpass', 3000, 2), e, s.buses.effects);
      o2.start(t);
      o2.stop(t + 2.4);
      return hiss(s, { t: t + 0.6, dur: 1.0, a: 0.2, type: 'highpass', f: 4000, g: 0.1 });
    }
    case 'breath': // W20, one breath in and out
      hiss(s, { t, dur: 0.35, a: 0.12, f: 900, Q: 0.8, g: 0.12 });
      return hiss(s, { t: t + 0.45, dur: 0.3, a: 0.05, f: 1300, Q: 0.8, g: 0.09 });
    case 'boardTurn': // R2
      hiss(s, { t, dur: 0.05, f: 1300, Q: 2, g: 0.35 });
      thump(s, t, 160, 0.25, 0.06);
      return hiss(s, { t: t + 0.08, dur: 0.04, f: 900, Q: 2, g: 0.2 });
    case 'gateDrop': // R3
      clang(s, t, 180, 0.35, 1.1);
      clang(s, t + 0.015, 233, 0.2, 0.9);
      hiss(s, { t, dur: 0.12, f: 1200, Q: 0.7, g: 0.4 });
      return thump(s, t + 0.02, 70, 0.7, 0.3);
    case 'landing': // R6
      thump(s, t, 65, 0.85 * k, 0.28);
      hiss(s, { t, dur: 0.2, a: 0.004, type: 'lowpass', f: 1100, g: 0.3 * k, p });
      return tone(s, { t: t + 0.05, f: 1900, f2: 1500, dur: 0.08, g: 0.02 * k, type: 'triangle', p });
    case 'crash': // R8, the hit and the slide (the engine's scream is the race's own engine)
      thump(s, t, 75, k, 0.4);
      hiss(s, { t, dur: 0.25, f: 700, Q: 0.6, g: 0.4 * k, p });
      hiss(s, { t: t + 0.05, dur: 1.1, a: 0.05, f: 2000, f2: 600, Q: 1.2, g: 0.22 * k, p });
      for (let i = 0; i < 10; i++) {
        const at = t + 0.1 + rnd(0, 1.0);
        hiss(s, { t: at, dur: 0.03, f: rnd(1500, 3500), Q: 4, g: 0.15 * k, p: p + rnd(-0.4, 0.4) });
        if (i % 3 === 0) thump(s, at, 120, 0.25 * k, 0.08);
      }
      clang(s, t + 0.2, 520, 0.06 * k, 0.4, 'effects', p);
      return clang(s, t + 0.55, 610, 0.04 * k, 0.3, 'effects', p);
    case 'crashSmall': // R9
      thump(s, t, 95, 0.6 * k, 0.25);
      hiss(s, { t, dur: 0.6, a: 0.02, f: 1500, f2: 500, Q: 1, g: 0.18 * k, p });
      return clang(s, t + 0.1, 600, 0.04 * k, 0.3, 'effects', p);
    case 'roost': // R10
      for (let i = 0; i < 60; i++) hiss(s, { t: t + rnd(0, 0.6), dur: 0.02, f: rnd(800, 3000), Q: 2, g: rnd(0.03, 0.09) * k, p: p + rnd(-0.3, 0.3) });
      return hiss(s, { t, dur: 0.7, a: 0.03, type: 'lowpass', f: 1200, g: 0.15 * k, p });
    case 'mudSplash': // R11
      thump(s, t, 70, 0.4 * k, 0.2);
      hiss(s, { t, dur: 0.35, a: 0.01, type: 'lowpass', f: 900, g: 0.3 * k, p });
      for (let i = 0; i < 8; i++) tone(s, { t: t + rnd(0.05, 0.4), f: rnd(300, 700), f2: rnd(800, 1400), glide: 0.04, dur: 0.05, g: 0.06 * k, p });
      return;
    case 'pitBoard': // R12
      hiss(s, { t, dur: 0.18, f: 600, f2: 1800, Q: 1.2, g: 0.15, a: 0.05 });
      return hiss(s, { t: t + 0.2, dur: 0.03, f: 1500, Q: 2, g: 0.2 });
    case 'lastLap': // R13
      hiss(s, { t, dur: 0.5, f: 1600, Q: 0.8, g: 0.1, a: 0.1 });
      for (let i = 0; i < 6; i++) hiss(s, { t: t + i * 0.16, dur: 0.07, f: 1100, Q: 1.5, g: 0.13 });
      return;
    case 'airhorn': // R16
      for (const f of [370, 466]) {
        const o2 = s.osc('sawtooth', f);
        const e = s.gain(0);
        e.gain.setValueAtTime(0, t);
        e.gain.linearRampToValueAtTime(0.07 * k, t + 0.03);
        e.gain.setValueAtTime(0.07 * k, t + 0.55);
        e.gain.linearRampToValueAtTime(0, t + 0.65);
        chain(o2, s.filt('lowpass', 2500), e, s.pan(p), s.buses.crowd);
        o2.start(t);
        o2.stop(t + 0.7);
      }
      return;
    case 'rocket': { // R18, a rocket going up
      const o2 = s.osc('sine', 900);
      o2.frequency.setValueAtTime(900, t);
      o2.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
      const e = s.gain(0);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.025 * k, t + 0.1);
      e.gain.linearRampToValueAtTime(0, t + 0.75);
      chain(o2, e, s.pan(p * 0.5), s.buses.effects);
      o2.start(t);
      o2.stop(t + 0.8);
      return hiss(s, { t, dur: 0.7, f: 3000, Q: 1, g: 0.04 * k, p: p * 0.5, a: 0.1 });
    }
    case 'burst': // R18, the bang and crackle
      thump(s, t, 55, 0.9 * k, 0.6);
      hiss(s, { t, dur: 0.5, a: 0.002, type: 'lowpass', f: 2500, g: 0.5 * k, p });
      for (let i = 0; i < 30; i++) hiss(s, { t: t + 0.25 + rnd(0, 1.2), dur: 0.012, type: 'highpass', f: 3500, g: rnd(0.04, 0.12) * k, p: p + rnd(-0.3, 0.3) });
      return;
  }
}
