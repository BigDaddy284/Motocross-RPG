import Phaser from 'phaser';
import type { Tile } from '../core/mapTypes';
import { COLORS } from '../ui/theme';
import { TILE } from './Character';
import { OVERHEAD_DEPTH } from './MapView';

// The tutorial markers on the map (Boss, 28 Oct 2026, samples 1A in orange, 2A, 3A and 4A):
// an orange "!" bubble over the NPC to talk to, a glowing outline on the equipment to use, and a
// big arrow over the door or exit to take. They draw over roofs and trees, so they show from
// anywhere on screen. What to mark comes from core/waymarks.ts; the arrow at the screen edge for
// a mark that is off screen is drawn by the HUD.

const DEPTH = OVERHEAD_DEPTH + 10;
const GOLD = 0xecbe2a;

export type Mark =
  | { kind: 'npc'; x: number; y: number }
  /** A news NPC's bubble: orange while there's something new to read, white once it's read. */
  | { kind: 'news'; x: number; y: number; fresh: boolean }
  | { kind: 'object'; tiles: Tile[] }
  | { kind: 'door'; tiles: Tile[] }
  | { kind: 'exit'; tiles: Tile[]; side: string };

/** The middle of some tiles, in world pixels. */
export function middle(tiles: Tile[]): { x: number; y: number } {
  return {
    x: (tiles.reduce((a, t) => a + t.x, 0) / tiles.length + 0.5) * TILE,
    y: (tiles.reduce((a, t) => a + t.y, 0) / tiles.length + 0.5) * TILE,
  };
}

/** Splits tiles into groups that touch, so each doorway of a building gets its own arrow. */
export function clusters(tiles: Tile[]): Tile[][] {
  const left = [...tiles];
  const out: Tile[][] = [];
  while (left.length) {
    const group = [left.shift()!];
    for (let i = 0; i < group.length; i++) {
      for (let j = left.length - 1; j >= 0; j--) {
        if (Math.abs(left[j].x - group[i].x) + Math.abs(left[j].y - group[i].y) <= 1) group.push(...left.splice(j, 1));
      }
    }
    out.push(group);
  }
  return out;
}

const ARROW_ANGLE: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

export class Waymarks {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly calm: boolean,
  ) {}

  clear(): void {
    for (const o of this.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects = [];
  }

  show(marks: Mark[]): void {
    this.clear();
    for (const m of marks) {
      if (m.kind === 'npc') this.bubble(m.x, m.y);
      else if (m.kind === 'news') this.bubble(m.x, m.y, !m.fresh);
      else if (m.kind === 'object') this.outline(m.tiles);
      else if (m.kind === 'door') this.doorArrow(m.tiles);
      else this.exitArrow(m.tiles, m.side);
    }
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  private bob(target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, by: number, ms = 520): void {
    if (this.calm) return;
    this.scene.tweens.add({ targets: target, y: target.y + by, duration: ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** 1A in orange: a speech bubble with "!" over the NPC's name, bobbing gently. White is a news bubble already read. */
  private bubble(x: number, feetY: number, white = false): void {
    const g = this.scene.add.graphics();
    const w = 34;
    const h = 40;
    g.fillStyle(COLORS.ink, 1).fillRoundedRect(-w / 2 - 3, -h - 3, w + 6, h + 6, 9);
    g.fillTriangle(-9, -2, 9, -2, 0, 13);
    g.fillStyle(white ? 0xffffff : COLORS.accent, 1).fillRoundedRect(-w / 2, -h, w, h, 7);
    g.fillTriangle(-6, -1, 6, -1, 0, 8);
    if (!white) g.fillStyle(COLORS.accentDark, 1).fillRect(-w / 2 + 3, -6, w - 6, 3);
    g.fillStyle(COLORS.ink, 1).fillRect(-4, -h + 7, 8, 18).fillRect(-4, -h + 29, 8, 7);
    const c = this.add(this.scene.add.container(x, feetY - 102, [g]).setDepth(DEPTH));
    // A read news bubble sits still: only something new bobs for attention.
    if (!white) this.bob(c, -6);
  }

  /** 2A: a glowing orange outline round the equipment, with sparkles at its corners. */
  private outline(tiles: Tile[]): void {
    const x0 = Math.min(...tiles.map((t) => t.x)) * TILE - 4;
    const y0 = Math.min(...tiles.map((t) => t.y)) * TILE - 4;
    const w = (Math.max(...tiles.map((t) => t.x)) + 1) * TILE + 4 - x0;
    const h = (Math.max(...tiles.map((t) => t.y)) + 1) * TILE + 4 - y0;
    const g = this.add(this.scene.add.graphics().setDepth(DEPTH));
    g.lineStyle(14, COLORS.accent, 0.3).strokeRoundedRect(x0 - 4, y0 - 4, w + 8, h + 8, 13);
    g.lineStyle(8, COLORS.ink, 1).strokeRoundedRect(x0, y0, w, h, 9);
    g.lineStyle(4, COLORS.accent, 1).strokeRoundedRect(x0, y0, w, h, 9);
    if (!this.calm) this.scene.tweens.add({ targets: g, alpha: 0.75, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    [[x0, y0], [x0 + w, y0 + h * 0.2], [x0 + w, y0 + h]].forEach(([sx, sy], i) => {
      const s = this.add(this.scene.add.graphics().setDepth(DEPTH + 1).setPosition(sx, sy));
      s.fillStyle(COLORS.ink, 1).fillRect(-3, -12, 6, 24).fillRect(-12, -3, 24, 6);
      s.fillStyle(0xffffff, 1).fillRect(-1.5, -10, 3, 20).fillRect(-10, -1.5, 20, 3);
      if (!this.calm) this.scene.tweens.add({ targets: s, scale: 0.45, alpha: 0.4, duration: 500, delay: i * 260, yoyo: true, repeat: -1 });
    });
  }

  /** A fat orange arrow with an ink edge, pointing down. */
  private arrow(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    const shape = (k: number) => [
      new Phaser.Math.Vector2(-9 - k, -38 - k), new Phaser.Math.Vector2(9 + k, -38 - k), new Phaser.Math.Vector2(9 + k, -12 + k * 0.2),
      new Phaser.Math.Vector2(22 + k * 1.6, -12 + k * 0.2), new Phaser.Math.Vector2(0, 12 + k * 1.6), new Phaser.Math.Vector2(-22 - k * 1.6, -12 + k * 0.2),
      new Phaser.Math.Vector2(-9 - k, -12 + k * 0.2),
    ];
    g.fillStyle(COLORS.ink, 1).fillPoints(shape(3), true);
    g.fillStyle(COLORS.accent, 1).fillPoints(shape(0), true);
    g.fillStyle(COLORS.accentDark, 1).fillRect(3, -36, 5, 24);
    return g;
  }

  /** 3A: the big arrow over the door, and a gold glow on the doormat in front of it. */
  private doorArrow(tiles: Tile[]): void {
    const { x, y } = middle(tiles);
    const glow = this.add(this.scene.add.ellipse(x, y + TILE * 0.85, TILE * 1.2, 22, GOLD, 0.45).setDepth(0.6));
    if (!this.calm) this.scene.tweens.add({ targets: glow, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
    const c = this.add(this.scene.add.container(x, y - TILE * 0.55, [this.arrow()]).setDepth(DEPTH));
    this.bob(c, -10, 450);
  }

  /** 4A once in view: the arrow on the exit, pointing the way out. */
  private exitArrow(tiles: Tile[], side: string): void {
    const { x, y } = middle(tiles);
    const angle = ARROW_ANGLE[side] ?? 0;
    const rad = Phaser.Math.DegToRad(angle);
    // Back from the edge a little, so the whole arrow is on the map.
    const back = TILE * 0.7;
    const cx = x + Math.sin(rad) * back;
    const cy = y - Math.cos(rad) * back;
    const c = this.add(this.scene.add.container(cx, cy, [this.arrow()]).setDepth(DEPTH).setAngle(angle));
    if (!this.calm) {
      this.scene.tweens.add({ targets: c, x: cx - Math.sin(rad) * 10, y: cy + Math.cos(rad) * 10, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
}
