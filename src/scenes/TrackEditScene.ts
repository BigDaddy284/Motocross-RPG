import Phaser from 'phaser';
import * as THREE from 'three';
import type { TrackDef } from '../core/race';
import { sectionBounds } from '../core/trackGeom';
import type { TrackPartsData } from '../core/trackParts';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { RaceView } from '../world/RaceView';

// The track editor's race view (tools/track-editor.html, "Race view"): the race screen's own 3D
// scene and camera, built by RaceView from the track the editor has open, shown in a frame inside
// the editor. It never runs a race: no riders, no race director, no sim, and it never reads or
// writes tracks.json. What you do with the mouse here goes back to the editor as a grid point, and
// the editor's own tools, undo, checks and save act on it, exactly as a click on its map would;
// the editor then sends the changed track back and this view rebuilds. The selection, brush and
// check markers live in RaceView's overlay group, which only this scene fills.
//
// Opened as the game with ?editview=1. Camera: mouse wheel or + and - zoom, W A S D or a
// middle-button (or Space + left-button) drag pans, [ and ] turn the view 45°, 0 puts it back.

/** What the editor sends: the open track and what to mark on it. */
export interface EditViewState {
  track: TrackDef;
  parts?: TrackPartsData;
  mode: string;
  sel: { item: number; sec: number; pt: number; start: number };
  /** Scenery items with a problem (by index) and problem spots (height), each an error or a warning. */
  issues: { item?: number; x?: number; y?: number; level: 'error' | 'warning' }[];
  /** The brush under the pointer: a circle of radius r grid units, or a square of n ground cells. */
  brush: { shape: 'circle'; r: number } | { shape: 'cells'; cell: number; n: number } | null;
  /** Each section's colour on the editor's map (by its kind, as '#rrggbb'), for the section lines in Layout. */
  sectionColors?: string[];
}

const RED = 0xff3b30;
const YELLOW = 0xffd60a;
const SELECT = 0xff8a1e;
/** Section boundaries: the game's cream edged in its ink, readable on dirt, grass and any section colour. */
const BOUND = COLORS.cream;
const BOUND_EDGE = COLORS.ink;
/** A section colour sent as '#rrggbb'; the map's "other" orange when missing. */
const hexColor = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : 0xf0a020);
/** Rebuilding the 3D scene takes a moment, so a stream of changes (a brush stroke) rebuilds at most this often, in ms. */
/** An angle in degrees, from 0 up to 360. */
const wrapDeg = (a: number) => ((a % 360) + 360) % 360;

const REBUILD_EVERY = 300;

export class TrackEditScene extends Phaser.Scene {
  private view: RaceView | null = null;
  private holder!: Phaser.GameObjects.Container;
  private turnLabel!: Phaser.GameObjects.Text;
  private state: EditViewState | null = null;
  private built = '';
  private pending = false;
  private lastBuild = 0;
  private cam = { x: 50, z: 30, zoom: 1, az: 0 };
  private hover: { x: number; z: number } | null = null;
  private pan: { x: number; y: number; cx: number; cz: number } | null = null;
  /** A Shift + middle-button drag turning the view: where it started and the turn then. */
  private turn: { x: number; az: number } | null = null;
  /** The turn the view is easing to, in degrees: [ ] and the editor's turn buttons move it 45° at a time. */
  private azTo = 0;
  private space = false;
  private readonly keys = new Set<string>();
  /** What the picture last drawn showed (the camera, and the view's own changes); the view draws again only when something changes. */
  private drawn = '';
  private dirty = true;
  private readonly off: (() => void)[] = [];

  constructor() {
    super('trackedit');
  }

  create(): void {
    this.holder = this.add.container(0, 0);
    this.add
      .text(10, 8, 'Race view · wheel or + − zoom · W A S D or middle-drag pan · [ ] or Shift + middle-drag turn · 0 reset', textStyle(13, COLORS.cream, { backgroundColor: '#000000a0', padding: { x: 6, y: 4 } }))
      .setDepth(10);
    this.turnLabel = this.add.text(10, 36, '', textStyle(13, COLORS.cream, { backgroundColor: '#000000a0', padding: { x: 6, y: 4 } })).setDepth(10).setVisible(false);
    const status = this.add.text(10, 36, 'Waiting for the track editor…', textStyle(13, COLORS.cream, { backgroundColor: '#000000a0', padding: { x: 6, y: 4 } })).setDepth(10);
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'message', (e) => {
      if (e.source !== window.parent || !e.data) return;
      // Camera keys pressed while the editor around the view has the keyboard.
      if (e.data.type === 'camkey') return void this.camKey(String(e.data.key), !!e.data.down);
      if (e.data.type === 'play') return void this.markPlay(typeof e.data.f === 'number' ? e.data.f : null);
      if (e.data.type !== 'track') return;
      this.state = e.data.state as EditViewState;
      status.setVisible(false);
      this.queue();
    });
    const canvas = this.game.canvas;
    const at = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * this.scale.width) / r.width, y: ((e.clientY - r.top) * this.scale.height) / r.height };
    };
    const send = (msg: object) => window.parent.postMessage(msg, '*');
    const pointer = (phase: string, e: PointerEvent | MouseEvent) => {
      const p = at(e);
      const g = this.view?.pick(p.x, p.y) ?? null;
      if (phase === 'move') this.hover = g ? { x: g.x, z: g.z } : null;
      if (!g && phase !== 'up') return;
      send({ type: 'pointer', phase, button: e.button, x: g?.x ?? null, y: g?.z ?? null, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey });
    };
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(canvas, 'pointerdown', (e) => {
      canvas.focus();
      if (e.button === 1 && e.shiftKey) {
        this.turn = { x: at(e).x, az: this.cam.az };
        e.preventDefault();
        return;
      }
      if (e.button === 1 || (e.button === 0 && this.space)) {
        const p = at(e);
        this.pan = { x: p.x, y: p.y, cx: this.cam.x, cz: this.cam.z };
        e.preventDefault();
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      pointer('down', e);
    });
    on(canvas, 'pointermove', (e) => {
      if (this.turn) {
        // A quarter turn for every 225 pixels dragged, following the pointer at once.
        this.azTo = wrapDeg(this.turn.az + ((at(e).x - this.turn.x) * 90) / 225);
        this.cam.az = this.azTo;
        return;
      }
      if (this.pan && this.view) {
        // Drag the ground: the grid point under the pointer stays under it.
        const p = at(e);
        const a = this.view.pick(this.pan.x, this.pan.y);
        const b = this.view.pick(p.x, p.y);
        if (a && b) {
          this.cam.x += a.x - b.x;
          this.cam.z += a.z - b.z;
          this.view.editCam = this.cam;
          this.view.aim();
        }
        this.pan = { ...this.pan, x: p.x, y: p.y };
        return;
      }
      pointer('move', e);
    });
    on(canvas, 'pointerup', (e) => {
      if (this.turn) {
        this.turn = null;
        return;
      }
      if (this.pan) {
        this.pan = null;
        return;
      }
      pointer('up', e);
    });
    on(canvas, 'pointerleave', () => {
      this.hover = null;
      send({ type: 'pointer', phase: 'leave' });
    });
    on(canvas, 'dblclick', (e) => pointer('dblclick', e));
    on(
      canvas,
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      },
      { passive: false },
    );
    on(window, 'keydown', (e) => {
      const key = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (key === ' ') {
        this.space = true;
        e.preventDefault();
        return;
      }
      if (!mod && this.camKey(key, true)) return void e.preventDefault();
      // Everything else is the editor's: its tools, undo, save and mode keys.
      if (mod && 'szyd'.includes(key.toLowerCase())) e.preventDefault();
      if (key === 'Delete' || key === 'Backspace' || key.startsWith('Arrow')) e.preventDefault();
      send({ type: 'key', key, code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey });
    });
    on(window, 'keyup', (e) => {
      if (e.key === ' ') this.space = false;
      this.camKey(e.key, false);
    });
    this.scale.on('resize', () => {
      // Too small to draw (a window being resized from nothing): build once it has a size.
      if (this.scale.width < 50 || this.scale.height < 50) return;
      this.built = '';
      this.queue();
    });
    this.events.once('shutdown', () => {
      for (const f of this.off) f();
      this.view?.destroy();
    });
    send({ type: 'ready' });
  }

  /** The camera's keys: W A S D pan while held, [ ] turn 45° (smoothly), + − zoom, 0 resets. True if the key is one. */
  private camKey(key: string, down: boolean): boolean {
    const k = key.toLowerCase();
    if (key.length === 1 && 'wasd'.includes(k)) {
      if (down) this.keys.add(k);
      else this.keys.delete(k);
      return true;
    }
    if (!down) return false;
    if (key === '[' || key === ']') this.azTo = wrapDeg(this.azTo + (key === '[' ? -45 : 45));
    else if (key === '+' || key === '=') this.zoom(1.25);
    else if (key === '-' || key === '_') this.zoom(1 / 1.25);
    else if (key === '0') this.resetCam();
    else return false;
    return true;
  }

  private zoom(k: number): void {
    this.cam.zoom = Math.max(0.35, Math.min(4, this.cam.zoom * k));
  }

  private resetCam(): void {
    const t = this.state?.track;
    if (!t) return;
    const xs = t.path.map((p) => p[0]);
    const ys = t.path.map((p) => p[1]);
    this.cam = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...ys) + Math.max(...ys)) / 2, zoom: 0.45, az: this.cam.az };
    this.azTo = 0;
  }

  /** Rebuilds the 3D scene for a changed track, at most every REBUILD_EVERY ms. */
  private queue(): void {
    this.pending = true;
  }

  private rebuild(): void {
    const st = this.state;
    if (!st || this.scale.width < 50 || this.scale.height < 50) return;
    const parts = st.parts ?? services.content.trackParts;
    const key = JSON.stringify([st.track, parts === services.content.trackParts ? null : parts, this.scale.width, this.scale.height]);
    if (key !== this.built) {
      const first = !this.built;
      this.built = key;
      // The new view takes over the old one's renderer (its WebGL context and shaders), then the old one goes.
      const old = this.view;
      const was = [...this.holder.list];
      this.view = new RaceView(this, this.holder, structuredClone(st.track), parts, 0, 0, this.scale.width, this.scale.height, old?.gl);
      old?.destroy(true);
      for (const o of was) o.destroy();
      this.view.editCam = this.cam;
      this.view.showMap(true);
      if (first) this.resetCam();
      this.lastBuild = performance.now();
    }
    this.mark();
  }

  update(_t: number, dtMs: number): void {
    if (this.pending && performance.now() - this.lastBuild > REBUILD_EVERY) {
      this.pending = false;
      this.rebuild();
    }
    const v = this.view;
    if (!v) return;
    // Keyboard panning, along the screen's own left-right and up-down.
    const step = ((v.unitsAcross() / this.cam.zoom) * dtMs) / 1000 / 2;
    const { right, up } = v.groundAxes();
    const mx = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);
    const my = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0);
    this.cam.x += step * (mx * right.x + my * up.x);
    this.cam.z += step * (mx * right.z + my * up.z);
    this.cam.x = Math.max(-10, Math.min(110, this.cam.x));
    this.cam.z = Math.max(-10, Math.min(70, this.cam.z));
    // Turning eases to the angle asked for, the short way round, at up to 240° a second.
    const dAz = ((this.azTo - this.cam.az + 540) % 360) - 180;
    if (dAz !== 0) this.cam.az = Math.abs(dAz) < 0.5 ? this.azTo : wrapDeg(this.cam.az + Math.sign(dAz) * Math.min(Math.abs(dAz), Math.max(Math.abs(dAz) * 0.25, (240 * dtMs) / 1000)));
    const turned = Math.round(this.cam.az) % 360;
    this.turnLabel.setText(`View turned ${turned > 180 ? `${360 - turned}° left` : `${turned}° right`} · 0 or Reset view goes back`).setVisible(turned !== 0);
    v.editCam = this.cam;
    this.markBrush();
    if (this.state?.mode === 'layout' && Math.abs(Math.log(this.cam.zoom / this.markedZoom)) > 0.18) this.mark();
    const shot = `${this.cam.x},${this.cam.z},${this.cam.zoom},${this.cam.az},${v.version}`;
    if (!this.dirty && shot === this.drawn) return;
    this.dirty = false;
    this.drawn = shot;
    v.update([], -60, dtMs / 1000, null);
  }

  // ---- markers ----

  private brushGroup: THREE.Group | null = null;
  /** The zoom the section lines were drawn for: zooming well past it draws them again at a width that reads. */
  private markedZoom = 1;

  /** The selection and the checks' markers, rebuilt whenever the editor sends its state. */
  private mark(): void {
    const v = this.view;
    const st = this.state;
    if (!v || !st) return;
    this.dirty = true;
    for (const c of [...v.overlay.children]) if (c !== this.brushGroup && c !== this.playDot) dispose(v.overlay, c);
    const t = st.track;
    const line = (pts: { x: number; z: number }[], color: number, closed = false, dashed = false, width = 0.09, order = 10) => v.overlay.add(ribbon(v, closed ? [...pts, pts[0]] : pts, color, dashed, false, width, order));
    const rect = (x: number, z: number, w: number, d: number, a: number) => {
      const pts = [];
      for (const [u, q] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        // Every side sampled, so the outline follows the ground over a hill.
        pts.push({ x: x + ((u * w) / 2) * Math.cos(a) - ((q * d) / 2) * Math.sin(a), z: z + ((u * w) / 2) * Math.sin(a) + ((q * d) / 2) * Math.cos(a) });
      }
      const out: { x: number; z: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % 4];
        for (let k = 0; k < 6; k++) out.push({ x: p.x + ((q.x - p.x) * k) / 6, z: p.z + ((q.z - p.z) * k) / 6 });
      }
      return out;
    };
    const ring = (x: number, z: number, r: number) => Array.from({ length: 40 }, (_, i) => ({ x: x + r * Math.cos((i / 40) * Math.PI * 2), z: z + r * Math.sin((i / 40) * Math.PI * 2) }));
    const parts = st.parts ?? services.content.trackParts;
    const size = (i: number) => {
      const it = t.scenery?.[i];
      if (!it) return null;
      const def = parts.scenery.find((s) => s.id === it.type);
      return { x: it.x, z: it.y, w: it.w ?? def?.w ?? 2, d: it.h ?? def?.h ?? 2, a: ((it.rot ?? 0) * Math.PI) / 180 };
    };
    for (const p of st.issues) {
      const color = p.level === 'error' ? RED : YELLOW;
      if (p.item !== undefined) {
        const f = size(p.item);
        if (f) line(rect(f.x, f.z, f.w + 0.2, f.d + 0.2, f.a), color, true, p.level === 'warning');
      } else if (p.x !== undefined && p.y !== undefined) line(ring(p.x, p.y, 1.2), color, true, p.level === 'warning');
    }
    if (st.sel.item >= 0) {
      const f = size(st.sel.item);
      if (f) line(rect(f.x, f.z, f.w + 0.45, f.d + 0.45, f.a), SELECT, true);
    }
    if (st.mode === 'layout') {
      // The sections, from the track's own section lengths: a stripe down the middle of each in its
      // kind's colour (as on the map), following the bends, and a line across the track where one
      // section ends and the next begins. The lap's start (the finish line) already has its own line.
      const b = sectionBounds(t);
      const n = t.sections.length;
      // A few pixels wide at any zoom: wider in grid units zoomed out, narrower zoomed in.
      this.markedZoom = this.cam.zoom;
      const k = Math.max(0.5, Math.min(2, 0.8 / this.cam.zoom));
      const along = (f0: number, f1: number) => {
        const k = Math.max(2, Math.ceil(((f1 - f0) * v.surface.g.total) / 0.25));
        return Array.from({ length: k + 1 }, (_, j) => v.surface.spot(f0 + ((f1 - f0) * j) / k, 0));
      };
      for (let i = 0; i < n; i++) {
        if (b[i + 1] <= b[i]) continue;
        const sel = i === st.sel.sec;
        line(along(b[i], b[i + 1]), sel ? SELECT : hexColor(st.sectionColors?.[i]), false, false, (sel ? 0.2 : 0.11) * k, 9);
      }
      for (let i = 1; i < n; i++) {
        if (b[i] <= b[i - 1] || b[i] >= 1) continue;
        const across = Array.from({ length: 9 }, (_, j) => v.surface.spot(b[i], -1.05 + (2.1 * j) / 8));
        line(across, BOUND_EDGE, false, false, 0.14 * k, 9.5);
        line(across, BOUND, false, false, 0.07 * k, 9.6);
      }
      // The lap's points (white, the finish line's bigger) and the start straight's (blue).
      t.path.forEach(([x, y], i) => line(ring(x, y, i === st.sel.pt ? 0.6 : i === 0 ? 0.5 : 0.35), i === st.sel.pt ? SELECT : 0xffffff, true));
      (t.start?.path ?? []).forEach(([x, y], i) => line(rect(x, y, 0.6, 0.6, 0), i === st.sel.start ? SELECT : 0x4aa0ff, true));
    }
  }

  /** The editor's Preview rider: an orange dot ridden round the lap, as on the map. */
  private playDot: THREE.Mesh | null = null;

  private markPlay(f: number | null): void {
    const v = this.view;
    if (!v) return;
    if (f === null) {
      if (this.playDot) dispose(this.playDot.parent ?? v.overlay, this.playDot);
      this.playDot = null;
      this.dirty = true;
      return;
    }
    if (!this.playDot || this.playDot.parent !== v.overlay) {
      if (this.playDot) dispose(this.playDot.parent ?? v.overlay, this.playDot);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: SELECT, depthTest: false }));
      dot.rotation.x = -Math.PI / 2;
      dot.renderOrder = 11;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      rim.renderOrder = 11;
      dot.add(rim);
      v.overlay.add(dot);
      this.playDot = dot;
    }
    const p = v.surface.spot(f, 0);
    this.playDot.position.set(p.x, v.heightAt(p.x, p.z) + 0.1, p.z);
    // 10 pixels across its middle, as on the map, at any zoom.
    this.playDot.scale.setScalar((10 * v.unitsAcross()) / this.cam.zoom / this.scale.width);
    this.dirty = true;
  }

  /** The brush under the pointer, following the ground. */
  private brushKey = '';

  private markBrush(): void {
    const v = this.view;
    const b = this.state?.brush;
    if (!v) return;
    const key = JSON.stringify([b, this.hover]);
    if (key === this.brushKey && (this.brushGroup ? this.brushGroup.parent === v.overlay : !b || !this.hover)) return;
    this.brushKey = key;
    this.dirty = true;
    if (this.brushGroup) dispose(v.overlay, this.brushGroup);
    this.brushGroup = null;
    if (!b || !this.hover) return;
    const g = new THREE.Group();
    const h = this.hover;
    const pts: { x: number; z: number }[] = [];
    if (b.shape === 'circle') {
      for (let i = 0; i <= 48; i++) pts.push({ x: h.x + b.r * Math.cos((i / 48) * Math.PI * 2), z: h.z + b.r * Math.sin((i / 48) * Math.PI * 2) });
    } else {
      const x0 = (Math.floor(h.x / b.cell) - Math.floor((b.n - 1) / 2)) * b.cell;
      const z0 = (Math.floor(h.z / b.cell) - Math.floor((b.n - 1) / 2)) * b.cell;
      const s = b.n * b.cell;
      // Each side sampled, so the square follows the ground.
      const c = [
        [x0, z0],
        [x0 + s, z0],
        [x0 + s, z0 + s],
        [x0, z0 + s],
      ];
      for (let i = 0; i < 4; i++) for (let k = 0; k <= 8; k++) pts.push({ x: c[i][0] + ((c[(i + 1) % 4][0] - c[i][0]) * k) / 8, z: c[i][1] + ((c[(i + 1) % 4][1] - c[i][1]) * k) / 8 });
    }
    // The ground's height grid, not a ray at the 3D scene: this follows the pointer every frame.
    g.add(ribbon(v, pts, 0xffffff, false, true));
    v.overlay.add(g);
    this.brushGroup = g;
  }
}

/** A flat band (WebGL draws lines one pixel wide) along points on the ground, drawn over everything, dashed if asked; `quick` follows the ground's height grid instead of the 3D surface. */
function ribbon(v: RaceView, pts: { x: number; z: number }[], color: number, dashed: boolean, quick = false, w = 0.09, order = 10): THREE.Mesh {
  const y = (x: number, z: number) => (quick ? v.terrainAt(x, z) + 0.1 : v.heightAt(x, z) + 0.06);
  const pos: number[] = [];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    run += len;
    if (len < 1e-6 || (dashed && Math.floor(run / 0.4) % 2 === 1)) continue;
    const nx = (-(b.z - a.z) / len) * w;
    const nz = ((b.x - a.x) / len) * w;
    const ya = y(a.x, a.z);
    const yb = y(b.x, b.z);
    pos.push(a.x + nx, ya, a.z + nz, a.x - nx, ya, a.z - nz, b.x + nx, yb, b.z + nz, b.x + nx, yb, b.z + nz, a.x - nx, ya, a.z - nz, b.x - nx, yb, b.z - nz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide }));
  m.renderOrder = order;
  return m;
}

function dispose(parent: THREE.Object3D, o: THREE.Object3D): void {
  parent.remove(o);
  o.traverse((c) => {
    const m = c as THREE.Line;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
}
