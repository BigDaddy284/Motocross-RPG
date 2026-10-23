import Phaser from 'phaser';
import { bikeStats, statMax, type Bike } from '../core/career';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { button, panel, statBar, textInput, type Button } from '../ui/widgets';
import { newCareer } from './careerFlow';

// Character creation for the test build: one of the sample riders, a rider name that can't be
// changed later (GDD 4.1), and one of four starter 50cc bikes, one per brand (Spec 18.8).
// Full character creation (body, skin, eyes, hair) uses the same layers in a later build.

const LOOKS = ['player-m-start-a', 'player-f-start-a', 'player-m-start-b', 'player-f-start-b'];
const NAME_MAX = 16;
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9 '\-]*$/;

export class NewCareerScene extends Phaser.Scene {
  private index = 0;
  private brand = 0;

  constructor() {
    super('newCareer');
  }

  create(): void {
    this.index = 0;
    this.brand = 0;
    const { bikes } = services.content;
    const looks = LOOKS.filter((l) => services.manifest.characters.sheets[l]);
    const { width: sw, height: sh } = this.scale;
    this.add.rectangle(0, 0, sw, sh, COLORS.ink).setOrigin(0);
    // Laid out for 1160 × 720 and scaled down to fit smaller screens.
    const width = 1160;
    const height = 720;
    const k = Math.min(1, sw / width, sh / height);
    const root = this.add.container((sw - width * k) / 2, (sh - height * k) / 2).setScale(k);
    const add = this.add;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => (root.add(o), o);
    track(add.text(width / 2, 50, 'New career', textStyle(36, COLORS.accent)).setOrigin(0.5));
    track(add.text(width / 2, 92, 'Pick your rider and your first bike. Every champion starts somewhere.', textStyle(18)).setOrigin(0.5));

    // ---- rider ----
    const lx = 250;
    track(panel(this, lx, 360, 420, 470));
    track(add.text(lx, 150, 'Your rider', textStyle(22, COLORS.accent)).setOrigin(0.5));
    track(add.ellipse(lx, 382, 120, 30, COLORS.inkLine, 0.3));
    const rider = track(add.sprite(lx, 390, `chr:${looks[0]}:walk`, 0).setOrigin(0.5, 1).setScale(3));
    const label = track(add.text(lx, 410, '', textStyle(16, COLORS.muted)).setOrigin(0.5));
    const anim = (id: string) => {
      const key = `newcareer:${id}`;
      if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(`chr:${id}:walk`, { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
      rider.play(key);
      label.setText(`Rider ${this.index + 1} of ${looks.length}`);
    };
    anim(looks[0]);
    const step = (d: number) => {
      this.index = (this.index + d + looks.length) % looks.length;
      anim(looks[this.index]);
    };
    track(button(this, lx - 150, 300, '◀', () => step(-1), 52, 52));
    track(button(this, lx + 150, 300, '▶', () => step(1), 52, 52));

    track(add.text(lx - 180, 450, 'Rider name', textStyle(18)));
    track(add.text(lx - 180, 540, "You can't change it later.", textStyle(15, COLORS.muted)));
    const nameError = track(add.text(lx - 180, 565, '', textStyle(15, COLORS.accent)));
    const nameBox = track(add.rectangle(lx, 500, 360, 44, COLORS.panel).setStrokeStyle(2, COLORS.panelLight));
    const name = textInput(this, root, nameBox, { maxLength: NAME_MAX, placeholder: 'Type a name' });

    // ---- bike ----
    const rx = 820;
    track(panel(this, rx, 360, 600, 470));
    track(add.text(rx, 150, 'Your first bike', textStyle(22, COLORS.accent)).setOrigin(0.5));
    const bikeName = track(add.text(rx, 240, '', textStyle(24, COLORS.cream, { fontStyle: 'bold' })).setOrigin(0.5));
    const bikeChar = track(add.text(rx, 274, '', textStyle(16, COLORS.cream, { align: 'center', wordWrap: { width: 520 } })).setOrigin(0.5, 0));
    const brandButtons: Button[] = bikes.brands.map((b, i) =>
      track(button(this, rx - 225 + i * 150, 192, b.name, () => pick(i), 140, 40)),
    );
    const max = statMax(bikes, bikes.starter.class);
    const bars = bikes.stats.map((st, i) => track(statBar(this, rx - 240, 340 + i * 34, st.name, 300, max)));
    track(add.text(rx, 560, 'Second-hand, so every part is worn, and the top end is broken.\nAll four have the same overall performance.', textStyle(15, COLORS.muted, { align: 'center' })).setOrigin(0.5));
    const pick = (i: number) => {
      this.brand = i;
      const b = bikes.brands[i];
      brandButtons.forEach((btn, j) => btn.setSelected(j === i));
      bikeName.setText(b.starter);
      bikeChar.setText(b.character);
      // Show the brand's character on a fresh bike, so worn parts don't hide it.
      const fresh: Bike = { brand: b.id, class: bikes.starter.class, parts: Object.fromEntries(bikes.slots.map((s) => [s.id, { grade: bikes.starter.grade, condition: 1 }])) };
      const stats = bikeStats(bikes, fresh);
      bikes.stats.forEach((st, j) => bars[j].setValue(stats[st.id]));
    };
    pick(0);

    const typing = () => name.focused();
    this.input.keyboard?.on('keydown-LEFT', () => !typing() && step(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => !typing() && step(1));

    track(button(this, width / 2 - 140, height - 50, 'Back', () => this.scene.start('menu'), 220, 46));
    track(button(this, width / 2 + 140, height - 50, 'Start career', () => {
      const n = name.value().trim().replace(/\s+/g, ' ');
      if (!n) return void nameError.setText('Give your rider a name first.');
      if (!NAME_OK.test(n)) return void nameError.setText("Use letters, numbers, spaces, ' and - only.");
      newCareer(this, { look: looks[this.index], name: n, brand: bikes.brands[this.brand].id });
    }, 220, 46));
  }
}
