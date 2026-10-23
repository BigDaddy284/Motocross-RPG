import Phaser from 'phaser';
import { bikeProblem, bikeStats, formatMoney, journal, statMax, type CareerState } from '../core/career';
import type { DialogueLine } from '../core/content';
import { services } from '../services';
import { COLORS, hex, textStyle } from '../ui/theme';
import { button, panel, statBar } from '../ui/widgets';
import type { WorldScene } from './WorldScene';

// Screen-space layer over the world: map name, money and task, messages, the dialogue box, the
// bike / bag / task panel, confirm boxes, the work progress bar, the world map, the pause menu and
// touch buttons. Runs alongside the world scene at a fixed zoom.

type PanelTab = 'bike' | 'bag' | 'task';

export class HudScene extends Phaser.Scene {
  private dialogue: Phaser.GameObjects.Container | null = null;
  private pause: Phaser.GameObjects.Container | null = null;
  private toastText!: Phaser.GameObjects.Text;
  private toastBg!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private saveText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private taskText!: Phaser.GameObjects.Text;
  private shiftText!: Phaser.GameObjects.Text;
  private progressBox: Phaser.GameObjects.Container | null = null;
  /** The bike panel, a confirm box or the world map: anything that takes over input until closed. */
  private modal: Phaser.GameObjects.Container | null = null;
  private onModalClose: (() => void) | null = null;
  private career: CareerState | null = null;
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
    this.modal = null;
    this.progressBox = null;
    const outline = { stroke: '#14141e', strokeThickness: 4 };
    this.titleText = this.add.text(16, 14, '', textStyle(this.ts(20), COLORS.cream, outline));
    this.moneyText = this.add.text(16, 44, '', textStyle(this.ts(20), COLORS.accent, { ...outline, fontStyle: 'bold' }));
    this.taskText = this.add.text(16, 74, '', textStyle(this.ts(16), COLORS.cream, { ...outline, wordWrap: { width: 420 } }));
    this.shiftText = this.add.text(0, 0, '', textStyle(this.ts(18), COLORS.cream, { ...outline, align: 'center' })).setOrigin(0.5, 0);
    this.toastBg = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.88).setStrokeStyle(2, COLORS.panelLight).setVisible(false);
    this.toastText = this.add.text(0, 0, '', textStyle(this.ts(18), COLORS.cream, { align: 'center' })).setOrigin(0.5).setVisible(false);
    this.saveText = this.add.text(0, 0, '', textStyle(this.ts(16), COLORS.muted, { stroke: '#14141e', strokeThickness: 3 })).setOrigin(1, 0).setAlpha(0);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    const kb = this.input.keyboard!;
    // One owner for these keys, so a press that closes a dialogue or menu can't also reopen it.
    const use = () => {
      if (this.pause || this.modal) return;
      if (this.dialogue) this.advance?.();
      else this.world.interactFacing();
    };
    kb.on('keydown-E', use);
    kb.on('keydown-SPACE', use);
    kb.on('keydown-ENTER', () => this.dialogue && this.advance?.());
    kb.on('keydown-ESC', () => {
      if (this.pause) this.closePause();
      else if (this.modal) this.closeModal();
      else if (!this.dialogue) this.world.openPause();
    });
    const togglePanel = (e?: KeyboardEvent) => {
      e?.preventDefault();
      if (this.modal && this.panelOpen) this.closeModal();
      else if (!this.modal && !this.pause && !this.dialogue) this.openPanel('bike');
    };
    kb.addCapture('TAB');
    kb.on('keydown-TAB', togglePanel);
    kb.on('keydown-I', togglePanel);
    kb.on('keydown-B', togglePanel);
  }

  private panelOpen = false;

  private layout(): void {
    const { width, height } = this.scale;
    for (const b of this.uiButtons) b.destroy();
    this.uiButtons = [
      button(this, width - 34, 34, '☰', () => this.world.openPause(), 48, 48),
      button(this, width - 34, 92, '+', () => this.world.zoomBy(10), 48, 48),
      button(this, width - 34, 146, '−', () => this.world.zoomBy(-10), 48, 48),
      button(this, width - 50, 206, 'Bike', () => !this.modal && !this.dialogue && this.openPanel('bike'), 80, 48),
    ];
    this.saveText.setPosition(width - 70, 18);
    this.shiftText.setPosition(width / 2, 14);
    this.toastText.setPosition(width / 2, height - 60);
    this.toastText.setWordWrapWidth(Math.min(700, width - 60));
    this.fitToast();
  }

  /** True when a pointer is over a HUD button or panel, so the world ignores the click. */
  pointerOnUi(p: Phaser.Input.Pointer): boolean {
    return !!this.pause || !!this.modal || this.input.hitTestPointer(p).length > 0;
  }

  /** Money and the current task, shown under the map name. */
  showCareer(career: CareerState): void {
    this.career = career;
    this.moneyText.setText(formatMoney(career.money));
    this.taskText.setText(`Task: ${journal(services.content.story, career)}`);
  }

  showShift(text: string | null): void {
    this.shiftText.setText(text ?? '');
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

  /** True while a dialogue or a panel that takes over input is open, so the world waits. */
  isDialogueOpen(): boolean {
    return !!this.dialogue || !!this.modal;
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
      name.setText(line.speaker === 'npc' ? npcName : line.speaker === 'player' ? riderName : '');
      body.setText(line.text).setColor(hex(line.speaker === 'narrator' ? COLORS.muted : COLORS.cream)).setFontStyle(line.speaker === 'narrator' ? 'italic' : '');
      body.setY(line.speaker === 'narrator' ? -h / 2 + 30 : -h / 2 + 46);
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

  // ---- panels that take over input ----

  private openModal(c: Phaser.GameObjects.Container, onClose: (() => void) | null = null): void {
    this.closeModal();
    this.modal = c;
    this.onModalClose = onClose;
  }

  closeModal(): void {
    const done = this.onModalClose;
    this.modal?.destroy();
    this.modal = null;
    this.onModalClose = null;
    this.panelOpen = false;
    done?.();
  }

  private backdrop(c: Phaser.GameObjects.Container, w: number, h: number, closeOnClick: boolean): void {
    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0, 0.5).setInteractive();
    if (closeOnClick) shade.on('pointerup', () => this.closeModal());
    c.add(shade);
    c.add(panel(this, 0, 0, w, h).setInteractive());
  }

  /** A yes / no box. Esc or No cancels. */
  confirm(text: string, yes: string, onYes: () => void, onNo: () => void): void {
    const { width, height } = this.scale;
    const w = Math.min(560, width - 32);
    const c = this.add.container(width / 2, height / 2);
    this.backdrop(c, w, 220, false);
    c.add(this.add.text(0, -50, text, textStyle(this.ts(20), COLORS.cream, { align: 'center', wordWrap: { width: w - 60 } })).setOrigin(0.5));
    let answered = false;
    c.add(button(this, -120, 55, yes, () => {
      answered = true;
      this.closeModal();
      onYes();
    }, 200, 46));
    c.add(button(this, 120, 55, 'Not now', () => this.closeModal(), 200, 46));
    this.openModal(c, () => !answered && onNo());
  }

  /** A bar that fills over `ms`, for work at a station. Resolves when it is full. */
  progress(label: string, ms: number): Promise<void> {
    this.progressBox?.destroy();
    const { width, height } = this.scale;
    const w = 320;
    const c = this.add.container(width / 2, height - 140);
    c.add(panel(this, 0, 0, w + 40, 70));
    c.add(this.add.text(0, -14, label, textStyle(this.ts(17))).setOrigin(0.5));
    c.add(this.add.rectangle(-w / 2, 14, w, 12, COLORS.panelLight).setOrigin(0, 0.5));
    const fill = this.add.rectangle(-w / 2, 14, 1, 12, COLORS.accent).setOrigin(0, 0.5);
    c.add(fill);
    this.progressBox = c;
    return new Promise((resolve) => {
      this.tweens.add({
        targets: fill,
        width: w,
        duration: ms,
        onComplete: () => {
          c.destroy();
          if (this.progressBox === c) this.progressBox = null;
          resolve();
        },
      });
    });
  }

  /** The world map: pick where to drive. Destinations are listed in data/world.json. */
  openWorldMap(current: string, onPick: (map: string, spawn: string) => void): void {
    const dests = services.content.world.worldMap;
    const { width, height } = this.scale;
    const w = Math.min(640, width - 32);
    const h = 150 + dests.length * 76;
    const c = this.add.container(width / 2, height / 2);
    this.backdrop(c, w, h, true);
    c.add(this.add.text(0, -h / 2 + 34, 'Where to?', textStyle(28, COLORS.accent)).setOrigin(0.5));
    dests.forEach((d, i) => {
      const y = -h / 2 + 100 + i * 76;
      const here = d.map === current;
      const b = button(this, -w / 2 + 150, y, here ? `${d.name} (here)` : d.name, () => {
        this.closeModal();
        onPick(d.map, d.spawn);
      }, 240, 46);
      b.setEnabled(!here);
      c.add(b);
      c.add(this.add.text(-w / 2 + 290, y, d.note, textStyle(this.ts(15), COLORS.muted, { wordWrap: { width: w - 310 } })).setOrigin(0, 0.5));
    });
    c.add(button(this, 0, h / 2 - 40, 'Stay here', () => this.closeModal(), 200, 44));
    this.openModal(c);
  }

  /** Bike, bag and task in one panel (the task journal lives in the bag until the home PC, Spec 21b). */
  openPanel(tab: PanelTab): void {
    const career = this.career;
    if (!career) return;
    const { bikes, items, story } = services.content;
    const { width, height } = this.scale;
    const w = Math.min(900, width - 24);
    const h = Math.min(560, height - 24);
    const c = this.add.container(width / 2, height / 2);
    this.backdrop(c, w, h, true);
    const left = -w / 2 + 28;
    const top = -h / 2 + 24;
    (['bike', 'bag', 'task'] as PanelTab[]).forEach((t, i) => {
      const b = button(this, left + 60 + i * 130, top + 22, t === 'bike' ? 'Bike' : t === 'bag' ? 'Bag' : 'Task', () => this.openPanel(t), 120, 40);
      b.setSelected(t === tab);
      c.add(b);
    });
    c.add(button(this, w / 2 - 46, top + 22, '✕', () => this.closeModal(), 44, 40));
    const y0 = top + 70;
    const body = (x: number, y: number, text: string, size = 16, color: number = COLORS.cream, wrap = w - 56) =>
      c.add(this.add.text(x, y, text, textStyle(this.ts(size), color, { wordWrap: { width: wrap } })));

    if (tab === 'bike') {
      const bike = career.bike;
      const brand = bikes.brands.find((b) => b.id === bike.brand);
      body(left, y0, `${brand?.starter ?? bike.brand}  ·  ${bike.class}`, 22, COLORS.accent);
      const problem = bikeProblem(bikes, bike);
      body(left, y0 + 32, problem ?? 'Runs. Ready for the backyard, and for the tracks once you have a van.', 16, problem ? COLORS.accent : COLORS.muted, w / 2 - 40);
      const stats = bikeStats(bikes, bike);
      const max = statMax(bikes, bike.class);
      bikes.stats.forEach((st, i) => c.add(statBar(this, left, y0 + 100 + i * 34, st.name, w / 2 - 260, max, 110).setValue(stats[st.id])));
      const px = 20;
      body(px, y0, 'Parts', 20, COLORS.accent);
      bikes.slots.forEach((slot, i) => {
        const part = bike.parts[slot.id];
        const y = y0 + 40 + i * 32;
        const cond = part ? Math.round(part.condition * 100) : 0;
        body(px, y, slot.name, 15);
        body(px + 190, y, part ? `G${part.grade}` : '—', 15, COLORS.muted);
        const barW = w / 2 - 330;
        c.add(this.add.rectangle(px + 230, y + 10, barW, 10, COLORS.panelLight).setOrigin(0, 0.5));
        c.add(this.add.rectangle(px + 230, y + 10, Math.max(1, (barW * cond) / 100), 10, cond === 0 ? 0xb03030 : cond <= 20 ? COLORS.accent : 0x6fa84a).setOrigin(0, 0.5));
        body(px + 240 + barW, y, cond === 0 ? 'Broken' : `${cond}%`, 15, cond === 0 ? COLORS.accent : COLORS.cream);
      });
    } else if (tab === 'bag') {
      body(left, y0, 'Bag', 22, COLORS.accent);
      if (!career.bag.length) body(left, y0 + 40, 'Your bag is empty.', 16, COLORS.muted);
      career.bag.forEach((b, i) => {
        const def = items[b.id];
        body(left, y0 + 40 + i * 56, def?.name ?? b.id, 18);
        body(left, y0 + 64 + i * 56, def?.desc ?? '', 15, COLORS.muted);
      });
    } else {
      body(left, y0, 'Task', 22, COLORS.accent);
      body(left, y0 + 40, journal(story, career), 18);
      body(left, y0 + 110, `Money: ${formatMoney(career.money)}`, 18);
      const shifts = Object.entries(career.counters).filter(([k]) => k.startsWith('job.'));
      const names = Object.fromEntries(services.content.world.jobs.map((j) => [j.id, j.name]));
      shifts.forEach(([k, n], i) => body(left, y0 + 146 + i * 28, `${names[k] ?? k}s finished: ${n}`, 16, COLORS.muted));
    }
    this.openModal(c);
    this.panelOpen = true;
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
