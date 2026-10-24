import Phaser from 'phaser';
import type { SceneryItem, TrackDef } from '../core/race';
import { groundElev, type RiderPose } from '../core/riderAI';
import { headingAt, lapGeom, lapMetres, pointAt, sectionBounds, sectionTurns, type LapGeom } from '../core/trackGeom';
import { DEFAULT_TRACK_WIDTH, GRID_H, GRID_W, trackKind, type TrackPartsData } from '../core/trackParts';
import { COLORS } from '../ui/theme';

// The race screen's track view (GDD 11.1), in the spirit of Super Off Road: the whole track seen
// from high up and a little to the front, so jumps, hills and scenery stand up off the ground and
// every rider is a small bike with a shadow that leaves the ground on jumps. A stadium track fits
// on one fixed screen, as in Super Off Road. Outdoor and endurance tracks are too long for that,
// so the view follows your rider, with a map of the whole lap in the corner.
//
// Everything is drawn from the track data: the ground tiles, surface patches and scenery laid in
// the track editor, and the sections. The riders come from the rider AI (riderAI.ts).

/** How much the ground is squashed top to bottom, for the look from the front. */
const SQ = 0.8;
/** Screen pixels per grid unit of height, as a share of the pixels per unit across. */
const VZ = 0.8;
/** Jumps look higher than they are, so you can read them at a glance. */
const AIR_K = 1.8;
/** Pixels per grid unit when the view follows a rider. */
const FOLLOW_PPU = 24;
/** Grid units above the top of the grid, for hills and tall scenery. */
const TOP = 10;
const ART_DIR = 'assets/art/area-map/tiled/tiles';

const SURFACES: Record<string, number> = { hard_pack: 0xb98448, loam: 0x8e5d34, sand: 0xd6bf78, mud: 0x6b4a2b };
const BIG_JUMPS = new Set(['tabletop', 'double', 'step_up']);
/** Scenery low enough to draw flat on the ground. */
const FLAT = new Set(['tape', 'tuff_block', 'hay_bale', 'tyre_wall', 'start_gate']);

export interface ViewRider {
  pose: RiderPose;
  color: number;
  /** Running position, shown over CPU riders. */
  label: string;
  player: boolean;
}

interface Puff {
  x: number;
  y: number;
  life: number;
  r: number;
  color: number;
}

const hex = (s: string | undefined, fallback: number) => (s && /^#[0-9a-f]{6}$/i.test(s) ? parseInt(s.slice(1), 16) : fallback);
function shade(c: number, k: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

export class RaceView {
  readonly follow: boolean;
  private readonly ppu: number;
  private readonly g: LapGeom;
  private readonly bounds: number[];
  private readonly turns: number[];
  /** Metres of the lap per grid unit of the drawing. */
  private readonly mpu: number;
  private readonly hw: number;
  private readonly world: Phaser.GameObjects.Container;
  private readonly screenRT: Phaser.GameObjects.RenderTexture;
  private readonly groundRT: Phaser.GameObjects.RenderTexture;
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly dust: Phaser.GameObjects.Graphics;
  private readonly bikes = new Map<string, { g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }>();
  private props: Phaser.GameObjects.GameObject[] = [];
  private readonly mapDots: Phaser.GameObjects.Graphics | null = null;
  private readonly mapBox: { x: number; y: number; k: number } | null = null;
  private puffs: Puff[] = [];
  private cam: { x: number; y: number } | null = null;
  private readonly fixed: { x: number; y: number } | null = null;
  private lastClock = 0;
  private dead = false;
  /** The base ground colour, round the edges of the world. */
  private bg = 0x5f8f3c;
  private readonly patchSpans: { from: number; to: number; color: number; water: boolean }[];

  constructor(
    private readonly scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    private readonly track: TrackDef,
    private readonly parts: TrackPartsData,
    x: number,
    y: number,
    private readonly w: number,
    private readonly h: number,
  ) {
    this.g = lapGeom(track.path);
    this.bounds = sectionBounds(track);
    this.turns = sectionTurns(track, this.g);
    this.mpu = lapMetres(track) / this.g.total;
    this.hw = (track.width ?? DEFAULT_TRACK_WIDTH) / 2;
    const lap = lapMetres(track);
    this.patchSpans = (track.patches ?? []).map((p) => {
      const def = parts.surfaces.find((s) => s.id === p.surface);
      return { from: p.at / lap, to: (p.at + p.length) / lap, color: hex(def?.color, 0x888888), water: p.surface === 'water' };
    });

    this.follow = trackKind(parts, track).view === 'follow';
    if (this.follow) this.ppu = FOLLOW_PPU;
    else {
      // Fit the track and everything round it on the screen.
      const b = this.contentBounds();
      this.ppu = Math.min(14, (w - 16) / (b.x1 - b.x0), (h - 16) / (b.y1 - b.y0));
      this.fixed = { x: ((b.x0 + b.x1) / 2) * this.ppu, y: ((b.y0 + b.y1) / 2) * this.ppu };
    }

    this.screenRT = scene.add.renderTexture(x, y, w, h).setOrigin(0);
    parent.add(this.screenRT);
    this.world = scene.make.container({ x: 0, y: 0 }, false);
    this.groundRT = scene.make.renderTexture({ x: 0, y: 0, width: Math.ceil(GRID_W * this.ppu), height: Math.ceil((GRID_H * SQ + TOP + 2) * this.ppu) }, false).setOrigin(0);
    this.groundRT.setDepth(-1e6);
    this.shadows = scene.make.graphics({}, false).setDepth(-1e5);
    this.dust = scene.make.graphics({}, false).setDepth(-5e4);
    this.world.add([this.groundRT, this.shadows, this.dust]);

    if (this.follow) {
      const mw = 200;
      const k = mw / GRID_W;
      const box = { x: x + w - mw - 10, y: y + 10, k };
      const mg = scene.add.graphics();
      mg.fillStyle(COLORS.ink, 0.88).fillRoundedRect(box.x - 6, box.y - 6, mw + 12, GRID_H * k + 12, 6);
      mg.lineStyle(4, 0xc98a4b, 1);
      mg.beginPath();
      this.g.pts.forEach((p, i) => (i ? mg.lineTo(box.x + p.x * k, box.y + p.y * k) : mg.moveTo(box.x + p.x * k, box.y + p.y * k)));
      mg.strokePath();
      const s = pointAt(this.g, 0);
      mg.fillStyle(0xffffff, 1).fillRect(box.x + s.x * k - 2, box.y + s.y * k - 2, 4, 4);
      this.mapDots = scene.add.graphics();
      parent.add([mg, this.mapDots]);
      this.mapBox = box;
    }
    this.screenRT.once('destroy', () => this.destroy());

    this.buildStatic();
    this.loadArt();
  }

  /** Grid point on the ground to world pixels. z is height in grid units. */
  private proj(x: number, y: number, z = 0): { x: number; y: number } {
    return { x: x * this.ppu, y: (y * SQ + TOP - z * VZ) * this.ppu };
  }

  /** A point on the track: lap fraction f, lane -1 (left) to 1 (right), raised by any hill. */
  private onTrack(f: number, lane: number): { x: number; y: number; ang: number } {
    const p = pointAt(this.g, f);
    const ang = headingAt(this.g, f);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const z = groundElev(this.track, this.bounds, f) / this.mpu;
    const s = this.proj(p.x + nx * lane * this.hw, p.y + ny * lane * this.hw, z);
    return { x: s.x, y: s.y, ang };
  }

  private contentBounds(): { x0: number; y0: number; x1: number; y1: number } {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x: number, y: number, z = 0) => {
      const sx = x;
      const sy = y * SQ + TOP - z * VZ;
      x0 = Math.min(x0, sx);
      x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    };
    for (const [px, py] of this.track.path) {
      add(px - this.hw - 1, py - this.hw - 1);
      add(px + this.hw + 1, py + this.hw + 1);
    }
    for (const it of this.track.scenery ?? []) {
      const { w, h } = this.itemSize(it);
      add(it.x - w / 2, it.y - h / 2, this.itemHeight(it.type));
      add(it.x + w / 2, it.y + h / 2);
    }
    return { x0: Math.max(0, x0), y0: Math.max(0, y0 - 1), x1: Math.min(GRID_W, x1), y1: Math.min(GRID_H * SQ + TOP, y1 + 1) };
  }

  private itemSize(it: SceneryItem): { w: number; h: number; a: number } {
    const def = this.parts.scenery.find((s) => s.id === it.type);
    return { w: it.w ?? def?.w ?? 2, h: it.h ?? def?.h ?? 2, a: ((it.rot ?? 0) * Math.PI) / 180 };
  }

  private itemHeight(type: string): number {
    return ({ stand: 4.5, light_tower: 9, finish_arch: 5.5, pit_tent: 2.4, van: 2.2, crowd: 1.2, flag_post: 2.6, banner: 1.4, sponsor_board: 1.6, tree: 5 } as Record<string, number>)[type] ?? 1;
  }

  // ---- the ground, the track and the scenery ----

  private loadArt(): void {
    const arts = [...this.parts.ground, ...this.parts.scenery].map((p) => p.art).filter((a): a is string => !!a);
    const missing = [...new Set(arts)].filter((a) => !this.scene.textures.exists(`trackart:${a}`));
    if (!missing.length) return;
    for (const a of missing) this.scene.load.image(`trackart:${a}`, `${ART_DIR}/${a}.png`);
    this.scene.load.once('complete', () => {
      if (!this.dead) this.buildStatic();
    });
    this.scene.load.start();
  }

  private art(id: string | undefined): string | null {
    return id && this.scene.textures.exists(`trackart:${id}`) ? `trackart:${id}` : null;
  }

  private buildStatic(): void {
    const rt = this.groundRT;
    rt.clear();
    for (const o of this.props) o.destroy();
    this.props = [];
    this.drawGround();
    const gfx = this.scene.make.graphics({}, false);
    this.drawTrack(gfx);
    for (const it of this.track.scenery ?? []) if (FLAT.has(it.type)) this.drawItem(gfx, it);
    rt.draw(gfx);
    gfx.destroy();
    for (const it of this.track.scenery ?? []) if (!FLAT.has(it.type)) this.addProp(it);
  }

  private drawGround(): void {
    const rt = this.groundRT;
    const ground = this.track.ground ?? { base: this.parts.ground[0]?.id ?? 'grass', cell: 2, paint: {} };
    const cell = ground.cell || 2;
    const painted = new Map<string, string>();
    for (const [id, cells] of Object.entries(ground.paint ?? {})) for (const [cx, cy] of cells) painted.set(`${cx},${cy}`, id);
    const base = this.parts.ground.find((g) => g.id === ground.base);
    this.bg = hex(base?.color, 0x5f8f3c);
    rt.fill(this.bg);
    const stamp = this.scene.make.image({ key: '__WHITE' }, false).setOrigin(0);
    const fill = this.scene.make.graphics({}, false);
    const pw = cell * this.ppu;
    const ph = cell * this.ppu * SQ;
    // The strip above the grid, where tall scenery and hills reach, is the base ground too.
    for (let cy = -Math.ceil(TOP / SQ / cell); cy < Math.ceil(GRID_H / cell); cy++) {
      for (let cx = 0; cx < Math.ceil(GRID_W / cell); cx++) {
        const def = this.parts.ground.find((g) => g.id === (painted.get(`${cx},${cy}`) ?? ground.base));
        const s = this.proj(cx * cell, cy * cell);
        const key = this.art(def?.art);
        if (key) {
          stamp.setTexture(key).setDisplaySize(pw + 0.6, ph + 0.6);
          rt.draw(stamp, s.x, s.y);
        } else fill.fillStyle(hex(def?.color, 0x5f8f3c), 1).fillRect(s.x, s.y, pw + 0.6, ph + 0.6);
      }
    }
    rt.draw(fill);
    stamp.destroy();
    fill.destroy();
  }

  /** The tone of the track at lap fraction f: jump faces lit, landings and gaps in shadow, and so on. */
  private toneAt(f: number): number {
    let si = 0;
    while (si < this.track.sections.length - 1 && this.bounds[si + 1] <= f) si++;
    const sec = this.track.sections[si];
    const u = (f - this.bounds[si]) / Math.max(1e-9, this.bounds[si + 1] - this.bounds[si]);
    switch (sec.type) {
      case 'tabletop':
        return u > 0.2 && u < 0.3 ? 1.3 : u >= 0.3 && u < 0.72 ? 1.12 : u >= 0.72 && u < 0.82 ? 0.78 : 1;
      case 'double':
        return u > 0.2 && u < 0.3 ? 1.3 : u >= 0.3 && u < 0.72 ? 0.7 : u >= 0.72 && u < 0.82 ? 1.15 : 1;
      case 'step_up':
        return u > 0.2 && u < 0.3 ? 1.3 : u >= 0.3 && u < 0.72 ? 0.72 : u >= 0.72 && u < 0.8 ? 1.3 : u >= 0.8 ? 1.12 : 1;
      case 'rhythm': {
        const x = (u * 3) % 1;
        return x > 0.1 && x < 0.42 ? 1.25 : x >= 0.42 && x < 0.75 ? 0.8 : 1;
      }
      case 'whoops': {
        const s = Math.sin(u * Math.PI * 20);
        return s > 0.3 ? 1.2 : s < -0.3 ? 0.8 : 1;
      }
      case 'braking_bumps':
        return Math.sin(u * Math.PI * 28) > 0 ? 1.06 : 0.92;
      case 'uphill':
        return u < 0.5 ? 1.18 : 0.86;
      case 'downhill':
        return u < 0.5 ? 1.12 : 0.84;
      default:
        return 1;
    }
  }

  private patchAt(f: number): { color: number; water: boolean } | null {
    for (const p of this.patchSpans) if ((f >= p.from && f <= p.to) || (p.to > 1 && f <= p.to - 1)) return p;
    return null;
  }

  private drawTrack(gfx: Phaser.GameObjects.Graphics): void {
    const steps = Math.max(200, Math.ceil(this.g.total / 0.3));
    const base = SURFACES[this.track.surface] ?? 0xb07a44;
    const edge = shade(base, 0.62);
    const quad = (f0: number, f1: number, l0: number, l1: number, color: number) => {
      const a = this.onTrack(f0, l0);
      const b = this.onTrack(f0, l1);
      const c = this.onTrack(f1, l1);
      const d = this.onTrack(f1, l0);
      gfx.fillStyle(color, 1);
      gfx.fillPoints([a, b, c, d], true);
    };
    // The worn edge of the track, then the track itself in short strips.
    for (let i = 0; i < steps; i++) quad(i / steps, (i + 1.6) / steps, -1.18, 1.18, edge);
    for (let i = 0; i < steps; i++) {
      const f0 = i / steps;
      const f1 = (i + 1.5) / steps;
      const fm = (i + 0.5) / steps;
      const patch = this.patchAt(fm);
      let color = patch ? patch.color : base;
      // A faint grain along the lap, like a raked dirt track.
      color = shade(color, this.toneAt(fm) * (Math.floor(i / 3) % 2 ? 1.03 : 0.98));
      quad(f0, f1, -1, 1, color);
    }
    // Berms bank up on the outside of the corner.
    this.track.sections.forEach((s, i) => {
      if (s.type !== 'berm' || !this.turns[i]) return;
      const out = -this.turns[i];
      const n = Math.max(6, Math.ceil(((this.bounds[i + 1] - this.bounds[i]) * steps) / 1));
      for (let k = 0; k < n; k++) {
        const f0 = this.bounds[i] + ((this.bounds[i + 1] - this.bounds[i]) * k) / n;
        const f1 = this.bounds[i] + ((this.bounds[i + 1] - this.bounds[i]) * (k + 1.5)) / n;
        quad(f0, f1, out * 0.85, out * 1.3, shade(base, 1.22));
      }
    });
    // Lips of the big jumps, as dark lines across the track.
    this.track.sections.forEach((s, i) => {
      if (!BIG_JUMPS.has(s.type)) return;
      for (const u of s.type === 'tabletop' ? [0.3, 0.72] : [0.3]) {
        const f = this.bounds[i] + (this.bounds[i + 1] - this.bounds[i]) * u;
        const a = this.onTrack(f, -1);
        const b = this.onTrack(f, 1);
        gfx.lineStyle(Math.max(2, this.ppu * 0.18), shade(base, 0.5), 1).lineBetween(a.x, a.y, b.x, b.y);
      }
    });
    // Chequered start and finish line.
    const cells = 8;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        const l0 = -1 + (2 * i) / cells;
        const l1 = -1 + (2 * (i + 1)) / cells;
        const f0 = (j * 0.4) / this.g.total;
        const f1 = ((j + 1) * 0.4) / this.g.total;
        quad(f0, f1, l0, l1, (i + j) % 2 ? 0xffffff : COLORS.ink);
      }
    }
  }

  /** The four corners of a scenery item on the ground, in grid units. */
  private footprint(it: SceneryItem, w: number, h: number, a: number): { x: number; y: number }[] {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: it.x + ((sx * w) / 2) * c - ((sy * h) / 2) * s, y: it.y + ((sx * w) / 2) * s + ((sy * h) / 2) * c }));
  }

  /** A box standing on the ground: the sides that face the camera, then the top. */
  private box(gfx: Phaser.GameObjects.Graphics, foot: { x: number; y: number }[], z0: number, z1: number, color: number, top = color): void {
    const lo = foot.map((p) => this.proj(p.x, p.y, z0));
    const hi = foot.map((p) => this.proj(p.x, p.y, z1));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // A side faces the camera when its outward normal points down the screen.
      const ex = foot[j].x - foot[i].x;
      const ey = foot[j].y - foot[i].y;
      const cx = foot.reduce((a, p) => a + p.x, 0) / 4;
      const cy = foot.reduce((a, p) => a + p.y, 0) / 4;
      let ny = ex;
      if ((foot[i].x - cx) * -ey + (foot[i].y - cy) * ex < 0) ny = -ex;
      if (ny <= 0) continue;
      gfx.fillStyle(shade(color, Math.abs(ex) > Math.abs(ey) ? 0.72 : 0.84), 1);
      gfx.fillPoints([lo[i], lo[j], hi[j], hi[i]], true);
    }
    gfx.fillStyle(top, 1).fillPoints(hi, true);
  }

  private drawItem(gfx: Phaser.GameObjects.Graphics, it: SceneryItem): void {
    const def = this.parts.scenery.find((s) => s.id === it.type);
    const { w, h, a } = this.itemSize(it);
    const color = hex(it.color ?? def?.color, 0x888888);
    const foot = this.footprint(it, w, h, a);
    // A soft shadow under everything.
    gfx.fillStyle(0x000000, 0.22).fillPoints(foot.map((p) => this.proj(p.x + 0.25, p.y + 0.3)), true);
    switch (it.type) {
      case 'tape': {
        const ps = foot.map((p) => this.proj(p.x, p.y, 0.5));
        gfx.lineStyle(Math.max(1, this.ppu * 0.08), color, 1).lineBetween((ps[0].x + ps[3].x) / 2, (ps[0].y + ps[3].y) / 2, (ps[1].x + ps[2].x) / 2, (ps[1].y + ps[2].y) / 2);
        for (let k = 0; k <= Math.round(w / 2); k++) {
          const t = k / Math.max(1, Math.round(w / 2));
          const gx = it.x + (t - 0.5) * w * Math.cos(a);
          const gy = it.y + (t - 0.5) * w * Math.sin(a);
          const b = this.proj(gx, gy);
          const tp = this.proj(gx, gy, 0.55);
          gfx.lineStyle(Math.max(1, this.ppu * 0.06), 0x444444, 1).lineBetween(b.x, b.y, tp.x, tp.y);
        }
        return;
      }
      case 'tuff_block':
        this.box(gfx, foot, 0, 0.5, color);
        // Red bands.
        for (let k = 0; k < 3; k++) {
          const sub = this.footprint({ ...it, x: it.x + (k - 1) * (w / 3) * Math.cos(a), y: it.y + (k - 1) * (w / 3) * Math.sin(a) }, w / 8, h, a);
          gfx.fillStyle(0xd33a2c, 1).fillPoints(sub.map((p) => this.proj(p.x, p.y, 0.5)), true);
        }
        return;
      case 'hay_bale':
        this.box(gfx, foot, 0, 0.6, color, shade(color, 1.08));
        return;
      case 'tyre_wall':
        this.box(gfx, foot, 0, 0.6, color, 0x3a3a40);
        return;
      case 'start_gate': {
        this.box(gfx, foot, 0, 0.3, color);
        const n = Math.max(2, Math.round(w / 1.6));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n - 0.5;
          const sub = this.footprint({ ...it, x: it.x + t * w * Math.cos(a), y: it.y + t * w * Math.sin(a) }, (w / n) * 0.8, h * 0.25, a);
          this.box(gfx, sub, 0.3, 0.9, 0x5a5a60);
        }
        return;
      }
      default:
        this.box(gfx, foot, 0, 0.6, color);
    }
  }

  /** Scenery that stands up: drawn in front of or behind the riders by where it stands. */
  private addProp(it: SceneryItem): void {
    const def = this.parts.scenery.find((s) => s.id === it.type);
    const { w, h, a } = this.itemSize(it);
    const color = hex(it.color ?? def?.color, 0x888888);
    const foot = this.footprint(it, w, h, a);
    const depth = Math.max(...foot.map((p) => this.proj(p.x, p.y).y));
    const key = this.art(def?.art);
    if (key) {
      const img = this.scene.make.image({ key }, false).setOrigin(0.5, 1);
      const tex = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
      const dw = w * this.ppu;
      img.setDisplaySize(dw, (dw * tex.height) / tex.width);
      const b = this.proj(it.x, it.y + h / 2);
      img.setPosition(b.x, b.y).setDepth(b.y);
      const sh = this.scene.make.graphics({}, false).setDepth(-1e5 + 1);
      sh.fillStyle(0x000000, 0.25).fillEllipse(b.x + dw * 0.1, b.y - h * this.ppu * SQ * 0.15, dw * 0.9, h * this.ppu * SQ * 0.5);
      this.world.add([sh, img]);
      this.props.push(sh, img);
      return;
    }
    const gfx = this.scene.make.graphics({}, false).setDepth(depth);
    gfx.fillStyle(0x000000, 0.22).fillPoints(foot.map((p) => this.proj(p.x + 0.4, p.y + 0.5)), true);
    const H = this.itemHeight(it.type);
    let text: { z: number; size: number; color: string } | null = null;
    switch (it.type) {
      case 'stand': {
        // Stepped seating rising away from the track.
        const tiers = 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        for (let k = 0; k < tiers; k++) {
          const off = (k / tiers - 0.5 + 0.5 / tiers) * h;
          const sub = this.footprint({ ...it, x: it.x - off * s, y: it.y + off * c }, w, h / tiers, a);
          this.box(gfx, sub, 0, (H * (tiers - k)) / tiers, k % 2 ? shade(color, 1.1) : color);
          // A row of fans on each step.
          const top = sub.map((p) => this.proj(p.x, p.y, (H * (tiers - k)) / tiers));
          const n = Math.max(3, Math.round(w * 1.2));
          for (let q = 0; q < n; q++) {
            const t = (q + 0.5) / n;
            const px = top[0].x + (top[1].x - top[0].x) * t + (top[3].x - top[0].x) * 0.5;
            const py = top[0].y + (top[1].y - top[0].y) * t + (top[3].y - top[0].y) * 0.5;
            gfx.fillStyle([0xc0607a, 0xe0c060, 0x60a0e0, 0xf0f0f0, 0x80c080, 0xe08040][(q + k * 3) % 6], 1).fillCircle(px, py - this.ppu * 0.25, Math.max(1.2, this.ppu * 0.22));
          }
        }
        break;
      }
      case 'crowd': {
        const n = Math.max(4, Math.round(w * h * 1.5));
        for (let q = 0; q < n; q++) {
          const tx = ((q * 0.618) % 1) - 0.5;
          const ty = ((q * 0.382 + 0.17) % 1) - 0.5;
          const gx = it.x + tx * w * Math.cos(a) - ty * h * Math.sin(a);
          const gy = it.y + tx * w * Math.sin(a) + ty * h * Math.cos(a);
          const b = this.proj(gx, gy);
          const hd = this.proj(gx, gy, H);
          const col = [0xc0607a, 0xe0c060, 0x60a0e0, 0xf0f0f0, 0x80c080, 0xe08040][q % 6];
          gfx.lineStyle(Math.max(1.5, this.ppu * 0.3), col, 1).lineBetween(b.x, b.y, hd.x, hd.y);
          gfx.fillStyle(0xf0c8a0, 1).fillCircle(hd.x, hd.y, Math.max(1, this.ppu * 0.17));
        }
        break;
      }
      case 'light_tower': {
        const b = this.proj(it.x, it.y);
        const tp = this.proj(it.x, it.y, H);
        gfx.lineStyle(Math.max(2, this.ppu * 0.3), 0x5a5a60, 1).lineBetween(b.x, b.y, tp.x, tp.y);
        gfx.fillStyle(0x3a3a40, 1).fillRect(tp.x - w * this.ppu * 0.6, tp.y - this.ppu * 0.9, w * this.ppu * 1.2, this.ppu * 0.9);
        gfx.fillStyle(0xfff6c0, 1);
        for (let q = 0; q < 3; q++) gfx.fillRect(tp.x - w * this.ppu * 0.55 + q * w * this.ppu * 0.4, tp.y - this.ppu * 0.8, w * this.ppu * 0.3, this.ppu * 0.7);
        break;
      }
      case 'flag_post': {
        const b = this.proj(it.x, it.y);
        const tp = this.proj(it.x, it.y, H);
        gfx.lineStyle(Math.max(1.5, this.ppu * 0.12), 0xdddddd, 1).lineBetween(b.x, b.y, tp.x, tp.y);
        gfx.fillStyle(color, 1).fillTriangle(tp.x, tp.y, tp.x + this.ppu * 0.9, tp.y + this.ppu * 0.3, tp.x, tp.y + this.ppu * 0.6);
        break;
      }
      case 'finish_arch': {
        const c = Math.cos(a);
        const s = Math.sin(a);
        for (const side of [-1, 1]) {
          const post = this.footprint({ ...it, x: it.x + side * (w / 2 - 0.4) * c, y: it.y + side * (w / 2 - 0.4) * s }, 0.8, Math.min(h, 0.8), a);
          this.box(gfx, post, 0, H, 0xd0d0d0);
        }
        this.box(gfx, this.footprint(it, w, Math.min(h, 0.6), a), H - 1.4, H, color);
        text = { z: H - 0.7, size: Math.max(7, this.ppu * 0.9), color: '#ffffff' };
        break;
      }
      case 'banner':
      case 'sponsor_board': {
        const thin = this.footprint(it, w, Math.min(h, 0.3), a);
        this.box(gfx, thin, 0, H, color);
        text = { z: H / 2, size: Math.max(6, this.ppu * 0.8), color: '#ffffff' };
        break;
      }
      case 'pit_tent':
        this.box(gfx, foot, 0, H * 0.75, shade(color, 0.9));
        this.box(gfx, foot, H * 0.75, H, 0xf0f0f0, color);
        break;
      default:
        this.box(gfx, foot, 0, H, color, shade(color, 1.1));
    }
    this.world.add(gfx);
    this.props.push(gfx);
    const words = it.text ?? def?.text;
    if (text && words) {
      // Lettering on the face towards the camera.
      const c = this.proj(it.x, it.y + Math.min(h, 0.3) / 2 + 0.02, text.z);
      const ang = Math.atan2(Math.sin(a) * SQ, Math.cos(a));
      const flip = Math.abs(ang) > Math.PI / 2 ? Math.PI : 0;
      const t = this.scene.make.text({ x: c.x, y: c.y, text: words, style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${Math.round(text.size)}px`, color: text.color, fontStyle: 'bold', resolution: 2 } }, false);
      t.setOrigin(0.5).setRotation(ang - flip).setDepth(depth + 0.5);
      const fit = (w * this.ppu * 0.92) / Math.max(1, t.width);
      if (fit < 1) t.setScale(fit);
      this.world.add(t);
      this.props.push(t);
    }
  }

  // ---- riders ----

  /** Draws the riders at their poses. clock is race time, dt real seconds since the last frame. */
  update(riders: ViewRider[], clock: number, dt: number, focus: string | null): void {
    if (this.dead) return;
    const dc = Math.max(0, Math.min(1, clock - this.lastClock));
    this.lastClock = clock;
    this.shadows.clear();
    const s = Math.max(this.ppu, 13);
    let target: { x: number; y: number } | null = null;
    const blink = Math.floor(clock * 6) % 2 === 0;
    for (const r of riders) {
      const p = r.pose;
      let b = this.bikes.get(p.id);
      if (!b) {
        const g = this.scene.make.graphics({}, false);
        const label = this.scene.make.text({ x: 0, y: 0, text: '', style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${Math.round(Math.max(10, s * 0.55))}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#14141e', strokeThickness: 3, resolution: 2 } }, false).setOrigin(0.5, 1);
        this.world.add([g, label]);
        b = { g, label };
        this.bikes.set(p.id, b);
      }
      const f = p.dist - Math.floor(p.dist);
      const at = this.onTrack(f, p.lane);
      if (p.id === focus) target = at;
      const lift = ((p.air * AIR_K) / this.mpu) * this.ppu * VZ;
      let ang = at.ang;
      if (p.state === 'wobble') ang += 0.4 * Math.sin(clock * 16);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang) * SQ;
      const g = b.g;
      g.clear().setPosition(at.x, at.y).setDepth(at.y);
      g.setAlpha(p.state === 'retired' ? 0.55 : p.state === 'remount' && !blink ? 0.45 : 1);
      // Shadow on the ground, smaller and fainter the higher the bike.
      const shrink = 1 / (1 + lift / (s * 2));
      this.shadows.fillStyle(0x000000, 0.35 * shrink).fillEllipse(at.x, at.y, s * 1.3 * (0.55 + 0.45 * Math.abs(dx)) * shrink, s * 0.55 * shrink);
      if (p.state === 'crashed') this.drawDown(g, s, ang, r.color);
      else this.drawBike(g, s, dx, dy, lift, r.color);
      if (r.player) {
        const ty = -s * 1.45 - lift;
        g.fillStyle(COLORS.accent, 1).lineStyle(2, 0xffffff, 1);
        g.fillTriangle(-s * 0.3, ty - s * 0.4, s * 0.3, ty - s * 0.4, 0, ty);
        g.strokeTriangle(-s * 0.3, ty - s * 0.4, s * 0.3, ty - s * 0.4, 0, ty);
      }
      b.label.setText(r.player ? '' : r.label).setPosition(at.x, at.y - s * 1.15 - lift).setDepth(1e6).setVisible(this.follow && !r.player && p.state !== 'retired');
      // Dust off the back wheel, or spray in water.
      if (dc > 0 && p.speed > 5 && p.air < 0.1 && p.state !== 'retired') {
        const patch = this.patchAt(f);
        const n = Math.min(3, dc * p.speed * 0.25);
        for (let k = 0; k < n || (k === 0 && Math.random() < n); k++) {
          this.puffs.push({ x: at.x - dx * s * 0.6 + (Math.random() - 0.5) * s * 0.4, y: at.y - dy * s * 0.6, life: 1, r: s * (0.18 + Math.random() * 0.15), color: patch?.water ? 0xcfe8ff : 0xc8a070 });
        }
      }
    }
    // Old puffs fade and grow.
    const fade = Math.min(1, dc * 1.2 + dt * 0.4);
    this.puffs = this.puffs.filter((q) => (q.life -= fade) > 0).slice(-260);
    this.dust.clear();
    for (const q of this.puffs) {
      q.r += fade * 2;
      this.dust.fillStyle(q.color, 0.45 * q.life).fillCircle(q.x, q.y - (1 - q.life) * s * 0.4, q.r);
    }
    this.world.sort('depth');
    this.moveCamera(target, dt);
    this.screenRT.clear();
    this.screenRT.fill(this.bg);
    this.screenRT.draw(this.world, -(this.cam!.x - this.w / 2), -(this.cam!.y - this.h / 2));
    this.drawMap(riders);
  }

  private drawBike(g: Phaser.GameObjects.Graphics, s: number, dx: number, dy: number, lift: number, color: number): void {
    const wb = s * 0.48;
    const wr = s * 0.2;
    const y0 = -lift - wr;
    const fx = dx * wb;
    const fy = dy * wb + y0;
    const rx = -dx * wb;
    const ry = -dy * wb + y0;
    g.fillStyle(0x1c1c22, 1).fillCircle(rx, ry, wr).fillCircle(fx, fy, wr);
    g.lineStyle(Math.max(2, s * 0.24), shade(color, 0.78), 1).lineBetween(rx * 0.8, ry - s * 0.12, fx * 0.8, fy - s * 0.14);
    // Number plate and tank in the rider's colour, then the rider and helmet.
    g.fillStyle(color, 1).fillCircle(fx * 0.55, fy - s * 0.2, s * 0.15);
    g.fillStyle(shade(color, 0.9), 1).fillEllipse(-dx * s * 0.05, y0 - s * 0.42, s * 0.42, s * 0.46);
    g.fillStyle(0xf4f4f4, 1).fillCircle(dx * s * 0.1, y0 - s * 0.7, s * 0.17);
    g.fillStyle(color, 1).fillCircle(dx * s * 0.1, y0 - s * 0.76, s * 0.11);
  }

  /** A rider on the ground, with the bike on its side. */
  private drawDown(g: Phaser.GameObjects.Graphics, s: number, ang: number, color: number): void {
    const px = -Math.sin(ang);
    const py = Math.cos(ang) * SQ;
    g.fillStyle(0x1c1c22, 1).fillEllipse(px * s * 0.45, py * s * 0.45 - s * 0.1, s * 0.4, s * 0.22).fillEllipse(-px * s * 0.45, -py * s * 0.45 - s * 0.1, s * 0.4, s * 0.22);
    g.lineStyle(Math.max(2, s * 0.22), shade(color, 0.78), 1).lineBetween(px * s * 0.4, py * s * 0.4 - s * 0.12, -px * s * 0.4, -py * s * 0.4 - s * 0.12);
    const bx = Math.cos(ang) * s * 0.7;
    const by = Math.sin(ang) * SQ * s * 0.7;
    g.fillStyle(shade(color, 0.9), 1).fillEllipse(bx, by - s * 0.12, s * 0.5, s * 0.3);
    g.fillStyle(0xf4f4f4, 1).fillCircle(bx + Math.cos(ang) * s * 0.3, by - s * 0.2, s * 0.16);
  }

  private moveCamera(target: { x: number; y: number } | null, dt: number): void {
    if (this.fixed) {
      this.cam = { ...this.fixed };
      return;
    }
    const want = target ?? this.cam ?? this.onTrack(0, 0);
    if (!this.cam || Math.hypot(want.x - this.cam.x, want.y - this.cam.y) > this.w) this.cam = { x: want.x, y: want.y };
    else {
      const k = 1 - Math.exp(-dt * 5);
      this.cam.x += (want.x - this.cam.x) * k;
      this.cam.y += (want.y - this.cam.y) * k;
    }
    const ww = this.groundRT.width;
    const wh = this.groundRT.height;
    this.cam.x = Math.max(this.w / 2, Math.min(ww - this.w / 2, this.cam.x));
    this.cam.y = Math.max(this.h / 2, Math.min(wh - this.h / 2, this.cam.y));
  }

  private drawMap(riders: ViewRider[]): void {
    const g = this.mapDots;
    const box = this.mapBox;
    if (!g || !box || !this.cam) return;
    g.clear();
    // The part of the track on screen now.
    const vx = this.cam.x / this.ppu;
    const vy = (this.cam.y / this.ppu - TOP) / SQ;
    const vw = this.w / this.ppu;
    const vh = this.h / this.ppu / SQ;
    g.lineStyle(1, 0xffffff, 0.7).strokeRect(box.x + (vx - vw / 2) * box.k, box.y + (vy - vh / 2) * box.k, vw * box.k, vh * box.k);
    const order = [...riders].sort((a, b) => Number(a.player) - Number(b.player));
    for (const r of order) {
      if (r.pose.state === 'retired') continue;
      const p = pointAt(this.g, r.pose.dist - Math.floor(r.pose.dist));
      g.fillStyle(r.color, 1).fillCircle(box.x + p.x * box.k, box.y + p.y * box.k, r.player ? 4 : 2.6);
      if (r.player) g.lineStyle(1.5, 0xffffff, 1).strokeCircle(box.x + p.x * box.k, box.y + p.y * box.k, 4);
    }
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.world.destroy(true);
  }
}
