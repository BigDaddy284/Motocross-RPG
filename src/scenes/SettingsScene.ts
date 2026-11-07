import Phaser from 'phaser';
import { TEXT_MAX, TEXT_MIN, ZOOM_CONTROLS, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type Settings } from '../core/settings';
import { CONTROL_ACTIONS, keyLabel, keyName, rebind, type ControlId } from '../core/keybinds';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';
import { button, panel, slider, toggle } from '../ui/widgets';
import { cssSize, DPR } from '../ui/view';

// Settings apply as soon as they change and save automatically (GDD 20.1).

type Tab = 'Audio' | 'Display' | 'Accessibility' | 'Gameplay' | 'Controls';
const TABS: Tab[] = ['Audio', 'Display', 'Accessibility', 'Gameplay', 'Controls'];

export class SettingsScene extends Phaser.Scene {
  private back: 'menu' | 'world' = 'menu';
  private tab: Tab = 'Audio';
  /** The action waiting for its new key in Settings > Controls. */
  private waiting: ControlId | null = null;
  private note = '';

  constructor() {
    super('settings');
  }

  init(data: { back?: 'menu' | 'world' }): void {
    this.back = data.back ?? 'menu';
  }

  create(): void {
    // Opened from the pause menu it must draw over the world and HUD.
    this.scene.bringToTop();
    this.draw();
    this.scale.on('resize', this.draw, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.draw, this));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const key = keyName(e.code);
      if (this.waiting) {
        e.preventDefault();
        const action = this.waiting;
        this.waiting = null;
        if (key === 'ESC' && action !== 'menu') this.note = '';
        else if (!key) this.note = "That key can't be used. Pick a letter, a number or Esc.";
        else {
          const r = rebind(services.settings.get().controls, action, key);
          if (r.ok) {
            for (const [a, k] of Object.entries(r.controls) as [ControlId, string][]) if (services.settings.get().controls[a] !== k) services.settings.update('controls', a, k);
            const name = (id: ControlId) => CONTROL_ACTIONS.find((x) => x.id === id)!.label;
            this.note = r.swapped ? `${keyLabel(key)} is now ${name(action)}; ${name(r.swapped)} moved to ${keyLabel(r.controls[r.swapped])}.` : `${keyLabel(key)} is now ${name(action)}.`;
          } else this.note = r.message;
        }
        this.draw();
        return;
      }
      if (key === 'ESC') this.close();
    });
  }

  private draw(): void {
    this.children.removeAll(true);
    // Laid out on an 800 × 600 page; the camera zooms it to fit the screen.
    const width = 800;
    const height = 600;
    const css = cssSize(this);
    const k = Math.min(1, css.width / width, css.height / height);
    this.cameras.main.setZoom(k * DPR).centerOn(width / 2, height / 2);
    const cx = width / 2;
    if (this.back === 'menu') this.add.rectangle(-4000, -4000, 8000 + width, 8000 + height, COLORS.ink).setOrigin(0);
    else this.add.rectangle(-4000, -4000, 8000 + width, 8000 + height, 0, 0.55).setOrigin(0).setInteractive();
    const w = 760;
    const h = 560;
    panel(this, cx, height / 2, w, h);
    const top = height / 2 - h / 2;
    const left = cx - w / 2 + 32;
    this.add.text(cx, top + 32, 'Settings', textStyle(30, COLORS.accent)).setOrigin(0.5);

    const tabW = (w - 40) / TABS.length;
    TABS.forEach((t, i) => {
      const b = button(this, cx - w / 2 + 20 + tabW * (i + 0.5), top + 82, t, () => {
        this.tab = t;
        this.waiting = null;
        this.note = '';
        this.draw();
      }, tabW - 6, 36);
      if (t === this.tab) (b.list[0] as Phaser.GameObjects.Rectangle).setStrokeStyle(2, COLORS.accent);
    });

    const s = services.settings.get();
    const rowY = (i: number) => top + 140 + i * 52;
    const label = (i: number, text: string) => this.add.text(left, rowY(i), text, textStyle(18)).setOrigin(0, 0.5);
    const sliderX = left + 230;
    const sliderW = Math.max(120, w - 360);
    const upd = <C extends keyof Settings, K extends keyof Settings[C]>(c: C, k: K) => (v: Settings[C][K]) => services.settings.update(c, k, v);

    switch (this.tab) {
      case 'Audio':
        label(0, 'Master volume'); slider(this, sliderX, rowY(0), sliderW, 0, 100, s.audio.master, upd('audio', 'master'));
        label(1, 'Music'); slider(this, sliderX, rowY(1), sliderW, 0, 100, s.audio.music, upd('audio', 'music'));
        label(2, 'Bike engines'); slider(this, sliderX, rowY(2), sliderW, 0, 100, s.audio.engines, upd('audio', 'engines'));
        // No Crowd slider: the crowd came out (Boss, 7 Nov 2026); its setting is kept for saves.
        label(3, 'Effects'); slider(this, sliderX, rowY(3), sliderW, 0, 100, s.audio.effects, upd('audio', 'effects'));
        label(4, 'Mute all'); toggle(this, sliderX + 26, rowY(4), s.audio.muted, upd('audio', 'muted'));
        this.add.text(left, rowY(5), 'Effects: buttons, footsteps, doors, the van, the workshop, and the race\'s jumps and crashes.', { ...textStyle(15, COLORS.muted), wordWrap: { width: w - 64 } }).setOrigin(0, 0.5);
        break;
      case 'Display':
        label(0, 'Map zoom (%)'); slider(this, sliderX, rowY(0), sliderW, ZOOM_MIN, ZOOM_MAX, s.display.zoom, upd('display', 'zoom'), ZOOM_STEP);
        label(1, 'Full screen');
        toggle(this, sliderX + 26, rowY(1), this.scale.isFullscreen, (v) => {
          services.settings.update('display', 'fullscreen', v);
          if (v) this.scale.startFullscreen();
          else this.scale.stopFullscreen();
        });
        label(2, 'Zoom control');
        ZOOM_CONTROLS.forEach((z, i) => {
          button(this, sliderX + 80 + i * 170, rowY(2), z === 'slider' ? 'Slider' : '+ and −', () => {
            services.settings.update('display', 'zoomControl', z);
            this.draw();
          }, 160, 38).setSelected(s.display.zoomControl === z);
        });
        this.add.text(left, rowY(3), 'The on-screen zoom: a Zoom button that opens a slider, or + and − buttons.', textStyle(15, COLORS.muted)).setOrigin(0, 0.5);
        break;
      case 'Accessibility':
        label(0, 'Text size (%)'); slider(this, sliderX, rowY(0), sliderW, TEXT_MIN, TEXT_MAX, s.accessibility.textScale, upd('accessibility', 'textScale'), 10);
        label(1, 'Reduced effects'); toggle(this, sliderX + 26, rowY(1), s.accessibility.reducedEffects, upd('accessibility', 'reducedEffects'));
        label(2, 'High contrast'); toggle(this, sliderX + 26, rowY(2), s.accessibility.highContrast, upd('accessibility', 'highContrast'));
        break;
      case 'Gameplay':
        label(0, 'Tutorial prompts'); toggle(this, sliderX + 26, rowY(0), s.gameplay.tutorialPrompts, upd('gameplay', 'tutorialPrompts'));
        label(1, 'Context hints'); toggle(this, sliderX + 26, rowY(1), s.gameplay.contextHints, upd('gameplay', 'contextHints'));
        label(2, 'Repeated reminders'); toggle(this, sliderX + 26, rowY(2), s.gameplay.reminders, upd('gameplay', 'reminders'));
        // Boss, 2 Nov 2026: the task line under the money can be switched off.
        label(3, 'Show task on screen'); toggle(this, sliderX + 26, rowY(3), s.gameplay.showTask, upd('gameplay', 'showTask'));
        break;
      case 'Controls': {
        // Rebinding keys (Boss, 5 Nov 2026): pick an action, then press its new key (core/keybinds.ts).
        const c = s.controls;
        const y = (i: number) => top + 132 + i * 37;
        CONTROL_ACTIONS.forEach((a, i) => {
          this.add.text(left, y(i), a.label, textStyle(17)).setOrigin(0, 0.5);
          const waiting = this.waiting === a.id;
          button(this, sliderX + 65, y(i), waiting ? 'Press a key' : keyLabel(c[a.id]), () => {
            this.waiting = waiting ? null : a.id;
            this.note = waiting ? '' : `Press the new key for ${a.label.toLowerCase()}, or Esc to cancel.`;
            this.draw();
          }, 130, 32).setSelected(waiting);
          if (a.extra || (a.id === 'menu' && c.menu !== 'ESC')) this.add.text(sliderX + 145, y(i), a.id === 'menu' ? 'Esc always works too' : a.extra!, textStyle(15, COLORS.muted)).setOrigin(0, 0.5);
        });
        const foot = this.note || 'Click, tap, mouse wheel and the + and - keys work as always. A key already in use swaps over.';
        this.add.text(left, y(CONTROL_ACTIONS.length) + 4, foot, { ...textStyle(15, COLORS.muted), wordWrap: { width: w - 64 } }).setOrigin(0, 0.5);
        break;
      }
    }

    button(this, cx - 130, top + h - 40, 'Restore defaults', () => {
      services.settings.restoreDefaults();
      this.draw();
    }, 220, 42);
    button(this, cx + 130, top + h - 40, 'Back', () => this.close(), 220, 42);
  }

  private close(): void {
    if (this.back === 'menu') this.scene.start('menu');
    else {
      this.scene.stop();
      this.scene.resume('world');
      this.scene.resume('hud');
    }
  }
}
