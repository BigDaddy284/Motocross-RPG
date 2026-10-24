import Phaser from 'phaser';
import { centre, type Heading, type Move, type VanDesign, type VanPose, type VanSheet } from '../core/vehicles';
import { services } from '../services';
import { TILE } from './Character';

// Draws the player's van on an area map from its sheet (art/vehicles/sheets/map): the heading's
// closed or rear-open cell, a soft shadow on the footprint, and the rider seen through the cab
// window while driving.

/** The driver is drawn a little smaller than the rider on foot, sat down behind the glass. */
const DRIVER_SCALE = 0.85;
/** The point of the rider's 64 × 64 frame that sits in the middle of the window: their face. */
const DRIVER_FACE: [number, number] = [32, 24];

export const vanTexture = (id: string) => `veh:${id}`;

/** Adds the sheet's named frames (east:closed, east:open, ...) once. */
function ensureFrames(scene: Phaser.Scene, id: string, sheet: VanSheet): void {
  const tex = scene.textures.get(vanTexture(id));
  for (const [h, v] of Object.entries(sheet.views)) {
    for (const state of ['closed', 'open'] as const) {
      const name = `${h}:${state}`;
      if (!tex.has(name)) tex.add(name, 0, ...v[state]);
    }
  }
}

export class VanView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Rectangle;
  private driver: Phaser.GameObjects.Image | null = null;
  private driverSheet: string | null = null;
  private open = false;
  pose: VanPose;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly design: VanDesign,
    private readonly sheet: VanSheet,
    pose: VanPose,
  ) {
    ensureFrames(scene, design.id, sheet);
    this.pose = { ...pose };
    this.shadow = scene.add.rectangle(0, 0, 10, 10, 0x14181e, 0.3);
    this.sprite = scene.add.image(0, 0, vanTexture(design.id), `${pose.heading}:closed`);
    this.place(pose);
  }

  /** Puts the van straight on a pose. */
  place(pose: VanPose): void {
    this.pose = { ...pose };
    this.setFrame(pose.heading);
    const c = centre(pose, this.design.length);
    this.setPixel(c.x * TILE, c.y * TILE, pose.heading);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.setFrame(this.pose.heading);
  }

  /** Shows the rider (a character sheet) in the cab, or nobody. */
  setDriver(sheet: string | null): void {
    this.driverSheet = sheet;
    this.driver?.destroy();
    this.driver = sheet ? this.scene.add.image(0, 0, `chr:${sheet}:act`, 0).setOrigin(0, 0).setScale(DRIVER_SCALE) : null;
    this.setPixel(this.sprite.x, this.sprite.y, this.heading);
  }

  /** Animates one drive move. A turn swings the body round halfway through. */
  move(m: Move): Promise<void> {
    const from = { x: this.sprite.x, y: this.sprite.y };
    const c = centre(m.to, this.design.length);
    const to = { x: c.x * TILE, y: c.y * TILE };
    const fromHeading = this.pose.heading;
    this.pose = { ...m.to };
    const steps = m.kind === 'turn' ? 2 : m.kind === 'uturn' ? 3 : 1;
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: this.design.stepMs * steps,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const h = v < 0.5 ? fromHeading : m.to.heading;
          this.setFrame(h);
          this.setPixel(from.x + (to.x - from.x) * v, from.y + (to.y - from.y) * v, h);
        },
        onComplete: () => {
          this.place(m.to);
          resolve();
        },
      });
    });
  }

  /** True when a world point is on the van's picture. */
  contains(wx: number, wy: number): boolean {
    return this.sprite.getBounds().contains(wx, wy) && this.scene.textures.getPixelAlpha(wx - this.sprite.getTopLeft().x, wy - this.sprite.getTopLeft().y, vanTexture(this.design.id), this.sprite.frame.name) > 0;
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.driver?.destroy();
  }

  private heading: Heading = 'east';

  private setFrame(h: Heading): void {
    this.heading = h;
    const frame = `${h}:${this.open ? 'open' : 'closed'}`;
    if (this.sprite.frame.name !== frame) this.sprite.setFrame(frame);
    const v = this.sheet.views[h];
    const cell = v.closed;
    this.sprite.setOrigin(v.anchor[0] / cell[2], v.anchor[1] / cell[3]);
  }

  /** Places the picture with the footprint centre at (x, y), sorted by the footprint's bottom edge. */
  private setPixel(x: number, y: number, h: Heading): void {
    const along = h === 'east' || h === 'west';
    const len = this.design.length * TILE;
    const w = along ? len - 12 : TILE * 0.72;
    const ht = along ? TILE * 0.72 : len - 12;
    const bottom = y + (along ? TILE : len) / 2;
    this.sprite.setPosition(Math.round(x), Math.round(y)).setDepth(bottom - 0.5);
    this.shadow.setPosition(x, y + 4).setSize(w, ht).setOrigin(0.5).setDisplaySize(w, ht).setDepth(bottom - 0.75);
    this.placeDriver(h);
  }

  /** The rider's face in the cab window, cropped to the glass. Hidden from behind unless there is a rear window. */
  private placeDriver(h: Heading): void {
    const d = this.driver;
    if (!d || !this.driverSheet) return;
    const view = this.sheet.views[h];
    const win = view.driver;
    if (!win) {
      d.setVisible(false);
      return;
    }
    const cols = services.manifest.characters.act.columns.length;
    const facing = h === 'north' ? 'up' : h === 'south' ? 'down' : h === 'east' ? 'right' : 'left';
    d.setFrame(services.manifest.characters.rows.indexOf(facing) * cols);
    const left = this.sprite.x - view.anchor[0];
    const top = this.sprite.y - view.anchor[1];
    const wx = left + win[0];
    const wy = top + win[1];
    const ix = wx + win[2] / 2 - DRIVER_FACE[0] * DRIVER_SCALE;
    const iy = wy + win[3] / 2 - DRIVER_FACE[1] * DRIVER_SCALE + 2;
    d.setPosition(ix, iy).setVisible(true).setDepth(this.sprite.depth + 0.01);
    d.setCrop((wx - ix) / DRIVER_SCALE, (wy - iy) / DRIVER_SCALE, win[2] / DRIVER_SCALE, win[3] / DRIVER_SCALE);
  }
}
