import Phaser from 'phaser';
import type { Facing, Tile } from '../core/mapTypes';
import { services } from '../services';
import { FONT, TEXT_RES } from '../ui/theme';

export const TILE = 64;
/** Walking speed: milliseconds per tile (4 tiles a second). */
export const STEP_MS = 250;
/** Name tags draw over the map, its roofs, trees and arches (overhead art, from OVERHEAD_DEPTH up) included. */
const NAME_DEPTH = 1e7;

const FACINGS: Facing[] = ['down', 'left', 'right', 'up'];

/** Creates the walk, idle and reach animations for one character sheet, once. */
export function ensureAnims(scene: Phaser.Scene, sheet: string): void {
  if (scene.anims.exists(`${sheet}:walk-down`)) return;
  const { walk, act } = services.manifest.characters;
  services.manifest.characters.rows.forEach((dir, row) => {
    scene.anims.create({
      key: `${sheet}:walk-${dir}`,
      frames: scene.anims.generateFrameNumbers(`chr:${sheet}:walk`, { start: row * walk.columns, end: row * walk.columns + walk.columns - 1 }),
      frameRate: walk.fps,
      repeat: -1,
    });
    const actCols = act.columns.length;
    scene.anims.create({
      key: `${sheet}:idle-${dir}`,
      frames: scene.anims.generateFrameNumbers(`chr:${sheet}:act`, { frames: [row * actCols, row * actCols + 1] }),
      frameRate: act.idle_fps,
      repeat: -1,
    });
  });
}

/**
 * A character standing on the tile grid: the player or an NPC. Drawn bottom-centre on its tile
 * with a soft shadow, depth-sorted by the bottom of its tile.
 */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  tile: Tile;
  facing: Facing;
  moving = false;
  /** Lowest depth to draw at, so the player can stay on top of an NPC they walk through. */
  depthFloor: (() => number) | null = null;
  /** How far up a tile this character stands on it (standLift.ts), for one who walks the pavements. */
  liftAt: ((t: Tile) => number) | null = null;
  /** The name over an NPC's head (Boss's design A, 28 Oct 2026: white with a dark outline). */
  private nameTag: Phaser.GameObjects.Text | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly sheet: string,
    tile: Tile,
    facing: Facing = 'down',
  ) {
    ensureAnims(scene, sheet);
    this.tile = { ...tile };
    this.facing = facing;
    this.shadow = scene.add.ellipse(0, 0, 34, 12, 0x14181e, 0.3);
    this.sprite = scene.add.sprite(0, 0, `chr:${sheet}:act`, 0).setOrigin(0.5, 1);
    this.placeAt(tile);
    this.idle();
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /** Stands on a tile, `lift` pixels up from its bottom edge (on a pavement drawn across the middle of the tile, standLift.ts). */
  placeAt(t: Tile, lift = this.liftAt?.(t) ?? 0): void {
    this.tile = { ...t };
    this.setPixel(t.x * TILE + TILE / 2, (t.y + 1) * TILE - lift);
  }

  /** Shows a name over the character's head, following them about. */
  showName(name: string): void {
    this.nameTag?.destroy();
    this.nameTag = this.scene.add
      .text(0, 0, name, { fontFamily: FONT, fontSize: '15px', color: '#ffffff', stroke: '#27292c', strokeThickness: 4, resolution: TEXT_RES })
      .setOrigin(0.5, 1)
      .setDepth(NAME_DEPTH);
    this.setPixel(this.sprite.x, this.sprite.y);
  }

  private setPixel(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.nameTag?.setPosition(x, y - 64);
    this.shadow.setPosition(x, y - 4);
    const d = Math.max(y, this.depthFloor?.() ?? -Infinity);
    this.sprite.setDepth(d);
    this.shadow.setDepth(y - 0.5);
  }

  face(dir: Facing): void {
    this.facing = dir;
    if (!this.moving) this.idle();
  }

  faceTowards(t: Tile): void {
    const dx = t.x - this.tile.x;
    const dy = t.y - this.tile.y;
    this.face(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
  }

  idle(): void {
    this.sprite.play(`${this.sheet}:idle-${this.facing}`, true);
  }

  /** The reach frame, used while talking or using something. */
  reach(): void {
    const cols = services.manifest.characters.act.columns.length;
    this.sprite.stop();
    this.sprite.setTexture(`chr:${this.sheet}:act`, FACINGS.indexOf(this.facing) * cols + 2);
  }

  /** Walks one tile. Resolves when the step finishes. */
  step(to: Tile): Promise<void> {
    this.faceTowards(to);
    this.moving = true;
    this.sprite.play(`${this.sheet}:walk-${this.facing}`, true);
    const from = { x: this.sprite.x, y: this.sprite.y };
    const target = { x: to.x * TILE + TILE / 2, y: (to.y + 1) * TILE - (this.liftAt?.(to) ?? 0) };
    this.tile = { ...to };
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: STEP_MS,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          this.setPixel(from.x + (target.x - from.x) * v, from.y + (target.y - from.y) * v);
        },
        onComplete: () => {
          this.setPixel(target.x, target.y);
          resolve();
        },
      });
    });
  }

  stopWalking(): void {
    this.moving = false;
    this.idle();
  }

  destroy(): void {
    this.nameTag?.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
