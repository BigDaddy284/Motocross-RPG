import { engineNote, packLevel, raceCues, type EngineKind, type SoundRider } from '../core/sound';
import { audio } from './audio';
import type { Crowd, Engine } from './synth';

// The live race's sound (Boss, 7 Nov 2026): the engine of the rider the camera follows, the rest
// of the field around them, the crowd, and the start, landings and crashes as they happen
// (core/sound.ts raceCues). Pause stops the frames, and with them the engines.

/** Real milliseconds without a frame before the engines fall quiet (paused, or a modal open). */
const STALL_MS = 250;

export class RaceAudio {
  private readonly engine: Engine | null;
  private readonly pack: Engine[];
  private readonly crowd: Crowd | null;
  private prev = new Map<string, SoundRider>();
  private lastClock = -Infinity;
  private lastFrame = performance.now();
  private lastSpeed = 0;
  private lastFocus: string | null = null;
  private readonly timer: number;
  private stalled = false;
  private lastRoost = 0;
  private stopped = false;

  /**
   * kind: the engine of the class racing. gate: a start gate drops (not an enduro sprint or practice).
   * crowd: how big the crowd is, 0 for none. wet: rain, so the roost is mud.
   */
  constructor(kind: EngineKind, private readonly opts: { gate: boolean; crowd: number; wet: boolean }) {
    this.engine = audio.engine(kind, { level: 1 });
    this.pack = [0, 1].map((i) => audio.engine(kind, { level: 0, p: i ? 0.35 : -0.35 })).filter((e): e is Engine => !!e);
    // No crowd: it sounded like static (Boss, 7 Nov 2026: "you can remove crowd noise"). The air horns stay.
    this.crowd = null;
    this.timer = window.setInterval(() => this.watch(), 100);
  }

  update(riders: SoundRider[], clock: number, focus: string | null, dt: number): void {
    if (this.stopped) return;
    this.lastFrame = performance.now();
    if (this.stalled) {
      this.stalled = false;
      this.crowd?.level(0.25 * this.opts.crowd, 0.2);
    }
    const f = riders.find((r) => r.id === focus) ?? riders[0];
    if (!f) return;
    if (focus !== this.lastFocus) this.lastSpeed = f.speed;
    this.lastFocus = focus;
    // On the line before the gate drops: idling, then holding the revs up from the 5-second board.
    if (clock < 0) {
      const hold = clock > -3 && this.opts.gate;
      const blip = hold && Math.sin(clock * 9.1) > 0.7 ? 0.25 : 0;
      this.engine?.setFrac((hold ? 0.38 : 0.04) + blip, hold ? 0.5 : 0, 0.08);
      this.engine?.setLevel(1, 0.1);
      this.pack.forEach((e, i) => {
        e.setFrac((hold ? 0.4 : 0.05) + (hold && Math.sin(clock * (6 + i * 2.3) + i) > 0.6 ? 0.25 : 0), hold ? 0.5 : 0, 0.08);
        e.setLevel(hold ? 0.85 : 0.45, 0.2);
      });
    } else {
      const accel = dt > 0 ? (f.speed - this.lastSpeed) / Math.max(dt, 1 / 120) : 0;
      const note = engineNote(f.speed, accel, f.air > 0.3, !!f.down);
      this.engine?.setFrac(note.rpm, note.throttle, 0.05);
      this.engine?.setLevel(f.hidden ? 0 : 1, 0.1);
      const near = packLevel(riders, focus);
      this.pack.forEach((e, i) => {
        const drift = Math.sin(clock * (0.6 + i * 0.37) + i * 2) * 0.06 + (i ? -0.07 : 0.05);
        e.setFrac(Math.max(0.1, Math.min(1, note.rpm + drift)), near > 0.05 ? 0.9 : 0, 0.12);
        e.setLevel(near * 0.8, 0.25);
      });
      // Dirt off the back wheel, driving hard out of a slow turn.
      const now = performance.now();
      if (!f.down && f.air < 0.1 && accel > 1.5 && f.speed < 14 && now - this.lastRoost > 1800 && Math.random() < dt * 2) {
        this.lastRoost = now;
        audio.play(this.opts.wet ? 'mudSplash' : 'roost', { level: 0.5 });
      }
    }
    this.lastSpeed = f.speed;
    for (const c of raceCues(this.prev, riders, this.lastClock, clock, focus, this.opts.gate)) {
      const pan = (Math.random() - 0.5) * 0.6;
      if (c.kind === 'board') audio.play('boardTurn');
      else if (c.kind === 'gateDrop') {
        audio.play('gateDrop');
        this.crowd?.cheer(0.6 * this.opts.crowd, 2.5, 0.25 * this.opts.crowd);
      } else if (c.kind === 'landing') audio.play('landing', { level: c.near * (0.4 + 0.6 * c.size), pan });
      else {
        audio.play(c.big ? 'crash' : 'crashSmall', { level: c.near, pan });
        if (c.big && c.near > 0.5) this.crowd?.cheer(0.5 * this.opts.crowd, 2, 0.25 * this.opts.crowd);
      }
    }
    this.lastClock = clock;
    this.prev = new Map(riders.map((r) => [r.id, { ...r, down: r.down && { ...r.down } }]));
  }

  /** The crowd goes up: a pass for the lead, the chequered flag (with the air horns). */
  cheer(strength = 1, horn = false): void {
    if (this.stopped) return;
    this.crowd?.cheer(strength * Math.max(0.5, this.opts.crowd), 3.5, 0.25 * this.opts.crowd);
    if (horn) audio.play('airhorn', { level: Math.max(0.5, this.opts.crowd) });
  }

  private watch(): void {
    if (this.stalled || performance.now() - this.lastFrame < STALL_MS) return;
    this.stalled = true;
    this.engine?.setLevel(0, 0.08);
    this.pack.forEach((e) => e.setLevel(0, 0.08));
    this.crowd?.level(0.05, 0.3);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.engine?.stop();
    this.pack.forEach((e) => e.stop());
    this.crowd?.stop();
  }
}
