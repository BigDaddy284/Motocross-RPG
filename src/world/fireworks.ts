import * as THREE from 'three';
import { fireworkShow, type Shell } from '../core/fireworks';
import { mixSeed, seededRng } from '../core/race';

// The finish arch's fireworks in the race view (core/fireworks.ts): each shell climbs from the top
// of a post trailing sparks, bursts into a ball of sparks in its colour that fall and fade. One
// THREE.Points holds every spark, drawn additively so they glow.

/** Most sparks alive at once. */
const MAX = 1600;
/** Sparks in one burst. */
const BURST = 72;
/** Seconds a shell takes to climb. */
const CLIMB = 0.7;
const GRAVITY = 4;

interface Spark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  max: number;
  colour: THREE.Color;
}

export class Fireworks {
  private readonly shells: Shell[];
  private next = 0;
  private readonly sparks: Spark[] = [];
  private readonly rising: { shell: Shell; t: number }[] = [];
  private readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly rnd: () => number;

  /** `posts` are the tops of the arch's posts; the show starts at race time `from`. */
  constructor(scene: THREE.Scene, private readonly posts: THREE.Vector3[], private readonly from: number, seed: number, size: number) {
    this.shells = fireworkShow(posts.length, seed);
    this.rnd = seededRng(mixSeed(seed, 0xb005));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  /** Moves the show on to race time `clock`, `dc` seconds since the last frame. */
  update(clock: number, dc: number): void {
    const t = clock - this.from;
    while (this.next < this.shells.length && this.shells[this.next].at <= t) this.rising.push({ shell: this.shells[this.next++], t: 0 });
    for (let i = this.rising.length - 1; i >= 0; i--) {
      const r = this.rising[i];
      r.t += dc;
      const top = this.posts[r.shell.post];
      const k = Math.min(1, r.t / CLIMB);
      // Eases out as it climbs, like a shell slowing at the top.
      const y = top.y + r.shell.rise * (1 - (1 - k) * (1 - k));
      if (k < 1) {
        // A trail of embers behind the climbing shell.
        this.spark(top.x, y, top.z, (this.rnd() - 0.5) * 0.4, -0.5, (this.rnd() - 0.5) * 0.4, 0.35, new THREE.Color(0xffe0a0));
        continue;
      }
      this.rising.splice(i, 1);
      const c = new THREE.Color(r.shell.colour);
      for (let n = 0; n < BURST; n++) {
        // Evenly round a sphere, at a little more or less speed so the ball has depth.
        const u = this.rnd() * 2 - 1;
        const a = this.rnd() * Math.PI * 2;
        const sp = 4.5 + 1.8 * this.rnd();
        const ring = Math.sqrt(1 - u * u);
        this.spark(top.x, y, top.z, Math.cos(a) * ring * sp, u * sp, Math.sin(a) * ring * sp, 1.4 + 0.6 * this.rnd(), c);
      }
    }
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dc;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-dc * 1.6);
      s.vx *= drag;
      s.vz *= drag;
      s.vy = s.vy * drag - GRAVITY * dc;
      s.x += s.vx * dc;
      s.y += s.vy * dc;
      s.z += s.vz * dc;
      // Fades out over the last of its life, with a twinkle.
      const k = Math.min(1, s.life / (s.max * 0.6)) * (0.75 + 0.25 * Math.sin(s.life * 40 + i));
      this.pos.set([s.x, s.y, s.z], n * 3);
      this.col.set([s.colour.r * k, s.colour.g * k, s.colour.b * k], n * 3);
      n++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, colour: THREE.Color): void {
    if (this.sparks.length >= MAX) this.sparks.shift();
    this.sparks.push({ x, y, z, vx, vy, vz, life, max: life, colour });
  }
}
