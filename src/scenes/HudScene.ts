import Phaser from 'phaser';
import type { DialogueLine } from '../core/content';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { button, panel } from '../ui/widgets';
import type { WorldScene } from './WorldScene';

// Screen-space layer over the world: map name, messages, the dialogue box, the pause menu and
// touch buttons. Runs alongside the world scene at a fixed zoom.

export class HudScene extends Phaser.Scene {
  private dialogue: Phaser.GameObjects.Container | null = null;
  private pause: Phaser.GameObjects.Container | null = null;
  private toastText!: Phaser.GameObjects.Text;
  private toastBg!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private saveText!: Phaser.GameObjects.Text;
  private uiButtons: Phaser.GameObjects.Container[] = [];
  private advance: (() => void) | null = null;

  constructor() {
    super('hud');
  }

  private get world(): WorldScene {
    return this.scene.get('world') as WorldScene;
  }

  private ts(size: number): number {
    return Math.round((size * services.settings.get().accessibility.textScale) / 100);
  }

  create(): void {
    this.dialogue = null;
    this.pause = null;
    this.titleText = this.add.text(16, 14, '', textStyle(this.ts(20), COLORS.cream, { stroke: '#14141e', strokeThickness: 4 }));
    this.toastBg = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.88).setStrokeStyle(2, COLORS.panelLight).setVisible(false);
    this.toastText = this.add.text(0, 0, '', textStyle(this.ts(18), COLORS.cream, { align: 'center' })).setOrigin(0.5).setVisible(false);
    this.saveText = this.add.text(0, 0, '', textStyle(this.ts(16), COLORS.muted, { stroke: '#14141e', strokeThickness: 3 })).setOrigin(1, 0).setAlpha(0);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    const kb = this.input.keyboard!;
    // One owner for these keys, so a press that closes a dialogue or menu can't also reopen it.
    const use = () => {
      if (this.pause) return;
      if (this.dialogue) this.advance?.();
      else this.world.interactFacing();
    };
    kb.on('keydown-E', use);
    kb.on('keydown-SPACE', use);
    kb.on('keydown-ENTER', () => this.dialogue && this.advance?.());
    kb.on('keydown-ESC', () => {
      if (this.pause) this.closePause();
      else if (!this.dialogue) this.world.openPause();
    });
  }

  private layout(): void {
    const { width, height } = this.scale;
    for (const b of this.uiButtons) b.destroy();
    this.uiButtons = [
      button(this, width - 34, 34, '☰', () => this.world.openPause(), 48, 48),
      button(this, width - 34, 92, '+', () => this.world.zoomBy(10), 48, 48),
      button(this, width - 34, 146, '−', () => this.world.zoomBy(-10), 48, 48),
    ];
    this.saveText.setPosition(width - 70, 18);
    this.toastText.setPosition(width / 2, height - 60);
    this.toastText.setWordWrapWidth(Math.min(700, width - 60));
    this.fitToast();
  }

  /** True when a pointer is over a HUD button or panel, so the world ignores the click. */
  pointerOnUi(p: Phaser.Input.Pointer): boolean {
    return !!this.pause || this.input.hitTestPointer(p).length > 0;
  }

  showMapTitle(title: string): void {
    this.titleText.setText(title);
  }

  toast(message: string): void {
    this.toastText.setText(message).setVisible(true).setAlpha(1);
    this.fitToast();
    this.toastBg.setVisible(true).setAlpha(1);
    this.tweens.killTweensOf([this.toastText, this.toastBg]);
    this.tweens.add({ targets: [this.toastText, this.toastBg], alpha: 0, delay: 2600, duration: 400 });
  }

  private fitToast(): void {
    const b = this.toastText.getBounds();
    this.toastBg.setPosition(this.toastText.x, this.toastText.y).setSize(b.width + 32, b.height + 18).setOrigin(0.5);
    this.toastBg.setDisplaySize(b.width + 32, b.height + 18);
  }

  saveIndicator(text: string): void {
    this.saveText.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.saveText);
    this.tweens.add({ targets: this.saveText, alpha: 0, delay: 1500, duration: 500 });
  }

  isDialogueOpen(): boolean {
    return !!this.dialogue;
  }

  /** Shows lines one at a time; click, tap, E, Space or Enter moves on. */
  openDialogue(npcName: string, riderName: string, lines: DialogueLine[], onClose: () => void): void {
    this.dialogue?.destroy();
    const { width, height } = this.scale;
    const w = Math.min(900, width - 32);
    const h = 150;
    const c = this.add.container(width / 2, height - h / 2 - 16);
    const bg = panel(this, 0, 0, w, h).setInteractive({ useHandCursor: true });
    const name = this.add.text(-w / 2 + 24, -h / 2 + 16, '', textStyle(this.ts(18), COLORS.accent, { fontStyle: 'bold' }));
    const body = this.add.text(-w / 2 + 24, -h / 2 + 46, '', textStyle(this.ts(19), COLORS.cream, { wordWrap: { width: w - 48 }, lineSpacing: 4 }));
    const hint = this.add.text(w / 2 - 16, h / 2 - 12, '', textStyle(this.ts(14), COLORS.muted)).setOrigin(1, 1);
    c.add([bg, name, body, hint]);
    this.dialogue = c;
    let i = 0;
    const show = () => {
      const line = lines[i];
      name.setText(line.speaker === 'npc' ? npcName : riderName);
      body.setText(line.text);
      hint.setText(i < lines.length - 1 ? 'Next ▸' : 'Close ▸');
    };
    const close = () => {
      c.destroy();
      this.dialogue = null;
      this.advance = null;
      onClose();
    };
    // Skip the key press or click that opened the box.
    let ready = false;
    this.time.delayedCall(150, () => (ready = true));
    this.advance = () => {
      if (!ready) return;
      i += 1;
      if (i >= lines.length) close();
      else show();
    };
    bg.on('pointerup', () => this.advance?.());
    show();
  }

  openPause(): void {
    if (this.pause) return;
    const { width, height } = this.scale;
    this.scene.pause('world');
    const c = this.add.container(width / 2, height / 2);
    c.add(this.add.rectangle(0, 0, width, height, 0, 0.55).setInteractive());
    c.add(panel(this, 0, 0, 340, 360));
    c.add(this.add.text(0, -140, 'Paused', textStyle(28, COLORS.accent)).setOrigin(0.5));
    const items: [string, () => void][] = [
      ['Resume', () => this.closePause()],
      ['Save now', () => {
        this.world.saveNow();
        this.closePause();
      }],
      ['Settings', () => {
        this.closePause(false);
        this.scene.pause();
        this.scene.launch('settings', { back: 'world' });
      }],
      ['Main menu', () => {
        this.closePause();
        this.world.quitToMenu();
      }],
    ];
    items.forEach(([label, fn], i) => c.add(button(this, 0, -70 + i * 58, label, fn, 240, 46)));
    this.pause = c;
  }

  private closePause(resumeWorld = true): void {
    this.pause?.destroy();
    this.pause = null;
    if (resumeWorld) this.scene.resume('world');
  }
}
