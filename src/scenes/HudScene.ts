import Phaser from 'phaser';
import { bikeProblem, bikeStats, formatMoney, journal, statMax, type CareerState } from '../core/career';
import { childLevel, childXp, leadLevel, leadXp, levelProgress } from '../core/skills';
import type { DialogueLine } from '../core/content';
import { services } from '../services';
import { COLORS, hex, textStyle } from '../ui/theme';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../core/settings';
import { button, panel, slider, statBar } from '../ui/widgets';
import type { WorldScene } from './WorldScene';
import { cssSize, view } from '../ui/view';

// Screen-space layer over the world: map name, money and task, messages, the dialogue box, the
// bike / bag / task panel, confirm boxes, the work progress bar, the world map, the pause menu and
// touch buttons. Runs alongside the world scene at a fixed zoom.

type PanelTab = 'bike' | 'bag' | 'task' | 'skills';

/** The smallest page panels are laid out on (see page()). */
const PAGE_W = 940;
const PAGE_H = 600;

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
  private flags: Record<string, boolean> = {};
  private uiButtons: Phaser.GameObjects.Container[] = [];
  /** The zoom slider that pops out beside the Zoom button. */
  private zoomPop: Phaser.GameObjects.Container | null = null;
  private zoomDragging = false;
  private advance: (() => void) | null = null;

  constructor() {
    super('hud');
  }

  private get world(): WorldScene {
    return this.scene.get('world') as WorldScene;
  }

  /** A text size after the player's Text size setting, eased down a little on narrow phone screens. */
  private ts(size: number): number {
    const narrow = Math.min(1, Math.max(0.72, Math.min(cssSize(this).width, cssSize(this).height * 1.6) / 900));
    return Math.round((size * services.settings.get().accessibility.textScale * narrow) / 100);
  }

  /** A text size after the player's Text size setting, for panels laid out on page(). */
  private pts(size: number): number {
    return Math.round((size * services.settings.get().accessibility.textScale) / 100);
  }

  /**
   * Panels and boxes are laid out on a page at least PAGE_W × PAGE_H and scaled down by k to fit
   * smaller screens, such as a phone on its side, so nothing spills off the screen.
   */
  private page(): { width: number; height: number; k: number } {
    const { width, height } = view(this);
    const k = Math.min(1, width / PAGE_W, height / PAGE_H);
    return { width: width / k, height: height / k, k };
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
    this.zoomPop = null;
    this.layout();
    this.scale.on('resize', this.layout, this);
    // Keep the slider in step when the mouse wheel or + and - change the zoom, and swap the
    // on-screen zoom control when the setting changes.
    let control = services.settings.get().display.zoomControl;
    const unsub = services.settings.onChange((s) => {
      if (s.display.zoomControl !== control) {
        control = s.display.zoomControl;
        this.closeZoom();
        this.layout();
      }
      if (this.zoomPop && !this.zoomDragging) this.openZoom();
    });
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      unsub();
    });

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
    kb.on('keydown-K', () => !this.modal && !this.pause && !this.dialogue && this.openPanel('skills'));
  }

  private panelOpen = false;

  private layout(): void {
    const { width, height } = view(this);
    for (const b of this.uiButtons) b.destroy();
    // The zoom control is a Zoom button with a pop-out slider, or + and − buttons (Settings > Display).
    const zoom = services.settings.get().display.zoomControl === 'buttons'
      ? [
        button(this, width - 86, 92, '−', () => this.world.zoomBy(-ZOOM_STEP), 48, 48),
        button(this, width - 34, 92, '+', () => this.world.zoomBy(ZOOM_STEP), 48, 48),
      ]
      : [button(this, width - 50, 92, 'Zoom', () => (this.zoomPop ? this.closeZoom() : this.openZoom()), 80, 48)];
    this.uiButtons = [
      button(this, width - 34, 34, '☰', () => this.world.openPause(), 48, 48),
      ...zoom,
      button(this, width - 50, 150, 'Bike', () => !this.modal && !this.dialogue && this.openPanel('bike'), 80, 48),
    ];
    if (this.zoomPop) this.openZoom();
    this.saveText.setPosition(width - 70, 18);
    this.shiftText.setPosition(width / 2, 14);
    this.taskText.setWordWrapWidth(Math.min(520, width - 140));
    this.toastText.setPosition(width / 2, height - 60);
    this.toastText.setWordWrapWidth(Math.min(700, width - 60));
    this.fitToast();
  }

  /** A draggable zoom slider beside the Zoom button. Mouse wheel and + and - still zoom too. */
  private openZoom(): void {
    this.zoomPop?.destroy();
    const { width } = view(this);
    const w = 300;
    const c = this.add.container(width - 100 - w / 2, 92);
    c.add(panel(this, 0, 0, w, 56).setInteractive());
    c.add(this.add.text(-w / 2 + 14, 0, 'Zoom', textStyle(this.ts(16))).setOrigin(0, 0.5));
    this.zoomPop = c;
    // The slider sits outside the panel's container so its drag maths works in screen space.
    const sl = slider(this, c.x - w / 2 + 76, c.y, 150, ZOOM_MIN, ZOOM_MAX, services.settings.get().display.zoom, (v) => {
      this.zoomDragging = true;
      services.settings.update('display', 'zoom', v);
      this.zoomDragging = false;
    }, ZOOM_STEP, (v) => `${v}%`);
    c.once('destroy', () => sl.destroy());
  }

  /** Closes the zoom slider. Returns true if it was open, so a click on the world only closes it. */
  closeZoom(): boolean {
    const open = !!this.zoomPop;
    this.zoomPop?.destroy();
    this.zoomPop = null;
    return open;
  }

  /** True when a pointer is over a HUD button or panel, so the world ignores the click. */
  pointerOnUi(p: Phaser.Input.Pointer): boolean {
    return !!this.pause || !!this.modal || this.input.hitTestPointer(p).length > 0;
  }

  /** Money and the current task, shown under the map name. */
  showCareer(career: CareerState, flags: Record<string, boolean>): void {
    this.career = career;
    this.flags = flags;
    this.moneyText.setText(formatMoney(career.money));
    this.taskText.setText(`Task: ${journal(services.content.story, career, flags)}`);
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
    const { width, height, k } = this.page();
    const w = Math.min(960, width - 24);
    const pad = 20;
    const nameStyle = textStyle(this.pts(18), COLORS.accent, { fontStyle: 'bold' });
    const bodyStyle = textStyle(this.pts(20), COLORS.cream, { wordWrap: { width: w - 2 * pad - 8 }, lineSpacing: 4 });
    const name = this.add.text(0, 0, 'M', nameStyle);
    const body = this.add.text(0, 0, '', bodyStyle);
    // Size the box to the longest line at the chosen text size, so big text never spills out.
    const nameH = name.height;
    const tallest = Math.max(...lines.map((l) => body.setText(l.text).height));
    const hintH = this.pts(14) + 8;
    const h = Math.max(140, pad + nameH + 8 + tallest + hintH + pad / 2);
    const c = this.add.container((width / 2) * k, (height - h / 2 - 12) * k).setScale(k);
    const bg = panel(this, 0, 0, w, h).setInteractive({ useHandCursor: true });
    name.setPosition(-w / 2 + pad, -h / 2 + pad - 4);
    const hint = this.add.text(w / 2 - 16, h / 2 - 10, '', textStyle(this.pts(14), COLORS.muted)).setOrigin(1, 1);
    c.add([bg, name, body, hint]);
    this.dialogue = c;
    let i = 0;
    const show = () => {
      const line = lines[i];
      const narrator = line.speaker === 'narrator';
      name.setText(line.speaker === 'npc' ? npcName : line.speaker === 'player' ? riderName : '');
      body.setText(line.text).setFontStyle(narrator ? 'italic' : '').setColor(hex(narrator ? 0xcfc6b0 : COLORS.cream));
      body.setPosition(-w / 2 + pad, narrator ? -h / 2 + pad : -h / 2 + pad + nameH + 4);
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
    const { width, height } = this.page();
    const shade = this.add.rectangle(0, 0, width, height, 0, 0.5).setInteractive();
    if (closeOnClick) shade.on('pointerup', () => this.closeModal());
    c.add(shade);
    c.add(panel(this, 0, 0, w, h).setInteractive());
  }

  /** A yes / no box. Esc or No cancels. */
  confirm(text: string, yes: string, onYes: () => void, onNo: () => void): void {
    const { width, height, k } = this.page();
    const w = Math.min(560, width - 32);
    const c = this.add.container((width / 2) * k, (height / 2) * k).setScale(k);
    this.backdrop(c, w, 220, false);
    c.add(this.add.text(0, -50, text, textStyle(this.pts(20), COLORS.cream, { align: 'center', wordWrap: { width: w - 60 } })).setOrigin(0.5));
    let answered = false;
    c.add(button(this, -120, 55, yes, () => {
      answered = true;
      this.closeModal();
      onYes();
    }, 200, 46));
    c.add(button(this, 120, 55, 'Not now', () => this.closeModal(), 200, 46));
    this.openModal(c, () => !answered && onNo());
  }

  /** A box with a few choices, such as the race office's menu. Esc or the last button closes it. */
  choose(title: string, text: string, options: { label: string; note?: string; enabled?: boolean; onPick: () => void }[], onClose: () => void): void {
    const { width, height, k } = this.page();
    const w = Math.min(720, width - 32);
    const textObj = this.add.text(0, 0, text, textStyle(this.pts(18), COLORS.cream, { wordWrap: { width: w - 60 }, lineSpacing: 4 }));
    const h = 166 + textObj.height + (options.length - 1) * 64;
    const c = this.add.container((width / 2) * k, (height / 2) * k).setScale(k);
    this.backdrop(c, w, h, false);
    c.add(this.add.text(0, -h / 2 + 32, title, textStyle(26, COLORS.accent)).setOrigin(0.5));
    textObj.setPosition(-w / 2 + 30, -h / 2 + 62);
    c.add(textObj);
    let picked = false;
    options.forEach((o, i) => {
      const y = -h / 2 + 116 + textObj.height + i * 64;
      const b = button(this, -w / 2 + 150, y, o.label, () => {
        picked = true;
        this.closeModal();
        o.onPick();
      }, 250, 48);
      b.setEnabled(o.enabled !== false);
      c.add(b);
      if (o.note) c.add(this.add.text(-w / 2 + 290, y, o.note, textStyle(this.pts(15), COLORS.muted, { wordWrap: { width: w - 310 } })).setOrigin(0, 0.5));
    });
    this.openModal(c, () => !picked && onClose());
  }

  /** A bar that fills over `ms`, for work at a station. Resolves when it is full. */
  progress(label: string, ms: number): Promise<void> {
    this.progressBox?.destroy();
    const { width, height, k } = this.page();
    const w = 320;
    const c = this.add.container((width / 2) * k, (height - 140) * k).setScale(k);
    c.add(panel(this, 0, 0, w + 40, 70));
    c.add(this.add.text(0, -14, label, textStyle(this.pts(17))).setOrigin(0.5));
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
    const { width, height, k } = this.page();
    const w = Math.min(640, width - 32);
    const h = 150 + dests.length * 76;
    const c = this.add.container((width / 2) * k, (height / 2) * k).setScale(k);
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
      c.add(this.add.text(-w / 2 + 290, y, d.note, textStyle(this.pts(15), COLORS.muted, { wordWrap: { width: w - 310 } })).setOrigin(0, 0.5));
    });
    c.add(button(this, 0, h / 2 - 40, 'Stay here', () => this.closeModal(), 200, 44));
    this.openModal(c);
  }

  /** Bike, bag and task in one panel (the task journal lives in the bag until the home PC, Spec 21b). */
  openPanel(tab: PanelTab): void {
    const career = this.career;
    if (!career) return;
    const { bikes, items, story } = services.content;
    const { width, height, k } = this.page();
    const w = Math.min(900, width - 24);
    const h = Math.min(560, height - 24);
    const c = this.add.container((width / 2) * k, (height / 2) * k).setScale(k);
    this.backdrop(c, w, h, true);
    const left = -w / 2 + 28;
    const top = -h / 2 + 24;
    const tabNames: Record<PanelTab, string> = { bike: 'Bike', bag: 'Bag', task: 'Task', skills: 'Skills' };
    (['bike', 'bag', 'task', 'skills'] as PanelTab[]).forEach((t, i) => {
      const b = button(this, left + 60 + i * 130, top + 22, tabNames[t], () => this.openPanel(t), 120, 40);
      b.setSelected(t === tab);
      c.add(b);
    });
    c.add(button(this, w / 2 - 46, top + 22, '✕', () => this.closeModal(), 44, 40));
    const y0 = top + 70;
    const body = (x: number, y: number, text: string, size = 16, color: number = COLORS.cream, wrap = w - 56) =>
      c.add(this.add.text(x, y, text, textStyle(this.pts(size), color, { wordWrap: { width: wrap } })));

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
    } else if (tab === 'task') {
      body(left, y0, 'Task', 22, COLORS.accent);
      body(left, y0 + 40, journal(story, career, this.flags), 18);
      body(left, y0 + 110, `Money: ${formatMoney(career.money)}`, 18);
      const shifts = Object.entries(career.counters).filter(([k]) => k.startsWith('job.'));
      const names = Object.fromEntries(services.content.world.jobs.map((j) => [j.id, j.name]));
      shifts.forEach(([k, n], i) => body(left, y0 + 146 + i * 28, `${names[k] ?? k}s finished: ${n}`, 16, COLORS.muted));
      const c0 = career.counters;
      if (c0['race.days']) {
        body(left, y0 + 160 + shifts.length * 28, `Race days: ${c0['race.days']}   Moto wins: ${c0['race.wins'] ?? 0}   Podiums: ${c0['race.podiums'] ?? 0}`, 16, COLORS.muted);
      }
    } else {
      // Skills: each lead skill with its child skills, level and progress to the next level (GDD 6.1).
      const { skills } = services.content;
      const colW = (w - 56) / skills.leads.length;
      skills.leads.forEach((lead, i) => {
        const x = left + i * colW;
        const lx = leadXp(career.skills, lead);
        body(x, y0, lead.name, 20, COLORS.accent, colW - 16);
        body(x, y0 + 28, `Level ${leadLevel(skills, career.skills, lead)} · ${Math.floor(lx).toLocaleString()} XP`, 15, COLORS.cream, colW - 16);
        const barW = colW - 40;
        c.add(this.add.rectangle(x, y0 + 58, barW, 8, COLORS.panelLight).setOrigin(0, 0.5));
        c.add(this.add.rectangle(x, y0 + 58, Math.max(1, barW * levelProgress(lx, lead.multiplier, skills.maxLevel)), 8, COLORS.accent).setOrigin(0, 0.5));
        lead.children.forEach((ch, j) => {
          const y = y0 + 76 + j * 48;
          const xp = childXp(career.skills, ch.id);
          body(x, y, ch.name, 15, COLORS.cream, colW - 50);
          c.add(this.add.text(x + barW, y, `${childLevel(skills, career.skills, ch.id)}`, textStyle(this.pts(15), COLORS.accent)).setOrigin(1, 0));
          c.add(this.add.rectangle(x, y + 26, barW, 6, COLORS.panelLight).setOrigin(0, 0.5));
          c.add(this.add.rectangle(x, y + 26, Math.max(1, barW * levelProgress(xp, 1, skills.maxLevel)), 6, 0x6fa84a).setOrigin(0, 0.5));
        });
      });
      body(left, h / 2 - 40, 'Racing and practice train Rider Ability. Training minigames for every skill come in later builds.', 14, COLORS.muted);
    }
    this.openModal(c);
    this.panelOpen = true;
  }

  openPause(): void {
    if (this.pause) return;
    const { width, height, k } = this.page();
    this.scene.pause('world');
    const c = this.add.container((width / 2) * k, (height / 2) * k).setScale(k);
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
