import { isSupercross } from '../core/supercross';
import { passengerEntry, passengerPracticeFee, passengerTrack, type PassengerTerms } from '../core/passenger';
import Phaser from 'phaser';
import { advanceStory, bikeProblem, catchUp, currentStep, earlyStep, hearEarly, fillText, formatMoney, batchPay, jobPay, matchStory, openChains, pence, wholePounds, type JobDef, type PlaceDef, type StoryEvent, type StoryStep } from '../core/career';
import { newsRead, npcsOnMap, properName, type DialogueLine, type NpcDef, type NpcPlacement } from '../core/content';
import { Grid, STEPS } from '../core/grid';
import { objectTiles, type BakedMap, type Facing, type MapObject, type Tile } from '../core/mapTypes';
import { findPathToAny, findPathTowards, standingTiles } from '../core/pathfinding';
import { saveFileName, saveFileText, type SaveData } from '../core/saves';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../core/settings';
import { applyMapState, clearedPatches, hiddenSprites } from '../core/mapState';
import { placeArrival, roadMenu, routeArrival, routeFor, sideOf, venueHere, type RoadStop } from '../core/guides';
import { earning, goalObjects, hopsTo, nextHop, storyGoals } from '../core/waymarks';
import { biggestBike, bikeImage, zoneFor } from '../core/worldMap';
import { ROUTE, spawnTile, stepTriggerAt, triggerTilesToAvoid, type Arrival, type StepResult } from '../core/travel';
import { areaFlag, areaName, areaOfMap, buyHouse, buyMotor, houseFlag, motorProblem, openAreas, openReleasedAreas, roadWaiting, soldTexture } from '../core/areas';
import { defaultSetup, effectiveSetup, positionValue, positionsFor, setupReport, sliderUnlocked, type SliderDef } from '../core/setup';
import { DriveMap, FACING_OF, ON_FOOT, needsMotor, bayFor, driveLeavesBy, ensureVan, exitTile, footprint, arrivalPose, haulerAt, nearestFree, placeNear, planDrive, sheetFor, steer, HEADING_OF, type Heading, type Move, type VanDesign, type VanPose } from '../core/vehicles';
import { forgetImport, keepImport, loadModTracks, modVenue, readModTrack, type ModTrack } from '../core/modTracks';
import { isNoTurn } from '../core/trackGeom';
import { venueClassFor, entryFee, fieldCount, lapsFor, practiceFee, coachedFee, trackById, venueProblem, type VenueDef } from '../core/raceDay';
import { champProblem, otherActive, enter, nextRoundVenue, nextRoundVenues, rewardTexture, roundEntry, roundsHere, standings, titlePossible, withdraw, type ChampionshipDef } from '../core/championship';
import { noteActivity, shopForAction, slotName, type ShopDef } from '../core/shops';
import { machineFee, machineProblem, modsLabel, rollBatchMods, runMachine } from '../core/modifiers';
import { dayObjectives, dropPenalty, dropSponsor, objectiveText, offerProblem, reputationHint, signOffer, sponsorsOpen } from '../core/sponsors';
import { awardOutfit, buyOutfit, legendsPickDue, pickOptions, type OutfitDef, outfitProblem, outfitSheet, ownsOutfit, rackOpen, shownLook, storageLimit, storeSpare, stored, takeSpare, wearOutfit, wornOutfit } from '../core/house';
import { errandStage, finishErrand, takeErrand, type ErrandDef } from '../core/errands';
import { challengeReady, challengeVenue, lossHint, type ChallengeDef } from '../core/challenge';
import { drillForAction, drillsForNpc, drillsAtVenue, finishRound, walked, type DrillDef } from '../core/training';
import { finishBatch, finishPass, openJobAt, passXp, startJob } from '../core/jobs';
import { className } from '../core/classes';
import { ticketJob, ticketProblem, ticketsOffered, type BoardDef, type Ticket } from '../core/jobBoard';
import { childLevel } from '../core/skills';
import { leadLevel } from '../core/skills';
import { challengeWins } from '../core/records';
import { CAREER_SLOT, services } from '../services';
import { backupDue, lastBackup, markBackup } from '../core/backup';
import { giveFile } from '../ui/files';
import { Character, TILE } from '../world/Character';
import { MapView, OVERHEAD_DEPTH, isMapCached, loadMapImages } from '../world/MapView';
import { actionMessage, actionName } from '../world/messages';
import { Waymarks, clusters, middle, type Mark } from '../world/Waymarks';
import { DPR, HUD_BAR } from '../ui/view';
import { standLift } from '../world/standLift';
import { VanView, type Driver, type VanLoad } from '../world/VanView';
import { modelFor } from '../world/raceBike';
import type { ChooseOption, HudScene } from './HudScene';
import { TASK_MARK } from '../ui/widgets';
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
  /** The way out a clicked drive is heading for (null: somewhere else), or 'any' when steering by key. */
  private driveGoal: MapObject | null | 'any' = 'any';
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
  /** A house the rider owns loses its For Sale sign (Boss, 2 Nov 2026): its sold patch over the house front. */
  private drawSoldHouses(map: BakedMap): void {
    for (const a of services.content.areas.areas) {
      const sold = a.house?.sold;
      if (a.map !== map.id || !sold || !this.save.flags[houseFlag(a.n)] || !this.textures.exists(soldTexture(sold.image))) continue;
      const b = map.objects.find((o) => o.type === 'building' && o.name === a.house!.door);
      const front = b && map.sprites.find((s) => s.x === b.x && s.y === b.y);
      if (!b || !front) continue;
      this.add.image(b.x + sold.at[0], b.y + sold.at[1], soldTexture(sold.image)).setOrigin(0).setDepth(front.depth + 0.01);
    }
  }

  /** The rider's sheet as drawn: their kit in the current bike's brand colours (core/house.ts shownLook). */
  look(): string {
    return shownLook(this.save.rider.look, this.save.career.bike.brand, (s) => !!services.manifest.characters.sheets[s]);
  }

  /** The road the road menu was opened from: where a town is picked on it, the rider comes in (placeArrival). */
  private roadVia: MapObject | null = null;
  /** The maps the task's markers lead to, for the road menu's "!" (Boss, 2 Nov 2026). */
  private goalMaps: string[] = [];
  /** The news NPCs' bubbles (Manny Festo), kept apart from the story markers. */
  private newsMarks!: Waymarks;
  /** NPCs here that the story marker is over: their news bubble stays off so they don't wear two "!" (Boss, 4 Nov 2026). */
  private storyNpcs = new Set<string>();
  /** The tutorial marker the screen-edge arrow points to while it is off screen, in world pixels. */
  private markPoint: { x: number; y: number; label: string; sub?: string } | null = null;
  private markEarning = false;

  constructor() {
    super('world');
  }

  init(data: WorldData): void {
    this.save = structuredClone(data.save);
    // A build that releases more areas (areas.json release) opens the ones already won the way into.
    openReleasedAreas(services.content.areas, services.content.championships, this.save.career, this.save.flags);
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
    // Where the rider's head is on screen, for the bank note shown when money comes in.
    this.hud.headAt = () => {
      if (!this.player || !this.scene.isActive()) return null;
      const cam = this.cameras.main;
      // The van's top while driving, for a speech note over it.
      const b = (this.save.driving && this.van ? this.van.sprite : this.player.sprite).getBounds();
      return { x: ((b.centerX - cam.worldView.x) * cam.zoom) / DPR, y: ((b.top - cam.worldView.y) * cam.zoom) / DPR, feet: ((b.bottom - cam.worldView.y) * cam.zoom) / DPR };
    };
    this.cameras.main.setBackgroundColor('#14141e');

    const firstVisit = !isMapCached(this, map);
    const started = performance.now();
    await loadMapImages(this, map);
    new MapView(this, map, hiddenSprites(map, this.save.flags), clearedPatches(map, this.save.flags));
    this.drawSoldHouses(map);
    if (firstVisit) console.info(`Map ${map.id}: first visit ${Math.round(performance.now() - started)} ms`);
    else console.info(`Map ${map.id}: cached visit ${Math.round(performance.now() - started)} ms`);

    this.grid = Grid.fromMap(map);
    applyMapState(map, this.grid, this.save.flags);
    for (const p of npcsOnMap(services.content, map, this.save.flags, currentStep(services.content.story, this.save.career)?.on.talk)) {
      // NPCs don't block the way: walking past (not clicking them) goes straight through.
      const character = new Character(this, p.npc.sprite, p, p.facing);
      // Standing on the paving, not the kerb or road below it.
      character.placeAt(p, standLift(map, p.x, p.y));
      character.showName(p.npc.name);
      if (p.npc.booth) character.inBooth(...p.npc.booth);
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
    this.player = new Character(this, this.look(), { x, y }, facing);
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
    // Back from winning the Legends Championship: pick a legend kit, once (Boss, 5 Nov 2026).
    const house = services.content.house;
    if (house.picks && legendsPickDue(house, this.save.flags)) {
      const kits = pickOptions(house, house.picks.legends.outfits, this.save.rider);
      this.save.flags[house.picks.legends.done] = true;
      this.milestoneSave();
      if (kits.length) this.time.delayedCall(400, () => this.pickOutfit('Legends champion', 'The Legends trophy is yours, and so is a legend kit. Pick the design you want.', kits, () => {}));
    }
    this.events.once('shutdown', () => this.hud.showWayArrow(null));

    this.setupInput();
    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: () => this.autosave('timer') });
    this.hud.showMapTitle(map.title, map.id);
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
    this.bindMoveKeys();
    // A rebind in Settings > Controls takes effect at once (Boss, 5 Nov 2026).
    const unbind = services.settings.onChange(() => this.bindMoveKeys());
    this.events.once('shutdown', unbind);
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

  /** A pick of one outfit from a set (sponsor kits, legend kits): it hangs in the wardrobe. */
  private pickOutfit(title: string, text: string, outfits: OutfitDef[], then: () => void): void {
    const pick = (o: OutfitDef) => {
      const r = awardOutfit(o, this.save.rider);
      this.hud.toast(r.ok ? `${o.name}: yours. Put it on at the wardrobe.` : r.message);
      this.milestoneSave();
      then();
    };
    this.hud.choose(title, text, outfits.map((o) => ({ label: o.name, note: o.desc, onPick: () => pick(o) })), () => pick(outfits[0]));
  }

  /** The walking keys: the arrows, and the four picked in Settings > Controls. */
  private bindMoveKeys(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
    const c = services.settings.get().controls;
    if (this.keys) for (const k of Object.values(this.keys)) kb.removeKey(k, true, true);
    this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K[c.up], a: K[c.left], s: K[c.down], d: K[c.right] }) as typeof this.keys;
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
    // A click on a way out walks to whichever of its tiles is nearest: stepping on any of them leaves.
    const via = stepTriggerAt(this.map, tile);
    const ways = via ? objectTiles(via, this.map.tileSize) : [tile];
    const path = this.planWalk(ways, () => (via && findPathToAny(this.grid, this.player.tile, ways)) || findPathTowards(this.grid, this.player.tile, tile));
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
      // A wall-hung thing (job board, standings poster) is drawn on the wall above the tile you use it
      // from, so a click on its picture counts too, not only on the floor in front of it (Boss, 4 Nov 2026).
      const onPicture = o.props.on_wall === true && tiles.some((t) => t.x === tile.x && t.y - 1 === tile.y);
      if (onPicture || tiles.some((t) => t.x === tile.x && t.y === tile.y)) {
        // A building someone works in (the gym, a practice kiosk) is a way to them (Boss, 4 Nov 2026).
        const n = o.type === 'click' ? this.buildingNpc(o) : undefined;
        return n ? { kind: 'npc', placement: n.placement, character: n.character } : { kind: 'object', object: o, tiles };
      }
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

  /**
   * Plans a walk that keeps off every door and way out except the ones aimed for (Boss, 4 Nov 2026:
   * leaving Phoenix MX with the motor out front, a click on the next shop walked back in through the
   * door). Falls back to any way when the only one is through a door.
   */
  private planWalk<T extends Tile[] | null>(goals: Tile[], plan: () => T): T {
    const triggers = triggerTilesToAvoid(this.map, [...goals, this.player.tile]);
    const kept = this.grid.avoiding(triggers, plan);
    return kept && kept.length ? kept : plan();
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
    const ends = goals.length ? goals : walkable;
    const path = this.planWalk([...ends, ...tiles], () => findPathToAny(this.grid, here, ends));
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
    const named = o.type === 'venue' ? services.content.tracks.venues.find((v) => v.id === o.props.venue) : undefined;
    // A race venue's gate is for whichever track the rider came here for (one venue map per track type).
    const venue = named && !named.practiceOnly ? this.venueHere() : named;
    const drills = o.type === 'venue' && !venue ? drillsAtVenue(services.content.training, String(o.props.venue)) : [];
    if (drills.length) return this.chooseDrill(o.name, drills);
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
      const how = needsMotor(this.save.van, this.map.id, this.driving) ? 'drive' : 'walk';
      this.hud.toast(lock ? lock.message : `${o.name}: ${how} out onto the road to pick where to go.`);
      return;
    }
    // A shift or job board station says what it's for, not "Nothing to do here" (Boss, 6 Nov 2026).
    const station = o.type === 'interact' ? this.stationUse(o) : null;
    const msg = station ?? actionMessage(o, this.save.flags);
    if (msg) this.hud.toast(msg);
  }

  /** What a shift or job board station is for, when no shift or job is running, or null if it isn't one. */
  private stationUse(o: MapObject): string | null {
    const here = (j: { map: string; stations: { object: string }[] }) => j.map === this.map.id && j.stations.some((s) => s.object === o.name);
    const job = services.content.world.jobs.find(here);
    const board = job ? undefined : services.content.jobboard.boards.find(here);
    const what = job ? `the ${job.name}` : (board ? `jobs from the ${board.name}` : null);
    return what ? `${o.name.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}: used for ${what}.` : null;
  }

  /** A menu of drills: pick one to run. Every round counts, whatever the score. */
  private chooseDrill(title: string, drills: DrillDef[], onClose: () => void = () => this.player.idle()): void {
    const skillName = (id: string) => services.content.skills.leads.flatMap((l) => l.children).find((c) => c.id === id)?.name ?? id;
    this.hud.choose(title, 'Pick a drill. Every round counts, whatever the score.', [
      ...drills.map((d) => ({ label: d.name, note: `${skillName(d.skill)} XP every round.`, onPick: () => this.runDrill(d, onClose) })),
      { label: 'Not now', onPick: onClose },
    ], onClose);
  }

  /** Who works in a building with no way in, by its blueprint's npc (the gym coach, the practice coach in the kiosk), if they're here. */
  private buildingNpc(o: MapObject): { placement: NpcPlacement; character: Character } | undefined {
    const building = this.map.objects.find((b) => b.type === 'building' && b.props.blueprint === o.props.building);
    const who = typeof building?.props.npc === 'string' ? building.props.npc : null;
    return who ? this.npcs.find((c) => c.placement.npc.name === who) : undefined;
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
      // The news can move on with the story (talk rules: Area 3's date once Area 2 is won, Boss, 1 Nov 2026).
      const rule = this.talkRule(npc);
      const news = rule?.dialogue ?? npc.dialogue;
      this.say(npc.name, news, () => {
        const read = newsRead(news);
        if (!this.save.flags[read]) {
          this.save.flags[read] = true;
          this.refreshNews();
          // Reading the news can be the task (Manny's Area 3 news): the task line and markers move on.
          this.hud.showCareer(this.save.career, this.save.flags);
          this.refreshWaymarks();
          this.quickSave();
        }
        this.faceBack(placement, character);
        // Manny opens the road to the next area (areas.ts roadFlag, Boss, 2 Nov 2026).
        if (rule?.sets && !this.save.flags[rule.sets]) this.storyFlag(rule.sets);
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
        if (hello.sets && !this.save.flags[hello.sets]) this.storyFlag(hello.sets);
        open();
      });
      return;
    }
    const back = () => this.faceBack(placement, character);
    if (npc.trainer) return this.trainerTalk(npc, npc.trainer, back);
    if (npc.sidecar) return this.sidecarTalk(npc, npc.sidecar, back);
    const rule = this.talkRule(npc);
    const { challenges, errands } = services.content;
    const challenge = challenges.challenges.find((d) => d.npc === npc.id && (!d.needs || this.save.flags[d.needs]));
    if (challenge && !rule) return this.challengeTalk(npc, challenge, back);
    const errand = errands.errands.find((d) => d.npc === npc.id && (!d.needs || this.save.flags[d.needs]));
    if (errand && !rule) return this.errandTalk(npc, errand, back);
    // A coach runs their drills (Tasha's running, every gym and practice yard coach; Boss, 4 Nov 2026:
    // "the gym coach should start the mini game, not some weird hit box"): one is run straight away,
    // several are offered on a menu.
    const drills = drillsForNpc(services.content.training, npc.id);
    if (drills.length && !rule) return this.say(npc.name, npc.dialogue, () => (drills.length === 1 ? this.runDrill(drills[0], back) : this.chooseDrill(npc.name, drills, back)));
    if (!rule && this.offerMotor(npc, back)) return;
    const shop = services.content.shops.shops.find((s) => s.npc === npc.id);
    if (shop && !rule && services.content.house.rack.shops.includes(shop.id) && (!shop.needs || this.save.flags[shop.needs])) return this.offerRack(npc, shop, back);
    if (shop && !rule && this.openShop(shop, 'buy', back)) return;
    this.say(npc.name, rule?.dialogue ?? npc.dialogue, () => {
      // A one-off talk (the mechanic's advice after the opening chain): said once, then the NPC's usual lines.
      const once = !!rule?.sets && !this.save.flags[rule.sets];
      if (once) this.storyFlag(rule!.sets!);
      // A shop's one-off talk then opens the shop (Bill after a championship: the new bike, Boss, 2 Nov 2026).
      if (once && shop && this.openShop(shop, 'buy', back)) return;
      back();
    });
  }

  /**
   * A trainer at the track (Big Pete, Boss, 1 Nov 2026): a coached practice here, at feeTimes the
   * practice fee for xpTimes the practice XP.
   */
  private trainerTalk(npc: NpcDef, trainer: NonNullable<NpcDef['trainer']>, back: () => void): void {
    const rc = services.content;
    const venue = this.venueHere();
    const problem = venue && venueProblem(rc, venue, this.save.career, this.save.flags);
    this.say(npc.name, this.talkRule(npc)?.dialogue ?? npc.dialogue, () => {
      if (!venue || venue.practiceOnly || problem) {
        if (problem) this.hud.toast(problem);
        return back();
      }
      const fee = coachedFee(practiceFee(rc, venue, venueClassFor(rc, venue, this.save.career)), trainer);
      const short = this.save.career.money < fee;
      const bonus = Math.round((trainer.xpTimes - 1) * 100);
      this.hud.choose(npc.name, `Practice at ${venue.name} with me watching. I don't come cheap, but you'll learn more.`, [
        { label: `Practice with ${npc.name}`, note: `${formatMoney(fee)}: ride laps until you stop, +${bonus}% practice XP.${short ? " You can't afford it." : ''}`, enabled: !short, onPick: () => this.ride('practice', venue, fee, back, undefined, undefined, { name: npc.name, xpTimes: trainer.xpTimes }) },
        { label: 'Not now', onPick: back },
      ], back);
    });
  }

  /**
   * A sidecar rider at the track (Ray Crispy, Boss, 4 Nov 2026; core/passenger.ts): ride in his chair
   * for practice or a race day, or enter and race the area's sidecar championship. It's his outfit,
   * so the rider's own bike doesn't matter; entries cost feeTimes a solo one and he keeps his share
   * of the prizes.
   */
  private sidecarTalk(npc: NpcDef, terms: PassengerTerms, back: () => void): void {
    this.say(npc.name, this.talkRule(npc)?.dialogue ?? npc.dialogue, () => this.sidecarMenu(npc, terms, back));
  }

  private sidecarMenu(npc: NpcDef, terms: PassengerTerms, back: () => void): void {
    const rc = services.content;
    const career = this.save.career;
    const venue = this.venueHere();
    const track = venue?.track ? trackById(rc, venue.track) : undefined;
    if (!venue || !track || venue.practiceOnly || venue.locked || !passengerTrack(track) || (venue.needs && !this.save.flags[venue.needs])) {
      this.hud.toast(`${npc.name} only races here once the track is open to you.`);
      return back();
    }
    const passenger = { rider: npc.name, terms };
    const raceFee = passengerEntry(rc, venue, terms);
    const practice = passengerPracticeFee(rc, venue, terms);
    const short = (f: number) => career.money < f;
    const afford = (f: number) => (short(f) ? " You can't afford it." : '');
    // The Sidecar Series raced here (Boss's sheet, 4 Nov 2026: one track can be in several). The one
    // you're in comes first, so its round here is the one offered.
    const defs = rc.championships.championships.filter((d) => d.sidecar && d.rounds.includes(venue.id)).sort((x, y) => +!!career.champs?.active[y.id] - +!!career.champs?.active[x.id]);
    const def = defs[0];
    const active = def && career.champs?.active[def.id];
    const roundHere = !!def && !!active && nextRoundVenue(def, active) === venue.id;
    const roundFee = def ? wholePounds(raceFee * def.entryTimes) : 0;
    const share = `${Math.round(terms.prizeShare * 100)}% of the prize money`;
    const laps = lapsFor(rc, track, venue.class ?? '50cc', false);
    this.hud.choose(npc.name, `You ride in my chair at ${venue.name}: my outfit, so no wear on your bike, and you work harder than on your own bike, so you learn more fitness (+${Math.round((terms.fitnessXpTimes - 1) * 100)}% fitness XP). You get ${share}.`, [
      ...(roundHere ? [{ label: `${def!.short} round ${active!.rounds.length + 1}`, note: `Entry: ${formatMoney(roundFee)}.${afford(roundFee)} 2 motos against the championship's ${def!.size + 1} outfits.`, enabled: !short(roundFee), onPick: () => this.ride('raceday', venue, roundFee, back, def, undefined, undefined, passenger) }] : []),
      roundHere
        ? { label: 'Sidecar race day', note: 'Not today: our championship round is on here.', enabled: false, onPick: back }
        : { label: 'Sidecar race day', note: `Entry: ${formatMoney(raceFee)}.${afford(raceFee)} 8 outfits, 2 motos of ${laps} laps.`, enabled: !short(raceFee), onPick: () => this.ride('raceday', venue, raceFee, back, undefined, undefined, undefined, passenger) },
      { label: 'Sidecar practice', note: `${formatMoney(practice)}: ride laps in the chair until you stop.${afford(practice)}`, enabled: !short(practice), onPick: () => this.ride('practice', venue, practice, back, undefined, undefined, undefined, passenger) },
      ...(defs.length === 1
        ? [{ label: 'Sidecar championship', note: active ? `${def.short}: round ${active.rounds.length + 1} of ${def.rounds.length} next.` : `Enter the ${def.short}, or see what it pays.`, onPick: () => this.sidecarChampionship(npc, terms, def, back) }]
        : defs.length
          ? [{ label: 'Sidecar championships', note: active ? `${def.short}: round ${active.rounds.length + 1} of ${def.rounds.length} next.` : `${defs.length} race here: enter one, or see what they pay.`, onPick: () => this.hud.choose('Sidecar championships', 'Which one?', [
            ...defs.map((d) => {
              const a = career.champs?.active[d.id];
              return { label: d.short, note: a ? `Round ${a.rounds.length + 1} of ${d.rounds.length} next.` : `${d.rounds.length} rounds.${champProblem(rc, d, this.save.flags) ? ' Not open to you yet.' : ''}`, onPick: () => this.sidecarChampionship(npc, terms, d, back) };
            }),
            { label: 'Back', onPick: () => this.sidecarMenu(npc, terms, back) },
          ], () => this.sidecarMenu(npc, terms, back)) }]
          : []),
      { label: 'Not now', onPick: back },
    ], back);
  }

  /** The area's sidecar championship, through Ray: enter it, or see the standings and give it up. */
  private sidecarChampionship(npc: NpcDef, terms: PassengerTerms, def: ChampionshipDef, back: () => void): void {
    const rc = services.content;
    const career = this.save.career;
    const active = career.champs?.active[def.id];
    const menu = () => this.sidecarMenu(npc, terms, back);
    const venues = def.rounds.map((v) => rc.tracks.venues.find((x) => x.id === v));
    const rounds = venues.map((v, i) => `${i + 1}. ${v?.name ?? def.rounds[i]}`).join('   ');
    if (!active) {
      const other = otherActive(rc.championships, career, def);
      const problem = other ? `You're in the ${other.name} with me: finish it or give it up first.` : champProblem(rc, def, this.save.flags);
      const reward = def.rewards[0];
      const fee = venues[0] ? wholePounds(passengerEntry(rc, venues[0], terms) * def.entryTimes) : 0;
      const record = career.champs?.done[def.id];
      this.hud.choose(def.name, [
        `${def.rounds.length} rounds: ${rounds}`,
        `${def.size + 1} outfits, the same at every round, points for every moto. About ${formatMoney(fee)} a round in entry, and you keep ${Math.round(terms.prizeShare * 100)}% of the prizes.${record?.wins ? ' Won before: half prize money and XP.' : ''}`,
        `The winners take ${reward.title ?? 'the title'}${reward.money ? `, and your share of the prize is £${reward.money}` : ''}; 2nd and 3rd win a smaller prize.`,
      ].join('\n\n'), [
        problem
          ? { label: 'Enter', note: problem, enabled: false, onPick: menu }
          : { label: 'Enter', note: 'Free to enter: you pay each round\'s entry when you ride it.', onPick: () => {
            enter(career, rc, def, (Math.random() * 2 ** 32) >>> 0);
            this.milestoneSave();
            this.hud.news(`Entered the ${def.name} with ${npc.name}. Round 1 is at ${venues[0]?.name}.`);
            menu();
          } },
        { label: 'Back', onPick: menu },
      ], menu);
      return;
    }
    const table = standings(rc.racing.points, active);
    const name = (id: string) => (id === 'player' ? `You and ${npc.name}` : rc.riders.riders.find((r) => r.id === id)?.name ?? id);
    const me = table.find((r) => r.player)!;
    const top = table.slice(0, 5).map((r) => `${r.position}. ${name(r.id)}  ${r.points}`);
    if (me.position > 5) top.push(`${me.position}. ${name('player')}  ${me.points}`);
    const next = rc.tracks.venues.find((v) => v.id === nextRoundVenue(def, active));
    const giveUp = () => this.hud.confirm(`Give up the ${def.name}?\nYour points so far are lost. You can enter again later.`, 'Give it up', () => {
      withdraw(career, def);
      this.milestoneSave();
      this.hud.news(`You gave up the ${def.name}.`);
      menu();
    }, () => this.sidecarChampionship(npc, terms, def, back));
    this.hud.choose(def.name, [
      `Rounds: ${rounds}`,
      active.rounds.length ? `After round ${active.rounds.length}:\n${top.join('\n')}` : 'No rounds ridden yet.',
      `Next: round ${active.rounds.length + 1} at ${next?.name}. Find me there, next to Big Pete.`,
    ].join('\n\n'), [
      { label: 'Give it up', note: 'Leave the championship. You can enter again later, from round 1.', onPick: giveUp },
      { label: 'Back', onPick: menu },
    ], menu);
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
      if (message) this.hud.toast(message);
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
        // Paid: the bank note over the head says it, with no message on top (Boss, 2 Nov 2026).
        saved(r.ok ? '' : r.message);
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
    // What was bought can finish the task (Bill's new bike, Boss 2 Nov 2026: his bubble stayed up): markers and task line again on close.
    this.hud.openShop(shop, tab, () => {
      this.refreshWaymarks();
      // A new bike of another brand: the kit's colours follow it.
      this.player.setSheet(this.look());
      this.hud.showCareer(this.save.career, this.save.flags);
      onClose();
    });
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

  /**
   * Sets a flag a talk gives: the task line and markers move on, an area opened starts its intro,
   * and a map with things shown or hidden by flags (the road's barrier) is drawn again.
   */
  private storyFlag(flag: string): void {
    this.save.flags[flag] = true;
    this.hud.showCareer(this.save.career, this.save.flags);
    this.refreshWaymarks();
    this.refreshNews();
    this.milestoneSave();
    // Only an area opening changes what a map shows (the barrier on its road); a reload would cut off a shop or office opening next.
    if (flag.startsWith('area.')) this.refreshMapState();
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
      // Bought: the −£ note says it, with no message (Boss, 2 Nov 2026). A refusal still says why.
      if (!r.ok) return void this.hud.toast(r.message);
      this.hud.showCareer(career, this.save.flags);
      this.refreshMapState();
      this.drawSoldHouses(this.map);
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
        // Bought: the −£ note says it (Boss, 2 Nov 2026); only where the new motor is parked gets a message.
        if (!r.ok) this.hud.toast(r.message);
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
    if (!m) {
      // A later step that is just lines plays now, and the chain won't send the rider back for it (Boss, 1 Nov 2026).
      const early = earlyStep(story, career, ev);
      if (!early) return false;
      onStart();
      hearEarly(story, career, early);
      this.say(speaker, early.lines!, onClose);
      return true;
    }
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
      // Steps already heard early come off the chain now, their effects with them.
      const caught = completed ? catchUp(story, career, this.save.flags, items) : [];
      this.hud.showCareer(career, this.save.flags);
      const show = () => {
        onClose();
        this.refreshWaymarks();
        if (!completed) return;
        // Money shows as the bank note over your head (HudScene.moneyNote), not along the bottom.
        for (const s of [step, ...caught]) if (s.toast) this.hud.news(s.toast);
        if ([step, ...caught].some((s) => s.effects?.flags?.length)) this.refreshMapState();
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
      .filter((n) => n.placement.npc.news && !this.storyNpcs.has(n.placement.npc.id) && (!n.placement.npc.quietUntil || this.save.flags[n.placement.npc.quietUntil]))
      .map((n) => ({ kind: 'news', x: n.character.sprite.x, y: n.character.sprite.y, fresh: !this.save.flags[newsRead(this.talkRule(n.placement.npc)?.dialogue ?? n.placement.npc.dialogue)] }));
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
    for (const c of openChains(services.content.story, career, this.save.flags)) this.hud.news(`${services.content.areas.areas.find((a) => a.intro === c.id)?.name ?? 'A new area'}: a new task.`);
    this.markEarning = earning(services.content, career);
    const goals = storyGoals(services.content, services.maps, career, this.save.flags, this.save.van ?? null, this.map.id);
    this.goalMaps = goals.map((g) => g.map);
    this.storyNpcs = new Set(goals.flatMap((g) => (g.map === this.map.id && g.kind === 'npc' ? [g.npc] : [])));
    if (this.newsMarks) this.refreshNews();
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
        const objs = goalObjects(this.map, goal.action, career.story.used, services.content.training).map((o) => objectTiles(o, ts));
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
        // On foot with the motor parked here, a road out starts at the motor (Boss, 2 Nov 2026: no walking between areas and venues).
        if (hop.kind === 'exit' && hop.via[0].props.to === ROUTE && this.van && needsMotor(this.save.van, this.map.id, this.driving)) {
          const tiles = footprint(this.van.pose, this.van.design.length);
          marks.push({ kind: 'object', tiles });
          points.push({ ...middle(tiles), label: this.van.design.name, sub: services.maps.get(hop.to)?.title });
          continue;
        }
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
        this.hud.flashShift();
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
    // Money is whole pounds (Boss, 2 Nov 2026), so the offer gives the batch's pay, not the pence a part.
    const pay = formatMoney(batchPay(services.content.world, job));
    const skills = services.content.skills.leads.flatMap((l) => l.children);
    const xp = Object.entries(passXp(job)).map(([id, n]) => `${n} ${skills.find((c) => c.id === id)?.name ?? id}`).join(', ');
    const keeps = job.keeps ? ` Finish the batch and one ${job.keeps.length === 1 ? slotName(services.content.bikes, job.keeps[0]) : 'part'} is yours to keep.` : '';
    const text = open
      ? `${job.name}: carry on your batch, ${open.made} of ${job.batch} ${job.product}s made, ${pay} for the whole batch.${keeps}`
      : `${job.name}: make a batch of ${job.batch} ${job.product}s for ${pay}, with ${xp} XP every part.\nYou're paid as you go, even if you stop early, and the batch waits for you.${keeps}`;
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
      this.hud.flashShift();
    };
    if (open?.ticket) {
      const job = ticketJob(board, tools, bikes, open.ticket);
      const ticket = open.ticket;
      this.hud.confirm(`${job.name} is still on the bench (${formatMoney(batchPay(services.content.world, job))} when it's done). Carry on?`, 'Carry on', () => begin(job, ticket), () => this.player.idle());
      return;
    }
    const tickets = ticketsOffered(board, bikes, career);
    this.hud.choose(board.name, 'Customer repairs: strip the part, fix it, refit it and test it. Each ticket needs the tools for its part.', [
      ...tickets.map((t) => {
        const problem = ticketProblem(tools, career, t);
        const job = ticketJob(board, tools, bikes, t);
        return {
          label: `${t.customer}: G${t.grade} ${slotName(bikes, t.slot)}`,
          note: `${formatMoney(batchPay(services.content.world, job))}, ${board.xpPerStation * board.stations.length} ${tools.sets.find((s) => s.slots.includes(t.slot))?.skill.replace('_', ' ') ?? ''} XP.${problem ? ` ${problem}` : ''}`,
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
      for (const u of pass.ups) this.hud.levelUp(u.name, u.level);
      this.hud.showCareer(career, this.save.flags);
      if (pass.done) {
        const engine = new Set(services.content.bikes.slots.filter((sl) => sl.engine).map((sl) => sl.id));
        const r = finishBatch(services.content.skills, career, shift.job, engine);
        noteActivity(services.content.shops, career, 'activity');
        // Later game: once Maggie's machine is fixed, a kept part can come out with modifiers (Boss, 5 Nov 2026).
        const rolled = r.kept ? rollBatchMods(services.content.modifiers, r.kept.slot, this.save.flags, leadLevel(services.content.skills, career.skills, services.content.skills.leads.find((l) => l.id === 'mech')!)) : null;
        if (r.kept && rolled) r.kept.mods = rolled.mods;
        const extra = rolled ? (rolled.masterwork ? ' A Masterwork, every modifier good: ' : ' It came off the line with ') + modsLabel(services.content.modifiers, rolled.mods) + '.' : '';
        const kept = r.kept ? ` The boss hands you a G${r.kept.grade} ${slotName(services.content.bikes, r.kept.slot)} from the batch: it's in your bag.${extra}` : '';
        this.endShift(shift.job.batch === 1 ? `${shift.job.name}: done and paid.` : `Batch done: ${shift.made} ${shift.job.product}s made.${kept}`);
        this.milestoneSave();
        this.passStory(shift.job);
        return;
      }
      this.milestoneSave();
      this.passStory(shift.job);
    }
    this.showShift();
  }

  /**
   * A pass through the stations can be a story step (Beach Town's first pass at the Brake works; Boss,
   * 3 Nov 2026): the step's use is the start object's action, done when a pass is finished, not when the
   * shift starts.
   */
  private passStory(job: JobDef): void {
    const start = this.map.objects.find((o) => o.name === job.start && typeof o.props.action === 'string');
    if (!start) return;
    const boss = services.content.npcs.find((n) => n.map === this.map.id && n.id.endsWith('works_boss'));
    this.runStory({ use: String(start.props.action), map: this.map.id, object: `${this.map.id}:${start.name}:${start.x},${start.y}` }, boss?.name ?? '', () => this.player.idle(), () => {});
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
    // Supercross is indoors and always dry (Boss, 6 Nov 2026).
    const indoor = isSupercross(trackById(rc, venue.track!));
    const forecast = indoor ? ' Indoors: always dry.' : area?.weather ? ` Weather here: ${Object.keys(area.weather).map((k) => rc.racing.weather?.[k]?.name.toLowerCase() ?? k).join(', ')}; you find out at the gate.` : '';
    const short = (p: number) => career.money < p;
    const champs = services.content.championships;
    // A championship's next round here takes the place of a local race day (Spec 18.6, 6C).
    // Sidecar championships are raced through Ray Crispy, not the race office (ChampionshipDef.sidecar).
    const rounds = mod ? [] : roundsHere(champs, career, venue).filter((d) => !d.sidecar);
    // Where every championship under way goes next, marked with its badge or a trophy as on the road
    // menu (Boss, 4 Nov 2026: "no real indicator as to where to go next after each champ race").
    const next = mod ? new Map<string, ChampionshipDef>() : new Map([...nextRoundVenues(champs, career)].filter(([, d]) => !d.sidecar));
    const markFor = (def: ChampionshipDef | undefined): string | true | undefined => (def ? (def.rewards[0]?.image ? rewardTexture(def.rewards[0].image) : true) : undefined);
    const elsewhere = [...next].filter(([v]) => v !== venue.id).map(([v, def]) => {
      const at = rc.tracks.venues.find((x) => x.id === v);
      const place = at && rc.world.places.find((p) => p.map === at.map && !p.mods);
      const n = career.champs!.active[def.id].rounds.length + 1;
      return `${def.short} round ${n}: ${at?.name ?? v}${place && at!.map !== venue.map ? ` (${place.name}, on the road menu)` : at?.map === venue.map ? ' (Other tracks, here)' : ''}.`;
    });
    const text = [
      (mod ? mod.intro : first ? "First time here? Your first race day is on us." : 'Race office. What can I do for you?') + forecast,
      `${className(rc.bikes, dayCls)} race day: ${field} riders including the Local Champion, 2 motos of ${laps} laps. Prize money to 10th in each moto.`,
      ...(elsewhere.length ? [`Your next ${elsewhere.length === 1 ? 'round is' : 'rounds are'} elsewhere. ${elsewhere.join(' ')}`] : []),
    ].join('\n\n');
    const roundOptions = rounds.map((def) => {
      const f = roundEntry(rc, def, dayCls);
      const n = career.champs!.active[def.id].rounds.length + 1;
      return { label: `${def.short} round ${n}`, mark: markFor(def), note: `Entry: ${formatMoney(f)}${short(f) ? " — you can't afford it" : ''}. 2 motos against the championship's ${def.size + 1} riders.`, enabled: !short(f), onPick: () => this.ride('raceday', venue, f, onClose, def) };
    });
    const hasChamps = !mod && champs.championships.some((d) => !d.sidecar && d.rounds.includes(venue.id));
    const others = mod ? [] : rc.tracks.venues.filter((v) => v.map === venue.map && v.id !== venue.id && !v.practiceOnly && !v.locked && (!v.needs || this.save.flags[v.needs]));
    this.hud.choose(venue.name, text, [
      ...roundOptions,
      rounds.length
        ? { label: 'Race day', note: 'Not today: your championship round is on here.', enabled: false, onPick: onClose }
        : { label: 'Race day', note: first ? 'Entry: free (first race)' : `Entry: ${formatMoney(fee)}${short(fee) ? " — you can't afford it" : ''}`, enabled: !short(fee), onPick: () => this.ride('raceday', venue, fee, onClose) },
      ...(mod
        ? mod.extra
        : isNoTurn(trackById(rc, venue.track!))
          ? [] // A No-Turn Takedown is one short run from the platform: race days only, like a mod track (Boss, 4 Nov 2026).
          : [{ label: 'Free practice', note: `${formatMoney(pFee)}: ride laps until you stop${venue.practiceRiders ? `, with ${venue.practiceRiders} other riders out on track` : ' on your own'}.${short(pFee) ? " You can't afford it." : ''}`, enabled: !short(pFee), onPick: () => this.ride('practice', venue, pFee, onClose) }]),
      ...(hasChamps ? [{ label: 'Championships', mark: champs.championships.filter((d) => !d.sidecar && d.rounds.includes(venue.id)).map((d) => (career.champs?.active[d.id] ? markFor(d) : undefined)).find((m) => m !== undefined), note: 'Enter one, see the standings, or give one up.', onPick: () => this.openChampionships(venue, onClose) }] : []),
      // Sponsored Rides (core/sponsors.ts, Spec 16; Boss, 31 Oct 2026: from Area 5).
      ...(!mod && sponsorsOpen(rc.sponsors, this.save.flags) ? [{ label: 'Sponsors', note: career.sponsor ? `Riding for ${career.sponsor.name}: today's objectives, or leave them.` : career.sponsorOffers?.length ? `${career.sponsorOffers.length} offer${career.sponsorOffers.length === 1 ? '' : 's'} waiting.` : 'No offers yet: finish a championship to open a window.', onPick: () => this.openSponsors(venue, () => this.openVenue(venue, onClose, mod)) }] : []),
      // Bike setup (Spec 8; Boss, 31 Oct 2026): the Basic view from Area 2, the Advanced view from Area 5.
      ...(!mod && this.save.flags[areaFlag(rc.setup.basicArea)] ? [{ label: 'Bike setup', note: 'Set the bike up for this track: a ready-made setup, or your own sliders.', onPick: () => this.openSetup(venue, () => this.openVenue(venue, onClose, mod)) }] : []),
      // One venue map per track type (Boss, 30 Oct 2026): the other tracks of this type race here too.
      ...(!mod && others.length ? [{ label: 'Other tracks', mark: others.map((v) => markFor(next.get(v.id))).find((m) => m !== undefined), note: `${others.length} more ${others.length === 1 ? 'track races' : 'tracks race'} here: ${others.map((v) => v.name).join(', ')}.`, onPick: () => this.hud.choose('Other tracks', 'Which track today?', [
        ...others.map((v) => ({ label: v.name, mark: markFor(next.get(v.id)), note: `${next.has(v.id) ? `${next.get(v.id)!.short}'s next round. ` : ''}${className(rc.bikes, venueClassFor(rc, v, career))} race days.`, onPick: () => { career.venue = v.id; this.openVenue(v, onClose); } })),
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
          // Signing brings the sponsor's kit: pick one of the five you don't have yet (Boss, 5 Nov 2026).
          const kits = r.ok && services.content.house.picks ? pickOptions(services.content.house, services.content.house.picks.sponsor, this.save.rider) : [];
          if (kits.length) this.pickOutfit(`${o.name}'s kit`, 'Your new sponsor sends a kit. Pick the design you want.', kits, again);
          else again();
        }, again) };
      }),
      ...(c ? [{ label: `Leave ${c.name}`, note: `Costs ${formatMoney(dropPenalty(data, c))} of what they've paid you, and your name among sponsors.`, onPick: () => this.hud.confirm(`Leave ${c.name} now for ${formatMoney(dropPenalty(data, c))}?`, 'Leave', () => {
        const r = dropSponsor(data, career);
        this.hud.showCareer(career, this.save.flags);
        if (!r.ok) this.hud.toast(r.message);
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
          this.player.setSheet(this.look());
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
          // Only a refusal gets a message over the rack (Boss, 2 Nov 2026).
          if (!r.ok) this.hud.toast(r.message);
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

  /** Rider Ability level: some championships need it (ChampionshipDef.level). */
  private riderLevel(): number {
    const rc = services.content;
    return leadLevel(rc.skills, this.save.career.skills, rc.skills.leads.find((l) => l.id === 'rider')!);
  }

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
        : [{ label: 'Advanced: set each slider', note: openAreas(this.save.flags) < data.advancedArea ? `Opens in ${areaName(services.content.areas, data.advancedArea)}.` : `Needs Mechanical Engineer ${data.advancedLevel}.`, enabled: false, onPick: () => {} }]),
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
    const list = rc.championships.championships.filter((d) => !d.sidecar && d.rounds.includes(venue.id));
    const venueName = (id: string | null) => rc.tracks.venues.find((v) => v.id === id)?.name ?? 'the next track';
    const options = list.map((def) => {
      const active = career.champs?.active[def.id];
      const record = career.champs?.done[def.id];
      // One championship at a time: finish or give up the one you're in first (Boss, 31 Oct 2026).
      const other = active ? null : otherActive(rc.championships, career, def);
      const problem = active ? null : other ? `You're in the ${other.name}: finish it or give it up first.` : champProblem(rc, def, this.save.flags, career.bike.class, this.riderLevel());
      let note: string;
      if (active) {
        const me = standings(rc.racing.points, active).find((r) => r.player)!;
        note = `Round ${active.rounds.length + 1} of ${def.rounds.length} next, at ${venueName(nextRoundVenue(def, active))}.${active.rounds.length ? ` You're ${ordinal(me.position)} on ${me.points} points.` : ''}`;
      } else if (problem) note = problem;
      else note = `${def.rounds.length} rounds, ${formatMoney(roundEntry(rc, def, career.bike.class))} a round.${record?.wins ? ' Won before: half prize money and XP.' : record ? ` Best so far: ${ordinal(record.best)}.` : ''}`;
      // A locked one can still be picked, to say why it's locked (Boss, 28 Oct 2026).
      const onPick = problem ? () => { this.hud.toast(problem); this.openChampionships(venue, onClose); } : () => this.openChampionship(def, venue, onClose);
      // The one you're in carries its badge, or a trophy (Boss, 4 Nov 2026).
      const mark: string | true | undefined = active ? (def.rewards[0]?.image ? rewardTexture(def.rewards[0].image) : true) : undefined;
      return { label: problem ? `${def.short} (locked)` : def.short, mark, note, onPick };
    });
    this.hud.choose('Championships', 'Each round is entered separately at its track\'s race office, with the same field of riders every round. There is no calendar: a championship waits for you.', [...options, { label: 'Back', onPick: back }], back);
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
        `${className(rc.bikes, def.class)}. ${def.rounds.length} rounds: ${rounds}`,
        `${def.size + 1} riders, the same at every round. Moto 1 gate picks are drawn at random, moto 2 goes in moto 1 order; points for every moto (25 for a win). Entry ${formatMoney(roundEntry(rc, def, career.bike.class))} a round, with bigger prize money than a race day.`,
        `The winner takes ${reward.title ?? 'the title'}${reward.money ? ` and £${reward.money}` : ''}; 2nd and 3rd win a smaller prize.`,
      ].join('\n\n');
      this.hud.choose(def.name, text, [
        { label: 'Enter', note: 'Free to enter: you pay each round\'s entry when you ride it.', onPick: () => {
          enter(career, rc, def, (Math.random() * 2 ** 32) >>> 0);
          this.milestoneSave();
          this.hud.news(`Entered the ${def.name}. Round 1 is at ${rc.tracks.venues.find((v) => v.id === def.rounds[0])?.name}.`);
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
      this.hud.news(`You gave up the ${def.name}.`);
      this.openChampionships(venue, onClose);
    }, () => this.openChampionship(def, venue, onClose));
    // No Start again: Give it up and enter again does the same. At the next round's track, the
    // round can be raced from here as well as from the race office's list (Boss, 31 Oct 2026).
    const here = roundsHere(rc.championships, career, venue).includes(def);
    const fee = roundEntry(rc, def, venueClassFor(rc, venue, career));
    const short = career.money < fee;
    this.hud.choose(def.name, text, [
      ...(here ? [{ label: `Race round ${active.rounds.length + 1}`, note: `Entry: ${formatMoney(fee)}${short ? " — you can't afford it" : ''}. 2 motos.`, enabled: !short, onPick: () => this.ride('raceday', venue, fee, onClose, def) }] : []),
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
          this.hud.errorBar("Couldn't keep it: this browser's storage is full or blocked.");
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
  private ride(mode: RaceSceneData['mode'], venue: VenueDef, fee: number, onClose: () => void, champ?: ChampionshipDef, challenge?: ChallengeDef, coach?: RaceSceneData['coach'], passenger?: RaceSceneData['passenger']): void {
    this.busy = true;
    this.path = [];
    this.player.stopWalking();
    const data: RaceSceneData = {
      mode,
      venue,
      fee,
      champ,
      challenge,
      coach,
      passenger,
      save: this.snapshot(),
      onDone: (save) => {
        this.scene.wake('hud');
        this.scene.wake();
        // Money won comes back as the bank note over the rider's head, not in the message (Boss, 2 Nov 2026).
        const gain = save.career.money - this.save.career.money;
        this.save = save;
        this.busy = false;
        // The race day can move the task on (first_race_done takes Joseph's "!" away, a cup won puts
        // it back): draw the markers from the new save, not only when the player next gets in the van
        // or reloads (Boss, 7 Nov 2026).
        this.refreshWaymarks();
        onClose();
        this.hud.showCareer(this.save.career, this.save.flags);
        if (gain > 0) this.time.delayedCall(250, () => this.hud.moneyNote(gain));
        this.milestoneSave();
        // No message on top: the results screen has said it all (Boss, 2 Nov 2026).
        this.time.delayedCall(900, () => this.offerBackup());
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
    this.van.setDriver(this.look());
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
    if (step?.markVan && !this.save.flags[step.markVan]) this.save.flags[step.markVan] = true;
    // In the cab, a road out is marked at the road again, not at the motor.
    this.refreshWaymarks();
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
    this.refreshWaymarks();
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
        // Steered by key: any road out the van is driven into is taken.
        this.driveGoal = 'any';
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
    this.driveGoal = via?.type === 'exit' ? via : null;
    this.startDrive();
  }

  /** Handles an exit under a tile the van has just moved onto. Returns true when it is leaving the map. */
  private checkVanTrigger(before: Tile[], to: VanPose): boolean {
    const van = this.van!;
    const fresh = footprint(to, van.design.length).filter((t) => !before.some((b) => b.x === t.x && b.y === t.y));
    for (const t of fresh) {
      const via = stepTriggerAt(this.map, t);
      if (!via || via.type !== 'exit') continue;
      // A clicked drive only leaves by the way out that was clicked (Boss, 4 Nov 2026).
      if (!driveLeavesBy(this.driveGoal, via)) continue;
      const r = services.travel.resolve(this.map, via, this.save.flags);
      if (!r) continue;
      this.moves = [];
      return this.vanThrough(r);
    }
    return false;
  }

  /**
   * After a championship that opens a new area, the rider can't leave the track until Joseph has
   * had a word (Boss, 2 Nov 2026). Says so and returns true while he's waiting.
   */
  private josephFirst(): boolean {
    if (!this.venueHere() || roadWaiting(this.save.flags) === null) return false;
    this.hud.toast('Joseph Halden wants a word before you go. He\'s at the race office.');
    return true;
  }

  /** Takes the van out by an exit it has reached, or says why it can't go. Returns true when leaving. */
  private vanThrough(r: NonNullable<StepResult>): boolean {
    if (r.kind === 'blocked') this.hud.toast(r.message);
    else if (r.kind === 'route') {
      if (this.josephFirst()) return false;
      let went = false;
      this.routeTo(r.via, (to) => { went = this.driveTo(to); });
      return went;
    } else return this.driveTo(r.to);
    return false;
  }

  /**
   * Takes the van to another map's arrival point: parked on the road in, in its lane, pointing into
   * the map (core/vehicles.ts arrivalPose). Returns false (and stays) when the van has nowhere to fit.
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
      : target && arrivalPose(this.driveMapFor(target, van.design.length), target, to.tile, van.design.length, (t) => !!stepTriggerAt(target, t) || taken.has(`${t.x},${t.y}`));
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
    dm.setNpcTiles(npcsOnMap(services.content, map, this.save.flags, currentStep(services.content.story, this.save.career)?.on.talk).map((p) => ({ x: p.x, y: p.y })));
    return dm;
  }

  // ---- routes ----

  /**
   * Where a route exit takes the rider, then `go` there: its only place straight away, otherwise the
   * road menu at the road itself. Returns true when it went straight away.
   */
  private routeTo(via: MapObject, go: (to: Arrival) => void): boolean {
    this.roadVia = via;
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
   * unlocked championships (a comingSoon type says Coming soon; none is, since Boss, 4 Nov 2026);
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
      // A town's road to its neighbour comes in on the neighbour's road back (core/guides.ts placeArrival).
      go({ map: p.map, tile: 'venue' in p ? spawnTile(services.maps.get(p.map)!, p.spawn!)! : placeArrival(rc.world, services.maps, this.map.id, this.roadVia ? routeFor(rc.world, this.map, this.roadVia) : undefined, p) });
    };
    const atVenue = this.venueHere()?.id;
    // Where the championships under way hold their next round (Boss, 2 Nov 2026): that track and its
    // type are marked with the championship's badge, or a trophy when it is played for a trophy.
    const rounds = nextRoundVenues(rc.championships, this.save.career);
    const markOf = (venue: string | undefined): string | true | undefined => {
      const def = venue ? rounds.get(venue) : undefined;
      if (!def) return undefined;
      const image = def.rewards[0]?.image;
      return image ? rewardTexture(image) : true;
    };
    // Where the task is (Boss, 2 Nov 2026: the arrow only pointed at the road): the places on this
    // road nearest the task's map get the task's "!", and so do the Tracks or Areas holding them.
    const away = new Map([...menu.tracks.flatMap((t) => t.places), ...menu.areas].filter((p: PlaceDef) => p.map !== this.map.id).map((p: PlaceDef) => {
      const ds = this.goalMaps.map((g) => hopsTo(services.maps, rc.world, services.travel, this.save.flags, p.map, g)).filter((d): d is number => d !== null);
      return [p.map, ds.length ? Math.min(...ds) : Infinity] as const;
    }));
    const best = Math.min(Infinity, ...away.values());
    const task = (p: PlaceDef | RoadStop) => best < Infinity && away.get(p.map) === best && p.map !== this.map.id;
    const item = (p: PlaceDef | RoadStop) => {
      const mark = ('venue' in p ? markOf(p.venue) : undefined) ?? (task(p) ? TASK_MARK : undefined);
      return p.map === this.map.id && (!('venue' in p) || p.venue === atVenue)
        ? { label: p.name, note: "You're here.", enabled: false, mark, onPick: done }
        : { label: p.name, note: p.note, mark, onPick: () => arrive(p) };
    };
    const champs = this.roadChampionships(arrive);
    const tracks = menu.tracks.reduce((n, t) => n + t.places.filter((p) => p.venue !== atVenue).length, 0);
    const areas = menu.areas.filter((p) => p.map !== this.map.id);
    const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

    const openTracks = (): void => {
      const back = top;
      // Just the type buttons, centred: the tracks are inside each type (Boss, 30 Oct 2026).
      const types = menu.tracks.map((t) => ({
        label: t.name,
        mark: t.places.map((p) => markOf(p.venue)).find((m) => m !== undefined) ?? (t.places.some(task) ? TASK_MARK : undefined),
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
      { label: 'Tracks', mark: menu.tracks.some((t) => t.places.some(task)) ? TASK_MARK : undefined, note: `${plural(tracks, 'track')} to go to${champs.length ? `, ${plural(champs.length, 'championship')}` : ''}.`, onPick: openTracks },
      { label: 'Areas', mark: areas.some(task) ? TASK_MARK : undefined, note: areas.length ? areas.map((p) => p.name).join(', ') : 'No other areas on this road.', enabled: areas.length > 0, onPick: () => this.roadList('Areas', 'Head into an area.', menu.areas.map(item), top) },
      ...(menu.mods ? [{ label: 'Mod Tracks', note: `${plural(services.modTracks.length, 'track')} installed or imported. Race one, or import a track file.`, onPick: () => this.openModTracks(0, top) }] : []),
      { label: 'Not now', onPick: done },
    ], done);
  }

  /** The unlocked championships, for the road menu: picking one goes to its next round's track. */
  private roadChampionships(arrive: (p: RoadStop) => void): ChooseOption[] {
    const rc = services.content;
    const career = this.save.career;
    return rc.championships.championships.flatMap((def) => {
      const active = career.champs?.active[def.id];
      if (!active && champProblem(rc, def, this.save.flags, def.sidecar ? undefined : career.bike.class, this.riderLevel())) return [];
      const venue = rc.tracks.venues.find((v) => v.id === (active ? nextRoundVenue(def, active) : def.rounds[0]));
      const place = venue && rc.world.places.find((p) => p.map === venue.map && p.spawn && services.maps.get(p.map) && spawnTile(services.maps.get(p.map)!, p.spawn));
      if (!venue || !place) return [];
      const n = active ? active.rounds.length + 1 : 1;
      const note = `${active ? 'Entered' : 'Not entered'}. Round ${n} of ${def.rounds.length} is at ${venue.name}.`;
      const image = def.rewards[0]?.image;
      const mark = active ? (image ? rewardTexture(image) : true) : undefined;
      if (venue.id === this.venueHere()?.id) return [{ label: def.short, note: `${note} You're here: see ${def.sidecar ? 'Ray Crispy, next to Big Pete' : 'the race office'}.`, enabled: false, mark, onPick: () => {} }];
      return [{ label: def.short, note, mark, onPick: () => arrive({ ...place, venue: venue.id }) }];
    });
  }

  /** A list on the road menu, a few to a page, with Back. */
  private roadList(title: string, text: string, items: ChooseOption[], back: () => void, page = 0): void {
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
        this.path = this.planWalk([end], () => findPathTowards(this.grid, this.player.tile, end));
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
    for (const u of r.ups) this.hud.levelUp(u.name, u.level);
  }

  /** A Fitness drill (core/training.ts): its round in the HUD, XP for every round finished, saved after each. */
  private runDrill(drill: DrillDef, onClose: () => void = () => this.player.idle()): void {
    const skill = services.content.skills.leads.flatMap((l) => l.children).find((c) => c.id === drill.skill);
    const coach = drill.npc ? services.content.npcs.find((n) => n.id === drill.npc)?.sprite : undefined;
    const level = childLevel(services.content.skills, this.save.career.skills, drill.skill);
    // A round finished can be a story step (Big Pete's lessons, the agility ladder; Boss, 3 Nov 2026):
    // it plays when the drill is closed, as the drill's use of the spot.
    let rounds = 0;
    const closed = () => {
      if (!rounds) return onClose();
      const trainer = this.storyTrainer(drill);
      if (!this.runStory({ use: drill.id, map: this.map.id, object: `${this.map.id}:drill:${drill.id}` }, trainer, onClose)) onClose();
    };
    this.hud.openDrill(drill, { player: this.look(), coach, level, bike: { model: modelFor(this.save.career.bike.class), brand: this.save.career.bike.brand } }, () => {
      rounds += 1;
      const ups = finishRound(services.content.skills, this.save.career.skills, drill);
      this.hud.showCareer(this.save.career, this.save.flags);
      this.milestoneSave();
      return [`+${drill.xp} ${skill?.name ?? drill.skill} XP`, ...ups.map((u) => `Level up! ${u.name} is now level ${u.level}.`)];
    }, closed);
  }

  /** Who speaks a drill's story lines: the drill's coach, or whoever stands nearest the training spot (Big Pete by his sand track). */
  private storyTrainer(drill: DrillDef): string {
    const byNpc = drill.npc && services.content.npcs.find((n) => n.id === drill.npc);
    if (byNpc) return byNpc.name;
    const me = this.player.tile;
    const near = this.npcs
      .map((c) => ({ name: c.placement.npc.name, d: Math.hypot(c.placement.x - me.x, c.placement.y - me.y) }))
      .filter((c) => c.d <= 8)
      .sort((a, b) => a.d - b.d)[0];
    return near?.name ?? '';
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
      if (this.josephFirst()) {
        this.path = [];
        this.onArrive = null;
        return false;
      }
      if (needsMotor(this.save.van, this.map.id, this.driving)) {
        this.path = [];
        this.onArrive = null;
        this.hud.toast(ON_FOOT);
        return false;
      }
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
  /**
   * Every few race days, offers to download the career as a file, the one copy a browser clearing
   * its storage can't take (Boss, 6 Nov 2026: "just the browsers losing the files").
   */
  private offerBackup(): void {
    const days = this.save.career.counters['race.days'] ?? 0;
    if (this.busy || this.hud.modalOpen || !backupDue(days, lastBackup(services.store))) return;
    const save = this.snapshot();
    this.hud.confirm(
      'Back up your career?\n\nYour career lives in this browser, and a browser can clear it. A backup file brings it back with Load > Import save.',
      'Download backup',
      () => void giveFile(saveFileName(save), saveFileText(save)).then((how) => {
        if (how === 'cancelled') return;
        markBackup(services.store, days);
        this.hud.toast(how === 'shared' ? 'Backup shared' : 'Backup saved to your downloads');
      }),
      // Not now: ask again after the next few race days.
      () => markBackup(services.store, days),
    );
  }

  private milestoneSave(): void {
    try {
      this.writeSave();
      this.hud.saveIndicator('Autosaved');
    } catch {
      this.hud.errorBar('Saving failed: storage is full or blocked.');
    }
  }

  private autosave(reason: 'timer' | 'manual'): void {
    if (reason === 'timer' && (this.busy || this.hud.isDialogueOpen() || this.scene.isPaused())) return;
    try {
      this.writeSave();
      this.hud.saveIndicator(reason === 'manual' ? 'Game saved' : 'Autosaved');
    } catch {
      this.hud.errorBar('Saving failed: storage is full or blocked.');
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
