import Phaser from 'phaser';
import { advanceStory, bikeProblem, currentStep, fillText, formatMoney, jobPay, matchStory, openChains, pence, type JobDef, type PlaceDef, type StoryEvent, type StoryStep } from '../core/career';
import { newsRead, npcsOnMap, properName, type DialogueLine, type NpcDef, type NpcPlacement } from '../core/content';
import { Grid, STEPS } from '../core/grid';
import { objectTiles, type BakedMap, type Facing, type MapObject, type Tile } from '../core/mapTypes';
import { findPathToAny, findPathTowards, standingTiles } from '../core/pathfinding';
import type { SaveData } from '../core/saves';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../core/settings';
import { applyMapState, clearedPatches, hiddenSprites } from '../core/mapState';
import { roadMenu, routeArrival, sideOf, venueHere, type RoadStop } from '../core/guides';
import { earning, goalObjects, nextHop, storyGoals } from '../core/waymarks';
import { biggestBike, bikeImage, zoneFor } from '../core/worldMap';
import { ROUTE, spawnTile, stepTriggerAt, type Arrival, type StepResult } from '../core/travel';
import { areaFlag, areaOfMap, buyHouse, buyMotor, houseFlag, motorProblem, openAreas } from '../core/areas';
import { defaultSetup, effectiveSetup, positionValue, positionsFor, setupReport, sliderUnlocked, type SliderDef } from '../core/setup';
import { DriveMap, FACING_OF, bayFor, ensureVan, exitTile, footprint, haulerAt, inwardHeading, nearestFree, placeNear, planDrive, sheetFor, steer, HEADING_OF, type Heading, type Move, type VanDesign, type VanPose } from '../core/vehicles';
import { forgetImport, keepImport, loadModTracks, modVenue, readModTrack, type ModTrack } from '../core/modTracks';
import { venueClassFor, entryFee, fieldCount, lapsFor, practiceFee, trackById, venueProblem, type VenueDef } from '../core/raceDay';
import { champProblem, enter, nextRoundVenue, roundEntry, roundsHere, standings, titlePossible, withdraw, type ChampionshipDef } from '../core/championship';
import { noteActivity, shopForAction, slotName, type ShopDef } from '../core/shops';
import { machineFee, machineProblem, modsLabel, runMachine } from '../core/modifiers';
import { dayObjectives, dropPenalty, dropSponsor, objectiveText, offerProblem, reputationHint, signOffer, sponsorsOpen } from '../core/sponsors';
import { buyOutfit, outfitProblem, outfitSheet, ownsOutfit, rackOpen, storageLimit, storeSpare, stored, takeSpare, wearOutfit, wornOutfit } from '../core/house';
import { errandStage, finishErrand, takeErrand, type ErrandDef } from '../core/errands';
import { challengeReady, challengeVenue, lossHint, type ChallengeDef } from '../core/challenge';
import { drillForAction, drillForNpc, drillsAtVenue, finishRound, walked, type DrillDef } from '../core/training';
import { finishBatch, finishPass, openJobAt, passXp, startJob } from '../core/jobs';
import { className } from '../core/classes';
import { ticketJob, ticketProblem, ticketsOffered, type BoardDef, type Ticket } from '../core/jobBoard';
import { childLevel } from '../core/skills';
import { leadLevel } from '../core/skills';
import { challengeWins } from '../core/records';
import { CAREER_SLOT, services } from '../services';
import { Character, TILE } from '../world/Character';
import { MapView, OVERHEAD_DEPTH, isMapCached, loadMapImages } from '../world/MapView';
import { actionMessage, actionName } from '../world/messages';
import { Waymarks, clusters, middle, type Mark } from '../world/Waymarks';
import { DPR, HUD_BAR } from '../ui/view';
import { standLift } from '../world/standLift';
import { VanView, type Driver, type VanLoad } from '../world/VanView';
import { modelFor } from '../world/raceBike';
import type { HudScene } from './HudScene';
import { ordinal, type RaceSceneData } from './RaceScene';

// The walkable world: one map at a time, the player, NPCs, doors and exits, and the player's van.
// Changing map restarts this scene with the arrival tile, so nothing from the old map lingers.
// The van is a solid footprint on the grid. Getting in hides the rider, who then drives it with
// the same keys and clicks; driving through an exit takes the van to the next map, and getting
// out leaves it parked where it stands (the save's van record).

/** Autosave every 5 minutes outside menus, plus on every map change (Spec 21b, Boss: 3 to 5 minutes). */
const AUTOSAVE_MS = 5 * 60 * 1000;
/** Design viewport: at 100% zoom, 20 × 11 tiles fit in 1280 × 720 (style guide 3). */
const DESIGN_W = 1280;
const DESIGN_H = 720;
/** Zoom on entering a building: all the way out, then six clicks in (Boss). Closer settings are kept. */
const INTERIOR_ZOOM = ZOOM_MIN + 6 * ZOOM_STEP;

interface WorldData {
  save: SaveData;
  /** A brand-new career: show the opening lines. */
  intro?: boolean;
}

/** A shift in progress: which station is next and how many parts are made. */
interface Shift {
  job: JobDef;
  made: number;
  station: number;
}

/** What a click or the interact key is aimed at. */
type Target =
  | { kind: 'npc'; placement: NpcPlacement; character: Character }
  | { kind: 'object'; object: MapObject; tiles: Tile[] }
  | { kind: 'venue'; venue: VenueDef; tiles: Tile[] }
  | { kind: 'van'; tiles: Tile[] }
  | { kind: 'hauler'; tiles: Tile[] };

export class WorldScene extends Phaser.Scene {
  private save!: SaveData;
  private map!: BakedMap;
  private grid!: Grid;
  private player!: Character;
  private npcs: { placement: NpcPlacement; character: Character }[] = [];
  private path: Tile[] = [];
  private onArrive: (() => void) | null = null;
  /** Tiles walked since the last Agility XP (core/training.ts walked). */
  private walkCarry = 0;
  private walking = false;
  private busy = false;
  /** The zoom the player had outside, while a building has raised it to INTERIOR_ZOOM. */
  private outdoorZoom: number | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private hud!: HudScene;
  private intro = false;
  private shift: Shift | null = null;
  private stationMarks: Phaser.GameObjects.GameObject[] = [];
  /** The player's van, when it is parked (or being driven) on this map. */
  private van: VanView | null = null;
  /** The Factory Hauler the team parks at every venue once the rider has a factory sponsor (Boss, 31 Oct 2026). */
  private hauler: VanView | null = null;
  private drive!: DriveMap;
  private moves: Move[] = [];
  /** E was pressed on the move: get out once the van has pulled up. */
  private outWhenStopped = false;
  private lastBumpToast = 0;
  private waymarks!: Waymarks;
  /** The news NPCs' bubbles (Manny Festo), kept apart from the story markers. */
  private newsMarks!: Waymarks;
  /** The tutorial marker the screen-edge arrow points to while it is off screen, in world pixels. */
  private markPoint: { x: number; y: number; label: string; sub?: string } | null = null;
  private markEarning = false;

  constructor() {
    super('world');
  }

  init(data: WorldData): void {
    this.save = structuredClone(data.save);
    this.intro = !!data.intro;
    this.shift = null;
    this.stationMarks = [];
    this.npcs = [];
    this.path = [];
    this.onArrive = null;
    this.walking = false;
    this.busy = true;
    this.van = null;
    this.moves = [];
    this.markPoint = null;
  }

  async create(): Promise<void> {
    const map = services.maps.get(this.save.position.map) ?? services.maps.get('area1-home-town')!;
    this.map = map;
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.hud = this.scene.get('hud') as HudScene;
    this.cameras.main.setBackgroundColor('#14141e');

    const firstVisit = !isMapCached(this, map);
    const started = performance.now();
    await loadMapImages(this, map);
    new MapView(this, map, hiddenSprites(map, this.save.flags), clearedPatches(map, this.save.flags));
    if (firstVisit) console.info(`Map ${map.id}: first visit ${Math.round(performance.now() - started)} ms`);
    else console.info(`Map ${map.id}: cached visit ${Math.round(performance.now() - started)} ms`);

    this.grid = Grid.fromMap(map);
    applyMapState(map, this.grid, this.save.flags);
    for (const p of npcsOnMap(services.content, map)) {
      // NPCs don't block the way: walking past (not clicking them) goes straight through.
      const character = new Character(this, p.npc.sprite, p, p.facing);
      // Standing on the paving, not the kerb or road below it.
      character.placeAt(p, standLift(map, p.x, p.y));
      character.showName(p.npc.name);
      this.npcs.push({ placement: p, character });
    }
    this.drive = new DriveMap(map, this.grid, services.content.vehicles);
    this.drive.setNpcTiles(this.npcs.map((n) => ({ x: n.placement.x, y: n.placement.y })));
    this.setupHauler();
    this.setupVan();
    let { x, y } = this.save.position;
    const { facing } = this.save.position;
    // A save from before a map was cut down can sit past its new edge: bring it back onto the map.
    x = Math.min(Math.max(x, 0), map.width - 1);
    y = Math.min(Math.max(y, 0), map.height - 1);
    // Arriving on foot where the van is parked: step off to the nearest clear tile.
    if (!this.driving && !this.grid.isFree(x, y)) ({ x, y } = nearestFree(this.grid, { x, y }) ?? { x, y });
    this.player = new Character(this, this.save.rider.look, { x, y }, facing);
    // While overlapping an NPC, the player draws on top of them.
    this.player.depthFloor = () => {
      let floor = -Infinity;
      for (const n of this.npcs) {
        const s = n.character.sprite;
        if (Math.abs(s.x - this.player.x) < TILE && Math.abs(s.y - this.player.y) < TILE) floor = Math.max(floor, s.depth + 1);
      }
      return floor;
    };
    // The player's feet go on the paving of a one-tile pavement too, as the NPCs' do.
    this.player.liftAt = (t) => standLift(this.map, t.x, t.y);
    this.player.placeAt({ x, y });

    const cam = this.cameras.main;
    this.hud.setDriving(false);
    if (this.driving) this.sitInVan();
    else cam.startFollow(this.player.sprite, true, 0.2, 0.2, 0, TILE / 2);
    cam.setRoundPixels(true);
    this.applyZoom();
    const unsub = services.settings.onChange(() => this.applyZoom());
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => {
      unsub();
      this.scale.off('resize', this.applyZoom, this);
    });

    this.waymarks = new Waymarks(this, services.settings.get().accessibility.reducedEffects);
    this.refreshWaymarks();
    this.newsMarks = new Waymarks(this, services.settings.get().accessibility.reducedEffects);
    this.refreshNews();
    this.events.once('shutdown', () => this.hud.showWayArrow(null));

    this.setupInput();
    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: () => this.autosave('timer') });
    this.hud.showMapTitle(map.title);
    this.hud.showCareer(this.save.career, this.save.flags);
    this.hud.rider = this.save.rider;
    this.hud.showShift(null);
    // Buying, selling, repairs and dumping spares change the career in the HUD's panels.
    this.hud.onShopChange = () => {
      this.hud.showCareer(this.save.career, this.save.flags);
      this.milestoneSave();
    };
    cam.fadeIn(250, 20, 20, 30);
    this.busy = false;
    if (this.intro) this.say('', services.content.story.intro);

    // Remember the rider's spot: on arriving on every map, and whenever the page is hidden or
    // closed, so Continue puts them back where they were (not just where the last autosave was).
    this.quickSave();
    const onHide = () => document.visibilityState === 'hidden' && this.quickSave();
    const onPageHide = () => this.quickSave();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    });
  }

  update(_time: number, delta: number): void {
    if (!this.player) return;
    this.updateWayArrow();
    if (!this.busy && !this.hud.isDialogueOpen()) this.save.stats.playSeconds += delta / 1000;
    // The van drives every frame, whatever else is going on, on real time (Phaser's smoothed
    // delta runs slow when frames are long, which would make the van crawl on a slow device).
    this.van?.update(Math.min(this.game.loop.rawDelta, 100));
    if (this.busy || this.walking || this.hud.isDialogueOpen()) return;
    const dir = this.heldDirection();
    if (this.driving) {
      if (dir) this.startDrive();
      return;
    }
    if (dir) {
      this.path = [];
      this.onArrive = null;
      const to = { x: this.player.tile.x + dir.x, y: this.player.tile.y + dir.y };
      if (this.grid.canStep(this.player.tile, to)) void this.walk([to]);
      else this.player.faceTowards(to);
      return;
    }
    if (this.player.moving) this.player.stopWalking();
  }

  // ---- input ----

  private setupInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as typeof this.keys;
    // E, Space and Esc are handled by the HUD, which knows whether a dialogue or menu is open.
    kb.on('keydown-PLUS', () => this.zoomBy(ZOOM_STEP));
    kb.on('keydown-NUMPAD_ADD', () => this.zoomBy(ZOOM_STEP));
    kb.on('keydown-MINUS', () => this.zoomBy(-ZOOM_STEP));
    kb.on('keydown-NUMPAD_SUBTRACT', () => this.zoomBy(-ZOOM_STEP));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -ZOOM_STEP : ZOOM_STEP));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 12) return; // a drag, not a click
      if (this.busy || this.hud.isDialogueOpen() || this.hud.pointerOnUi(p)) return;
      if (this.hud.closeZoom()) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      this.clickAt(w.x, w.y);
    });
  }

  private heldDirection(): Tile | null {
    const k = this.keys;
    if (k.up.isDown || k.w.isDown) return STEPS[3];
    if (k.down.isDown || k.s.isDown) return STEPS[0];
    if (k.left.isDown || k.a.isDown) return STEPS[1];
    if (k.right.isDown || k.d.isDown) return STEPS[2];
    return null;
  }

  zoomBy(d: number): void {
    const z = services.settings.get().display.zoom;
    services.settings.update('display', 'zoom', Phaser.Math.Clamp(z + d, ZOOM_MIN, ZOOM_MAX));
  }

  /** Entering a building zooms in to INTERIOR_ZOOM; leaving puts back the outdoor zoom unless the player changed it inside. */
  private zoomForMapChange(entering: boolean): void {
    const z = services.settings.get().display.zoom;
    if (entering) {
      this.outdoorZoom = z < INTERIOR_ZOOM ? z : null;
      if (this.outdoorZoom !== null) services.settings.update('display', 'zoom', INTERIOR_ZOOM);
    } else if (this.map.kind === 'interior') {
      if (this.outdoorZoom !== null && z === INTERIOR_ZOOM) services.settings.update('display', 'zoom', this.outdoorZoom);
      this.outdoorZoom = null;
    }
  }

  private applyZoom(): void {
    const { width, height } = this.scale;
    const base = Math.min(width / DESIGN_W, height / DESIGN_H);
    const zoom = base * (services.settings.get().display.zoom / 100);
    const cam = this.cameras.main.setZoom(zoom);
    // A map smaller than the screen (most interiors) sits in the middle instead of the top-left.
    const mw = this.map.width * TILE;
    const mh = this.map.height * TILE;
    const vw = width / zoom;
    const vh = height / zoom;
    const bx = mw < vw ? (mw - vw) / 2 : 0;
    const by = mh < vh ? (mh - vh) / 2 : 0;
    cam.setBounds(bx, by, Math.max(mw, vw), Math.max(mh, vh));
  }

  // ---- clicks and interaction ----

  private clickAt(wx: number, wy: number): void {
    const tile = { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
    if (this.driving) {
      this.clickDriving(tile, wx, wy);
      return;
    }
    const target = this.targetAt(tile, wx, wy);
    if (target) {
      this.approach(target);
      return;
    }
    if (tile.x === this.player.tile.x && tile.y === this.player.tile.y && stepTriggerAt(this.map, tile) && !this.walking) {
      // Standing on a way out that turned the rider back: try it again.
      this.checkTrigger();
      return;
    }
    const path = findPathTowards(this.grid, this.player.tile, tile);
    this.markTarget(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2);
    this.setPath(path, null);
  }

  /** An NPC or usable object under a click. Characters are checked by their sprite, not just their tile. */
  private targetAt(tile: Tile, wx: number, wy: number): Target | null {
    for (const n of this.npcs) {
      const b = n.character.sprite.getBounds();
      if (b.contains(wx, wy) || (n.placement.x === tile.x && n.placement.y === tile.y)) return { kind: 'npc', placement: n.placement, character: n.character };
    }
    if (this.van) {
      const tiles = footprint(this.van.pose, this.van.design.length);
      if (tiles.some((t) => t.x === tile.x && t.y === tile.y) || this.van.contains(wx, wy)) return { kind: 'van', tiles };
    }
    if (this.hauler) {
      const tiles = footprint(this.hauler.pose, this.hauler.design.length);
      if (tiles.some((t) => t.x === tile.x && t.y === tile.y) || this.hauler.contains(wx, wy)) return { kind: 'hauler', tiles };
    }
    for (const o of this.map.objects) {
      if (!actionMessage(o)) continue;
      const tiles = objectTiles(o, this.map.tileSize);
      if (tiles.some((t) => t.x === tile.x && t.y === tile.y)) return { kind: 'object', object: o, tiles };
    }
    // Ride-on spots with no map object of their own, such as the backyard loop.
    for (const v of services.content.tracks.venues) {
      if (v.map !== this.map.id || !v.area) continue;
      const [ax, ay, aw, ah] = v.area;
      if (tile.x >= ax && tile.x < ax + aw && tile.y >= ay && tile.y < ay + ah) {
        const tiles: Tile[] = [];
        for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) tiles.push({ x, y });
        return { kind: 'venue', venue: v, tiles };
      }
    }
    return null;
  }

  /** Smart pathing: walk to the nearest free tile beside the target, face it, then use it. */
  private approach(target: Target): void {
    const tiles = target.kind === 'npc' ? [{ x: target.placement.x, y: target.placement.y }] : target.tiles;
    const here = this.player.tile;
    const act = () => {
      const facingTile = tiles.reduce((best, t) => (dist(t, this.player.tile) < dist(best, this.player.tile) ? t : best), tiles[0]);
      this.player.faceTowards(facingTile);
      this.use(target);
    };
    // Already standing on it (a walkable object such as a venue gate) or next to it.
    if (tiles.some((t) => t.x === here.x && t.y === here.y) || tiles.some((t) => dist(t, here) === 1 && this.grid.edgeOpen(t, here))) {
      act();
      return;
    }
    const goals = standingTiles(this.grid, tiles);
    const walkable = tiles.filter((t) => this.grid.isFree(t.x, t.y));
    const path = findPathToAny(this.grid, here, goals.length ? goals : walkable);
    if (!path) {
      this.hud.toast("You can't get there from here.");
      return;
    }
    this.setPath(path, act);
  }

  interactFacing(): void {
    if (this.driving && this.van?.moving) {
      // Pull up, then get out.
      this.moves = [];
      this.outWhenStopped = true;
      this.van.endTrip();
      return;
    }
    if (this.busy || this.walking) return;
    if (this.hud.isDialogueOpen()) return;
    if (this.driving) {
      this.getOut();
      return;
    }
    const d = STEPS[['down', 'left', 'right', 'up'].indexOf(this.player.facing)];
    const t = { x: this.player.tile.x + d.x, y: this.player.tile.y + d.y };
    const target = this.targetAt(t, -1, -1);
    if (target && this.grid.edgeOpen(this.player.tile, t)) this.use(target);
  }

  private use(target: Target): void {
    if (target.kind === 'npc') {
      this.talkTo(target.placement, target.character);
      return;
    }
    if (target.kind === 'venue') {
      this.openVenue(target.venue);
      return;
    }
    if (target.kind === 'van') {
      this.offerVan();
      return;
    }
    if (target.kind === 'hauler') {
      this.offerHauler();
      return;
    }
    const o = target.object;
    if (this.useForShift(o)) return;
    const action = typeof o.props.action === 'string' ? o.props.action : null;
    const objectKey = `${this.map.id}:${o.name}:${o.x},${o.y}`;
    if (action && this.runStory({ use: action, map: this.map.id, object: objectKey }, '')) return;
    const shop = action ? shopForAction(services.content.shops, this.map.id, action) : null;
    if (shop && this.openShop(shop.shop, shop.fit ? 'fit' : 'buy')) return;
    if (action === 'storage.tools' && this.openWorkbench()) return;
    if (action === services.content.modifiers.machine.action && this.map.id === services.content.modifiers.machine.map) return this.openMachine();
    if (action === 'outfit') return this.openWardrobe();
    if (action === 'storage.parts') return this.openChest();
    const board = action ? services.content.jobboard.boards.find((b) => b.map === this.map.id && b.action === action) : null;
    if (board) return this.openBoard(board);
    const drill = action ? drillForAction(services.content.training, action) : undefined;
    if (drill) return this.runDrill(drill);
    // The running track itself: the coach's session (Boss, 29 Oct 2026).
    const coachDrill = o.type === 'venue' && o.props.venue === 'running_track' ? services.content.training.drills.find((d) => d.npc) : undefined;
    if (coachDrill) {
      const coach = services.content.npcs.find((n) => n.id === coachDrill.npc);
      if (coach?.quietUntil && !this.save.flags[coach.quietUntil]) this.hud.toast(`${o.name}: the club's closed to you for now.`);
      else this.hud.toast(`${o.name}: talk to ${coach?.name ?? 'the coach'} by the pavilion to run a session.`);
      return;
    }
    const named = o.type === 'venue' ? services.content.tracks.venues.find((v) => v.id === o.props.venue) : undefined;
    // A race venue's gate is for whichever track the rider came here for (one venue map per track type).
    const venue = named && !named.practiceOnly ? this.venueHere() : named;
    const drills = o.type === 'venue' && !venue ? drillsAtVenue(services.content.training, String(o.props.venue)) : [];
    if (drills.length) {
      // A training spot with no track (the gym, the drill yard): its drills, nothing to ride.
      const skillName = (id: string) => services.content.skills.leads.flatMap((l) => l.children).find((c) => c.id === id)?.name ?? id;
      this.hud.choose(o.name, 'Pick a drill. Every round counts, whatever the score.', [
        ...drills.map((d) => ({ label: d.name, note: `${skillName(d.skill)} XP every round.`, onPick: () => this.runDrill(d) })),
        { label: 'Not now', onPick: () => this.player.idle() },
      ], () => this.player.idle());
      return;
    }
    if (venue) {
      if (venue.office && !venue.locked) {
        const official = services.content.npcs.find((n) => n.id === venue.office);
        // A named official (Joseph Halden, at every track: Boss, 30 Oct 2026) goes by name, anyone else by the job.
        const who = official && properName(official.name) ? official.name : `the ${official?.name.toLowerCase() ?? 'track official'}`;
        this.hud.toast(`${venue.name}: sign on with ${who} at the race office.`);
      } else this.openVenue(venue);
      return;
    }
    if (o.type === 'travel' && o.props.to === ROUTE) {
      // Signs and stops for the roads out: the road itself asks where to.
      const lock = services.travel.lockFor(this.map, o, this.save.flags);
      this.hud.toast(lock ? lock.message : `${o.name}: walk out onto the road to pick where to go.`);
      return;
    }
    const msg = actionMessage(o, this.save.flags);
    if (msg) this.hud.toast(msg);
  }

  private talkTo(placement: NpcPlacement, character: Character): void {
    const { npc } = placement;
    if (this.runStory({ talk: npc.id }, npc.name, () => this.faceBack(placement, character), () => this.faceNpc(character))) return;
    if (npc.quietUntil && !this.save.flags[npc.quietUntil]) {
      // GDD 4.2: NPCs outside the opening chain don't acknowledge the rider until it's done.
      // A named NPC goes by their name ("Louis Jonez doesn't look up"), anyone else by their job.
      this.hud.toast(`${properName(npc.name) ? npc.name : `The ${npc.name.toLowerCase()}`} doesn't look up.`);
      return;
    }
    this.faceNpc(character);
    if (npc.news) {
      // News for the players: read once, and the bubble turns white until there's a new message.
      this.say(npc.name, npc.dialogue, () => {
        const read = newsRead(npc.dialogue);
        if (!this.save.flags[read]) {
          this.save.flags[read] = true;
          this.refreshNews();
          this.quickSave();
        }
        this.faceBack(placement, character);
      });
      return;
    }
    const office = services.content.tracks.venues.some((v) => v.office === npc.id && v.map === this.map.id) ? this.venueHere() : undefined;
    if (office) {
      // A one-off hello first (Joseph Halden introduces himself: his family runs every track), then the office.
      const hello = this.talkRule(npc);
      const open = () => this.openVenue(office, () => this.faceBack(placement, character));
      if (!hello) return open();
      this.say(npc.name, hello.dialogue, () => {
        if (hello.sets) {
          this.save.flags[hello.sets] = true;
          this.milestoneSave();
        }
        open();
      });
      return;
    }
    const back = () => this.faceBack(placement, character);
    const rule = this.talkRule(npc);
    const { challenges, errands } = services.content;
    const challenge = challenges.challenges.find((d) => d.npc === npc.id && (!d.needs || this.save.flags[d.needs]));
    if (challenge && !rule) return this.challengeTalk(npc, challenge, back);
    const errand = errands.errands.find((d) => d.npc === npc.id && (!d.needs || this.save.flags[d.needs]));
    if (errand && !rule) return this.errandTalk(npc, errand, back);
    const drill = drillForNpc(services.content.training, npc.id);
    if (drill && !rule) return this.say(npc.name, npc.dialogue, () => this.runDrill(drill, back));
    if (!rule && this.offerMotor(npc, back)) return;
    const shop = services.content.shops.shops.find((s) => s.npc === npc.id);
    if (shop && !rule && services.content.house.rack.shops.includes(shop.id) && (!shop.needs || this.save.flags[shop.needs])) return this.offerRack(npc, shop, back);
    if (shop && !rule && this.openShop(shop, 'buy', back)) return;
    this.say(npc.name, rule?.dialogue ?? npc.dialogue, () => {
      // A one-off talk (the mechanic's advice after the opening chain): said once, then the NPC's usual lines.
      if (rule?.sets && !this.save.flags[rule.sets]) {
        this.save.flags[rule.sets] = true;
        this.hud.showCareer(this.save.career, this.save.flags);
        // The next task line's NPC gets the markers.
        this.refreshWaymarks();
        this.milestoneSave();
      }
      back();
    });
  }

  /**
   * A challenger by a practice track (core/challenge.ts): the track isn't built yet, or they offer
   * a race for their stake. Win or lose, they race again straight away.
   */
  private challengeTalk(npc: NpcDef, def: ChallengeDef, back: () => void): void {
    const career = this.save.career;
    if (!challengeReady(services.content, def)) return this.say(npc.name, def.building, back);
    const fee = pence(def.entry);
    this.say(npc.name, def.offer, () => {
      this.hud.confirm(`Race ${npc.name} for ${formatMoney(fee)}?\nWin and you get ${formatMoney(fee * 2)} back.`, 'Race', () => {
        if (career.money < fee) return this.say(npc.name, def.short, back);
        const problem = bikeProblem(services.content.bikes, career.bike);
        if (problem) {
          this.hud.toast(problem);
          return back();
        }
        const wins = career.counters[challengeWins(def.id)] ?? 0;
        this.ride('challenge', challengeVenue(def), fee, () => {
          const won = (this.save.career.counters[challengeWins(def.id)] ?? 0) > wins;
          if (won) return this.say(npc.name, def.won, back);
          // The walk-off: a general hint at what to improve (Boss, 28 Oct 2026).
          const { challenges, bikes, skills, riders } = services.content;
          const state = this.save.career.skills;
          const lead = (id: string) => leadLevel(skills, state, skills.leads.find((l) => l.id === id)!);
          const level = riders.riders.find((r) => r.id === def.challenger)?.level ?? 1;
          const hint = lossHint(challenges, def, bikes, this.save.career.bike, { riding: lead('rider'), fitness: lead('fitness') }, level);
          this.say(npc.name, def.lost, () => this.say(npc.name, hint, back));
        }, undefined, def);
      }, back);
    });
  }

  /** An errand (core/errands.ts): offered, under way, or the repaired part handed back. */
  private errandTalk(npc: NpcDef, def: ErrandDef, back: () => void): void {
    const { shops, bikes } = services.content;
    const career = this.save.career;
    const saved = (message: string) => {
      this.hud.toast(message);
      this.hud.showCareer(career, this.save.flags);
      this.milestoneSave();
      back();
    };
    const stage = errandStage(career, def);
    if (stage === 'waiting') return this.say(npc.name, def.waiting, back);
    if (stage === 'ready') {
      return this.say(npc.name, def.thanks, () => {
        const r = finishErrand(career, def);
        if (r.ok && def.sets) this.save.flags[def.sets] = true;
        saved(r.message);
      });
    }
    this.say(npc.name, def.offer, () => {
      this.hud.confirm(`Take ${def.owner}'s part to the garage for repair?\nYou pay for the repair and get it back on return, plus ${formatMoney(pence(def.reward))}.`, 'Take it', () => {
        const r = takeErrand(shops, bikes, career, def);
        if (!r.ok) {
          this.hud.toast(r.message);
          return back();
        }
        saved(r.message);
      }, back);
    });
  }

  /**
   * Opens a shop or the garage's services. Returns false while it is shut (before the opening
   * chain is done), so the object or NPC says its usual line instead.
   */
  private openShop(shop: ShopDef, tab: 'buy' | 'fit', onClose: () => void = () => this.player.idle()): boolean {
    if (shop.needs && !this.save.flags[shop.needs]) return false;
    this.hud.showCareer(this.save.career, this.save.flags);
    this.hud.openShop(shop, tab, onClose);
    return true;
  }

  /**
   * The rider's own workbench (core/tools.ts): repairs and fitting with their tool sets, at the tool
   * cabinet at home or the back of the motor. Shut until the opening chain is done, like the shops.
   */
  private openWorkbench(): boolean {
    if (!this.save.flags.tutorial_done) return false;
    const bench: ShopDef = { id: 'diy', name: 'Your tools', npc: '', map: this.map.id, actions: [], greeting: 'Your own tools. Repairs drop a grade as always, and cost nothing; fitting a spare is free. Each set covers its own parts.', repairs: true, fitFee: 0, diy: true };
    this.hud.showCareer(this.save.career, this.save.flags);
    this.hud.openShop(bench, 'repair', () => this.player.idle());
    return true;
  }

  private faceNpc(character: Character): void {
    const turn: Record<Facing, Facing> = { down: 'up', up: 'down', left: 'right', right: 'left' };
    character.face(turn[this.player.facing]);
    this.player.reach();
  }

  private faceBack(placement: NpcPlacement, character: Character): void {
    this.player.idle();
    character.face(placement.facing);
  }

  /** The NPC's line set for the current flags (npcs.json talk), if any; otherwise their default dialogue is said. */
  private talkRule(npc: NpcDef): NonNullable<NpcDef['talk']>[number] | undefined {
    const f = this.save.flags;
    return npc.talk?.find((t) => (t.if === undefined || f[t.if]) && (t.unless === undefined || !f[t.unless]));
  }

  /** Shows a dialogue by key, filling in {rider} and any extra values. */
  private say(speaker: string, key: string, onClose: () => void = () => this.player.idle(), vars: Record<string, string> = {}): void {
    const all = { rider: this.save.rider.name, ...vars };
    const lines: DialogueLine[] = services.content.dialogue[key].lines.map((l) => ({ ...l, text: fillText(l.text, all) }));
    this.hud.openDialogue(speaker, this.save.rider.name, lines, onClose);
  }

  /** The area's house, for sale at its locked door (core/areas.ts): offers it, or says why not. Returns false if this isn't the house door. */
  private offerHouse(door: MapObject): boolean {
    const area = areaOfMap(services.content.areas, this.map.id);
    if (!area?.house || door.type !== 'door' || door.props.unlock !== houseFlag(area.n) || door.name !== area.house.door) return false;
    const career = this.save.career;
    const extras = area.house.unlocks?.includes('wardrobe') ? ' It comes with a wardrobe, so the clothing rack at Phoenix MX opens to you.' : '';
    this.hud.confirm(`${area.house.name}: for sale at £${area.house.price}.${extras}\nBuy it?`, 'Buy', () => {
      const r = buyHouse(area, career, this.save.flags);
      this.hud.toast(r.message);
      if (!r.ok) return;
      this.hud.showCareer(career, this.save.flags);
      this.refreshMapState();
      this.milestoneSave();
    }, () => {});
    return true;
  }

  /** Nicholls Used Motors in a later area sells that area's motor (core/areas.ts): offers it, or says why not. */
  private offerMotor(npc: NpcDef, back: () => void): boolean {
    const area = services.content.areas.areas.find((a) => a.motor?.npc === npc.id);
    if (!area?.motor) return false;
    const { vehicles } = services.content;
    const career = this.save.career;
    const design = vehicles.designs.find((d) => d.id === area.motor!.design);
    const problem = motorProblem(vehicles, area, career, this.save.van, this.save.flags);
    this.say(npc.name, npc.dialogue, () => {
      if (problem) return void this.hud.toast(problem), back();
      this.hud.confirm(`${design?.name ?? area.motor!.design}: £${area.motor!.price} with your old motor in part exchange. ${area.motor!.pitch ?? 'Bigger than the old one, and it never needs looking after.'}\nBuy it?`, 'Buy', () => {
        const r = buyMotor(vehicles, area, career, this.save.van!, this.save.flags);
        this.hud.toast(r.message);
        if (r.ok) {
          this.hud.showCareer(career, this.save.flags);
          this.milestoneSave();
          this.hud.toast("It's parked where the old one stood: you'll see it when you next step outside.");
        }
        back();
      }, back);
    });
    return true;
  }

  /**
   * Plays the current opening-chain step if this talk or use is it. Returns false when the event
   * has nothing to do with the story, so the normal response runs instead.
   */
  private runStory(ev: StoryEvent, speaker: string, onClose: () => void = () => this.player.idle(), onStart: () => void = () => this.player.reach()): boolean {
    const { story, items } = services.content;
    const career = this.save.career;
    const m = matchStory(story, career, ev, Object.fromEntries(services.content.skills.leads.map((l) => [l.id, leadLevel(services.content.skills, career.skills, l)])));
    if (!m) return false;
    if (m.kind === 'alreadyUsed') {
      this.hud.toast("You've already done that one.");
      return true;
    }
    onStart();
    if (m.kind === 'notReady') {
      if (m.step.notReady) this.say(speaker, m.step.notReady, onClose, { short: formatMoney(m.short) });
      else {
        this.hud.toast(m.short > 0 ? `You're ${formatMoney(m.short)} short.` : "You don't have what you need for this yet.");
        onClose();
      }
      return true;
    }
    const finish = () => {
      const object = 'use' in ev ? ev.object : undefined;
      const step: StoryStep = m.step;
      const completed = advanceStory(story, career, this.save.flags, items, object);
      this.hud.showCareer(career, this.save.flags);
      const show = () => {
        onClose();
        this.refreshWaymarks();
        if (!completed) return;
        if (step.effects?.money) this.hud.toast(step.toast ?? `${step.effects.money > 0 ? '+' : ''}${formatMoney(pence(step.effects.money))}`);
        else if (step.toast) this.hud.toast(step.toast);
        if (step.effects?.flags?.length) this.refreshMapState();
        this.milestoneSave();
      };
      if (step.lines) this.say(speaker, step.lines, show);
      else show();
    };
    if (m.step.confirm) this.hud.confirm(m.step.confirm, 'Yes', finish, onClose);
    else finish();
    return true;
  }

  /** The "!" over each news NPC here: orange until their current message is read (newsRead). */
  private refreshNews(): void {
    const marks: Mark[] = this.npcs
      // Like their talk, the bubble waits until the opening chain is done (GDD 4.2).
      .filter((n) => n.placement.npc.news && (!n.placement.npc.quietUntil || this.save.flags[n.placement.npc.quietUntil]))
      .map((n) => ({ kind: 'news', x: n.character.sprite.x, y: n.character.sprite.y, fresh: !this.save.flags[newsRead(n.placement.npc.dialogue)] }));
    this.newsMarks.show(marks);
  }

  // ---- tutorial markers (Boss, 28 Oct 2026) ----

  /** Marks the current story step's NPC or equipment here, or the door or exit on the way to it. */
  private refreshWaymarks(): void {
    this.van?.setLoad(this.vanLoad());
    this.waymarks.clear();
    this.markPoint = null;
    const career = this.save.career;
    // An area just opened starts its intro chain (core/career.ts openChains).
    for (const c of openChains(services.content.story, career, this.save.flags)) this.hud.toast(`${services.content.areas.areas.find((a) => a.intro === c.id)?.name ?? 'A new area'}: a new task.`);
    this.markEarning = earning(services.content, career);
    const goals = storyGoals(services.content, services.maps, career, this.save.flags, this.save.van ?? null);
    if (!goals.length) return;
    const ts = this.map.tileSize;
    const nearest = <P extends { x: number; y: number }>(points: P[]) => {
      const { x, y } = this.player.sprite;
      return points.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
    };
    const marks: Mark[] = [];
    const points: { x: number; y: number; label: string; sub?: string }[] = [];
    const here = goals.filter((g) => g.map === this.map.id);
    const nameOf = (goal: (typeof goals)[number]) => (goal.kind === 'npc' ? goal.name : goal.kind === 'van' ? (this.van?.design.name ?? 'Your motor') : actionName(goal.action));
    for (const goal of here) {
      const what = nameOf(goal);
      if (goal.kind === 'van') {
        if (!this.van) continue;
        const tiles = footprint(this.van.pose, this.van.design.length);
        marks.push({ kind: 'object', tiles });
        points.push({ ...middle(tiles), label: what });
      } else if (goal.kind === 'npc') {
        const n = this.npcs.find((c) => c.placement.npc.id === goal.npc);
        if (!n) continue;
        const { x, y } = n.character.sprite;
        marks.push({ kind: 'npc', x, y });
        points.push({ x, y: y - TILE, label: what });
      } else {
        const objs = goalObjects(this.map, goal.action, career.story.used).map((o) => objectTiles(o, ts));
        marks.push(...objs.map((tiles): Mark => ({ kind: 'object', tiles })));
        points.push(...objs.map((tiles) => ({ ...middle(tiles), label: what })));
      }
    }
    if (!here.length) {
      // The way to each goal: goals behind the same door or exit share its arrows (Boss, 28 Oct
      // 2026: one road to the Industrial Zone, then both work buildings' doors).
      const seen = new Set<MapObject>();
      for (const goal of goals) {
        const what = nameOf(goal);
        const hop = nextHop(services.maps, services.content.world, services.travel, this.save.flags, this.map.id, goal.map);
        if (!hop || hop.via.every((o) => seen.has(o))) continue;
        for (const o of hop.via) seen.add(o);
        // One arrow per doorway: a building's side door (its own spawn inside) is a doorway of its own.
        const doorways = new Map<string, Tile[]>();
        for (const o of hop.via) {
          const k = String(o.props.spawn ?? '');
          doorways.set(k, [...(doorways.get(k) ?? []), ...objectTiles(o, ts)]);
        }
        const groups = [...doorways.values()].flatMap(clusters);
        const side = sideOf(this.map, hop.via[0]);
        marks.push(...groups.map((tiles): Mark => (hop.kind === 'door' ? { kind: 'door', tiles } : { kind: 'exit', tiles, side })));
        const label = hop.kind === 'door' ? hop.via[0].name : (services.maps.get(hop.to)?.title ?? hop.via[0].name);
        // Several goals through one exit: no single thing to name under it.
        const sub = goals.length > 1 && hop.kind === 'exit' ? undefined : what.toLowerCase() === label.toLowerCase() ? undefined : what;
        points.push(...groups.map((tiles) => ({ ...middle(tiles), label, sub })));
      }
    }
    if (!points.length) return;
    this.waymarks.show(marks);
    this.markPoint = nearest(points);
  }

  /** Redraws the markers when the money for an earning step comes in, or runs out. */
  private checkMarkEarning(): void {
    if (earning(services.content, this.save.career) !== this.markEarning) this.refreshWaymarks();
  }

  /** 4A: while the marker is off screen, an arrow at the screen edge points the way to it. */
  private updateWayArrow(): void {
    this.checkMarkEarning();
    const p = this.markPoint;
    const cam = this.cameras.main;
    const v = cam.worldView;
    const m = TILE / 2;
    // Not inside a building: the arrow on the way out is enough there (Boss, 28 Oct 2026).
    if (!p || this.map.kind === 'interior' || this.busy || this.hud.isDialogueOpen() || (p.x > v.x + m && p.x < v.right - m && p.y > v.y + m && p.y < v.bottom - m)) {
      this.hud.showWayArrow(null);
      return;
    }
    // From the middle of the screen towards the marker, stopped inside the edge, clear of the HUD text and buttons.
    const w = this.scale.width / DPR;
    const h = this.scale.height / DPR;
    const dx = p.x - v.centerX;
    const dy = p.y - v.centerY;
    const left = 56;
    const right = w - 56;
    const top = 150;
    const bottom = h - HUD_BAR - 40;
    const cx = w / 2;
    const cy = h / 2;
    const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
    const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
    const t = Math.min(tx, ty);
    this.hud.showWayArrow({ x: cx + dx * t, y: cy + dy * t, angle: Phaser.Math.RadToDeg(Math.atan2(dy, dx)), label: p.label, sub: p.sub });
  }

  /** The world map, with the rider's biggest bike in the zone they're in. */
  openWorldMap(): void {
    const wm = services.content.world.worldMap;
    if (!wm || this.busy) return;
    const zone = zoneFor(wm, services.maps, services.travel, this.map.id);
    const bike = bikeImage(wm, biggestBike(services.content.bikes, this.save.career), services.content.bikes);
    this.player.stopWalking();
    this.path = [];
    this.onArrive = null;
    this.hud.showWorldMap(wm, zone, this.map.title, bike, () => {});
  }

  /** Flags such as cleared roadworks change the map: reload it in place. */
  private refreshMapState(): void {
    const hidden = hiddenSprites(this.map, this.save.flags);
    if (!hidden.size) return;
    this.time.delayedCall(300, () => {
      this.save.position = this.snapshot().position;
      this.scene.restart({ save: this.save });
    });
  }

  // ---- shift work (Spec 15.5: click a station, wait for it, move to the next; one pass makes one part) ----

  /** Starts a shift at a job's start object, or works the next station. Returns true if handled. */
  private useForShift(o: MapObject): boolean {
    if (this.shift) {
      const st = this.shift.job.stations[this.shift.station];
      if (o.name === st.object) {
        void this.workStation();
        return true;
      }
      if (this.shift.job.stations.some((s) => s.object === o.name)) {
        this.hud.toast(`Next: ${st.label}.`);
        return true;
      }
      return false;
    }
    const job = services.content.world.jobs.find((j) => j.map === this.map.id && j.start === o.name);
    if (!job) return false;
    if (job.needs && !this.save.flags[job.needs]) {
      this.hud.toast('Nobody here has time to show you the work yet. Finish helping Paul at Phoenix MX first.');
      return true;
    }
    const career = this.save.career;
    const open = openJobAt(career, job);
    if (open && open.job !== job.id) {
      this.hud.toast(`You're part way through another batch here. Finish that first.`);
      return true;
    }
    const pay = formatMoney(jobPay(services.content.world, job));
    const skills = services.content.skills.leads.flatMap((l) => l.children);
    const xp = Object.entries(passXp(job)).map(([id, n]) => `${n} ${skills.find((c) => c.id === id)?.name ?? id}`).join(', ');
    const keeps = job.keeps ? ` Finish the batch and one ${job.keeps.length === 1 ? slotName(services.content.bikes, job.keeps[0]) : 'part'} is yours to keep.` : '';
    const text = open
      ? `${job.name}: carry on your batch, ${open.made} of ${job.batch} ${job.product}s made, at ${pay} each.${keeps}`
      : `${job.name}: make a batch of ${job.batch} ${job.product}s at ${pay} each, with ${xp} XP every part.\nYou're paid for every part, even if you stop early, and the batch waits for you.${keeps}`;
    this.hud.confirm(text, open ? 'Carry on' : 'Start shift', () => {
      const r = startJob(career, job);
      if (!r.ok) return void this.hud.toast(r.reason);
      this.shift = { job, made: r.open.made, station: 0 };
      this.showShift();
      void this.workStation();
    }, () => this.player.idle());
    return true;
  }

  /** The customer repair board (core/jobBoard.ts): pick a ticket, or carry on the one under way. */
  private openBoard(board: BoardDef): void {
    const career = this.save.career;
    const { tools, bikes } = services.content;
    if (board.needs && !this.save.flags[board.needs]) return void this.hud.toast("The job board. Paul will put you on it once you've finished helping out.");
    const open = career.jobs?.open[board.id];
    const begin = (job: JobDef, ticket: Ticket) => {
      const r = startJob(career, job);
      if (!r.ok) return void this.hud.toast(r.reason);
      r.open.ticket = ticket;
      this.shift = { job, made: r.open.made, station: 0 };
      this.showShift();
      this.hud.toast(`${job.name}: ${job.stations[0].label}.`);
    };
    if (open?.ticket) {
      const job = ticketJob(board, tools, bikes, open.ticket);
      const ticket = open.ticket;
      this.hud.confirm(`${job.name} is still on the bench (${formatMoney(jobPay(services.content.world, job))} when it's done). Carry on?`, 'Carry on', () => begin(job, ticket), () => this.player.idle());
      return;
    }
    const tickets = ticketsOffered(board, bikes, career);
    this.hud.choose(board.name, 'Customer repairs: strip the part, fix it, refit it and test it. Each ticket needs the tools for its part.', [
      ...tickets.map((t) => {
        const problem = ticketProblem(tools, career, t);
        const job = ticketJob(board, tools, bikes, t);
        return {
          label: `${t.customer}: G${t.grade} ${slotName(bikes, t.slot)}`,
          note: `${formatMoney(jobPay(services.content.world, job))}, ${board.xpPerStation * board.stations.length} ${tools.sets.find((s) => s.slots.includes(t.slot))?.skill.replace('_', ' ') ?? ''} XP.${problem ? ` ${problem}` : ''}`,
          enabled: !problem,
          onPick: () => begin(job, t),
        };
      }),
      { label: 'Not now', onPick: () => this.player.idle() },
    ], () => this.player.idle());
  }

  private async workStation(): Promise<void> {
    const shift = this.shift;
    if (!shift || this.busy) return;
    const st = shift.job.stations[shift.station];
    this.busy = true;
    this.clearStationMarks();
    this.player.reach();
    await this.hud.progress(st.label, st.ms);
    this.player.idle();
    this.busy = false;
    if (this.shift !== shift) return;
    shift.station += 1;
    if (shift.station >= shift.job.stations.length) {
      shift.station = 0;
      const career = this.save.career;
      const pass = finishPass(services.content.skills, career, shift.job, jobPay(services.content.world, shift.job));
      shift.made += pass.parts;
      if (pass.parts > 1) this.hud.toast(`Two ${shift.job.product}s in one go!`);
      for (const u of pass.ups) this.hud.toast(`Level up! ${u.name} is now level ${u.level}.`);
      this.hud.showCareer(career, this.save.flags);
      if (pass.done) {
        const engine = new Set(services.content.bikes.slots.filter((sl) => sl.engine).map((sl) => sl.id));
        const r = finishBatch(services.content.skills, career, shift.job, engine);
        noteActivity(services.content.shops, career, 'activity');
        const kept = r.kept ? ` The boss hands you a G${r.kept.grade} ${slotName(services.content.bikes, r.kept.slot)} from the batch: it's in your bag.` : '';
        this.endShift(shift.job.batch === 1 ? `${shift.job.name}: done and paid.` : `Batch done: ${shift.made} ${shift.job.product}s made.${kept}`);
        this.milestoneSave();
        return;
      }
      this.milestoneSave();
    }
    this.showShift();
  }

  private showShift(): void {
    const s = this.shift;
    if (!s) return;
    const st = s.job.stations[s.station];
    this.hud.showShift(`${s.job.name}: ${s.made} of ${s.job.batch} ${s.job.product}s\nNext: ${st.label}`);
    this.markStation(st.object);
  }

  private endShift(message: string): void {
    this.shift = null;
    this.clearStationMarks();
    this.hud.showShift(null);
    this.hud.toast(message);
  }

  /** A pulsing ring under every object that can do the next station. */
  private markStation(name: string): void {
    this.clearStationMarks();
    for (const o of this.map.objects.filter((x) => x.name === name)) {
      const tiles = objectTiles(o, this.map.tileSize);
      const cx = (tiles.reduce((a, t) => a + t.x, 0) / tiles.length + 0.5) * TILE;
      const cy = (tiles.reduce((a, t) => a + t.y, 0) / tiles.length + 0.5) * TILE;
      const ring = this.add.ellipse(cx, cy + 18, TILE * Math.max(1, tiles.length * 0.8), 26).setStrokeStyle(4, 0xef6c18, 0.95).setDepth(OVERHEAD_DEPTH);
      if (!services.settings.get().accessibility.reducedEffects) this.tweens.add({ targets: ring, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
      this.stationMarks.push(ring);
    }
  }

  private clearStationMarks(): void {
    for (const m of this.stationMarks) m.destroy();
    this.stationMarks = [];
  }

  // ---- tracks: the race office, practice and the backyard loop ----

  /**
   * A race office's choices. A mod track (raceOnly) has race day only, said by `intro`, and
   * `extra` choices of its own.
   */
  private openVenue(venue: VenueDef, onClose: () => void = () => this.player.idle(), mod?: { intro: string; extra: { label: string; note?: string; onPick: () => void }[] }): void {
    const rc = services.content;
    const career = this.save.career;
    const problem = venueProblem(rc, venue, career, this.save.flags);
    if (problem) {
      this.hud.toast(problem);
      onClose();
      return;
    }
    const dayCls = venueClassFor(rc, venue, career);
    const pFee = practiceFee(rc, venue, dayCls);
    if (venue.practiceOnly) {
      const drills = drillsAtVenue(services.content.training, venue.id);
      if (!drills.length) {
        this.hud.confirm(`Ride the ${venue.name.toLowerCase()}?\nFree. Laps wear your parts and give practice XP.`, 'Ride', () => this.ride('practice', venue, pFee, onClose), onClose);
        return;
      }
      this.hud.choose(venue.name, 'Ride laps, or work on your starts at the gate.', [
        { label: 'Ride laps', note: 'Free. Laps wear your parts and give practice XP.', onPick: () => this.ride('practice', venue, pFee, onClose) },
        ...drills.map((d) => ({ label: d.name, note: `${services.content.skills.leads.flatMap((l) => l.children).find((c) => c.id === d.skill)?.name ?? d.skill} XP every round. No wear.`, onPick: () => this.runDrill(d, onClose) })),
        { label: 'Not now', onPick: onClose },
      ], onClose);
      return;
    }
    const fee = entryFee(rc, venue, this.save.flags, dayCls);
    const laps = lapsFor(rc, trackById(rc, venue.track!), dayCls, false);
    const field = fieldCount(rc, venue) + 1;
    const first = fee === 0 && venue.firstRaceFree;
    const area = venue.town ? areaOfMap(rc.areas, venue.town) : undefined;
    const forecast = area?.weather ? ` Weather here: ${Object.keys(area.weather).map((k) => rc.racing.weather?.[k]?.name.toLowerCase() ?? k).join(', ')}; you find out at the gate.` : '';
    const text = [
      (mod ? mod.intro : first ? "First time here? Your first race day is on us." : 'Race office. What can I do for you?') + forecast,
      `${className(rc.bikes, dayCls)} race day: ${field} riders including the Local Champion, 2 motos of ${laps} laps. Prize money to 10th in each moto.`,
    ].join('\n\n');
    const short = (p: number) => career.money < p;
    const champs = services.content.championships;
    // A championship's next round here takes the place of a local race day (Spec 18.6, 6C).
    const rounds = mod ? [] : roundsHere(champs, career, venue);
    const roundOptions = rounds.map((def) => {
      const f = roundEntry(rc, def, dayCls);
      const n = career.champs!.active[def.id].rounds.length + 1;
      return { label: `${def.short} round ${n}`, note: `Entry: ${formatMoney(f)}${short(f) ? " — you can't afford it" : ''}. Qualifying, then 2 motos against the championship's ${def.size + 1} riders.`, enabled: !short(f), onPick: () => this.ride('raceday', venue, f, onClose, def) };
    });
    const hasChamps = !mod && champs.championships.some((d) => d.rounds.includes(venue.id));
    const others = mod ? [] : rc.tracks.venues.filter((v) => v.map === venue.map && v.id !== venue.id && !v.practiceOnly && !v.locked && (!v.needs || this.save.flags[v.needs]));
    this.hud.choose(venue.name, text, [
      ...roundOptions,
      rounds.length
        ? { label: 'Race day', note: 'Not today: your championship round is on here.', enabled: false, onPick: onClose }
        : { label: 'Race day', note: first ? 'Entry: free (first race)' : `Entry: ${formatMoney(fee)}${short(fee) ? " — you can't afford it" : ''}`, enabled: !short(fee), onPick: () => this.ride('raceday', venue, fee, onClose) },
      ...(mod
        ? mod.extra
        : [{ label: 'Free practice', note: `${formatMoney(pFee)}: ride laps until you stop${venue.practiceRiders ? `, with ${venue.practiceRiders} other riders out on track` : ' on your own'}.${short(pFee) ? " You can't afford it." : ''}`, enabled: !short(pFee), onPick: () => this.ride('practice', venue, pFee, onClose) }]),
      ...(hasChamps ? [{ label: 'Championships', note: 'Enter one, see the standings, or give one up.', onPick: () => this.openChampionships(venue, onClose) }] : []),
      // Sponsored Rides (core/sponsors.ts, Spec 16; Boss, 31 Oct 2026: from Area 5).
      ...(!mod && sponsorsOpen(rc.sponsors, this.save.flags) ? [{ label: 'Sponsors', note: career.sponsor ? `Riding for ${career.sponsor.name}: today's objectives, or leave them.` : career.sponsorOffers?.length ? `${career.sponsorOffers.length} offer${career.sponsorOffers.length === 1 ? '' : 's'} waiting.` : 'No offers yet: finish a championship to open a window.', onPick: () => this.openSponsors(venue, () => this.openVenue(venue, onClose, mod)) }] : []),
      // Bike setup (Spec 8; Boss, 31 Oct 2026): the Basic view from Area 2, the Advanced view from Area 5.
      ...(!mod && this.save.flags[areaFlag(rc.setup.basicArea)] ? [{ label: 'Bike setup', note: 'Set the bike up for this track: a ready-made setup, or your own sliders.', onPick: () => this.openSetup(venue, () => this.openVenue(venue, onClose, mod)) }] : []),
      // One venue map per track type (Boss, 30 Oct 2026): the other tracks of this type race here too.
      ...(!mod && others.length ? [{ label: 'Other tracks', note: `${others.length} more ${others.length === 1 ? 'track races' : 'tracks race'} here: ${others.map((v) => v.name).join(', ')}.`, onPick: () => this.hud.choose('Other tracks', 'Which track today?', [
        ...others.map((v) => ({ label: v.name, note: `${className(rc.bikes, venueClassFor(rc, v, career))} race days.`, onPick: () => { career.venue = v.id; this.openVenue(v, onClose); } })),
        { label: 'Back', onPick: () => this.openVenue(venue, onClose, mod) },
      ], () => this.openVenue(venue, onClose, mod)) }] : []),
      { label: 'Not now', onPick: onClose },
    ], onClose);
  }

  /** The venue the rider is at on this map: the one picked at the road, on a map that holds every track of its type (core/guides.ts). */
  private venueHere(): VenueDef | undefined {
    return venueHere(services.content.tracks.venues, this.map.id, this.save.flags, this.save.career.venue);
  }

  // ---- sponsors (core/sponsors.ts, Spec 16) ----

  private openSponsors(venue: VenueDef, back: () => void): void {
    const rc = services.content;
    const data = rc.sponsors;
    const career = this.save.career;
    const again = () => this.openSponsors(venue, back);
    const c = career.sponsor;
    const lines = [`Word is: ${reputationHint(data, career)}`];
    if (c) {
      lines.push(`Riding for ${c.name} (${data.tiers.find((t) => t.id === c.tier)?.name ?? c.tier}): £${c.pay} an objective met, ${c.days - c.daysDone} race ${c.days - c.daysDone === 1 ? 'day' : 'days'} to go, £${c.cashReceived / 100} earned so far.${c.failStreak >= data.objectives.warnAfter ? ' On a warning.' : ''}`);
      lines.push(`Today here: ${dayObjectives(data, rc, c, venue).map((o) => objectiveText(rc, o, data)).join('; ')}.`);
    } else lines.push('No sponsor. Sponsors pay for objectives met, nothing up front; offers open when you finish a championship.');
    const offers = career.sponsorOffers ?? [];
    this.hud.choose('Sponsors', lines.join('\n'), [
      ...offers.map((o) => {
        const problem = offerProblem(o, career);
        const tier = data.tiers.find((t) => t.id === o.tier);
        return { label: `${o.name}: £${o.pay} an objective`, note: problem ?? `${tier?.name ?? o.tier}: ${o.days} race days, every part Grade ${o.minGrade} or better, top ${tier?.topN ?? '?'} to finish.`, enabled: !problem, onPick: () => this.hud.confirm(`Sign with ${o.name} for ${o.days} race days?`, 'Sign', () => {
          const r = signOffer(data, o, career, this.save.flags);
          this.hud.toast(r.message);
          this.milestoneSave();
          again();
        }, again) };
      }),
      ...(c ? [{ label: `Leave ${c.name}`, note: `Costs ${formatMoney(dropPenalty(data, c))} of what they've paid you, and your name among sponsors.`, onPick: () => this.hud.confirm(`Leave ${c.name} now for ${formatMoney(dropPenalty(data, c))}?`, 'Leave', () => {
        const r = dropSponsor(data, career);
        this.hud.showCareer(career, this.save.flags);
        this.hud.toast(r.message);
        this.milestoneSave();
        again();
      }, again) }] : []),
      { label: 'Back', onPick: back },
    ], back);
  }

  // ---- the house: wardrobe, chest and the Phoenix MX clothing rack (core/house.ts; Boss, 30 Oct 2026) ----

  private openWardrobe(): void {
    const data = services.content.house;
    const rider = this.save.rider;
    const back = () => this.player.idle();
    const worn = wornOutfit(data, rider);
    const owned = data.outfits.filter((o) => ownsOutfit(rider, o.id) && outfitSheet(o, rider));
    this.hud.choose('Wardrobe', `Wearing: ${worn.name}. ${owned.length > 1 ? 'Pick something to put on.' : "Nothing else in here yet: Phoenix MX in Mountain Town has a clothing rack."}`, [
      ...owned.map((o) => ({ label: o.name, note: o.id === worn.id ? 'On now.' : o.desc ?? '', enabled: o.id !== worn.id, onPick: () => {
        const r = wearOutfit(o, rider);
        this.hud.toast(r.message);
        if (r.ok) {
          this.player.setSheet(rider.look);
          this.milestoneSave();
        }
        back();
      } })),
      { label: 'Close', onPick: back },
    ], back);
  }

  private openChest(): void {
    const { house, shops, bikes } = services.content;
    const career = this.save.career;
    const back = () => this.player.idle();
    const limit = storageLimit(house, this.save.flags);
    const again = () => this.openChest();
    const label = (p: { grade: number; slot: string; condition: number }) => `G${p.grade} ${slotName(bikes, p.slot)} (${Math.round(p.condition * 100)}%)`;
    const inBag = career.bag.map((b, i) => ({ part: b.part!, i })).filter((r) => r.part && !r.part.owner);
    this.hud.choose('Storage chest', `${stored(career).length} of ${limit} parts put away. Every house you buy reaches the same chest${limit ? '' : ': buy one first'}.`, [
      ...stored(career).map((p, i) => ({ label: `Take out: ${label(p)}`, note: p.mods?.length ? modsLabel(services.content.modifiers, p.mods) : '', onPick: () => { this.hud.toast(takeSpare(shops, career, i).message); again(); } })),
      ...inBag.map(({ part, i }) => ({ label: `Put away: ${label(part)}`, note: part.mods?.length ? modsLabel(services.content.modifiers, part.mods) : '', enabled: stored(career).length < limit, onPick: () => { this.hud.toast(storeSpare(house, career, i, this.save.flags).message); again(); } })),
      { label: 'Close', onPick: () => { this.hud.showCareer(career, this.save.flags); this.milestoneSave(); back(); } },
    ], back);
  }

  /** Paul's shop in Mountain Town and on: parts and repairs, or the clothing rack by the door. */
  private offerRack(npc: NpcDef, shop: ShopDef, back: () => void): void {
    const data = services.content.house;
    const open = rackOpen(data, this.save.flags);
    this.hud.choose(npc.name, shop.greeting, [
      { label: 'Parts and repairs', onPick: () => { if (!this.openShop(shop, 'buy', back)) back(); } },
      { label: 'Clothing rack', note: open ? 'Race kit to wear about town. Hangs in your wardrobe.' : 'Nothing for sale until you have a wardrobe: buy the Starter terrace in Mountain Town.', enabled: open, onPick: () => this.openRack(npc, shop, back) },
      { label: 'Not now', onPick: back },
    ], back);
  }

  private openRack(npc: NpcDef, shop: ShopDef, back: () => void): void {
    const data = services.content.house;
    const career = this.save.career;
    const rider = this.save.rider;
    const again = () => this.openRack(npc, shop, back);
    this.hud.choose('Clothing rack', 'Bought outfits hang in your wardrobe at home: put them on there.', [
      ...data.outfits.filter((o) => o.id !== 'start' && !o.award).map((o) => {
        const problem = outfitProblem(data, o, career, rider, this.save.flags);
        return { label: `${o.name}: ${formatMoney(pence(o.price))}`, note: problem ?? o.desc ?? '', enabled: !problem, onPick: () => {
          const r = buyOutfit(data, o, career, rider, this.save.flags);
          this.hud.showCareer(career, this.save.flags);
          this.hud.toast(r.message);
          this.milestoneSave();
          again();
        } };
      }),
      { label: 'Back', onPick: () => this.offerRack(npc, shop, back) },
    ], back);
  }

  // ---- the Modifying Machine (core/modifiers.ts, Spec 6; Boss, 30 Oct 2026: Mad Maggie's, fixed by her quest) ----

  private openMachine(): void {
    const rc = services.content;
    const data = rc.modifiers;
    const career = this.save.career;
    const back = () => this.player.idle();
    if (!this.save.flags[data.machine.fixedFlag]) {
      this.hud.toast("The machine's dead: wires out, nothing on the dial. Maggie says it's been broken for years.");
      back();
      return;
    }
    const spares = career.bag.map((b, i) => ({ part: b.part!, i })).filter((r) => r.part);
    const rules = `One go per part, at ${Math.round(data.machine.minCondition * 100)}% or better and nothing on it yet. £${data.machine.fee.base} a go at Grade 1, ${data.machine.fee.perGrade === 2 ? 'doubling' : `times ${data.machine.fee.perGrade}`} every grade. ${data.machine.count} modifiers come out, each as likely bad as good, and 1 in ${Math.round(1 / data.machine.breakChance)} parts never comes out at all.`;
    if (!spares.length) {
      this.hud.toast(`${rules} You've no spare part to put in.`);
      back();
      return;
    }
    this.hud.choose('The Modifying Machine', rules, [
      ...spares.map(({ part, i }) => {
        const problem = machineProblem(data, rc.bikes, career, i, this.save.flags);
        const name = `G${part.grade} ${slotName(rc.bikes, part.slot)} (${Math.round(part.condition * 100)}%)`;
        return {
          label: name,
          note: problem ?? `${formatMoney(machineFee(data, part.grade))} a go. ${part.mods?.length ? modsLabel(data, part.mods) : ''}`,
          enabled: !problem,
          onPick: () => this.hud.confirm(`Put your ${name} in the machine for ${formatMoney(machineFee(data, part.grade))}?\nIt might not come back out.`, 'Do it', () => {
            const r = runMachine(data, rc.bikes, career, i, this.save.flags);
            this.hud.showCareer(career, this.save.flags);
            this.hud.toast(r.message);
            this.milestoneSave();
            back();
          }, back),
        };
      }),
      { label: 'Not now', onPick: back },
    ], back);
  }

  // ---- bike setup (core/setup.ts, Spec 8.0 to 8.3) ----

  /** Mechanical Engineer level: it sets how many positions a slider has and what the office can tell you. */
  private mechLevel(): number {
    const rc = services.content;
    return leadLevel(rc.skills, this.save.career.skills, rc.skills.leads.find((l) => l.id === 'mech')!);
  }

  private sliderLabel(s: SliderDef, value: number): string {
    return value < 0 ? `${s.low} ${Math.abs(value).toFixed(2)}` : value > 0 ? `${s.high} ${value.toFixed(2)}` : 'Middle';
  }

  private openSetup(venue: VenueDef, back: () => void): void {
    const rc = services.content;
    const data = rc.setup;
    const career = this.save.career;
    const setup = (career.setup ??= defaultSetup());
    const track = trackById(rc, venue.track!);
    const me = this.mechLevel();
    const values = effectiveSetup(data, setup, career.bike);
    const advanced = me >= data.advancedLevel && openAreas(this.save.flags) >= data.advancedArea;
    const report = setupReport(data, setup, career.bike, track, false);
    const count = (c: string) => report.colours.filter((x) => x === c).length;
    const preset = setup.preset ? data.presets.find((p) => p.id === setup.preset) : undefined;
    const lines = [
      preset ? `Setup: ${preset.name}.` : Object.keys(setup.sliders).length ? 'Setup: your own sliders.' : 'Setup: the default, everything in the middle.',
      ...data.sliders.map((s) => `${s.name}: ${sliderUnlocked(data, s, career.bike) ? this.sliderLabel(s, values[s.id]) : `locked until a Grade ${data.unlockGrade} ${s.slots.map((x) => slotName(rc.bikes, x).toLowerCase()).join(' or ')} is fitted`}`),
      // Spec 8.3: colours only until Mechanical Engineer detailLevel, then the numbers.
      me >= data.detailLevel
        ? `On ${track.name} in the dry: about ${report.lapGain >= 0 ? '+' : ''}${report.lapGain.toFixed(2)}% a lap. Rain pulls every ideal towards the mud setup.`
        : `On ${track.name} in the dry: ${count('green')} sections green, ${count('grey')} grey, ${count('amber')} amber, ${count('red')} red.`,
    ];
    const again = () => this.openSetup(venue, back);
    this.hud.choose('Bike setup', lines.join('\n'), [
      ...data.presets.map((p) => ({ label: `${p.name} setup`, note: p.note + (setup.preset === p.id ? ' (on now)' : ''), onPick: () => { setup.preset = p.id; setup.sliders = {}; again(); } })),
      { label: 'Default setup', note: 'Everything back to the middle.', onPick: () => { setup.preset = null; setup.sliders = {}; again(); } },
      ...(advanced
        ? [{ label: 'Advanced: set each slider', note: `${positionsFor(data, me)} positions per slider at Mechanical Engineer ${me}.`, onPick: () => this.openSliders(venue, again) }]
        : [{ label: 'Advanced: set each slider', note: openAreas(this.save.flags) < data.advancedArea ? `Opens in Area ${data.advancedArea}.` : `Needs Mechanical Engineer ${data.advancedLevel}.`, enabled: false, onPick: () => {} }]),
      { label: 'Back', onPick: back },
    ], back);
  }

  private openSliders(venue: VenueDef, back: () => void): void {
    const rc = services.content;
    const data = rc.setup;
    const career = this.save.career;
    const setup = (career.setup ??= defaultSetup());
    const values = effectiveSetup(data, setup, career.bike);
    const n = positionsFor(data, this.mechLevel());
    const again = () => this.openSliders(venue, back);
    this.hud.choose('Advanced setup', `Each slider has ${n} positions. Pick one to move it.`, [
      ...data.sliders.map((s) => {
        const open = sliderUnlocked(data, s, career.bike);
        return {
          label: `${s.name}: ${open ? this.sliderLabel(s, values[s.id]) : 'locked'}`,
          note: open ? `${s.low} to ${s.high}.` : `Needs a Grade ${data.unlockGrade} ${s.slots.map((x) => slotName(rc.bikes, x).toLowerCase()).join(' or ')}.`,
          enabled: open,
          onPick: () => {
            const options = Array.from({ length: n }, (_, i) => positionValue(i, n)).map((v) => ({ label: this.sliderLabel(s, v), onPick: () => {
              // Moving a slider makes the setup your own: the preset's other values are kept as a starting point.
              if (setup.preset) { setup.sliders = { ...values }; setup.preset = null; }
              setup.sliders[s.id] = v;
              again();
            } }));
            this.hud.choose(s.name, `${s.low} on the left, ${s.high} on the right.`, [...options, { label: 'Back', onPick: again }], again);
          },
        };
      }),
      { label: 'Back', onPick: back },
    ], back);
  }

  // ---- championships (core/championship.ts, Spec 12.5): entered and followed at any race office ----

  private openChampionships(venue: VenueDef, onClose: () => void): void {
    const rc = services.content;
    const career = this.save.career;
    const back = () => this.openVenue(venue, onClose);
    const list = rc.championships.championships.filter((d) => d.rounds.includes(venue.id));
    const venueName = (id: string | null) => rc.tracks.venues.find((v) => v.id === id)?.name ?? 'the next track';
    const options = list.map((def) => {
      const active = career.champs?.active[def.id];
      const record = career.champs?.done[def.id];
      const problem = active ? null : champProblem(rc, def, this.save.flags, career.bike.class);
      let note: string;
      if (active) {
        const me = standings(rc.racing.points, active).find((r) => r.player)!;
        note = `Round ${active.rounds.length + 1} of ${def.rounds.length} next, at ${venueName(nextRoundVenue(def, active))}.${active.rounds.length ? ` You're ${ordinal(me.position)} on ${me.points} points.` : ''}`;
      } else if (problem) note = problem;
      else note = `${def.rounds.length} rounds, ${formatMoney(roundEntry(rc, def, career.bike.class))} a round.${record?.wins ? ' Won before: half prize money and XP.' : record ? ` Best so far: ${ordinal(record.best)}.` : ''}`;
      // A locked one can still be picked, to say why it's locked (Boss, 28 Oct 2026).
      const onPick = problem ? () => { this.hud.toast(problem); this.openChampionships(venue, onClose); } : () => this.openChampionship(def, venue, onClose);
      return { label: problem ? `${def.short} (locked)` : def.short, note, onPick };
    });
    this.hud.choose('Championships', 'Each round is entered separately at its track\'s race office, with qualifying and the same field of riders every round. There is no calendar: a championship waits for you.', [...options, { label: 'Back', onPick: back }], back);
  }

  private openChampionship(def: ChampionshipDef, venue: VenueDef, onClose: () => void): void {
    const rc = services.content;
    const career = this.save.career;
    const active = career.champs?.active[def.id];
    const back = () => this.openChampionships(venue, onClose);
    const rounds = def.rounds.map((v, i) => `${i + 1}. ${rc.tracks.venues.find((x) => x.id === v)?.name ?? v}`).join('   ');
    if (!active) {
      const reward = def.rewards[0];
      const text = [
        `${def.class}. ${def.rounds.length} rounds: ${rounds}`,
        `${def.size + 1} riders, the same at every round. Qualifying sets the gate pick for moto 1; points for every moto (25 for a win). Entry ${formatMoney(roundEntry(rc, def, career.bike.class))} a round, with bigger prize money than a race day.`,
        `The winner takes ${reward.title ?? 'the title'}${reward.money ? ` and £${reward.money}` : ''}; 2nd and 3rd win a smaller prize.`,
      ].join('\n\n');
      this.hud.choose(def.name, text, [
        { label: 'Enter', note: 'Free to enter: you pay each round\'s entry when you ride it.', onPick: () => {
          enter(career, rc, def, (Math.random() * 2 ** 32) >>> 0);
          this.milestoneSave();
          this.hud.toast(`Entered the ${def.name}. Round 1 is at ${rc.tracks.venues.find((v) => v.id === def.rounds[0])?.name}.`);
          this.openVenue(venue, onClose);
        } },
        { label: 'Back', onPick: back },
      ], back);
      return;
    }
    const table = standings(rc.racing.points, active);
    const name = (id: string) => (id === 'player' ? 'You' : rc.riders.riders.find((r) => r.id === id)?.name ?? id);
    const me = table.find((r) => r.player)!;
    const top = table.slice(0, 5).map((r) => `${r.position}. ${name(r.id)}  ${r.points}`);
    if (me.position > 5) top.push(`${me.position}. You  ${me.points}`);
    const next = rc.tracks.venues.find((v) => v.id === nextRoundVenue(def, active));
    const text = [
      `Rounds: ${rounds}`,
      active.rounds.length ? `After round ${active.rounds.length}:\n${top.join('\n')}` : 'No rounds ridden yet.',
      `Next: round ${active.rounds.length + 1} at ${next?.name}. ${active.rounds.length && !titlePossible(def, rc.racing.points, active) ? 'The title is out of reach now, but the top three still win a prize.' : ''}`,
    ].join('\n\n');
    const giveUp = () => this.hud.confirm(`Give up the ${def.name}?\nYour points so far are lost. You can enter again later.`, 'Give it up', () => {
      withdraw(career, def);
      this.milestoneSave();
      this.hud.toast(`You gave up the ${def.name}.`);
      this.openChampionships(venue, onClose);
    }, () => this.openChampionship(def, venue, onClose));
    // No Start again: Give it up and enter again does the same. At the next round's track, the
    // round can be raced from here as well as from the race office's list (Boss, 31 Oct 2026).
    const here = roundsHere(rc.championships, career, venue).includes(def);
    const fee = roundEntry(rc, def, venueClassFor(rc, venue, career));
    const short = career.money < fee;
    this.hud.choose(def.name, text, [
      ...(here ? [{ label: `Race round ${active.rounds.length + 1}`, note: `Entry: ${formatMoney(fee)}${short ? " — you can't afford it" : ''}. Qualifying, then 2 motos.`, enabled: !short, onPick: () => this.ride('raceday', venue, fee, onClose, def) }] : []),
      { label: 'Give it up', note: 'Leave the championship. You can enter again later, from round 1.', onPick: giveUp },
      { label: 'Back', onPick: back },
    ], back);
  }

  // ---- mod tracks: player-made tracks raced from the road (core/modTracks.ts) ----

  /** The list of mod tracks, a few to a page, with importing one from this device. */
  private openModTracks(page = 0, back?: () => void): void {
    const mods = services.modTracks;
    const per = 3;
    const pages = Math.max(1, Math.ceil(mods.length / per));
    page = Math.min(page, pages - 1);
    const done = () => this.player.idle();
    const short = (name: string) => (name.length > 20 ? `${name.slice(0, 19)}…` : name);
    const options: { label: string; note?: string; enabled?: boolean; onPick: () => void }[] = mods.slice(page * per, page * per + per).map((m) => ({
      label: short(m.name),
      note: `${m.file}${m.source === 'imported' ? ' (imported)' : ''}${m.problems.length ? "\nCan't be raced: pick it to see why." : ''}`,
      onPick: () => this.pickModTrack(m, page, back),
    }));
    if (pages > 1) options.push({ label: page + 1 < pages ? 'More tracks' : 'Back to the first', note: `Page ${page + 1} of ${pages}`, onPick: () => this.openModTracks(page + 1 < pages ? page + 1 : 0, back) });
    options.push({ label: 'Import track', note: 'Add a .track.json from this device. It stays in this browser.', onPick: () => this.importModTrack(back) });
    // From the road menu, Back returns to it (Boss, 30 Oct 2026).
    options.push(back ? { label: 'Back', onPick: back } : { label: 'Not now', onPick: done });
    const text = mods.length
      ? `Player-made tracks, raced like a 50cc race day at Farmland MX. ${mods.length} installed or imported.`
      : "No mod tracks yet. Put .track.json files from the track editor in the game's mods/tracks folder, or import one.";
    this.hud.choose('Mod Tracks', text, options, done);
  }

  private pickModTrack(m: ModTrack, page: number, roadBack?: () => void): void {
    const remove = {
      label: 'Remove it',
      note: 'Take this imported track out of this browser.',
      onPick: () => {
        forgetImport(services.store, m.file);
        this.reloadMods();
        this.hud.toast(`Removed ${m.file}.`);
        this.openModTracks(page, roadBack);
      },
    };
    if (!m.track) {
      const back = { label: 'Back', onPick: () => this.openModTracks(page, roadBack) };
      this.hud.choose(m.name, `${m.file} can't be raced:\n${m.problems.slice(0, 4).join('\n')}`, m.source === 'imported' ? [remove, back] : [back], back.onPick);
      return;
    }
    this.openVenue(modVenue(m, this.map.id), () => this.player.idle(), {
      intro: `Mod track from ${m.file}${m.source === 'imported' ? ' (imported in this browser)' : ''}.`,
      extra: [...(m.source === 'imported' ? [remove] : []), { label: 'Back', note: 'Back to the mod track list.', onPick: () => this.openModTracks(page, roadBack) }],
    });
  }

  /** Reads a track file from this device, checks it, and keeps it in this browser if it can be raced. */
  private importModTrack(back?: () => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        const m = readModTrack(services.content, file.name, text, 'imported');
        if (!m.track) {
          this.hud.choose('Import track file', `${file.name} can't be raced, so it wasn't added:\n${m.problems.slice(0, 4).join('\n')}`, [{ label: 'OK', onPick: () => this.openModTracks(0, back) }], () => this.openModTracks(0, back));
          return;
        }
        try {
          keepImport(services.store, file.name, text);
        } catch {
          this.hud.toast("Couldn't keep it: this browser's storage is full or blocked.");
          return;
        }
        this.reloadMods();
        this.hud.toast(`Imported "${m.name}".`);
        const i = services.modTracks.findIndex((x) => x.source === 'imported' && x.file === file.name);
        this.openModTracks(Math.max(0, Math.floor(i / 3)), back);
      });
    });
    input.click();
  }

  private reloadMods(): void {
    services.modTracks = loadModTracks(services.content, services.modFolder, services.store);
  }

  /** Hands over to the race screen; the world sleeps until it is done. */
  private ride(mode: RaceSceneData['mode'], venue: VenueDef, fee: number, onClose: () => void, champ?: ChampionshipDef, challenge?: ChallengeDef): void {
    this.busy = true;
    this.path = [];
    this.player.stopWalking();
    const data: RaceSceneData = {
      mode,
      venue,
      fee,
      champ,
      challenge,
      save: this.snapshot(),
      onDone: (save, message) => {
        this.scene.wake('hud');
        this.scene.wake();
        this.save = save;
        this.busy = false;
        onClose();
        this.hud.showCareer(this.save.career, this.save.flags);
        this.milestoneSave();
        this.hud.toast(message);
      },
    };
    this.cameras.main.fadeOut(200, 20, 20, 30);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.sleep('hud');
      this.scene.sleep();
      this.scene.launch('race', data);
      this.cameras.main.fadeIn(200, 20, 20, 30);
    });
  }

  // ---- the van (Boss's brief, 24 Oct 2026: one van, driven on the area maps, parked where it is left) ----

  private get driving(): boolean {
    return this.save.driving;
  }

  private designOf(id: string): VanDesign {
    const { designs, starter } = services.content.vehicles;
    return designs.find((d) => d.id === id) ?? designs.find((d) => d.id === starter.design)!;
  }

  /**
   * Parks the Factory Hauler on its spot when the team brings it here (a factory sponsor, at a
   * venue): drawn like the van, solid to walkers and to the van, never driven.
   */
  private setupHauler(): void {
    const h = haulerAt(services.content.vehicles, this.save.flags, this.map.id, this.save.van);
    if (!h) return;
    const sheet = sheetFor(services.manifest.vehicles, h.design);
    if (!sheet) return;
    this.hauler = new VanView(this, h.design, sheet, h.pose);
    this.hauler.setLoad(this.vanLoad());
    const tiles = footprint(h.pose, h.design.length);
    for (const t of tiles) this.grid.setOccupied(t, true);
    this.drive.setParkedTiles(tiles);
  }

  /** Clicked or used: the back of the hauler holds the bag and spares, and the team's tools. */
  private offerHauler(): void {
    const hauler = this.hauler;
    if (!hauler) return;
    this.player.reach();
    const room = services.content.vehicles.hauler?.room;
    const note = room ? ` Room for ${room.bikes} bikes, ${room.parts} parts and ${room.tools} tools.` : '';
    this.hud.choose(hauler.design.name, `The team's hauler, parked up for you: your bikes, bag and spares are aboard.${note}`, [
      { label: 'Open the back', note: 'Your bag and spares.', onPick: () => this.openBack(hauler) },
      { label: 'Work on the bike', note: 'Repair and fit parts with your own tools.', onPick: () => void this.openWorkbench() },
      { label: 'Not now', onPick: () => this.player.idle() },
    ], () => this.player.idle());
  }

  /** Draws the van if it is parked on this map and makes its tiles solid to walkers. */
  private setupVan(): void {
    const dev = new URLSearchParams(window.location.search).get('van');
    const state = ensureVan(this.save, services.content.vehicles, dev);
    if (!state || state.map !== this.map.id) {
      this.save.driving = false;
      return;
    }
    const design = this.designOf(state.design);
    state.design = design.id;
    this.drive.setVanLength(design.length);
    let pose: VanPose = { x: state.x, y: state.y, heading: state.heading };
    // A design swap or a map change can leave the van where it no longer fits: move it to the nearest spot that does.
    if (!this.drive.fits(pose, design.length)) {
      const moved = placeNear(this.drive, pose, design.length, pose.heading, 12, (t) => !!stepTriggerAt(this.map, t));
      if (moved) pose = moved;
    }
    Object.assign(state, pose);
    const sheet = sheetFor(services.manifest.vehicles, design);
    if (!sheet) {
      this.save.driving = false;
      return;
    }
    this.van = new VanView(this, design, sheet, pose);
    this.van.setLoad(this.vanLoad());
    this.occupyVan(true);
  }

  /** The player's bike, once it is loaded in the motor: shown on the back of a truck, in its brand colours. */
  private vanLoad(): VanLoad | null {
    const bike = this.save.career.bike;
    return this.save.flags.van_loaded ? { model: modelFor(bike.class), brand: bike.brand } : null;
  }

  private occupyVan(on: boolean): void {
    if (!this.van) return;
    for (const t of footprint(this.van.pose, this.van.design.length)) this.grid.setOccupied(t, on);
  }

  /** The rider is in the cab: hide them, follow the van and show the Get out button. */
  private sitInVan(): void {
    if (!this.van) return;
    this.player.sprite.setVisible(false);
    this.player.shadow.setVisible(false);
    this.player.placeAt(this.van.pose);
    this.van.setDriver(this.save.rider.look);
    this.cameras.main.startFollow(this.van.sprite, true, 0.2, 0.2);
    this.hud.setDriving(true);
  }

  /** Clicked or used while parked: drive it, open the back for the bag, or leave it. */
  private offerVan(): void {
    const van = this.van;
    if (!van) return;
    this.player.reach();
    this.hud.choose(van.design.name, 'Get in and drive, or open the back to get at your bag and spares.', [
      { label: 'Drive', note: 'Arrow keys or WASD to drive, or click the road to drive there. E or Get out to stop.', onPick: () => this.getIn() },
      { label: 'Open the back', note: 'Your bag and spares.', onPick: () => this.openBack() },
      { label: 'Work on the bike', note: 'Repair and fit parts with your own tools.', onPick: () => void this.openWorkbench() },
      { label: 'Not now', onPick: () => this.player.idle() },
    ], () => this.player.idle());
  }

  private openBack(van: VanView | null = this.van): void {
    if (!van) return;
    van.setOpen(true);
    this.hud.openPanel('bag', () => {
      van.setOpen(false);
      this.player.idle();
    });
  }

  private getIn(): void {
    if (!this.van) return;
    this.path = [];
    this.onArrive = null;
    this.save.driving = true;
    this.player.stopWalking();
    this.sitInVan();
    const step = currentStep(services.content.story, this.save.career);
    if (step?.markVan && !this.save.flags[step.markVan]) {
      this.save.flags[step.markVan] = true;
      this.refreshWaymarks();
    }
    this.quickSave();
  }

  /** Steps out on the driver's side if it is clear, otherwise wherever there is room. The van stays put. */
  getOut(): void {
    const van = this.van;
    if (!van || !this.driving || this.walking || this.busy) return;
    const len = van.design.length;
    const t = exitTile(this.grid, van.pose, len, (c) => this.drive.isNpc(c.x, c.y) || !!stepTriggerAt(this.map, c));
    if (!t) {
      this.hud.toast("There's no room to get out here.");
      return;
    }
    this.moves = [];
    this.save.driving = false;
    van.setDriver(null);
    this.player.placeAt(t);
    const near = footprint(van.pose, len).reduce((a, c) => (dist(c, t) < dist(a, t) ? c : a));
    this.player.faceTowards({ x: 2 * t.x - near.x, y: 2 * t.y - near.y });
    this.player.sprite.setVisible(true);
    this.player.shadow.setVisible(true);
    this.player.idle();
    this.cameras.main.startFollow(this.player.sprite, true, 0.2, 0.2, 0, TILE / 2);
    this.hud.setDriving(false);
    this.quickSave();
  }

  /** Starts driving if the van is standing: it then asks for moves as it goes (see vanTrip). */
  private startDrive(): void {
    const van = this.van;
    if (!van || !this.driving) return;
    this.walking = true;
    van.drive(this.vanTrip);
  }

  /**
   * The scene's side of a drive. The next move comes from a clicked route, else from a held key
   * (ahead drives on, a side turns, back turns round or reverses where there's no room). Each move
   * is checked and booked on the grid when it is handed over; exits are checked as each one ends.
   */
  private readonly vanTrip: Driver = {
    next: () => {
      const van = this.van;
      if (!van || !this.driving || this.busy) return null;
      const len = van.design.length;
      let m = this.moves.shift() ?? null;
      if (!m) {
        const dir = this.heldDirection();
        if (!dir || this.outWhenStopped) return null;
        const want = HEADING_OF[['down', 'left', 'right', 'up'][STEPS.indexOf(dir)] as Facing];
        m = steer(this.drive, van.pose, len, want);
        if (!m) {
          this.bumpToast(dir, want);
          return null;
        }
      }
      this.occupyVan(false);
      if (!this.drive.fits(m.to, len)) {
        this.occupyVan(true);
        this.moves = [];
        return null;
      }
      for (const t of footprint(m.to, len)) this.grid.setOccupied(t, true);
      Object.assign(this.save.van!, m.to);
      this.player.placeAt(m.to);
      return m;
    },
    arrived: (m, from) => this.checkVanTrigger(footprint(from, this.van!.design.length), m.to),
    stopped: () => {
      this.walking = false;
      this.quickSave();
      if (this.outWhenStopped) {
        this.outWhenStopped = false;
        this.getOut();
      }
    },
  };

  /** Says why a held key didn't move the van, at most every 1.5 seconds. */
  private bumpToast(dir: Tile, want: Heading): void {
    const van = this.van!;
    const now = this.time.now;
    if (now - this.lastBumpToast < 1500) return;
    this.lastBumpToast = now;
    const ahead = footprint({ ...van.pose, x: van.pose.x + dir.x, y: van.pose.y + dir.y }, 1)[0];
    if (want === van.pose.heading && this.drive.isNpc(ahead.x, ahead.y)) this.hud.toast("Someone's in the way.");
    else if (want !== van.pose.heading) this.hud.toast(`No room to turn the ${van.design.name} here.`);
  }

  /** Clicks while driving: the van drives to the spot, or the rider gets out when the van itself is clicked. */
  private clickDriving(tile: Tile, wx: number, wy: number): void {
    const van = this.van!;
    if (footprint(van.pose, van.design.length).some((t) => t.x === tile.x && t.y === tile.y) || van.contains(wx, wy)) {
      if (!this.walking) this.getOut();
      return;
    }
    // A way out counts as reached on any of its tiles.
    const via = stepTriggerAt(this.map, tile);
    if (via?.type === 'exit' && footprint(van.pose, van.design.length).some((t) => stepTriggerAt(this.map, t) === via)) {
      // Already at it (turned back before, say to ask which way): try it again.
      const r = services.travel.resolve(this.map, via, this.save.flags);
      if (r) this.vanThrough(r);
      return;
    }
    const plan = planDrive(this.drive, van.pose, van.design.length, via?.type === 'exit' ? objectTiles(via, this.map.tileSize) : tile);
    // Parked in a bay it can't turn out of (the Factory Hauler at Riverside): out straight by the exit.
    const bay = bayFor(services.content.vehicles, this.map.id, van.design.length);
    if (!plan && via?.type === 'exit' && bay && bay.x === van.pose.x && bay.y === van.pose.y && bay.heading === van.pose.heading) {
      const r = services.travel.resolve(this.map, via, this.save.flags);
      if (r) this.vanThrough(r);
      return;
    }
    if (!plan) {
      this.hud.toast(`The ${van.design.name} can't get there.`);
      return;
    }
    this.markTarget(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2);
    this.moves = plan;
    this.startDrive();
  }

  /** Handles an exit under a tile the van has just moved onto. Returns true when it is leaving the map. */
  private checkVanTrigger(before: Tile[], to: VanPose): boolean {
    const van = this.van!;
    const fresh = footprint(to, van.design.length).filter((t) => !before.some((b) => b.x === t.x && b.y === t.y));
    for (const t of fresh) {
      const via = stepTriggerAt(this.map, t);
      if (!via || via.type !== 'exit') continue;
      const r = services.travel.resolve(this.map, via, this.save.flags);
      if (!r) continue;
      this.moves = [];
      return this.vanThrough(r);
    }
    return false;
  }

  /** Takes the van out by an exit it has reached, or says why it can't go. Returns true when leaving. */
  private vanThrough(r: NonNullable<StepResult>): boolean {
    if (r.kind === 'blocked') this.hud.toast(r.message);
    else if (r.kind === 'route') {
      let went = false;
      this.routeTo(r.via, (to) => { went = this.driveTo(to); });
      return went;
    } else return this.driveTo(r.to);
    return false;
  }

  /**
   * Takes the van to another map's arrival point: parked on the nearest free spot there, pointing
   * into the map. Returns false (and stays) when the van has nowhere to fit.
   */
  private driveTo(to: Arrival): boolean {
    const van = this.van!;
    const target = services.maps.get(to.map);
    const bay = target && bayFor(services.content.vehicles, target.id, van.design.length);
    // The Factory Hauler's spot over there is taken (setupHauler).
    const hauler = target && haulerAt(services.content.vehicles, this.save.flags, target.id, { design: van.design.id, map: target.id });
    const taken = new Set((hauler ? footprint(hauler.pose, hauler.design.length) : []).map((t) => `${t.x},${t.y}`));
    const pose = bay
      ? { x: bay.x, y: bay.y, heading: bay.heading }
      : target && placeNear(this.driveMapFor(target, van.design.length), to.tile, van.design.length, inwardHeading(target, to.tile), 12, (t) => !!stepTriggerAt(target, t) || taken.has(`${t.x},${t.y}`));
    if (!target || !pose) {
      this.hud.toast(`There's no room for the ${van.design.name} over there.`);
      return false;
    }
    this.save.van = { design: van.design.id, map: target.id, ...pose };
    this.leaveTo({ map: target.id, x: pose.x, y: pose.y, facing: FACING_OF[pose.heading] });
    return true;
  }

  /** Where a van can go on another map, with its story changes and NPCs, as the scene would build it. */
  private driveMapFor(map: BakedMap, length: number): DriveMap {
    const grid = Grid.fromMap(map);
    applyMapState(map, grid, this.save.flags);
    const dm = new DriveMap(map, grid, services.content.vehicles);
    dm.setVanLength(length);
    dm.setNpcTiles(npcsOnMap(services.content, map).map((p) => ({ x: p.x, y: p.y })));
    return dm;
  }

  // ---- routes ----

  /**
   * Where a route exit takes the rider, then `go` there: its only place straight away, otherwise the
   * road menu at the road itself. Returns true when it went straight away.
   */
  private routeTo(via: MapObject, go: (to: Arrival) => void): boolean {
    const to = routeArrival(this.map, via, services.content.world, services.maps, null, this.save.flags);
    if (typeof to === 'string') {
      this.hud.toast(to);
      return false;
    }
    if (!to.others.length) {
      go({ map: to.map, tile: to.tile });
      return true;
    }
    this.openRoad([to.place, ...to.others], go);
    return false;
  }

  /**
   * The road menu (Boss, 30 Oct 2026): Tracks, by type, with the unlocked tracks of each and the
   * unlocked championships (Enduro Sprint, EnduroCross and No-Turn Takedown say Coming soon);
   * Areas; Mod Tracks; Not now. Every menu under it has Back. Built from the road's places
   * (core/guides.ts roadMenu), with this map's own place shown as where you are.
   */
  private openRoad(places: PlaceDef[], go: (to: Arrival) => void): void {
    const rc = services.content;
    const here = rc.world.places.find((p) => p.map === this.map.id && !p.mods);
    const menu = roadMenu(here ? [here, ...places] : places, rc.tracks.venues, (id) => rc.tracks.tracks.find((t) => t.id === id)?.kind, this.save.flags);
    const done = () => {};
    const top = () => this.openRoad(places, go);
    // A track is a venue on its type's venue map (Boss, 30 Oct 2026): going there records which, for the gate and race office.
    const arrive = (p: PlaceDef | RoadStop) => {
      if ('venue' in p) this.save.career.venue = p.venue;
      go({ map: p.map, tile: spawnTile(services.maps.get(p.map)!, p.spawn!)! });
    };
    const atVenue = this.venueHere()?.id;
    const item = (p: PlaceDef | RoadStop) =>
      p.map === this.map.id && (!('venue' in p) || p.venue === atVenue) ? { label: p.name, note: "You're here.", enabled: false, onPick: done } : { label: p.name, note: p.note, onPick: () => arrive(p) };
    const champs = this.roadChampionships(arrive);
    const tracks = menu.tracks.reduce((n, t) => n + t.places.filter((p) => p.venue !== atVenue).length, 0);
    const areas = menu.areas.filter((p) => p.map !== this.map.id);
    const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

    const openTracks = (): void => {
      const back = top;
      // Just the type buttons, centred: the tracks are inside each type (Boss, 30 Oct 2026).
      const types = menu.tracks.map((t) => ({
        label: t.name,
        onPick: () =>
          t.comingSoon
            ? this.hud.choose(t.name, 'Coming soon.', [{ label: 'Back', onPick: openTracks }], openTracks, true)
            : this.roadList(t.name, t.places.length ? `${t.name} tracks you can ride.` : 'None unlocked yet.', t.places.map(item), openTracks),
      }));
      this.hud.choose('Tracks', '', [
        ...types,
        {
          label: 'Championship',
          onPick: () => this.roadList('Championship', champs.length ? 'Go to the track where its next round is. Enter rounds at the race office.' : 'None unlocked yet.', champs, openTracks),
        },
        { label: 'Back', onPick: back },
      ], back, true);
    };

    this.hud.choose('Where to?', 'Pick a track, another area, or a mod track.', [
      { label: 'Tracks', note: `${plural(tracks, 'track')} to go to${champs.length ? `, ${plural(champs.length, 'championship')}` : ''}.`, onPick: openTracks },
      { label: 'Areas', note: areas.length ? areas.map((p) => p.name).join(', ') : 'No other areas on this road.', enabled: areas.length > 0, onPick: () => this.roadList('Areas', 'Head into an area.', menu.areas.map(item), top) },
      ...(menu.mods ? [{ label: 'Mod Tracks', note: `${plural(services.modTracks.length, 'track')} installed or imported. Race one, or import a track file.`, onPick: () => this.openModTracks(0, top) }] : []),
      { label: 'Not now', onPick: done },
    ], done);
  }

  /** The unlocked championships, for the road menu: picking one goes to its next round's track. */
  private roadChampionships(arrive: (p: RoadStop) => void): { label: string; note: string; enabled?: boolean; onPick: () => void }[] {
    const rc = services.content;
    const career = this.save.career;
    return rc.championships.championships.flatMap((def) => {
      const active = career.champs?.active[def.id];
      if (!active && champProblem(rc, def, this.save.flags, career.bike.class)) return [];
      const venue = rc.tracks.venues.find((v) => v.id === (active ? nextRoundVenue(def, active) : def.rounds[0]));
      const place = venue && rc.world.places.find((p) => p.map === venue.map && p.spawn && services.maps.get(p.map) && spawnTile(services.maps.get(p.map)!, p.spawn));
      if (!venue || !place) return [];
      const n = active ? active.rounds.length + 1 : 1;
      const note = `${active ? 'Entered' : 'Not entered'}. Round ${n} of ${def.rounds.length} is at ${venue.name}.`;
      if (venue.id === this.venueHere()?.id) return [{ label: def.short, note: `${note} You're here: see the race office.`, enabled: false, onPick: () => {} }];
      return [{ label: def.short, note, onPick: () => arrive({ ...place, venue: venue.id }) }];
    });
  }

  /** A list on the road menu, a few to a page, with Back. */
  private roadList(title: string, text: string, items: { label: string; note?: string; enabled?: boolean; onPick: () => void }[], back: () => void, page = 0): void {
    const per = 4;
    const pages = Math.max(1, Math.ceil(items.length / per));
    page = Math.min(page, pages - 1);
    const options = items.slice(page * per, page * per + per);
    if (pages > 1) options.push({ label: page + 1 < pages ? 'More' : 'Back to the first', note: `Page ${page + 1} of ${pages}`, onPick: () => this.roadList(title, text, items, back, page + 1 < pages ? page + 1 : 0) });
    this.hud.choose(title, text, [...options, { label: 'Back', onPick: back }], back);
  }

  /** A small ring where the player clicked, so a click always shows a response. */
  private markTarget(x: number, y: number): void {
    const ring = this.add.ellipse(x, y + 8, 40, 18).setStrokeStyle(3, 0xe8dbb8, 0.9).setDepth(0.5);
    if (services.settings.get().accessibility.reducedEffects) {
      this.time.delayedCall(400, () => ring.destroy());
      return;
    }
    this.tweens.add({ targets: ring, scale: 0.4, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
  }

  // ---- walking ----

  private setPath(path: Tile[], onArrive: (() => void) | null): void {
    this.path = path;
    this.onArrive = onArrive;
    if (!this.walking) void this.walk([]);
  }

  /** Walks the queued path (or the given steps), checking doors and exits on every tile. */
  private async walk(steps: Tile[]): Promise<void> {
    if (steps.length) this.path = steps;
    this.walking = true;
    while (this.path.length) {
      const next = this.path.shift()!;
      if (!this.grid.canStep(this.player.tile, next)) {
        // Something moved into the way: re-plan to the same end tile.
        const end = this.path.at(-1) ?? next;
        this.path = findPathTowards(this.grid, this.player.tile, end);
        if (!this.path.length) break;
        continue;
      }
      // Moving along an exit (say, off it after being turned back) doesn't set it off again.
      const from = stepTriggerAt(this.map, this.player.tile);
      await this.player.step(next);
      this.walkedTile();
      if (from !== stepTriggerAt(this.map, this.player.tile) && this.checkTrigger()) {
        this.walking = false;
        return;
      }
      // Keep walking smoothly if a direction key is still held at the end of a keyboard step.
      if (!this.path.length && !this.onArrive) {
        const dir = this.heldDirection();
        const to = dir && { x: this.player.tile.x + dir.x, y: this.player.tile.y + dir.y };
        if (to && this.grid.canStep(this.player.tile, to)) this.path.push(to);
      }
    }
    this.walking = false;
    this.player.stopWalking();
    const done = this.onArrive;
    this.onArrive = null;
    done?.();
  }

  /** Agility for walking about (Spec 3.3): a little XP every few tiles, and a level-up says so. */
  private walkedTile(): void {
    const { training, skills } = services.content;
    const r = walked(training, skills, this.save.career.skills, this.walkCarry);
    this.walkCarry = r.carry;
    for (const u of r.ups) this.hud.toast(`Level up! ${u.name} is now level ${u.level}.`);
  }

  /** A Fitness drill (core/training.ts): its round in the HUD, XP for every round finished, saved after each. */
  private runDrill(drill: DrillDef, onClose: () => void = () => this.player.idle()): void {
    const skill = services.content.skills.leads.flatMap((l) => l.children).find((c) => c.id === drill.skill);
    const coach = drill.npc ? services.content.npcs.find((n) => n.id === drill.npc)?.sprite : undefined;
    const level = childLevel(services.content.skills, this.save.career.skills, drill.skill);
    this.hud.openDrill(drill, { player: this.save.rider.look, coach, level }, () => {
      const ups = finishRound(services.content.skills, this.save.career.skills, drill);
      this.hud.showCareer(this.save.career, this.save.flags);
      this.milestoneSave();
      return [`+${drill.xp} ${skill?.name ?? drill.skill} XP`, ...ups.map((u) => `Level up! ${u.name} is now level ${u.level}.`)];
    }, onClose);
  }

  /** Handles a door or exit under the player. Returns true when the player is leaving the map. */
  private checkTrigger(): boolean {
    const via = stepTriggerAt(this.map, this.player.tile);
    if (!via) return false;
    const r = services.travel.resolve(this.map, via, this.save.flags);
    if (!r) return false;
    if (r.kind === 'blocked') {
      this.path = [];
      this.onArrive = null;
      if (!this.offerHouse(via)) this.hud.toast(r.message);
      return false;
    }
    if (r.kind === 'route') {
      const go = (to: Arrival) => this.leaveTo({ map: to.map, x: to.tile.x, y: to.tile.y, facing: 'up' });
      if (this.routeTo(via, go)) return true;
      this.path = [];
      this.onArrive = null;
      return false;
    }
    const entering = this.map.kind === 'area' && via.type === 'door';
    this.leaveTo({ map: r.to.map, x: r.to.tile.x, y: r.to.tile.y, facing: entering ? 'up' : 'down' }, entering);
    return true;
  }

  /** Fades out and loads another map. Leaving ends any shift; the parts made are already paid. */
  private leaveTo(position: SaveData['position'], entering = false): void {
    if (this.shift) this.endShift(`Shift ended: ${this.shift.made} ${this.shift.job.product}s made.`);
    this.busy = true;
    this.path = [];
    this.moves = [];
    this.player.stopWalking();
    this.save.position = position;
    this.cameras.main.fadeOut(200, 20, 20, 30);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.zoomForMapChange(entering);
      this.scene.restart({ save: this.save });
    });
  }

  // ---- saving ----

  private snapshot(): SaveData {
    if (this.driving && this.van) {
      const v = this.van.pose;
      return { ...this.save, position: { map: this.map.id, x: v.x, y: v.y, facing: FACING_OF[v.heading] } };
    }
    const p = this.player?.tile ?? this.save.position;
    return { ...this.save, position: { map: this.map.id, x: p.x, y: p.y, facing: this.player?.facing ?? 'down' } };
  }

  /** Saves the current spot without rotating backups. */
  private quickSave(): void {
    try {
      this.save = services.saves.update(CAREER_SLOT, this.snapshot());
    } catch {
      // Storage full or blocked: the timed autosave reports it.
    }
  }

  private writeSave(): void {
    this.save = services.saves.write(CAREER_SLOT, this.snapshot());
  }

  /** Autosave at milestones such as a finished task or batch (Spec 21b). */
  private milestoneSave(): void {
    try {
      this.writeSave();
      this.hud.saveIndicator('Autosaved');
    } catch {
      this.hud.toast('Saving failed: storage is full or blocked.');
    }
  }

  private autosave(reason: 'timer' | 'manual'): void {
    if (reason === 'timer' && (this.busy || this.hud.isDialogueOpen() || this.scene.isPaused())) return;
    try {
      this.writeSave();
      this.hud.saveIndicator(reason === 'manual' ? 'Game saved' : 'Autosaved');
    } catch {
      this.hud.toast('Saving failed: storage is full or blocked.');
    }
  }

  saveNow(): void {
    this.autosave('manual');
  }

  openPause(): void {
    if (this.busy || this.hud.isDialogueOpen()) return;
    this.hud.openPause();
  }

  quitToMenu(): void {
    this.writeSave();
    this.scene.stop('hud');
    this.scene.start('menu');
  }
}

function dist(a: Tile, b: Tile): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
