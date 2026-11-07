import { CHANNELS, mixGains, type EngineKind } from '../core/sound';
import { services } from '../services';
import { Crowd, Engine, makeLoop, makeSong, playSfx, Synth, type LoopId, type SfxId, type SfxOpts, type SongId, type Stoppable } from './synth';

// The game's sound player (Boss, 7 Nov 2026). Scenes ask for music, a background loop and
// effects by id; this keeps one of each going, follows the Audio settings, and stays silent
// until the first click or key press (browsers block sound before that).

type Slot = 'music' | 'ambience' | 'weather';

class GameAudio {
  private synth: Synth | null = null;
  /** What each slot should be playing, kept while sound is still locked so it starts on the first click. */
  private readonly want: Record<Slot, string | null> = { music: null, ambience: null, weather: null };
  private readonly playing: Record<Slot, { id: string; it: Stoppable } | null> = { music: null, ambience: null, weather: null };
  private lastHover = 0;
  private lastTick = 0;

  /** Starts sound from a click or key press: call from the first user gesture. */
  unlock(): void {
    if (this.synth) {
      if (this.synth.ctx.state === 'suspended' && !document.hidden) void this.synth.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.synth = new Synth(new Ctx());
    } catch {
      return;
    }
    this.applySettings();
    services.settings.onChange(() => this.applySettings());
    document.addEventListener('visibilitychange', () => {
      const ctx = this.synth!.ctx;
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
    for (const slot of Object.keys(this.want) as Slot[]) this.refresh(slot);
  }

  /** The synth when sound is running, for the race's engines. */
  get live(): Synth | null {
    return this.synth && this.synth.ctx.state === 'running' ? this.synth : null;
  }

  private applySettings(): void {
    const s = this.synth;
    if (!s) return;
    const g = mixGains(services.settings.get().audio);
    s.master.gain.setTargetAtTime(g.master, s.now, 0.03);
    for (const c of CHANNELS) s.buses[c].gain.setTargetAtTime(g[c], s.now, 0.03);
  }

  play(id: SfxId, o?: SfxOpts): void {
    const s = this.live;
    if (!s) return;
    // Hovering along a row of buttons, or dragging a slider, ticks at most every so often.
    if (id === 'hover' || id === 'slider') {
      const now = performance.now();
      const last = id === 'hover' ? this.lastHover : this.lastTick;
      if (now - last < 60) return;
      if (id === 'hover') this.lastHover = now;
      else this.lastTick = now;
    }
    playSfx(s, id, o);
  }

  /** The music to play (M1 to M3), or none. The same tune asked for again carries on. */
  music(id: Extract<SongId, 'menu' | 'town' | 'race'> | null): void {
    this.want.music = id;
    this.refresh('music');
  }

  /** A short tune over everything (M4 win, M5 lose). */
  sting(id: Extract<SongId, 'win' | 'lose'>): void {
    const s = this.live;
    if (s) makeSong(s, id);
  }

  /** The background of where the player is (W1 to W3 and the paddock), or none. */
  ambience(id: LoopId | null): void {
    this.want.ambience = id;
    this.refresh('ambience');
  }

  /** Rain over the top (W5, W6), or none. */
  weather(id: 'rainLight' | 'rainHeavy' | null): void {
    this.want.weather = id;
    this.refresh('weather');
  }

  /** Stops every slot, for the race's live screen, which makes its own sound. */
  quiet(): void {
    this.music(null);
    this.ambience(null);
    this.weather(null);
  }

  engine(kind: EngineKind, o: { bus?: 'engines' | 'effects'; p?: number; level?: number } = {}): Engine | null {
    const s = this.live;
    return s ? new Engine(s, kind, o) : null;
  }

  crowd(level = 0.35): Crowd | null {
    const s = this.live;
    return s ? new Crowd(s, level) : null;
  }

  private refresh(slot: Slot): void {
    const s = this.synth;
    const id = this.want[slot];
    const cur = this.playing[slot];
    if (cur?.id === id) return;
    cur?.it.stop();
    this.playing[slot] = null;
    if (!s || !id) return;
    const it = slot === 'music' ? makeSong(s, id as SongId) : makeLoop(s, id as LoopId);
    this.playing[slot] = { id, it };
  }
}

export const audio = new GameAudio();
