import Phaser from 'phaser';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { button } from '../ui/widgets';
import { newCareer } from './careerFlow';

// Test-build character pick: one of the sample riders. Full character creation (body, skin,
// eyes, hair) uses the same layers in a later build.

const LOOKS = ['player-m-start-a', 'player-f-start-a', 'player-m-start-b', 'player-f-start-b'];

export class NewCareerScene extends Phaser.Scene {
  private index = 0;

  constructor() {
    super('newCareer');
  }

  create(): void {
    const looks = LOOKS.filter((l) => services.manifest.characters.sheets[l]);
    const { width: sw, height: sh } = this.scale;
    this.add.rectangle(0, 0, sw, sh, COLORS.ink).setOrigin(0);
    // Laid out for 1280 × 720 and scaled down to fit smaller screens.
    const k = Math.min(1, sw / 760, sh / 720);
    const width = 760;
    const height = 720;
    const cx = width / 2;
    const root = this.add.container((sw - width * k) / 2, (sh - height * k) / 2).setScale(k);
    const add = this.add;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => (root.add(o), o);
    track(add.text(cx, 70, 'New career', textStyle(36, COLORS.accent)).setOrigin(0.5));
    track(add.text(cx, 115, 'Pick your rider. You start with a broken 50cc and a dream.', textStyle(18)).setOrigin(0.5));

    track(add.ellipse(cx, height / 2 + 92, 120, 30, COLORS.inkLine, 0.3));
    const rider = track(add.sprite(cx, height / 2 + 100, `chr:${looks[0]}:walk`, 0).setOrigin(0.5, 1).setScale(3));
    const label = track(add.text(cx, height / 2 + 140, '', textStyle(18, COLORS.muted)).setOrigin(0.5));
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
    track(button(this, cx - 200, height / 2 - 20, '◀', () => step(-1), 60, 60));
    track(button(this, cx + 200, height / 2 - 20, '▶', () => step(1), 60, 60));
    this.input.keyboard?.on('keydown-LEFT', () => step(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => step(1));

    track(button(this, cx - 140, height - 80, 'Back', () => this.scene.start('menu'), 220, 46));
    track(button(this, cx + 140, height - 80, 'Start career', () => newCareer(this, looks[this.index]), 220, 46));
  }
}
