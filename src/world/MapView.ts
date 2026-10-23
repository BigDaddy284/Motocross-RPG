import Phaser from 'phaser';
import type { BakedMap, MapSprite } from '../core/mapTypes';

// Draws a baked map. Ground layers are painted once into a texture that stays cached, so a
// second visit to a map skips both the image downloads and the painting (Spec 22, map caching).

export const OVERHEAD_DEPTH = 1_000_000;

const imageKey = (path: string) => `img:${path}`;

/** Loads any of the map's images not already in the texture cache. */
export function loadMapImages(scene: Phaser.Scene, map: BakedMap): Promise<void> {
  const missing = map.images.filter((p) => !scene.textures.exists(imageKey(p)));
  if (!missing.length) return Promise.resolve();
  return new Promise((resolve) => {
    for (const p of missing) scene.load.image(imageKey(p), `assets/${p}`);
    scene.load.once('complete', () => resolve());
    scene.load.start();
  });
}

export function isMapCached(scene: Phaser.Scene, map: BakedMap): boolean {
  return scene.textures.exists(`ground:${map.id}`);
}

export class MapView {
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  /**
   * `hidden` sprites are left out and `patches` drawn over the ground, for story changes such as
   * cleared roadworks (core/mapState).
   */
  constructor(scene: Phaser.Scene, map: BakedMap, hidden: ReadonlySet<MapSprite> = new Set(), patches: { img: number; x: number; y: number }[] = []) {
    const t = map.tileSize;
    const groundKey = `ground:${map.id}`;
    if (!scene.textures.exists(groundKey)) {
      const dt = scene.textures.addDynamicTexture(groundKey, map.width * t, map.height * t)!;
      dt.beginDraw();
      for (const layer of map.ground) {
        layer.cells.forEach((img, i) => {
          if (img < 0) return;
          const key = imageKey(map.images[img]);
          const h = scene.textures.getFrame(key).height;
          dt.batchDraw(key, (i % map.width) * t, (Math.floor(i / map.width) + 1) * t - h);
        });
      }
      dt.endDraw();
    }
    this.objects.push(scene.add.image(0, 0, groundKey).setOrigin(0).setDepth(-1));
    for (const p of patches) this.objects.push(scene.add.image(p.x * t, p.y * t, imageKey(map.images[p.img])).setOrigin(0).setDepth(-0.9));

    for (const s of map.sprites) {
      if (hidden.has(s)) continue;
      const key = imageKey(map.images[s.img]);
      let frame: string | undefined;
      if (s.crop) {
        frame = s.crop.join(',');
        const tex = scene.textures.get(key);
        if (!tex.has(frame)) tex.add(frame, 0, ...s.crop);
      }
      const img = scene.add.sprite(s.x, s.y, key, frame).setOrigin(0);
      if (img.width !== s.w || img.height !== s.h) img.setDisplaySize(s.w, s.h);
      img.setDepth(s.overhead ? OVERHEAD_DEPTH + s.depth : s.depth);
      if (s.frames?.length) {
        const keys = s.frames.map((f) => imageKey(map.images[f.img]));
        let i = 0;
        scene.time.addEvent({
          delay: s.frames[0].ms,
          loop: true,
          callback: () => {
            i = (i + 1) % keys.length;
            if (img.active) img.setTexture(keys[i]);
          },
        });
      }
      this.objects.push(img);
    }
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
  }
}
