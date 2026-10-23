import Phaser from 'phaser';
import { BUILD_LABEL, CAREER_SLOT, services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { button, panel } from '../ui/widgets';
import { startCareer } from './careerFlow';

// Main menu: opens directly with no intro (Spec 22). New, Continue, Load, Settings, Archive,
// Info and Exit.

export class MenuScene extends Phaser.Scene {
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super('menu');
  }

  create(): void {
    this.overlay = undefined;
    const draw = () => this.layout();
    draw();
    this.scale.on('resize', draw, this);
    this.events.once('shutdown', () => this.scale.off('resize', draw, this));
  }

  private layout(): void {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, COLORS.ink).setOrigin(0);
    // Laid out for 640 px of height, then scaled down to fit short screens such as a phone on its side.
    const k = Math.min(1, height / 640, width / 420);
    const menu = this.add.container(width / 2, (height - 640 * k) / 2).setScale(k);
    menu.add(this.add.text(0, 50, 'MOTOCROSS RPG', textStyle(52, COLORS.accent, { fontStyle: 'bold' })).setOrigin(0.5));
    menu.add(this.add.text(0, 100, 'The Road to Legend', textStyle(24)).setOrigin(0.5));

    const hasSave = services.saves.load(CAREER_SLOT).status !== 'empty';
    const items: [string, () => void, boolean][] = [
      ['New career', () => this.scene.start('newCareer'), true],
      ['Continue', () => startCareer(this, CAREER_SLOT), hasSave],
      ['Load', () => this.showLoad(), hasSave],
      ['Settings', () => this.scene.start('settings', { back: 'menu' }), true],
      ['Archive', () => this.showInfo('Archive', 'Finished and abandoned careers will be kept here. Nothing to show in the test build.'), true],
      ['Info', () => this.showInfo('Info', `${BUILD_LABEL}\n\nWalk with WASD or the arrow keys, or click or tap where you want to go.\nClick an NPC to talk. E or Space talks to whoever you are facing.\nTab, I or B opens your bike, bag and task.\nMouse wheel, + and -, or the Zoom button to zoom. Esc for the pause menu.\n\nAll art is placeholder art in the agreed style.`), true],
      ['Exit', () => this.exit(), true],
    ];
    items.forEach(([label, fn, on], i) => menu.add(button(this, 0, 180 + i * 56, label, fn).setEnabled(on)));
    this.add.text(width - 12, height - 10, BUILD_LABEL, textStyle(14, COLORS.muted)).setOrigin(1, 1);
  }

  private modal(title: string, h = 300): Phaser.GameObjects.Container {
    this.overlay?.destroy();
    const { width, height } = this.scale;
    const k = Math.min(1, height / (h + 40), width / 600);
    const c = this.add.container(width / 2, height / 2);
    c.add(this.add.rectangle(0, 0, width / k, height / k, 0, 0.6).setInteractive());
    c.setScale(k);
    c.add(panel(this, 0, 0, 560, h));
    c.add(this.add.text(0, -h / 2 + 30, title, textStyle(26, COLORS.accent)).setOrigin(0.5));
    c.add(button(this, 0, h / 2 - 36, 'Close', () => c.destroy(), 160, 40));
    this.overlay = c;
    return c;
  }

  private showInfo(title: string, body: string): void {
    const c = this.modal(title, 340);
    c.add(this.add.text(0, -10, body, textStyle(17, COLORS.cream, { align: 'center', wordWrap: { width: 500 } })).setOrigin(0.5));
  }

  /** Lists the career save and its rotating backups. */
  private showLoad(): void {
    const c = this.modal('Load', 420);
    const r = services.saves.load(CAREER_SLOT);
    const rows: [string, () => void][] = [];
    if (r.status === 'ok') rows.push([`Career 1  ·  ${when(r.data.savedAt)}`, () => startCareer(this, CAREER_SLOT)]);
    for (const b of services.saves.backups(CAREER_SLOT)) {
      if (!b.savedAt) continue;
      rows.push([`Backup ${b.index}  ·  ${when(b.savedAt)}`, () => {
        services.saves.restoreBackup(CAREER_SLOT, b.index);
        startCareer(this, CAREER_SLOT);
      }]);
    }
    rows.forEach(([label, fn], i) => c.add(button(this, 0, -130 + i * 50, label, fn, 440, 40)));
  }

  private exit(): void {
    window.close();
    // A browser tab that the game did not open ignores close(), so say goodbye instead.
    this.showInfo('Thanks for testing', 'You can close this window now.');
  }
}

export function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown time' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
