import { dayClass } from './classes';
import { pence } from './career';
import { areaOfMap, rollWeather } from './areas';
import { MotoSim, SUPERCROSS_DEFAULTS, dealGates, mixSeed, seededRng, type Entrant, type RiderResult, type SupercrossRules, type TrackDef } from './race';
import { PLAYER_ID, cpuEntrant, cpuGatePick, drawPool, lapsFor, motoPrize, scaleXp, sumXp, trackById, tunePlayer, type CpuRiderDef, type RaceContent, type RoundOptions, type VenueDef } from './raceDay';

// A Supercross night (Boss, 1 Nov 2026): every Supercross race day and championship round, at
// every stadium track (Riverside Arena too), follows the AMA night programme with a few changes
// for the game. No qualifying. 32 riders, the player one of them, are drawn into two heats of 16
// at random. The first 6 in each heat go through to the Main Event, the last 2 go home and the
// rest (8 from each) ride the LCQ (Last Chance Qualifier), whose first 4 make the Main. The Main's
// 16 race for the win, the prize money and the championship points: nothing else pays or scores.
//
// Boss's answers (1 Nov 2026): the player is drawn into Heat 1 or 2 at random and the other heat is
// run off screen; heats pick gates in a random draw; the Main picks heat winners first, then the
// heats' 2nds and so on, with the LCQ's riders last; heats are 4 laps, the LCQ 3 and the Main 8
// (racing.json sim.supercross); a rider knocked out goes home with no points or prize (the entry fee
// is gone) but keeps the XP and wear from what they rode; Leave early is allowed between races and
// counts as not making the Main; and the rider can repair their bike at the track between races
// if they own the tools (the race screen does that with core/tools.ts). Pure rules with no graphics.

/** The Main Event pays and scores this many motos' worth at its place: a whole race day. */
export const MAIN_COUNTS = 2;

/** True for a track that races a Supercross night: the stadium tracks (trackParts.json kind stadium). */
export function isSupercross(track: Pick<TrackDef, 'kind'>): boolean {
  return track.kind === 'stadium';
}

export type NightRaceKind = 'heat' | 'lcq' | 'main';

export interface NightRace {
  kind: NightRaceKind;
  /** Its place in the night, from 0: Heat 1, Heat 2, LCQ, Main. */
  index: number;
  name: string;
  laps: number;
  /** Its riders, in gate pick order. Drawn up once the races before it are over. */
  riders: string[];
  /** The finishing order, once ridden. */
  results: RiderResult[] | null;
  /** Riders through to the Main (a heat or the LCQ) and to the LCQ (a heat), once ridden. */
  toMain: string[];
  toLcq: string[];
}

/** Where a rider's night got to. */
export type NightReach = 'Main Event' | 'LCQ' | 'Heat' | 'Left early';

export interface NightPlace {
  id: string;
  name: string;
  tag?: string;
  player: boolean;
  /** 1 for the Main's winner: the Main in order, then the LCQ's riders out, then the heats'. */
  position: number;
  reached: NightReach;
  /** Their result in the race they went out in (the Main for its riders), null for a DNF or not riding it. */
  finish: number | null;
}

export interface NightResult {
  places: NightPlace[];
  /** The player's place on the night. */
  position: number;
  /** The player's Main finish, or null when they didn't make it (or didn't finish it). */
  main: number | null;
  /** Prize money and the podium bonus, in pence: from the Main only. */
  prize: number;
  podiumBonus: number;
  xp: Record<string, number>;
}

/** The night's rules: racing.json's over the defaults. */
export function supercrossRules(rc: Pick<RaceContent, 'racing'>): SupercrossRules {
  return { ...SUPERCROSS_DEFAULTS, ...rc.racing.sim.supercross };
}

export class SupercrossNight {
  readonly field: Entrant[];
  readonly rules: SupercrossRules;
  readonly track: TrackDef;
  readonly cls: string;
  /** Heat 1, Heat 2, the LCQ and the Main, in the order they are run. */
  readonly races: NightRace[];
  readonly weather: string;
  /** The player's XP from each race they rode. */
  readonly xp: Record<string, number>[] = [];
  /** Races the player rode to the flag, and Mains won, for their counters. */
  playerRaces = 0;
  playerWins = 0;
  /** The player left early: every race still to come runs without them. */
  left = false;

  constructor(
    private readonly rc: RaceContent,
    readonly venue: VenueDef,
    player: Entrant,
    readonly seed: number,
    /** The entry fee paid, in pence. */
    readonly entry: number,
    /** Set for a championship round: its riders race, the rest of the night drawn from riders outside it. */
    readonly round?: RoundOptions,
    /** TEST ONLY, REMOVE BEFORE RELEASE (Boss, 30 Oct 2026): no CPU riders, to test ride a track. */
    alone = false,
  ) {
    this.track = trackById(rc, venue.track!);
    this.cls = dayClass(rc.bikes, venue.class, player.bike.class) ?? venue.class ?? '50cc';
    this.rules = supercrossRules(rc);
    const rng = seededRng(seed);
    this.weather = rollWeather(rc.areas ? areaOfMap(rc.areas, venue.town ?? '') : undefined, rng);
    tunePlayer(rc, player, this.track, this.weather);
    const need = this.rules.field - 1;
    let cpus: CpuRiderDef[];
    if (alone) cpus = [];
    else if (round) {
      // The championship's own riders, then the rest of the night from the pool outside it.
      const others = shuffle([...(round.others ?? [])], seededRng(mixSeed(seed, 0x6e696768)));
      cpus = [...round.cpus, ...others].slice(0, Math.max(need, round.cpus.length));
    } else cpus = drawPool(rc, venue, seed, need);
    this.field = [player, ...cpus.map((d) => cpuEntrant(rc, d, this.cls))];
    // The heats are drawn at random, the player in either; each heat's gate pick order is drawn too.
    const all = shuffle(this.field.map((e) => e.id), rng);
    const half = Math.ceil(all.length / 2);
    const mainLaps = this.rules.mainLaps ?? lapsFor(rc, this.track, this.cls, !!round);
    const race = (kind: NightRaceKind, index: number, name: string, laps: number, riders: string[]): NightRace => ({ kind, index, name, laps, riders, results: null, toMain: [], toLcq: [] });
    this.races = [
      race('heat', 0, 'Heat 1', this.rules.heatLaps, shuffle(all.slice(0, half), rng)),
      race('heat', 1, 'Heat 2', this.rules.heatLaps, shuffle(all.slice(half), rng)),
      race('lcq', 2, 'LCQ', this.rules.lcqLaps, []),
      race('main', 3, 'Main Event', mainLaps, []),
    ];
  }

  get player(): Entrant {
    return this.field.find((e) => e.player)!;
  }

  get heats(): NightRace[] {
    return this.races.filter((r) => r.kind === 'heat');
  }

  get lcq(): NightRace {
    return this.races.find((r) => r.kind === 'lcq')!;
  }

  get main(): NightRace {
    return this.races.find((r) => r.kind === 'main')!;
  }

  /** The heat the player was drawn into. */
  get playerHeat(): NightRace | undefined {
    return this.heats.find((h) => h.riders.includes(PLAYER_ID));
  }

  private entrant(id: string): Entrant {
    return this.field.find((e) => e.id === id)!;
  }

  /** The next race to run, or null when the night is over. Races with nobody in them are passed over. */
  get next(): NightRace | null {
    return this.races.find((r) => !r.results && r.riders.length > 0) ?? null;
  }

  get done(): boolean {
    return this.next === null;
  }

  /** True while the player has a race still to ride. */
  get playerIn(): boolean {
    return !!this.next?.riders.includes(PLAYER_ID);
  }

  /** Riders through to the Main and to the LCQ from a heat of this size. */
  heatSplit(size: number): { main: number; out: number; lcq: number } {
    const main = Math.min(this.rules.heatThrough, size);
    const out = Math.min(this.rules.heatOut, size - main);
    return { main, out, lcq: size - main - out };
  }

  // ---- gates ----

  /** Gates taken before the player's pick in a race, and the ones left for them. One gate per rider. */
  gatesForPlayer(race: NightRace): { taken: Map<number, string>; free: number[] } {
    const gates = race.riders.length;
    const taken = new Map<number, string>();
    for (const id of race.riders) {
      if (id === PLAYER_ID) break;
      taken.set(cpuGatePick(this.track, this.seed, race.index, race.riders, id, taken, gates), id);
    }
    return { taken, free: [...Array(gates).keys()].filter((g) => !taken.has(g)) };
  }

  /** Puts every rider in the race on their gate, the player on theirs (one of gatesForPlayer().free). */
  assignGates(race: NightRace, playerGate?: number): void {
    const gates = race.riders.length;
    const taken = new Map<number, string>();
    for (const id of race.riders) {
      const g = id === PLAYER_ID && playerGate !== undefined ? playerGate : cpuGatePick(this.track, this.seed, race.index, race.riders, id, taken, gates);
      if (taken.has(g) || g < 0 || g >= gates) throw new RangeError(`Gate ${g + 1} is not free in the ${race.name}`);
      taken.set(g, id);
    }
    for (const [g, id] of taken) this.entrant(id).gate = g;
  }

  // ---- racing ----

  /** The track as this race rides it: its gate bonuses dealt to the gates afresh (dealGates; Boss, 1 Nov 2026). */
  raceTrack(race: NightRace): TrackDef {
    return dealGates(this.track, mixSeed(this.seed, 0x6a7e5 + race.index), race.riders.length);
  }

  /** The simulation for a race, its gates assigned. The caller runs it (live, auto-complete or off screen). */
  startRace(race: NightRace, message: string, playerGate?: number, retireAtBroken?: number): MotoSim {
    if (race.results) throw new Error(`The ${race.name} has been run`);
    this.assignGates(race, playerGate);
    return new MotoSim(this.rc.racing, this.rc.bikes, this.raceTrack(race), this.cls, race.riders.map((id) => this.entrant(id)), {
      laps: race.laps,
      // Ruts deepen through the night, race by race (Spec 10.3).
      motoIndex: race.index,
      seed: mixSeed(this.seed, 0x5358 + race.index),
      message,
      retireAtBroken,
      weather: this.rc.racing.weather?.[this.weather],
    });
  }

  /** Records a race and draws up the races it feeds once their riders are known. */
  finishRace(race: NightRace, sim: MotoSim): RiderResult[] {
    const results = sim.results();
    race.results = results;
    if (sim.player) {
      const me = results.find((r) => r.player)!;
      this.xp.push(scaleXp(sumXp(sim.xp, sim.finishBonus(me.position)), this.round?.xpTimes ?? 1));
      if (!me.retired) this.playerRaces += 1;
      if (!me.retired && me.position === 1 && race.kind === 'main') this.playerWins += 1;
      if (sim.playerBike) this.player.bike = sim.playerBike;
    }
    const ids = results.map((r) => r.id);
    if (race.kind === 'heat') {
      const split = this.heatSplit(ids.length);
      race.toMain = ids.slice(0, split.main);
      race.toLcq = ids.slice(split.main, split.main + split.lcq);
    } else if (race.kind === 'lcq') race.toMain = ids.slice(0, Math.min(this.rules.lcqThrough, ids.length));
    this.drawUp();
    return results;
  }

  /** Runs a race with nobody watching: the other heat, and every race the player isn't in. */
  autoRun(race: NightRace): void {
    const sim = this.startRace(race, 'steady');
    sim.runToEnd();
    this.finishRace(race, sim);
  }

  /** Runs every race before the player's next one (all of them once the player is out). Returns the races run. */
  runUntilPlayer(): NightRace[] {
    const ran: NightRace[] = [];
    for (let r = this.next; r && !r.riders.includes(PLAYER_ID); r = this.next) {
      this.autoRun(r);
      ran.push(r);
    }
    return ran;
  }

  /**
   * The LCQ once both heats are over, and the Main once the LCQ is too. The LCQ picks gates in heat
   * finishing order (7ths first, the faster of a pair first); the Main the heat winners first, then
   * the heats' 2nds and so on, with the LCQ's riders last in their LCQ order (Boss, 1 Nov 2026).
   */
  private drawUp(): void {
    const heats = this.heats;
    if (heats.some((h) => !h.results && h.riders.length)) return;
    const stillIn = (id: string) => !(this.left && id === PLAYER_ID);
    const lcq = this.lcq;
    if (!lcq.results && !lcq.riders.length) lcq.riders = this.byHeatFinish(heats.flatMap((h) => h.toLcq)).filter(stillIn);
    const main = this.main;
    if (main.results || main.riders.length) return;
    if (lcq.riders.length && !lcq.results) return;
    main.riders = [...this.byHeatFinish(heats.flatMap((h) => h.toMain)), ...lcq.toMain].filter(stillIn);
  }

  /** Riders from the heats in pick order: by their heat finish, the faster race time first on a tie. */
  private byHeatFinish(ids: string[]): string[] {
    const at = new Map<string, RiderResult>();
    for (const h of this.heats) for (const r of h.results ?? []) at.set(r.id, r);
    return [...ids].sort((a, b) => at.get(a)!.position - at.get(b)!.position || at.get(a)!.time - at.get(b)!.time || a.localeCompare(b));
  }

  /** The player leaves the night: they ride no more, and every race to come runs without them. */
  leaveEarly(): void {
    this.left = true;
    for (const r of this.races) if (!r.results) r.riders = r.riders.filter((id) => id !== PLAYER_ID);
    this.drawUp();
    this.runUntilPlayer();
  }

  /** Where the player is going next after their last race: the Main, the LCQ, or home. */
  playerStatus(): 'main' | 'lcq' | 'out' {
    if (this.left) return 'out';
    if (this.main.riders.includes(PLAYER_ID) || this.heats.some((h) => h.toMain.includes(PLAYER_ID)) || this.lcq.toMain.includes(PLAYER_ID)) return 'main';
    if (this.lcq.results) return 'out';
    if (this.lcq.riders.includes(PLAYER_ID) || this.heats.some((h) => h.toLcq.includes(PLAYER_ID))) return 'lcq';
    return this.heats.every((h) => !h.riders.includes(PLAYER_ID) || h.results) ? 'out' : 'lcq';
  }

  // ---- the night ----

  /** Everyone's place: the Main in order, then the LCQ's riders out, then the heats' riders out (the better heat finish first). */
  places(): NightPlace[] {
    const out: NightPlace[] = [];
    const placed = new Set<string>();
    const add = (r: RiderResult, reached: NightReach) => {
      if (placed.has(r.id)) return;
      placed.add(r.id);
      out.push({ id: r.id, name: r.name, tag: r.tag, player: r.player, position: out.length + 1, reached, finish: r.retired ? null : r.position });
    };
    for (const r of this.main.results ?? []) add(r, 'Main Event');
    for (const r of this.lcq.results ?? []) if (!this.lcq.toMain.includes(r.id)) add(r, 'LCQ');
    const heatOuts = this.heats.flatMap((h) => (h.results ?? []).filter((r) => !h.toMain.includes(r.id) && !h.toLcq.includes(r.id)));
    heatOuts.sort((a, b) => Number(a.retired) - Number(b.retired) || a.position - b.position || a.time - b.time);
    for (const r of heatOuts) add(r, 'Heat');
    // Anyone left: the player gone before their next race.
    for (const e of this.field) {
      if (placed.has(e.id)) continue;
      placed.add(e.id);
      out.push({ id: e.id, name: e.name, tag: e.tag, player: e.player, position: out.length + 1, reached: 'Left early', finish: null });
    }
    return out;
  }

  /** The entry the prize maths works from: the class entry, times a championship's purse. */
  private get entryForPrize(): number {
    return pence(this.rc.racing.classes[this.cls].entry * (this.round?.purseTimes ?? 1));
  }

  /**
   * The player's night: their place, and prize money from the Main only, MAIN_COUNTS motos' worth at
   * their Main finish plus the podium bonus. Out before the Main, or a DNF in it, pays nothing.
   */
  dayResult(): NightResult {
    const places = this.places();
    const me = places.find((p) => p.player)!;
    const main = me.reached === 'Main Event' ? me.finish : null;
    const purse = this.entryForPrize;
    const prize = main === null ? 0 : MAIN_COUNTS * motoPrize(this.rc.racing, purse, main);
    const podiumBonus = main === null ? 0 : Math.round(purse * (this.rc.racing.prize.podium[main - 1] ?? 0));
    return { places, position: me.position, main, prize, podiumBonus, xp: sumXp(...this.xp) };
  }

  /**
   * The night as a championship round's motos: the Main's finishes, MAIN_COUNTS times over so it
   * scores a whole round's points (Boss, 1 Nov 2026). Riders who didn't make it score nothing.
   */
  championshipMotos(): Record<string, number | null>[] {
    const main = Object.fromEntries((this.main.results ?? []).map((r) => [r.id, r.retired ? null : r.position]));
    return Array.from({ length: MAIN_COUNTS }, () => ({ ...main }));
  }
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
