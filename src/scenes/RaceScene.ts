import Phaser from 'phaser';
import { bikeStats, conditionFactor, formatMoney, type Bike } from '../core/career';
import { formatTime, gateBonus, type LapTrace, type MotoSim, type RaceEvent, type RiderResult } from '../core/race';
import { PLAYER_ID, RaceDay, applyRide, playerEntrant, practiceSim, sumXp, type MotoRecord, type VenueDef } from '../core/raceDay';
import { finishChampionship, nextRoundVenue, recordRound, roundOptions, standings, titlePossible, type ActiveChampionship, type ChampionshipDef } from '../core/championship';
import { noteActivity } from '../core/shops';
import type { SaveData } from '../core/saves';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { button, panel, penMeter, type Button, type PenMeter } from '../ui/widgets';
import { directorFor, ROW_SIZE, type RaceDirector } from '../core/riderAI';
import { startGeom } from '../core/trackGeom';
import { RaceView } from '../world/RaceView';
import { view } from '../ui/view';
import { CPU_GEAR, GEAR_SETS, gearColour, type RaceLook } from '../world/raceBike';

// Race day and practice: gate pick, the live race screen with its pit board, auto-complete,
// moto and day results, and practice laps. The simulation does the racing; this screen only
// plays it back (GDD 11.1). Laid out on a 1280 × 720 design and scaled to fit the window.

const W = 1280;
const H = 720;
/** Race seconds per real second at each speed button (Pause, 1×, 2×, 4×, 8×). */
const SPEEDS = [0, 1, 2, 4, 8];
const SPEED_LABELS = ['Pause', '1×', '2×', '4×', '8×'];
const DEFAULT_SPEED = 2;
/** How many laps a pit board message can be set for; 0 is to the flag. */
const BOARD_LAPS = [1, 2, 3, 0];
/** Width of the pen meter in the race bar and on the pit board. */
const PEN_W = 116;

export interface RaceSceneData {
  mode: 'practice' | 'raceday';
  venue: VenueDef;
  save: SaveData;
  /** The entry or practice fee in pence, taken when the day is over. */
  fee: number;
  /** A championship round: the championship whose next round this is (it must be active in the save). */
  champ?: ChampionshipDef;
  onDone: (save: SaveData, message: string) => void;
}

interface Checkpoints {
  t: number[];
  /** Distance in laps (lap 2 halfway round is 1.5). */
  d: number[];
}

export class RaceScene extends Phaser.Scene {
  private args!: RaceSceneData;
  private save!: SaveData;
  private root!: Phaser.GameObjects.Container;
  private screen!: Phaser.GameObjects.Container;
  private day: RaceDay | null = null;
  private sim: MotoSim | null = null;
  private view: RaceView | null = null;
  private director: RaceDirector | null = null;
  /** Real seconds since the last frame, for the view's camera. */
  private frameDt = 0;
  private cps = new Map<string, Checkpoints>();
  private traces: LapTrace[] = [];
  private raceEvents: RaceEvent[] = [];
  private eventIndex = 0;
  private feed: string[] = [];
  private clock = 0;
  private speed = DEFAULT_SPEED;
  private paused = false;
  private live = false;
  private retiredAt: number | null = null;
  private realStart = 0;
  private colors = new Map<string, number>();
  /** Each rider's race-day bike and gear (Boss's brief, 24 Oct 2026: Race day bike colours). */
  private looks = new Map<string, RaceLook>();
  private names = new Map<string, string>();
  private ui: Record<string, Phaser.GameObjects.Text> = {};
  /** The pen in the race bar: its ink is the message changes left. */
  private pen: PenMeter | null = null;
  private modal: Phaser.GameObjects.Container | null = null;
  private skipButton: Button | null = null;
  private detail = false;
  private onTick: (() => void) | null = null;
  private explained = false;
  /** Auto-complete: the race plays out on screen with no pit board, holding the starting message. */
  private auto = false;
  /** Laps the next pit board message is set for (BOARD_LAPS), and the leader's lap when the board next comes out. */
  private boardLaps = 1;
  private boardAt = 0;
  /** Laps you have finished, as far as the clock has got: the pit board comes out as you cross the line. */
  private myLaps = 0;
  /** What Details last showed (tab, bike snapshot, timing points passed), to redraw it only when that changes. */
  private detailKey = '';
  /** The player's bike after each lap the simulation has run, by the race time the player finished that lap. */
  private wearAt: { t: number; parts: Bike['parts'] }[] = [];
  private detailTab: 'bike' | 'sections' = 'bike';
  private detailTabs: Button[] = [];
  /** The live screen is showing qualifying, not a moto. */
  private qualifying = false;

  constructor() {
    super('race');
  }

  init(data: RaceSceneData): void {
    this.args = data;
    this.save = structuredClone(data.save);
    this.day = null;
    this.sim = null;
    this.modal = null;
    this.onTick = null;
    this.qualifying = false;
    this.explained = !!this.save.flags.first_race_done;
    this.realStart = performance.now();
  }

  create(): void {
    const { width, height } = view(this);
    this.add.rectangle(0, 0, width, height, COLORS.ink).setOrigin(0);
    const k = Math.min(width / W, height / H);
    this.root = this.add.container((width - W * k) / 2, (height - H * k) / 2).setScale(k);
    this.screen = this.add.container(0, 0);
    this.root.add(this.screen);
    this.scale.on('resize', this.relayout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.relayout, this));
    if (this.args.mode === 'practice') this.startPractice();
    else {
      const career = this.save.career;
      const champ = this.champ;
      const round = champ ? roundOptions(services.content, champ.def, champ.active) : undefined;
      this.day = new RaceDay(services.content, this.args.venue, playerEntrant(services.content, career, this.save.rider.name), (Math.random() * 2 ** 32) >>> 0, this.args.fee, round);
      this.day.field.forEach((e, i) => {
        this.names.set(e.id, e.player ? 'You' : e.name);
        const gear = GEAR_SETS[e.player ? 'player-default' : e.tag === 'Local Champion' ? 'cpu-champion' : CPU_GEAR[i % CPU_GEAR.length]];
        this.looks.set(e.id, { brand: e.bike.brand, cls: e.bike.class, gear });
        this.colors.set(e.id, e.player ? COLORS.accent : gearColour(gear));
      });
      if (this.day.qualifyingDue) this.showQualifyingStart();
      else this.showGatePick();
    }
  }

  /** The championship this race day is a round of, with its state in this scene's save. */
  private get champ(): { def: ChampionshipDef; active: ActiveChampionship; round: number } | null {
    const def = this.args.champ;
    const active = def && this.save.career.champs?.active[def.id];
    return def && active ? { def, active, round: active.rounds.length + 1 } : null;
  }

  /** "Farmland MX · 50cc race day", or the championship and round. */
  private dayTitle(): string {
    const day = this.day!;
    const c = this.champ;
    return `${this.args.venue.name} · ${day.cls} ${c ? `${c.def.short} round ${c.round} of ${c.def.rounds.length}` : 'race day'}`;
  }

  private relayout(): void {
    const { width, height } = view(this);
    const k = Math.min(width / W, height / H);
    this.root.setScale(k).setPosition((width - W * k) / 2, (height - H * k) / 2);
  }

  update(_t: number, dt: number): void {
    if (!this.live || this.paused || this.modal) return;
    // The real time since the last frame, so 1× is real time even when frames come slowly (the
    // game loop smooths and trims its own delta), capped so a stalled tab doesn't leap ahead.
    const real = Math.min(250, this.game.loop.rawDelta || dt) / 1000;
    this.frameDt = real;
    // Before the gate drops (negative race time) the line-up and the start board run in real
    // time at any speed, so the five-second hold is always five seconds; Pause still stops it.
    const speed = SPEEDS[this.speed];
    if (this.clock < 0 && speed > 0) {
      const pre = Math.min(real, -this.clock);
      this.clock = Math.min(0, this.clock + pre) + (real - pre) * speed;
    } else this.clock += real * speed;
    this.onTick?.();
  }

  // ---- small helpers ----

  private clear(): void {
    this.screen.removeAll(true);
    this.ui = {};
    this.pen = null;
    this.view = null;
    this.skipButton = null;
    this.live = false;
    this.onTick = null;
  }

  private text(x: number, y: number, s: string, size = 18, color: number = COLORS.cream, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, textStyle(size, color, extra));
    this.screen.add(t);
    return t;
  }

  private btn(x: number, y: number, label: string, fn: () => void, w = 220, h = 46, into: Phaser.GameObjects.Container = this.screen): Button {
    const b = button(this, x, y, label, fn, w, h);
    into.add(b);
    return b;
  }

  private box(x: number, y: number, w: number, h: number, into: Phaser.GameObjects.Container = this.screen): Phaser.GameObjects.Rectangle {
    const p = panel(this, x + w / 2, y + h / 2, w, h);
    into.add(p);
    return p;
  }

  private openModal(w: number, h: number): Phaser.GameObjects.Container {
    this.modal?.destroy();
    const c = this.add.container(W / 2, H / 2);
    c.add(this.add.rectangle(0, 0, W, H, 0, 0.55).setInteractive());
    c.add(panel(this, 0, 0, w, h).setInteractive());
    this.root.add(c);
    this.modal = c;
    return c;
  }

  private closeModal(): void {
    this.modal?.destroy();
    this.modal = null;
  }

  private header(title: string, sub: string): void {
    this.text(W / 2, 26, title, 30, COLORS.accent).setOrigin(0.5, 0);
    this.text(W / 2, 68, sub, 18, COLORS.muted).setOrigin(0.5, 0);
  }

  // ---- race day: gate pick and how to race ----

  private showGatePick(): void {
    const day = this.day!;
    this.clear();
    const n = day.motoNumber;
    this.header(this.dayTitle(), `Moto ${n} of ${day.motoCount} · ${day.laps} laps · ${day.field.length} riders`);
    const { taken, free } = day.gatesForPlayer();
    const myTurn = day.pickOrder.indexOf(PLAYER_ID) + 1;
    const how = n > 1 ? 'Gate picks for moto 2 go in moto 1 finishing order.' : day.qualifying ? 'Gate picks for moto 1 go in qualifying order.' : 'Gate picks for moto 1 are drawn at random.';
    this.text(W / 2, 108, `${how} You pick ${ordinal(myTurn)}. Inside gates get a better start.`, 22).setOrigin(0.5, 0);

    let chosen = free[0];
    // One gate per rider, laid out as the start is: gates 1 to 8 are the front row, 9 to 16 the
    // second row and 17 on the third, each straight behind the gate 8 before it.
    const count = day.field.length;
    const perRow = Math.min(count, ROW_SIZE);
    const rows = Math.ceil(count / ROW_SIZE);
    // A third row squeezes the rows up and moves the rest of the screen down a little.
    const rowH = rows > 2 ? 46 : 60;
    const gh = rows > 2 ? 38 : 46;
    const y0 = rows > 2 ? 166 : 178;
    const dy = rows > 2 ? 26 : 0;
    const gw = 70;
    const gx = W / 2 - (perRow * gw) / 2 + gw / 2;
    const gateButtons: Button[] = [];
    for (let g = 0; g < count; g++) {
      const row = Math.floor(g / ROW_SIZE);
      const x = gx + (g % ROW_SIZE) * gw;
      const y = y0 + row * rowH;
      const who = taken.get(g);
      const bonus = gateBonus(day.track, g);
      if (who) {
        const r = this.add.rectangle(x, y, gw - 8, gh, COLORS.inkLine).setStrokeStyle(2, COLORS.panelLight);
        this.screen.add(r);
        this.text(x, y + 4, gateBadges(this.names).get(who) ?? '', 18, COLORS.muted).setOrigin(0.5);
      } else {
        const b = this.btn(x, y, bonus > 0 ? `+${bonus}%` : bonus < 0 ? `${bonus}%` : '0%', () => {
          chosen = g;
          gateButtons.forEach((o) => o.setSelected(o === b));
        }, gw - 8, gh);
        b.setSelected(g === chosen);
        gateButtons.push(b);
      }
      // The gate's number in its top corner, over the button.
      this.text(x - gw / 2 + 7, y - gh / 2 + 1, `${g + 1}`, 14, COLORS.muted).setOrigin(0, 0);
    }
    for (let row = 0; row < rows; row++) this.text(gx - gw / 2 - 12, y0 + row * rowH, ['Front row', 'Second row', 'Third row'][row] ?? `Row ${row + 1}`, 18, COLORS.muted).setOrigin(1, 0.5);
    this.text(W / 2, rows > 2 ? 282 : 266, 'Taken gates show who has them. The % is the start bonus.', 18, COLORS.muted).setOrigin(0.5, 0);

    // How to race it.
    const { racing } = services.content;
    this.box(100, 286 + dy, 1080, 356 - dy);
    const message = this.messagePicker(300 + dy);
    this.text(130, 462 + dy, `In a race, the pit board comes out when your message runs out (every lap, or the laps you set it for) and you can change your message ${racing.ink} times a moto. Auto-complete plays the same race out on screen with no pit board, holding your message all race. Either way, you retire at ${racing.sim.retireAtBroken} broken parts.`, 19, COLORS.cream, { wordWrap: { width: 1020 }, lineSpacing: 2 });
    this.btn(W / 2 - 300, 600, 'Race', () => this.go(chosen, message(), false), 260, 52);
    this.btn(W / 2, 600, 'Auto-complete', () => this.go(chosen, message(), true), 260, 52);
    this.btn(W / 2 + 300, 600, 'Bike check', () => this.showBike(), 260, 52);
    if (n > 1) this.btn(W / 2, 682, 'Leave early', () => this.confirmLeave(), 200, 44);
  }

  /** The starting message buttons, from y down: returns the message picked. */
  private messagePicker(y: number): () => string {
    const { racing } = services.content;
    this.text(130, y, 'Starting message', 24, COLORS.accent);
    let message = 'steady';
    const msgButtons: Button[] = [];
    racing.messages.forEach((m, i) => {
      const b = this.btn(250 + i * 280, y + 62, m.name, () => {
        message = m.id;
        msgButtons.forEach((o, j) => o.setSelected(j === i));
      }, 240, 48);
      b.setSelected(m.id === message);
      msgButtons.push(b);
      this.text(130 + i * 280, y + 94, m.desc, 18, COLORS.muted, { wordWrap: { width: 250 } });
    });
    return () => message;
  }

  // ---- championship rounds: qualifying (Spec 12.2) ----

  private showQualifyingStart(): void {
    const day = this.day!;
    const laps = day.round!.qualifyingLaps;
    this.clear();
    this.header(this.dayTitle(), `Qualifying · an out lap and ${laps} timed laps · ${day.field.length} riders`);
    this.text(W / 2, 108, 'Your best timed lap sets your place in the gate pick for moto 1. Qualifying scores no points.', 22).setOrigin(0.5, 0);
    this.text(W / 2, 146, 'Everyone goes out together from a random spot on the start; the out lap from the gate is not timed.', 18, COLORS.muted).setOrigin(0.5, 0);
    this.box(100, 286, 1080, 356);
    const message = this.messagePicker(300);
    const { racing } = services.content;
    this.text(130, 462, `The pit board comes out each lap as in a moto, with ${racing.ink} message changes. Auto-complete holds your message all session. Parts wear as in a race, and there are no repairs at the track.`, 19, COLORS.cream, { wordWrap: { width: 1020 }, lineSpacing: 2 });
    this.btn(W / 2 - 300, 600, 'Qualify', () => this.goQualifying(message(), false), 260, 52);
    this.btn(W / 2, 600, 'Auto-complete', () => this.goQualifying(message(), true), 260, 52);
    this.btn(W / 2 + 300, 600, 'Bike check', () => this.showBike(), 260, 52);
  }

  private goQualifying(message: string, auto: boolean): void {
    this.sim = this.day!.startQualifying(message);
    this.auto = auto;
    this.qualifying = true;
    this.startLive();
  }

  private showQualifyingResults(): void {
    const day = this.day!;
    const rec = day.finishQualifying(this.sim!);
    this.qualifying = false;
    this.clear();
    this.header('Qualifying results', this.dayTitle());
    const rows = rec.results.map((r) => {
      const name = (r.player ? `${this.save.rider.name} (you)` : r.name).padEnd(22).slice(0, 22);
      const best = r.bestLap !== null ? formatTime(r.bestLap, 3) : '—';
      return `${String(r.position).padStart(2)}  ${name} ${best.padStart(8)}  ${(r.position === 1 ? 'Pole' : r.gap).padStart(9)}`;
    });
    const t = this.text(40, 110, ['Pos Rider                      Best        Gap', ...rows].join('\n'), 16, COLORS.cream, { lineSpacing: 5 }).setFontFamily('Consolas, "Courier New", monospace');
    const mine = rec.results.findIndex((r) => r.player);
    const lh = t.height / (rows.length + 1);
    this.screen.add(this.add.rectangle(34, 110 + lh * (mine + 1), 640, lh, COLORS.accentDark, 0.45).setOrigin(0, 0));
    this.screen.bringToTop(t);
    const me = rec.results[mine];
    this.box(740, 110, 500, 470);
    this.text(764, 126, 'Your qualifying', 24, COLORS.accent);
    const xp = Object.values(rec.xp).reduce((a, b) => a + b, 0);
    this.text(764, 170, [
      me.bestLap === null ? 'No timed lap' : `${ordinal(me.position)} fastest${me.position === 1 ? ': pole position!' : ''}`,
      `Best timed lap: ${me.bestLap !== null ? formatTime(me.bestLap, 3) : '—'}`,
      `You pick your gate ${ordinal(me.position)} for moto 1.`,
      `Rider XP: ${xp.toFixed(0)}`,
    ].join('\n'), 20, COLORS.cream, { lineSpacing: 10, wordWrap: { width: 450 } });
    this.btn(990, 640, 'Moto 1', () => this.showGatePick(), 260, 50);
  }

  private confirmLeave(): void {
    const c = this.openModal(620, 240);
    c.add(this.add.text(0, -60, "Leave before moto 2? It counts as a DNF.\nYou keep everything you earned in moto 1.", textStyle(20, COLORS.cream, { align: 'center' })).setOrigin(0.5));
    c.add(button(this, -130, 50, 'Leave', () => {
      this.closeModal();
      this.day!.leaveEarly();
      this.showDayResults();
    }, 200, 46));
    c.add(button(this, 130, 50, 'Stay', () => this.closeModal(), 200, 46));
  }

  private showBike(): void {
    const career = this.save.career;
    const bike = this.day?.player.bike ?? career.bike;
    const c = this.openModal(620, 520);
    c.add(this.add.text(0, -230, 'Your bike', textStyle(24, COLORS.accent)).setOrigin(0.5));
    services.content.bikes.slots.forEach((s, i) => {
      const p = bike.parts[s.id];
      const cond = p ? Math.round(p.condition * 100) : 0;
      const y = -180 + i * 34;
      c.add(this.add.text(-270, y, s.name, textStyle(17)));
      c.add(this.add.rectangle(-30, y + 11, 200, 12, COLORS.panelLight).setOrigin(0, 0.5));
      c.add(this.add.rectangle(-30, y + 11, Math.max(1, 2 * cond), 12, cond === 0 ? 0xb03030 : cond <= 20 ? COLORS.accent : 0x6fa84a).setOrigin(0, 0.5));
      c.add(this.add.text(185, y, cond === 0 ? 'Broken' : `${cond}%`, textStyle(17, cond <= 20 ? COLORS.accent : COLORS.cream)));
    });
    c.add(this.add.text(0, 170, 'No repairs at the track. Parts wear as you ride.', textStyle(15, COLORS.muted)).setOrigin(0.5));
    c.add(button(this, 0, 220, 'Close', () => this.closeModal(), 200, 44));
  }

  private go(gate: number, message: string, auto: boolean): void {
    const day = this.day!;
    day.assignGates(gate);
    this.sim = day.startMoto(message);
    this.auto = auto;
    if (auto) {
      this.startLive();
      return;
    }
    if (!this.explained) {
      this.explained = true;
      const c = this.openModal(760, 400);
      c.add(this.add.text(0, -160, 'Your first race', textStyle(26, COLORS.accent)).setOrigin(0.5));
      c.add(this.add.text(0, -20, [
        'The race runs itself: your skills and your bike decide how fast you go.',
        'You are the orange rider with the arrow over you. The tower on the right is the running order.',
        'Each time the leader crosses the line, the pit board comes out. Pick a message, or keep the one you have.',
        'Goal for today: finish both motos.',
      ].join('\n\n'), textStyle(18, COLORS.cream, { align: 'center', wordWrap: { width: 680 } })).setOrigin(0.5));
      c.add(button(this, 0, 160, "Let's go", () => {
        this.closeModal();
        this.startLive();
      }, 220, 46));
      return;
    }
    this.startLive();
  }

  // ---- the live race screen ----

  private startLive(): void {
    const sim = this.sim!;
    this.clear();
    const from = startGeom(sim.track).from;
    this.cps = new Map(sim.riders.map((r) => [r.e.id, { t: [0], d: [from] }]));
    this.boardLaps = 1;
    this.boardAt = 0;
    this.myLaps = 0;
    this.wearAt = sim.playerBike ? [{ t: 0, parts: structuredClone(sim.playerBike.parts) }] : [];
    this.detailTab = 'bike';
    this.traces = [];
    this.raceEvents = [];
    this.eventIndex = 0;
    this.feed = [];
    this.clock = 0;
    this.paused = false;
    this.retiredAt = null;
    this.detail = false;

    const practice = this.args.mode === 'practice';
    this.box(16, 16, 900, 54);
    this.ui.title = this.text(32, 30, '', 20, COLORS.cream);
    // Your message, then the pen: one section of ink per message change (racing data's ink).
    this.ui.ink = this.text(900 - PEN_W - 14, 30, '', 20, COLORS.accent).setOrigin(1, 0);
    this.pen = penMeter(this, 900 - PEN_W, 43, services.content.racing.ink, PEN_W);
    this.screen.add(this.pen);
    this.pen.setVisible(!practice);
    // Riders ride up to the start in the order they picked their gates.
    this.director = directorFor(sim, services.content.bikes, services.content.racing.messages, this.day?.pickOrder);
    this.view = new RaceView(this, this.screen, sim.track, services.content.trackParts, 16, 82, 900, 440);
    this.view.hasStart = !practice;
    this.box(16, 534, 900, 170);
    this.ui.me = this.text(32, 546, '', 18, COLORS.cream, { lineSpacing: 6 });
    this.ui.feed = this.text(400, 546, '', 16, COLORS.cream, { lineSpacing: 7, wordWrap: { width: 500 } });
    this.box(930, 16, 334, 560);
    this.ui.tower = this.text(946, 30, '', 16, COLORS.cream, { lineSpacing: 7 });
    this.ui.detail = this.text(946, 76, '', 15, COLORS.cream, { lineSpacing: 5 }).setVisible(false);
    // Details: the bike's parts, or section times.
    this.detailTabs = (['bike', 'sections'] as const).map((tab, i) => {
      const b = this.btn(1015 + i * 160, 46, tab === 'bike' ? 'Bike' : 'Section times', () => {
        this.detailTab = tab;
        this.detailTabs.forEach((o, j) => o.setSelected(j === i));
        this.renderDetail();
      }, 150, 34);
      b.setSelected(tab === this.detailTab);
      b.setVisible(false);
      return b;
    });

    // Speed buttons and actions.
    const speedButtons = SPEED_LABELS.map((l, i) => this.btn(962 + i * 64, 604, l, () => {
      this.speed = i;
      this.paused = false;
      speedButtons.forEach((b, j) => b.setSelected(j === i));
    }, 60, 40));
    speedButtons[this.speed].setSelected(true);
    if (practice) {
      this.btn(1022, 660, 'Stop riding', () => this.stopPractice(), 170, 44);
      this.btn(1190, 660, 'Details', () => this.toggleDetail(), 130, 44);
    } else {
      this.btn(1012, 660, 'Retire', () => this.confirmRetire(), 150, 44);
      this.btn(1180, 660, 'Details', () => this.toggleDetail(), 150, 44);
    }
    this.addLap(sim.nextLap());
    // A race opens with the start procedure: the line-up, then the board and the five-second
    // hold, all in negative race time up to the gate drop at 0 (riderAI lineUp, RaceView updateStart).
    this.clock = practice ? 0 : -this.director.prestart;
    this.live = true;
    this.onTick = () => this.tick();
    this.tick();
  }

  private toggleDetail(): void {
    this.detail = !this.detail;
    this.ui.tower.setVisible(!this.detail);
    this.ui.detail.setVisible(this.detail);
    this.detailTabs.forEach((b) => b.setVisible(this.detail));
    this.renderDetail();
  }

  private addLap(trace: LapTrace): void {
    const sim = this.sim!;
    for (const [id, times] of Object.entries(trace.times)) {
      const cp = this.cps.get(id)!;
      for (let i = 1; i < times.length; i++) {
        cp.t.push(times[i]);
        cp.d.push(trace.marks[i]);
      }
    }
    // The bike as the simulation left it after this lap, shown once the player has ridden it.
    const mine = trace.times[PLAYER_ID];
    if (sim.playerBike && mine) this.wearAt.push({ t: mine[mine.length - 1], parts: structuredClone(sim.playerBike.parts) });
    this.traces.push(trace);
    this.director?.addLap(trace);
    this.raceEvents.push(...trace.events);
    this.raceEvents.sort((a, b) => a.t - b.t);
    this.renderDetail();
  }

  /**
   * Where each rider is at the current clock, in laps, and how many checkpoints they have passed.
   * A rider who has taken the flag keeps their finishing time, which fixes their place.
   */
  private positions(): { id: string; dist: number; k: number; out: boolean; finished: boolean; finishT: number; gate: number }[] {
    const sim = this.sim!;
    const res = [];
    for (const r of sim.riders) {
      const cp = this.cps.get(r.e.id)!;
      let k = 0;
      while (k + 1 < cp.t.length && cp.t[k + 1] <= this.clock) k++;
      let dist = cp.d[k];
      if (k + 1 < cp.t.length && this.clock > cp.t[k]) dist += ((this.clock - cp.t[k]) / (cp.t[k + 1] - cp.t[k])) * (cp.d[k + 1] - cp.d[k]);
      const lastLap = sim.totalLaps;
      const finished = lastLap !== null && cp.d[k] >= lastLap - 1e-9;
      const out = (r.retired && k === cp.t.length - 1 && !finished) || (r.e.player && this.retiredAt !== null);
      res.push({ id: r.e.id, dist, k, out, finished, finishT: finished ? cp.t[k] : Infinity, gate: r.e.gate });
    }
    return res;
  }

  /**
   * Running order as drawn: riders who have finished first, in the order they took the flag, then
   * the rest furthest round first, riders who are out at the bottom.
   */
  private runningOrder<T extends { dist: number; out: boolean; finishT: number; gate: number }>(pos: T[]): T[] {
    return [...pos].sort((a, b) => Number(a.out) - Number(b.out) || a.finishT - b.finishT || b.dist - a.dist || a.gate - b.gate);
  }

  /** When a rider passed race distance d, from their timing points (the clock if they haven't yet). */
  private timeAt(id: string, d: number): number {
    const cp = this.cps.get(id)!;
    let k = 0;
    while (k + 1 < cp.d.length && cp.d[k + 1] < d) k++;
    if (k + 1 >= cp.d.length) return this.clock;
    const t = cp.t[k] + ((d - cp.d[k]) / Math.max(1e-9, cp.d[k + 1] - cp.d[k])) * (cp.t[k + 1] - cp.t[k]);
    return Math.min(this.clock, t);
  }

  /** How far behind rider a rider b is: at the flag once both have finished, else now against when a passed this spot. */
  private behind(a: { id: string; finished: boolean; finishT: number }, b: { id: string; dist: number; finished: boolean; finishT: number }): number {
    if (b.finished) return a.finished ? b.finishT - a.finishT : 0;
    return Math.max(0, this.clock - this.timeAt(a.id, b.dist));
  }

  private tick(): void {
    const sim = this.sim!;
    const practice = this.args.mode === 'practice';
    // The leader reaches the end of the latest lap we have: the simulation runs the next one.
    const latest = this.traces.at(-1)!;
    const lapEnds = Object.values(latest.times).filter((t) => t.length === latest.marks.length).map((t) => t.at(-1)!);
    const leaderCross = lapEnds.length ? Math.min(...lapEnds) : Infinity;
    if (!sim.finished && this.clock >= leaderCross) {
      if (practice) {
        this.clock = leaderCross;
        this.addLap(sim.nextLap());
        if (sim.finished) this.stopPractice(true);
      } else this.addLap(sim.nextLap());
    }
    // You cross the line: the pit board comes out then, whoever is leading.
    if (!practice && this.crossLine()) return;
    // Lap traces only exist up to the latest lap, so a non-leader parked at its end just waits.
    const lastT = Math.max(...[...this.cps.values()].map((c) => c.t.at(-1)!));
    if (!practice && sim.finished && this.clock >= lastT) {
      this.live = false;
      this.render();
      this.time.delayedCall(800, () => this.finishMoto());
      return;
    }
    while (this.eventIndex < this.raceEvents.length && this.raceEvents[this.eventIndex].t <= this.clock) this.say(this.raceEvents[this.eventIndex++]);
    this.render();
  }

  /**
   * Counts your laps off as the clock passes your own line crossings, and brings the pit board out
   * when one is due: once per crossing, at the moment you cross, on every lap but the last.
   */
  private crossLine(): boolean {
    const sim = this.sim!;
    const tr = this.traces.find((x) => x.lap === this.myLaps + 1);
    const mine = tr?.times[PLAYER_ID];
    if (!tr || !mine || mine.length !== tr.marks.length || this.clock < mine.at(-1)!) return false;
    this.myLaps = tr.lap;
    // Only while you are still racing into another lap.
    const next = this.traces.find((x) => x.lap === tr.lap + 1);
    if (this.auto || this.retiredAt !== null || tr.lap >= sim.totalLaps! || tr.lap < this.boardAt || (next && !next.times[PLAYER_ID])) return false;
    this.clock = mine.at(-1)!;
    this.render();
    this.pitBoard();
    return true;
  }

  /**
   * Runs the lap you are starting again after a change at the pit board, when the simulation ran
   * it as the leader crossed the line. Riders who got there before you ride it exactly as before
   * (MotoSim.redoLap), so nothing already on screen moves. False when it is too late for that (you
   * were lapped and the lap after is already under way): the change then counts from the next lap.
   */
  private redoMyLap(change: () => void): boolean {
    const sim = this.sim!;
    if (sim.lap !== this.myLaps + 1) return false;
    const old = this.traces.pop()!;
    for (const [id, times] of Object.entries(old.times)) {
      const cp = this.cps.get(id)!;
      cp.t.length -= times.length - 1;
      cp.d.length -= times.length - 1;
    }
    if (sim.playerBike && old.times[PLAYER_ID]) this.wearAt.pop();
    const gone = new Set(old.events);
    this.raceEvents = this.raceEvents.filter((e) => !gone.has(e));
    this.director?.dropLap(old);
    this.addLap(sim.redoLap(change));
    this.eventIndex = this.raceEvents.filter((e) => e.t <= this.clock).length;
    return true;
  }

  private render(): void {
    const sim = this.sim!;
    const pos = this.positions();
    const practice = this.args.mode === 'practice';
    const order = this.runningOrder(pos);
    const leader = order[0];
    // Time behind the leader: at the finish line once both have finished, else at the last timing point the rider passed.
    const gap = (p: (typeof pos)[0]) => this.behind(leader, p);
    this.refreshDetail();
    const poses = this.director?.poses(this.clock) ?? [];
    // In qualifying the numbers over the bikes are the order of best timed laps, as in the tower.
    const labels = this.qualifying ? this.qualifyingOrder(pos).map((r) => r.p) : order;
    this.view?.update(poses.map((p) => ({
      pose: p,
      color: this.colors.get(p.id) ?? COLORS.accent,
      look: this.looks.get(p.id),
      label: String(labels.findIndex((o) => o.id === p.id) + 1),
      player: p.id === PLAYER_ID,
      startRow: this.director!.startRow(p.id),
    })), this.clock, this.frameDt, pos.find((p) => p.id === PLAYER_ID)?.out ? leader.id : PLAYER_ID);

    const me = pos.find((p) => p.id === PLAYER_ID)!;
    const myLap = Math.max(1, Math.min(Math.floor(me.dist) + 1, sim.totalLaps ?? Infinity));
    const msg = services.content.racing.messages.find((m) => m.id === sim.playerMessage)!;
    if (practice) {
      this.ui.title.setText(`${this.args.venue.name} · Practice · Lap ${myLap}`);
      this.ui.ink.setText('');
      const p = sim.player!;
      const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
      const xp = Object.values(this.practiceXpNow()).reduce((a, b) => a + b, 0);
      this.ui.me.setText([`Laps done: ${p.lapTimes.length}`, `Last lap: ${p.lapTimes.length ? formatTime(p.lapTimes.at(-1)!) : '—'}`, `Best lap: ${best !== null ? formatTime(best) : '—'}`, `Practice XP: ${xp.toFixed(1)}`].join('\n'));
      this.ui.feed.setText(this.bikeLines().join('\n'));
      const laps = p.lapTimes.map((t, i) => `Lap ${String(i + 1).padStart(3)}   ${formatTime(t)}${t === best ? '  best' : ''}`).slice(-18);
      this.ui.tower.setText(['Lap times', '', ...laps].join('\n')).setFontFamily('Consolas, "Courier New", monospace');
      return;
    }
    const total = sim.totalLaps!;
    if (this.qualifying) {
      this.renderQualifying(pos, me);
      return;
    }
    this.ui.title.setText(`${this.args.venue.name} · Moto ${this.day!.motoNumber} · Lap ${Math.max(1, Math.min(Math.floor(leader.dist) + 1, total))} of ${total}${this.auto ? ' · Auto-complete' : ''}`);
    const until = this.auto || this.boardAt === Infinity ? ' to the flag' : this.boardAt > this.myLaps ? ` to lap ${this.boardAt}` : '';
    this.ui.ink.setText(`${msg.name}${until}`);
    this.pen?.setLevel(sim.ink);

    const rank = order.findIndex((o) => o.id === PLAYER_ID);
    const ahead = order[rank - 1];
    const behind = order[rank + 1];
    const lines = [];
    if (me.out) lines.push('You are out of this moto.');
    else {
      lines.push(`Position: ${ordinal(rank + 1)} of ${order.length}`);
      lines.push(`Your lap: ${myLap} of ${total}`);
      const split = (a: (typeof pos)[0], b: (typeof pos)[0]) => this.behind(a, b).toFixed(1);
      if (ahead) lines.push(`Ahead: ${this.names.get(ahead.id)} ${split(ahead, me)}s`);
      if (behind && !behind.out) lines.push(`Behind: ${this.names.get(behind.id)} ${split(me, behind)}s`);
      const broken = this.brokenParts();
      lines.push(broken.length ? `Broken: ${broken.join(', ')}` : 'Bike: nothing broken');
    }
    this.ui.me.setText(lines.join('\n'));
    this.ui.feed.setText(this.feed.slice(-5).join('\n'));
    this.ui.tower.setText(order.map((p, i) => {
      const name = (this.names.get(p.id) ?? '').padEnd(15).slice(0, 15);
      const g = p.out ? 'OUT' : i === 0 ? (p.finished ? formatTime(p.finishT) : 'Leader') : `+${gap(p).toFixed(1)}`;
      return `${String(i + 1).padStart(2)}  ${p.id === PLAYER_ID ? '▶ ' : '  '}${name} ${g.padStart(7)}`;
    }).join('\n'));
    this.ui.tower.setFontFamily('Consolas, "Courier New", monospace');
    if (!this.skipButton && (me.out || me.finished)) {
      this.skipButton = this.btn(1096, 548, 'Skip to results', () => {
        while (!sim.finished) this.addLap(sim.nextLap());
        this.live = false;
        this.finishMoto();
      }, 300, 40);
    }
  }

  /**
   * Each rider's best timed lap so far (the out lap, lap 1, isn't timed), from when they passed
   * each finish line. Null until they have done one.
   */
  private bestTimed(id: string): number | null {
    const cp = this.cps.get(id)!;
    const ends = new Map<number, number>();
    for (let i = 0; i < cp.t.length && cp.t[i] <= this.clock; i++) {
      const d = cp.d[i];
      if (d >= 1 && Math.abs(d - Math.round(d)) < 1e-9) ends.set(Math.round(d), cp.t[i]);
    }
    let best: number | null = null;
    for (const [lap, t] of ends) {
      const before = ends.get(lap - 1);
      if (lap >= 2 && before !== undefined) best = best === null ? t - before : Math.min(best, t - before);
    }
    return best;
  }

  /** Riders by best timed lap so far, then those with no time yet furthest round first. */
  private qualifyingOrder<T extends { id: string; dist: number }>(pos: T[]): { p: T; best: number | null }[] {
    const rows = pos.map((p) => ({ p, best: this.bestTimed(p.id) }));
    return rows.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity) || b.p.dist - a.p.dist);
  }

  /** The live screen in qualifying: the tower is the order of best timed laps. */
  private renderQualifying(pos: ReturnType<RaceScene['positions']>, me: ReturnType<RaceScene['positions']>[number]): void {
    const sim = this.sim!;
    const total = sim.totalLaps!;
    const myLap = Math.max(1, Math.min(Math.floor(me.dist) + 1, total));
    const msg = services.content.racing.messages.find((m) => m.id === sim.playerMessage)!;
    this.ui.title.setText(`${this.args.venue.name} · Qualifying · ${myLap === 1 ? 'Out lap' : `Timed lap ${myLap - 1} of ${total - 1}`}${this.auto ? ' · Auto-complete' : ''}`);
    const until = this.auto || this.boardAt === Infinity ? ' to the flag' : this.boardAt > this.myLaps ? ` to lap ${this.boardAt}` : '';
    this.ui.ink.setText(`${msg.name}${until}`);
    this.pen?.setLevel(sim.ink);
    const rows = this.qualifyingOrder(pos);
    const pole = rows[0].best;
    const mine = rows.findIndex((r) => r.p.id === PLAYER_ID);
    const myBest = rows[mine].best;
    const lines = [];
    if (me.out) lines.push('You are out of qualifying.');
    else {
      lines.push(myBest === null ? 'No timed lap yet' : `Provisional: ${ordinal(mine + 1)} of ${rows.length}`);
      lines.push(myLap === 1 ? 'Out lap: not timed' : `Timed lap ${myLap - 1} of ${total - 1}`);
      lines.push(`Your best: ${myBest !== null ? formatTime(myBest, 3) : '—'}${myBest !== null && pole !== null && mine > 0 ? `  (+${(myBest - pole).toFixed(3)}s)` : ''}`);
      const broken = this.brokenParts();
      lines.push(broken.length ? `Broken: ${broken.join(', ')}` : 'Bike: nothing broken');
    }
    this.ui.me.setText(lines.join('\n'));
    this.ui.feed.setText(this.feed.slice(-5).join('\n'));
    this.ui.tower.setText(['Best timed laps', ...rows.map((r, i) => {
      const name = (this.names.get(r.p.id) ?? '').padEnd(15).slice(0, 15);
      const g = r.best === null ? (r.p.out ? 'OUT' : '—') : i === 0 ? formatTime(r.best, 3) : `+${(r.best - pole!).toFixed(3)}`;
      return `${String(i + 1).padStart(2)}  ${r.p.id === PLAYER_ID ? '▶ ' : '  '}${name} ${g.padStart(7)}`;
    })].join('\n'));
    this.ui.tower.setFontFamily('Consolas, "Courier New", monospace');
    if (!this.skipButton && (me.out || me.finished)) {
      this.skipButton = this.btn(1096, 548, 'Skip to results', () => {
        while (!sim.finished) this.addLap(sim.nextLap());
        this.live = false;
        this.finishMoto();
      }, 300, 40);
    }
  }

  /** Redraws Details when what it shows has moved on: you crossed the line (new wear, a new lap of section times). */
  private refreshDetail(): void {
    if (!this.detail) return;
    const mine = this.cps.get(PLAYER_ID);
    const key = `${this.detailTab} ${this.bikeNow()?.lap ?? -1} ${mine ? mine.t.filter((t) => t <= this.clock).length : 0}`;
    if (key !== this.detailKey) this.renderDetail();
  }

  private renderDetail(): void {
    const t = this.ui.detail;
    const sim = this.sim;
    if (!t || !sim || !this.detail) return;
    const mine = this.cps.get(PLAYER_ID);
    this.detailKey = `${this.detailTab} ${this.bikeNow()?.lap ?? -1} ${mine ? mine.t.filter((x) => x <= this.clock).length : 0}`;
    t.setFontFamily('Consolas, "Courier New", monospace');
    if (this.detailTab === 'bike') return void t.setText(this.bikeDetail().join('\n'));
    const done = [...this.traces].reverse().find((tr) => (tr.times[PLAYER_ID]?.length ?? 0) === tr.marks.length && tr.times[PLAYER_ID].at(-1)! <= this.clock);
    if (!done) return void t.setText('Section times\n\nAfter your first full lap.');
    const lines = [`Section times, lap ${done.lap}`, 'yours  vs the fastest', ''];
    done.secs.forEach((si, i) => {
      const dur = (id: string) => {
        const a = done.times[id];
        return a && a.length > i + 1 ? a[i + 1] - a[i] : Infinity;
      };
      const mine = dur(PLAYER_ID);
      const best = Math.min(...Object.keys(done.times).map(dur));
      const name = si < 0 ? 'Start straight' : (services.content.racing.sections[sim.track.sections[si].type]?.name ?? sim.track.sections[si].type);
      lines.push(`${name.padEnd(15).slice(0, 15)} ${mine.toFixed(1).padStart(5)} ${mine - best > 0.05 ? `+${(mine - best).toFixed(1)}` : ' best'}`);
    });
    t.setText(lines.join('\n'));
  }

  /** The player's bike as of the last time they crossed the line (or at the gate), from the simulation's own wear. */
  private bikeNow(): { parts: Bike['parts']; lap: number } | null {
    if (!this.sim?.playerBike || !this.wearAt.length) return null;
    let i = 0;
    while (i + 1 < this.wearAt.length && this.wearAt[i + 1].t <= this.clock + 1e-6) i++;
    return { parts: this.wearAt[i].parts, lap: i };
  }

  /**
   * Each part's condition, what its wear costs (its share of the bike's stats, from the bike's own
   * condition rule) and a warning when it is low or broken.
   */
  private partStatus(parts: Bike['parts']): { name: string; c: number; loss: number; warn: string }[] {
    const lowAt = services.content.racing.wear.lowAt;
    return services.content.bikes.slots.map((s) => {
      const c = parts[s.id]?.condition ?? 0;
      return { name: s.name, c, loss: 1 - conditionFactor(c), warn: c <= 0 ? 'BROKEN' : c <= lowAt ? 'LOW' : '' };
    });
  }

  /** The bike's stats now against the same bike with every part new. */
  private statStatus(parts: Bike['parts']): { name: string; now: number; fresh: number }[] {
    const bike = this.sim!.playerBike!;
    const now = bikeStats(services.content.bikes, { ...bike, parts });
    const fresh = bikeStats(services.content.bikes, { ...bike, parts: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, { ...p, condition: 1 }])) });
    return services.content.bikes.stats.map((st) => ({ name: st.name, now: now[st.id] ?? 0, fresh: fresh[st.id] ?? 0 }));
  }

  private bikeDetail(): string[] {
    const b = this.bikeNow();
    if (!b) return ['No bike data.'];
    const lowAt = Math.round(services.content.racing.wear.lowAt * 100);
    const short = (n: string) => n.replace('Intake and exhaust', 'Intake/exhaust').replace('Bodywork and controls', 'Bodywork').replace('Wheels and tyres', 'Wheels/tyres');
    const rows = this.partStatus(b.parts).map((p) => `${short(p.name).padEnd(14).slice(0, 14)}${(p.c <= 0 ? '--' : `${(p.c * 100).toFixed(1)}%`).padStart(7)}${`-${(p.loss * 100).toFixed(1)}%`.padStart(7)} ${p.warn}`);
    const stats = this.statStatus(b.parts).map((x) => `${x.name.padEnd(11).slice(0, 11)} ${String(x.now).padStart(4)}  of ${String(x.fresh).padStart(3)} new`);
    return [b.lap ? `Your bike after lap ${b.lap}` : 'Your bike at the gate', 'Part             Cond   Loss', ...rows, '', 'Stats', ...stats, '', 'Loss: what wear costs.', `LOW: ${lowAt}% or less.`];
  }

  private brokenParts(): string[] {
    const parts = this.bikeNow()?.parts;
    if (!parts) return [];
    return services.content.bikes.slots.filter((s) => parts[s.id]?.condition <= 0).map((s) => s.name);
  }

  private bikeLines(): string[] {
    const bike = this.sim?.playerBike;
    if (!bike) return [];
    const parts = services.content.bikes.slots.map((s) => ({ name: s.name, c: bike.parts[s.id]?.condition ?? 0 })).sort((a, b) => a.c - b.c).slice(0, 4);
    return ['Most worn parts', ...parts.map((p) => `${p.name}: ${p.c <= 0 ? 'Broken' : `${Math.round(p.c * 100)}%`}`)];
  }

  /** Turns a race event into a line for the feed, if it involves the rider or is a crash. */
  private say(e: RaceEvent): void {
    const sim = this.sim!;
    const section = (i: number) => (i < 0 ? 'start' : (services.content.racing.sections[sim.track.sections[i]?.type]?.name ?? 'track').toLowerCase());
    const name = (id: string) => this.names.get(id) ?? id;
    const slot = (id: string) => services.content.bikes.slots.find((s) => s.id === id)?.name.toLowerCase() ?? id;
    let line: string | null = null;
    switch (e.kind) {
      case 'pass':
        if (e.rider === PLAYER_ID) line = `You passed ${name(e.other)} at the ${section(e.section)}.`;
        else if (e.other === PLAYER_ID) line = `${name(e.rider)} passed you at the ${section(e.section)}.`;
        break;
      case 'failedPass':
        if (e.rider === PLAYER_ID) line = `You couldn't get past ${name(e.other)}.`;
        break;
      case 'mistake': {
        const crash = e.outcome === 'minor_crash' || e.outcome === 'serious_crash';
        if (e.rider === PLAYER_ID) {
          const what = e.outcome === 'small' ? 'Small mistake' : e.outcome === 'big' ? 'Big moment' : e.outcome === 'minor_crash' ? 'You went down' : 'Big crash';
          line = `${what} at the ${section(e.section)} (−${e.lost.toFixed(1)}s).`;
          if (e.damaged.length) line += ` ${e.outcome === 'serious_crash' ? 'Broken' : 'Damaged'}: ${e.damaged.map(slot).join(', ')}.`;
        } else if (crash) line = `${name(e.rider)} crashed at the ${section(e.section)}.`;
        break;
      }
      case 'breakdown':
        if (e.rider === PLAYER_ID) line = `Your ${slot(e.slot)} has broken!`;
        break;
      case 'retire':
        line = e.rider === PLAYER_ID ? `You're out: ${e.reason.toLowerCase()}.` : `${name(e.rider)} retires.`;
        if (e.rider === PLAYER_ID && this.retiredAt === null) this.retiredAt = e.t;
        break;
    }
    if (!line) return;
    // Repeats of the same line (a run of failed passes) stack up as one.
    const last = this.feed.at(-1);
    const m = last?.match(/^(.*?)(?: \(×(\d+)\))?$/);
    if (m && m[1] === line) this.feed[this.feed.length - 1] = `${line} (×${Number(m[2] ?? 1) + 1})`;
    else this.feed.push(line);
  }

  private pitBoard(): void {
    const sim = this.sim!;
    const { racing } = services.content;
    const c = this.openModal(1180, 620);
    const pos = this.positions();
    const order = this.runningOrder(pos);
    const rank = order.findIndex((o) => o.id === PLAYER_ID) + 1;
    const total = sim.totalLaps!;
    const left = total - this.myLaps;
    c.add(this.add.text(0, -278, `Pit board · you've done lap ${this.myLaps} of ${total}`, textStyle(24, COLORS.accent)).setOrigin(0.5));
    const line = this.add.text(-PEN_W / 2 - 8, -240, `You're ${ordinal(rank)}. Message now: ${racing.messages.find((m) => m.id === sim.playerMessage)!.name}. Ink left:`, textStyle(18)).setOrigin(0.5);
    c.add(line);
    c.add(penMeter(this, line.x + line.width / 2 + 12, -240, racing.ink, PEN_W).setLevel(sim.ink));

    // How long the message holds: the board stays away until then, so the race runs on through the line.
    c.add(this.add.text(-560, -196, 'Show it for', textStyle(18, COLORS.cream)));
    const choices = BOARD_LAPS.filter((n) => n === 0 || n < left);
    if (!choices.includes(this.boardLaps)) this.boardLaps = choices[0];
    const lapButtons = choices.map((n, i) => {
      const b = button(this, -400 + i * 118, -184, n === 0 ? 'To the flag' : `${n} lap${n > 1 ? 's' : ''}`, () => {
        this.boardLaps = n;
        lapButtons.forEach((o, j) => o.setSelected(j === i));
      }, 112, 40);
      b.setSelected(n === this.boardLaps);
      c.add(b);
      return b;
    });
    const set = () => {
      this.boardAt = this.boardLaps === 0 ? Infinity : this.myLaps + this.boardLaps;
      this.closeModal();
    };
    racing.messages.forEach((m, i) => {
      const y = -112 + i * 74;
      const current = m.id === sim.playerMessage;
      const b = button(this, -440, y, current ? `Keep ${m.name}` : m.name, () => {
        if (!current) {
          if (sim.ink <= 0) return;
          // The new message counts from the lap you are starting now.
          if (!this.redoMyLap(() => sim.changeMessage(m.id))) sim.changeMessage(m.id);
        }
        set();
      }, 230, 50);
      b.setSelected(current);
      b.setEnabled(current || sim.ink > 0);
      c.add(b);
      c.add(this.add.text(-312, y, `${m.desc}${current ? '' : sim.ink > 0 ? '  (uses 1 ink)' : '  (no ink left)'}`, textStyle(16, COLORS.muted, { wordWrap: { width: 300 } })).setOrigin(0, 0.5));
    });
    c.add(this.add.text(-560, 110, 'When it runs out the board comes out again; keeping a message is free.', textStyle(15, COLORS.muted, { wordWrap: { width: 540 } })));

    // The bike, from the same wear the race runs on.
    const bike = this.bikeNow();
    c.add(this.add.text(40, -196, bike?.lap ? `Your bike after lap ${bike.lap}` : 'Your bike', textStyle(20, COLORS.accent)));
    c.add(this.add.text(392, -192, 'cond', textStyle(14, COLORS.muted)));
    c.add(this.add.text(462, -192, 'loss', textStyle(14, COLORS.muted)));
    if (bike) {
      this.partStatus(bike.parts).forEach((p, i) => {
        const y = -158 + i * 29;
        const pct = p.c * 100;
        const col = p.c <= 0 ? 0xb03030 : p.warn ? COLORS.accent : 0x6fa84a;
        c.add(this.add.text(40, y, p.name, textStyle(15)));
        c.add(this.add.rectangle(236, y + 10, 150, 10, COLORS.panelLight).setOrigin(0, 0.5));
        c.add(this.add.rectangle(236, y + 10, Math.max(1, 1.5 * pct), 10, col).setOrigin(0, 0.5));
        c.add(this.add.text(392, y, p.c <= 0 ? 'Broken' : `${pct.toFixed(1)}%`, textStyle(15, p.warn ? COLORS.accent : COLORS.cream)));
        c.add(this.add.text(462, y, `−${(p.loss * 100).toFixed(1)}%${p.warn === 'LOW' ? '  low' : ''}`, textStyle(15, p.warn ? COLORS.accent : COLORS.muted)));
      });
      const stats = this.statStatus(bike.parts).map((x) => `${x.name} ${x.now}/${x.fresh}`).join('   ');
      c.add(this.add.text(40, 140, `Stats now / new: ${stats}`, textStyle(14, COLORS.muted, { wordWrap: { width: 520 } })));
      c.add(this.add.text(40, 186, `Loss is what wear takes off that part's share of its stats. Low (${Math.round(racing.wear.lowAt * 100)}% or less) wears faster.`, textStyle(14, COLORS.muted, { wordWrap: { width: 520 } })));
    }

    c.add(button(this, -150, 262, "It's over, bike blown", () => {
      this.closeModal();
      // You pull off at the line, so the lap you were starting is run without you.
      this.redoMyLap(() => sim.retirePlayer("It's over, bike blown"));
      this.retireNow();
    }, 280, 46));
    c.add(button(this, 170, 262, 'Watch on', set, 200, 46));
  }

  private confirmRetire(): void {
    // Nothing to retire from before the gate drops.
    if (this.retiredAt !== null || this.clock < 0) return;
    const c = this.openModal(560, 220);
    const what = this.qualifying ? 'You pull off and set no more times.' : 'You pull off and score a DNF for this moto.';
    c.add(this.add.text(0, -50, `It's over, bike blown?\n${what}`, textStyle(20, COLORS.cream, { align: 'center' })).setOrigin(0.5));
    c.add(button(this, -120, 55, 'Retire', () => {
      this.closeModal();
      this.retireNow();
    }, 200, 46));
    c.add(button(this, 120, 55, 'Keep racing', () => this.closeModal(), 200, 46));
  }

  private retireNow(): void {
    this.sim!.retirePlayer("It's over, bike blown");
    this.retiredAt = this.clock;
    this.director?.retire(PLAYER_ID, this.clock);
    this.feed.push('You pull off the track.');
  }

  // ---- results ----

  private finishMoto(): void {
    if (this.qualifying) return this.showQualifyingResults();
    const day = this.day!;
    const rec = day.finishMoto(this.sim!);
    this.showMotoResults(rec);
  }

  private resultTable(results: RiderResult[], x: number, y: number, points = true): void {
    const rows = results.map((r) => {
      const name = (r.player ? `${this.save.rider.name} (you)` : r.name).padEnd(22).slice(0, 22);
      const pts = r.retired ? 0 : (services.content.racing.points[r.position - 1] ?? 0);
      const best = r.bestLap !== null ? formatTime(r.bestLap) : '—';
      return `${String(r.position).padStart(2)}  ${name} ${(r.retired ? `DNF` : r.gap).padStart(9)}  ${best.padStart(6)}${points ? String(pts).padStart(5) : ''}`;
    });
    const head = `Pos Rider                       Gap   Best${points ? '  Pts' : ''}`;
    const t = this.text(x, y, [head, ...rows].join('\n'), 16, COLORS.cream, { lineSpacing: 5 }).setFontFamily('Consolas, "Courier New", monospace');
    const mine = results.findIndex((r) => r.player);
    if (mine >= 0) {
      const lh = t.height / (rows.length + 1);
      const bar = this.add.rectangle(x - 6, y + lh * (mine + 1), 660, lh, COLORS.accentDark, 0.45).setOrigin(0, 0);
      this.screen.add(bar);
      this.screen.bringToTop(t);
    }
  }

  private showMotoResults(rec: MotoRecord): void {
    const day = this.day!;
    this.clear();
    const n = day.motos.length;
    this.header(`Moto ${n} results`, this.dayTitle());
    this.resultTable(rec.results, 40, 110);
    const me = rec.results.find((r) => r.player)!;
    this.box(740, 110, 500, 470);
    const xp = Object.values(rec.xp).reduce((a, b) => a + b, 0);
    this.text(764, 126, 'Your moto', 24, COLORS.accent);
    this.text(764, 170, [
      me.retired ? `DNF: ${me.reason ?? 'retired'}` : `Finished ${ordinal(me.position)}${me.position === 1 ? '. You won!' : ''}`,
      `Points: ${rec.points}`,
      `Prize money: ${formatMoney(rec.prize)}`,
      `Passes: ${rec.passes}`,
      `Rider XP: ${xp.toFixed(0)}`,
    ].join('\n'), 20, COLORS.cream, { lineSpacing: 10 });
    const champ = rec.results.find((r) => r.tag === 'Local Champion');
    if (champ && !champ.player) this.text(764, 380, `The Local Champion, ${champ.name}, was ${champ.retired ? 'out' : ordinal(champ.position)}.`, 16, COLORS.muted, { wordWrap: { width: 450 } });
    if (day.done) this.btn(990, 640, 'Day results', () => this.showDayResults(), 260, 50);
    else {
      this.btn(860, 640, `Moto ${n + 1}`, () => this.showGatePick(), 220, 50);
      this.btn(1110, 640, 'Leave early', () => this.confirmLeave(), 220, 50);
    }
  }

  private showDayResults(): void {
    const day = this.day!;
    this.clear();
    const res = day.dayResult();
    this.header('Race day results', `${this.dayTitle()} · overall by combined moto finishes`);
    const rows = res.overall.map((r) => {
      const name = (r.player ? `${this.save.rider.name} (you)` : r.name).padEnd(22).slice(0, 22);
      const ps = r.positions.map((p) => (p === null ? 'DNF' : String(p))).map((s) => s.padStart(4)).join('');
      return `${String(r.position).padStart(2)}  ${name}${ps}${String(r.points).padStart(6)}`;
    });
    const t = this.text(40, 110, ['Pos Rider                   M1  M2   Pts', ...rows].join('\n'), 16, COLORS.cream, { lineSpacing: 5 }).setFontFamily('Consolas, "Courier New", monospace');
    const mine = res.overall.findIndex((r) => r.player);
    const lh = t.height / (rows.length + 1);
    this.screen.add(this.add.rectangle(34, 110 + lh * (mine + 1), 520, lh, COLORS.accentDark, 0.45).setOrigin(0, 0));
    this.screen.bringToTop(t);

    // Money, XP and the bike go back on the career.
    const career = this.save.career;
    const prizes = day.motos.reduce((a, m) => a + m.prize, 0);
    const money = prizes + res.podiumBonus - this.args.fee;
    const xp = sumXp(...day.motos.map((m) => m.xp), day.qualifying?.xp ?? {});
    const payout = applyRide(services.content, career, day.player.bike, money, xp);
    const c = career.counters;
    const myRows = day.motos.map((m) => m.results.find((r) => r.player)!);
    c['race.days'] = (c['race.days'] ?? 0) + 1;
    noteActivity(services.content.shops, career, 'raceDay');
    c['race.motos'] = (c['race.motos'] ?? 0) + myRows.filter((r) => !r.retired).length;
    c['race.wins'] = (c['race.wins'] ?? 0) + myRows.filter((r) => !r.retired && r.position === 1).length;
    const me = res.overall.find((r) => r.player)!;
    if (me.position <= 3) c['race.podiums'] = (c['race.podiums'] ?? 0) + 1;
    const finishedBoth = me.positions.every((p) => p !== null);
    const firstDay = !this.save.flags.first_race_done;
    this.save.flags.first_race_done = true;
    if (finishedBoth) this.save.flags.first_race_finished = true;

    this.box(580, 110, 680, 530);
    this.text(604, 124, `${ordinal(me.position)} overall`, 26, COLORS.accent);
    const champ = this.champ;
    const lines = [
      `Entry: ${this.args.fee ? `−${formatMoney(this.args.fee)}` : 'free (first race)'}`,
      `Moto prizes: ${formatMoney(prizes)}`,
      `Podium bonus: ${formatMoney(res.podiumBonus)}`,
      `Net: ${money >= 0 ? '+' : ''}${formatMoney(money)}`,
      `Money now: ${formatMoney(career.money)}`,
    ];
    if (firstDay) lines.push('', finishedBoth ? 'Goal done: you finished both motos.' : 'Goal: finish both motos. Try again next time.');
    lines.push('', 'Rider XP', ...this.xpLines(payout.xp));
    this.text(604, 170, lines.join('\n'), 17, COLORS.cream, { lineSpacing: 4, wordWrap: { width: 310 } });
    const ups = payout.levelUps.map((u) => `${u.name} → level ${u.level}`);
    const wear = this.wearLines(this.args.save.career.bike.parts, career.bike.parts);
    let y = 170;
    if (ups.length) {
      const t = this.text(930, y, ['Level up!', ...ups].join('\n'), 17, 0x9fe07a, { lineSpacing: 4 });
      y += t.height + 24;
    }
    this.text(930, y, ['Bike wear today', ...wear].join('\n'), 15, COLORS.muted, { lineSpacing: 4 });
    if (champ) {
      recordRound(champ.active, this.args.venue, day);
      this.btn(W / 2 + 300, 670, 'Championship standings', () => this.showStandings(champ.def, champ.active), 300, 50);
      return;
    }
    this.btn(W / 2 + 300, 670, 'Back to the paddock', () => this.done(`Race day done: ${ordinal(me.position)} overall, ${money >= 0 ? '+' : ''}${formatMoney(money)}.`), 300, 50);
  }

  /** The championship table after a round, and the final result after the last one (Spec 12.5). */
  private showStandings(def: ChampionshipDef, active: ActiveChampionship): void {
    const { points } = services.content.racing;
    this.clear();
    const done = active.rounds.length;
    const last = nextRoundVenue(def, active) === null;
    this.header(`${def.name} · ${last ? 'final standings' : `after round ${done} of ${def.rounds.length}`}`, `${def.class} · points for every moto, the same ${active.field.length + 1} riders every round`);
    const table = standings(points, active);
    const name = (id: string) => (id === PLAYER_ID ? `${this.save.rider.name} (you)` : services.content.riders.riders.find((r) => r.id === id)?.name ?? id);
    const rows = table.map((r) => `${String(r.position).padStart(2)}  ${name(r.id).padEnd(22).slice(0, 22)}${def.rounds.map((_, i) => String(r.byRound[i] ?? '').padStart(5)).join('')}${String(r.points).padStart(6)}`);
    const head = `Pos Rider                 ${def.rounds.map((_, i) => `  R${i + 1}`.padStart(5)).join('')}   Pts`;
    const t = this.text(40, 110, [head, ...rows].join('\n'), 15, COLORS.cream, { lineSpacing: 4 }).setFontFamily('Consolas, "Courier New", monospace');
    const mine = table.findIndex((r) => r.player);
    const lh = t.height / (rows.length + 1);
    this.screen.add(this.add.rectangle(34, 110 + lh * (mine + 1), 330 + def.rounds.length * 42, lh, COLORS.accentDark, 0.45).setOrigin(0, 0));
    this.screen.bringToTop(t);

    const me = table[mine];
    const leader = table[0];
    this.box(740, 110, 500, 500);
    const career = this.save.career;
    if (!last) {
      const venue = services.content.tracks.venues.find((v) => v.id === nextRoundVenue(def, active));
      const possible = titlePossible(def, points, active);
      this.text(764, 126, `You're ${ordinal(me.position)}`, 26, COLORS.accent);
      this.text(764, 176, [
        me.position === 1 ? `You lead by ${me.points - (table[1]?.points ?? 0)} points.` : `${leader.points - me.points} points behind ${name(leader.id)}.`,
        `Next: round ${done + 1} at ${venue?.name ?? 'the next track'}. Sign on there at the race office.`,
        '',
        possible ? 'The title is still possible.' : "The title is out of reach now. Finish it for a top-three place, or start it again from any race office.",
      ].join('\n'), 19, COLORS.cream, { lineSpacing: 6, wordWrap: { width: 450 } });
      this.btn(W / 2 + 300, 670, 'Back to the paddock', () => this.done(`${def.short} round ${done}: ${ordinal(me.position)} in the championship.`), 300, 50);
      return;
    }
    const fin = finishChampionship(career, this.save.flags, def, points);
    this.text(764, 126, fin.position === 1 ? 'Champion!' : `${ordinal(fin.position)} in the championship`, 28, COLORS.accent);
    const lines = [];
    if (fin.position === 1) lines.push(fin.firstWin && def.won ? def.won : `You won the ${def.name} again.`);
    else lines.push(`${name(leader.id)} won it with ${leader.points} points.`);
    if (fin.title) lines.push('', `You earned ${fin.title}.`);
    if (fin.money) lines.push(`Championship prize: ${formatMoney(fin.money)}`);
    if (fin.position > 3) lines.push('', 'The top three win a prize. Enter again from any race office.');
    lines.push('', `Money now: ${formatMoney(career.money)}`);
    this.text(764, 176, lines.join('\n'), 19, COLORS.cream, { lineSpacing: 6, wordWrap: { width: 450 } });
    this.btn(W / 2 + 300, 670, 'Back to the paddock', () => this.done(fin.position === 1 ? `${def.name}: champion!` : `${def.name}: ${ordinal(fin.position)}.`), 300, 50);
  }

  private xpLines(xp: Record<string, number>): string[] {
    const names = new Map(services.content.skills.leads.flatMap((l) => l.children.map((c) => [c.id, c.name] as const)));
    return Object.entries(xp).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${names.get(k) ?? k}: +${v < 10 ? v.toFixed(1) : v.toFixed(0)}`);
  }

  private wearLines(before: Record<string, { condition: number }>, after: Record<string, { condition: number }>): string[] {
    return services.content.bikes.slots
      .map((s) => ({ s, b: before[s.id]?.condition ?? 0, a: after[s.id]?.condition ?? 0 }))
      .filter((x) => x.b - x.a >= 0.005)
      .sort((x, y) => y.b - y.a - (x.b - x.a))
      .slice(0, 7)
      .map((x) => `${x.s.name}: ${Math.round(x.b * 100)}% → ${x.a <= 0 ? 'Broken' : `${Math.round(x.a * 100)}%`}`);
  }

  // ---- practice ----

  private startPractice(): void {
    const career = this.save.career;
    this.names.set(PLAYER_ID, 'You');
    this.colors.set(PLAYER_ID, COLORS.accent);
    this.looks.set(PLAYER_ID, { brand: career.bike.brand, cls: career.bike.class, gear: GEAR_SETS['player-default'] });
    this.sim = practiceSim(services.content, this.args.venue, playerEntrant(services.content, career, this.save.rider.name), (Math.random() * 2 ** 32) >>> 0);
    this.startLive();
  }

  private practiceXpNow(): Record<string, number> {
    return this.sim?.xp ?? {};
  }

  private stopPractice(forced = false): void {
    if (!this.live && !forced) return;
    this.live = false;
    const sim = this.sim!;
    const p = sim.player!;
    const career = this.save.career;
    const before = structuredClone(career.bike.parts);
    const payout = applyRide(services.content, career, sim.playerBike, -this.args.fee, sim.xp);
    if (p.lapTimes.length) noteActivity(services.content.shops, career, 'activity');
    const c = this.openModal(760, 520);
    c.add(this.add.text(0, -220, forced ? 'Practice over: your bike is broken' : 'Practice done', textStyle(26, COLORS.accent)).setOrigin(0.5));
    const best = p.lapTimes.length ? formatTime(Math.min(...p.lapTimes)) : '—';
    const lines = [`Laps: ${p.lapTimes.length}   Best lap: ${best}${this.args.fee ? `   Practice fee: ${formatMoney(this.args.fee)}` : ''}`, '', 'Practice XP (about a tenth of race XP)', ...this.xpLines(payout.xp), '', ...this.wearLines(before, career.bike.parts).slice(0, 4)];
    c.add(this.add.text(-330, -180, lines.join('\n'), textStyle(17, COLORS.cream, { lineSpacing: 4 })));
    if (payout.levelUps.length) c.add(this.add.text(-330, 150, payout.levelUps.map((u) => `Level up! ${u.name} is now level ${u.level}.`).join('\n'), textStyle(17, 0x9fe07a)));
    c.add(button(this, 0, 215, 'Done', () => this.done(`Practice: ${p.lapTimes.length} laps, best ${best}.`), 220, 46));
  }

  // ---- back to the world ----

  private done(message: string): void {
    this.save.stats.playSeconds += (performance.now() - this.realStart) / 1000;
    const { onDone } = this.args;
    const save = this.save;
    this.scene.stop();
    onDone(save, message);
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function initials(name: string): string {
  if (name === 'You') return 'You';
  return name.split(' ').map((p) => p[0]).join('');
}

/** Each rider's gate badge: their initials, or, where two in the field share them, the first two letters of the first name and the surname's initial (Jason and Jordan Styles: JaS, JoS). */
export function gateBadges(names: Map<string, string>): Map<string, string> {
  const plain = new Map([...names].map(([id, n]) => [id, initials(n)]));
  const count = new Map<string, number>();
  for (const b of plain.values()) count.set(b, (count.get(b) ?? 0) + 1);
  return new Map([...plain].map(([id, b]) => {
    if (count.get(b)! < 2 || b === 'You') return [id, b];
    const parts = names.get(id)!.split(' ');
    return [id, `${parts[0].slice(0, 2)}${parts.slice(1).map((p) => p[0]).join('')}`];
  }));
}
