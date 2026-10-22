import Phaser from 'phaser';
import { COLORS, textStyle } from './theme';

// Small UI building blocks drawn with shapes and text until the UI art exists.

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): Button;
  setLabel(text: string): Button;
}

export function button(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, width = 260, height = 44): Button {
  const bg = scene.add.rectangle(0, 0, width, height, COLORS.panel).setStrokeStyle(2, COLORS.inkLine);
  const text = scene.add.text(0, 0, label, textStyle(20)).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, text]) as Button;
  let enabled = true;
  c.setSize(width, height).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => enabled && bg.setFillStyle(COLORS.accentDark));
  c.on('pointerout', () => bg.setFillStyle(COLORS.panel));
  c.on('pointerup', () => enabled && onClick());
  c.setEnabled = (on: boolean) => {
    enabled = on;
    text.setAlpha(on ? 1 : 0.4);
    if (!on) bg.setFillStyle(COLORS.panel);
    return c;
  };
  c.setLabel = (t: string) => {
    text.setText(t);
    return c;
  };
  return c;
}

/** A dark backing panel with a thin outline. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.94): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, COLORS.ink, alpha).setStrokeStyle(2, COLORS.panelLight);
}

/** A horizontal slider for 0–100 style values. Calls onChange as it is dragged. */
export function slider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  min: number,
  max: number,
  value: number,
  onChange: (v: number) => void,
  step = 5,
): Phaser.GameObjects.Container {
  const track = scene.add.rectangle(0, 0, width, 6, COLORS.panelLight).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(0, 0, 0, 6, COLORS.accent).setOrigin(0, 0.5);
  const knob = scene.add.circle(0, 0, 10, COLORS.cream).setStrokeStyle(2, COLORS.inkLine);
  const label = scene.add.text(width + 16, 0, '', textStyle(16)).setOrigin(0, 0.5);
  const c = scene.add.container(x, y, [track, fill, knob, label]);
  const set = (v: number, notify: boolean) => {
    v = Phaser.Math.Clamp(Math.round(v / step) * step, min, max);
    const px = ((v - min) / (max - min)) * width;
    knob.x = px;
    fill.width = px;
    label.setText(String(v));
    if (notify && v !== value) {
      value = v;
      onChange(v);
    }
  };
  set(value, false);
  const hit = scene.add.rectangle(width / 2, 0, width + 20, 30, 0, 0).setInteractive({ useHandCursor: true });
  c.add(hit);
  const fromPointer = (p: Phaser.Input.Pointer) => {
    set(min + (Phaser.Math.Clamp(scene.cameras.main.getWorldPoint(p.x, p.y).x - c.x, 0, width) / width) * (max - min), true);
  };
  hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
    fromPointer(p);
    const move = (q: Phaser.Input.Pointer) => q.isDown && fromPointer(q);
    scene.input.on('pointermove', move);
    scene.input.once('pointerup', () => scene.input.off('pointermove', move));
  });
  return c;
}

/** An on/off switch. */
export function toggle(scene: Phaser.Scene, x: number, y: number, value: boolean, onChange: (v: boolean) => void): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, 52, 26, COLORS.panelLight).setStrokeStyle(2, COLORS.inkLine);
  const dot = scene.add.circle(0, 0, 9, COLORS.cream);
  const c = scene.add.container(x, y, [bg, dot]).setSize(52, 26).setInteractive({ useHandCursor: true });
  const draw = () => {
    dot.x = value ? 12 : -12;
    bg.setFillStyle(value ? COLORS.accent : COLORS.panelLight);
  };
  draw();
  c.on('pointerup', () => {
    value = !value;
    draw();
    onChange(value);
  });
  return c;
}
