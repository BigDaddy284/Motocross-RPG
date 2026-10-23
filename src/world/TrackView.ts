import Phaser from 'phaser';
import type { TrackDef } from '../core/race';
import { COLORS } from '../ui/theme';

// The race screen's track: a top-down drawing of the track's path with the riders as numbered
// dots. Placeholder for the isometric broadcast view (GDD 11.1), which needs the track art.

const GRASS = 0x5f8f3c;
const GRASS_DARK = 0x4f7a32;
const DIRT = 0xc98a4b;
const DIRT_EDGE = 0x8a5a2b;
const JUMPS = new Set(['tabletop', 'double', 'step_up', 'rhythm', 'whoops']);

export interface Dot {
  id: string;
  /** Distance along the lap, 0 to 1. */
  at: number;
  color: number;
  label: string;
  player: boolean;
  visible: boolean;
}

export class TrackView {
  private readonly pts: Phaser.Math.Vector2[];
  private readonly cum: number[];
  private readonly total: number;
  private readonly dots = new Map<string, Phaser.GameObjects.Container>();
  private readonly layer: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    track: TrackDef,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const g = scene.add.graphics();
    parent.add(g);
    g.fillStyle(GRASS, 1).fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, GRASS_DARK, 1).strokeRoundedRect(x, y, w, h, 10);
    // Fit the 100 × 60 path grid into the box, keeping its shape.
    const k = Math.min((w - 40) / 100, (h - 40) / 60);
    const ox = x + (w - 100 * k) / 2;
    const oy = y + (h - 60 * k) / 2;
    this.pts = track.path.map(([px, py]) => new Phaser.Math.Vector2(ox + px * k, oy + py * k));
    this.pts.push(this.pts[0].clone());
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distance(this.pts[i - 1]));
    this.total = this.cum.at(-1)!;

    const width = Math.max(14, k * 3.4);
    const line = (col: number, wd: number) => {
      g.lineStyle(wd, col, 1);
      g.beginPath();
      g.moveTo(this.pts[0].x, this.pts[0].y);
      for (const p of this.pts.slice(1)) g.lineTo(p.x, p.y);
      g.strokePath();
      for (const p of this.pts) g.fillStyle(col, 1).fillCircle(p.x, p.y, wd / 2);
    };
    line(DIRT_EDGE, width + 6);
    line(DIRT, width);

    // Jumps as dark bars across the track, at the middle of their section.
    const len = track.sections.reduce((a, s) => a + s.length, 0);
    let d = 0;
    for (const s of track.sections) {
      if (JUMPS.has(s.type)) {
        const n = s.type === 'rhythm' || s.type === 'whoops' ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const f = (d + (s.length * (i + 1)) / (n + 1)) / len;
          const p = this.pointAt(f);
          const q = this.pointAt(f + 0.002);
          const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
          g.lineStyle(5, DIRT_EDGE, 1);
          g.lineBetween(p.x - Math.cos(ang) * width * 0.55, p.y - Math.sin(ang) * width * 0.55, p.x + Math.cos(ang) * width * 0.55, p.y + Math.sin(ang) * width * 0.55);
        }
      }
      d += s.length;
    }
    // Chequered start and finish line.
    const p = this.pointAt(0);
    const q = this.pointAt(0.003);
    const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
    const cells = 6;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        const t = (i / (cells - 1) - 0.5) * (width + 4);
        const cx = p.x + Math.cos(ang) * t + Math.cos(ang - Math.PI / 2) * (j - 0.5) * 5;
        const cy = p.y + Math.sin(ang) * t + Math.sin(ang - Math.PI / 2) * (j - 0.5) * 5;
        g.fillStyle((i + j) % 2 ? 0xffffff : COLORS.ink, 1).fillRect(cx - 2.5, cy - 2.5, 5, 5);
      }
    }
    this.layer = scene.add.container(0, 0);
    parent.add(this.layer);
  }

  /** A point on the lap, from 0 (start line) to 1 (back at the start line). */
  pointAt(f: number): Phaser.Math.Vector2 {
    const d = (((f % 1) + 1) % 1) * this.total;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const a = this.pts[i - 1];
    const b = this.pts[i];
    const t = (d - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    return new Phaser.Math.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  setDots(dots: Dot[]): void {
    for (const d of dots) {
      let c = this.dots.get(d.id);
      if (!c) {
        const r = d.player ? 11 : 9;
        const circle = this.scene.add.circle(0, 0, r, d.color).setStrokeStyle(d.player ? 3 : 2, d.player ? 0xffffff : COLORS.ink);
        const text = this.scene.add.text(0, 0, d.label, { fontFamily: 'Trebuchet MS, sans-serif', fontSize: d.player ? '11px' : '10px', color: '#14141e', fontStyle: 'bold', resolution: 2 }).setOrigin(0.5);
        c = this.scene.add.container(0, 0, [circle, text]);
        this.layer.add(c);
        this.dots.set(d.id, c);
      }
      const p = this.pointAt(d.at);
      c.setPosition(p.x, p.y).setVisible(d.visible);
    }
    // The player draws on top.
    const mine = dots.find((d) => d.player);
    if (mine) this.layer.bringToTop(this.dots.get(mine.id)!);
  }
}
