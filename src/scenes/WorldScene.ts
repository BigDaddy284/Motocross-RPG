import Phaser from 'phaser';
import { npcsOnMap, type NpcPlacement } from '../core/content';
import { Grid, STEPS } from '../core/grid';
import { objectTiles, type BakedMap, type Facing, type MapObject, type Tile } from '../core/mapTypes';
import { findPathToAny, findPathTowards, standingTiles } from '../core/pathfinding';
import type { SaveData } from '../core/saves';
import { ZOOM_MAX, ZOOM_MIN } from '../core/settings';
import { stepTriggerAt } from '../core/travel';
import { CAREER_SLOT, services } from '../services';
import { Character, TILE } from '../world/Character';
import { MapView, isMapCached, loadMapImages } from '../world/MapView';
import { actionMessage } from '../world/messages';
import type { HudScene } from './HudScene';

// The walkable world: one map at a time, the player, NPCs, doors and exits.
// Changing map restarts this scene with the arrival tile, so nothing from the old map lingers.

/** Autosave every 5 minutes outside menus, plus on every map change (Spec 21b, Boss: 3 to 5 minutes). */
const AUTOSAVE_MS = 5 * 60 * 1000;
/** Design viewport: at 100% zoom, 20 × 11 tiles fit in 1280 × 720 (style guide 3). */
const DESIGN_W = 1280;
const DESIGN_H = 720;

interface WorldData {
  save: SaveData;
}

/** What a click or the interact key is aimed at. */
type Target =
  | { kind: 'npc'; placement: NpcPlacement; character: Character }
  | { kind: 'object'; object: MapObject; tiles: Tile[] };

export class WorldScene extends Phaser.Scene {
  private save!: SaveData;
  private map!: BakedMap;
  private grid!: Grid;
  private player!: Character;
  private npcs: { placement: NpcPlacement; character: Character }[] = [];
  private path: Tile[] = [];
  private onArrive: (() => void) | null = null;
  private walking = false;
  private busy = false;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private hud!: HudScene;

  constructor() {
    super('world');
  }

  init(data: WorldData): void {
    this.save = structuredClone(data.save);
    this.npcs = [];
    this.path = [];
    this.onArrive = null;
    this.walking = false;
    this.busy = true;
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
    new MapView(this, map);
    if (firstVisit) console.info(`Map ${map.id}: first visit ${Math.round(performance.now() - started)} ms`);
    else console.info(`Map ${map.id}: cached visit ${Math.round(performance.now() - started)} ms`);

    this.grid = Grid.fromMap(map);
    for (const p of npcsOnMap(services.content, map)) {
      const character = new Character(this, p.npc.sprite, p, p.facing);
      this.grid.setOccupied(p, true);
      this.npcs.push({ placement: p, character });
    }
    const { x, y, facing } = this.save.position;
    this.player = new Character(this, this.save.rider.look, { x, y }, facing);

    const cam = this.cameras.main;
    cam.startFollow(this.player.sprite, true, 0.2, 0.2, 0, TILE / 2);
    cam.setRoundPixels(true);
    this.applyZoom();
    const unsub = services.settings.onChange(() => this.applyZoom());
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => {
      unsub();
      this.scale.off('resize', this.applyZoom, this);
    });

    this.setupInput();
    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: () => this.autosave('timer') });
    this.hud.showMapTitle(map.title);
    cam.fadeIn(250, 20, 20, 30);
    this.busy = false;
  }

  update(_time: number, delta: number): void {
    if (!this.player) return;
    if (!this.busy && !this.hud.isDialogueOpen()) this.save.stats.playSeconds += delta / 1000;
    if (this.busy || this.walking || this.hud.isDialogueOpen()) return;
    const dir = this.heldDirection();
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
    kb.on('keydown-PLUS', () => this.zoomBy(10));
    kb.on('keydown-NUMPAD_ADD', () => this.zoomBy(10));
    kb.on('keydown-MINUS', () => this.zoomBy(-10));
    kb.on('keydown-NUMPAD_SUBTRACT', () => this.zoomBy(-10));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -10 : 10));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 12) return; // a drag, not a click
      if (this.busy || this.hud.isDialogueOpen() || this.hud.pointerOnUi(p)) return;
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
    const target = this.targetAt(tile, wx, wy);
    if (target) {
      this.approach(target);
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
    for (const o of this.map.objects) {
      if (!actionMessage(o)) continue;
      const tiles = objectTiles(o, this.map.tileSize);
      if (tiles.some((t) => t.x === tile.x && t.y === tile.y)) return { kind: 'object', object: o, tiles };
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
    if (this.busy || this.walking) return;
    if (this.hud.isDialogueOpen()) return;
    const d = STEPS[['down', 'left', 'right', 'up'].indexOf(this.player.facing)];
    const t = { x: this.player.tile.x + d.x, y: this.player.tile.y + d.y };
    const target = this.targetAt(t, -1, -1);
    if (target && this.grid.edgeOpen(this.player.tile, t)) this.use(target);
  }

  private use(target: Target): void {
    if (target.kind === 'npc') {
      const { npc } = target.placement;
      const turn: Record<Facing, Facing> = { down: 'up', up: 'down', left: 'right', right: 'left' };
      target.character.face(turn[this.player.facing]);
      this.player.reach();
      const lines = services.content.dialogue[npc.dialogue].lines;
      this.hud.openDialogue(npc.name, this.save.rider.name, lines, () => {
        this.player.idle();
        target.character.face(target.placement.facing);
      });
      return;
    }
    const msg = actionMessage(target.object);
    if (msg) this.hud.toast(msg);
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
      await this.player.step(next);
      if (this.checkTrigger()) {
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

  /** Handles a door or exit under the player. Returns true when the player is leaving the map. */
  private checkTrigger(): boolean {
    const via = stepTriggerAt(this.map, this.player.tile);
    if (!via) return false;
    const r = services.travel.resolve(this.map, via);
    if (!r) return false;
    if (r.kind === 'blocked') {
      this.path = [];
      this.onArrive = null;
      this.hud.toast(r.message);
      return false;
    }
    this.busy = true;
    this.path = [];
    this.player.stopWalking();
    const entering = this.map.kind === 'area' && via.type === 'door';
    this.save.position = { map: r.to.map, x: r.to.tile.x, y: r.to.tile.y, facing: entering ? 'up' : 'down' };
    this.cameras.main.fadeOut(200, 20, 20, 30);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ save: this.save }));
    return true;
  }

  // ---- saving ----

  private snapshot(): SaveData {
    const p = this.player?.tile ?? this.save.position;
    return { ...this.save, position: { map: this.map.id, x: p.x, y: p.y, facing: this.player?.facing ?? 'down' } };
  }

  private writeSave(): void {
    this.save = services.saves.write(CAREER_SLOT, this.snapshot());
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
