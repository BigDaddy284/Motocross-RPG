import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { COLORS, FONT, hex, textStyle } from './theme';

// Small UI building blocks drawn with shapes and text until the UI art exists.

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): Button;
  setLabel(text: string): Button;
  /** Keeps the label clear of `left` px at the button's left and `right` px at its right (a badge at one end), still fitting it. */
  makeRoom(left: number, right: number): Button;
  /** Marks one button of a group as the current choice. */
  setSelected(on: boolean): Button;
}

/** Labels of buttons that close something or go back: they play the back sound. */
const BACK_LABEL = /^(back|close|cancel|not now|no\b|leave|done|×|✕)/i;

export function button(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, width = 260, height = 44, fontSize = 20): Button {
  const bg = scene.add.rectangle(0, 0, width, height, COLORS.panel).setStrokeStyle(2, COLORS.inkLine);
  const text = scene.add.text(0, 0, label, textStyle(fontSize)).setOrigin(0.5);
  // Every label fits its button (Boss, 4 Nov 2026: "Old Tom: G3 intake and exhaust" ran out of the
  // job board's): a long one is set smaller, then on two lines, never past the button's edges.
  let pad = { left: 0, right: 0 };
  const fit = () => {
    const room = width - 16 - pad.left - pad.right;
    let size = fontSize;
    text.setWordWrapWidth(null).setFontSize(size);
    while (text.width > room && size > Math.min(fontSize, 15)) text.setFontSize(--size);
    if (text.width > room) text.setWordWrapWidth(room, true).setAlign('center');
    while ((text.height > height - 4 || text.width > room) && size > 10) text.setFontSize(--size);
    text.setX((pad.left - pad.right) / 2);
  };
  fit();
  const c = scene.add.container(x, y, [bg, text]) as Button;
  let enabled = true;
  let selected = false;
  const rest = () => bg.setFillStyle(selected ? COLORS.accentDark : COLORS.panel);
  c.setSize(width, height).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => {
    if (!enabled) return;
    bg.setFillStyle(COLORS.accentDark);
    audio.play('hover');
  });
  c.on('pointerout', rest);
  // A click, or the back sound for a button that closes or goes back (Boss, 7 Nov 2026; demo U2, U3).
  c.on('pointerup', () => {
    if (!enabled) return audio.play('error');
    audio.play(BACK_LABEL.test(text.text) ? 'back' : 'click');
    onClick();
  });
  c.setEnabled = (on: boolean) => {
    enabled = on;
    text.setAlpha(on ? 1 : 0.4);
    if (!on) rest();
    return c;
  };
  c.setSelected = (on: boolean) => {
    selected = on;
    bg.setStrokeStyle(2, on ? COLORS.accent : COLORS.inkLine);
    rest();
    return c;
  };
  c.makeRoom = (left: number, right: number) => {
    pad = { left, right };
    fit();
    return c;
  };
  c.setLabel = (t: string) => {
    text.setText(t);
    fit();
    return c;
  };
  return c;
}

/**
 * Binoculars drawn with shapes, about `w` wide, centred on (x, y): the race screen's zoom button
 * (Boss, 3 Nov 2026).
 */
export function binocularsIcon(scene: Phaser.Scene, x: number, y: number, w = 24): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const u = w / 24;
  g.fillStyle(COLORS.cream, 1);
  // Two barrels (wider at the front), a bridge between them and the eyepieces on top.
  g.fillRoundedRect(-12 * u, -2 * u, 10 * u, 10 * u, 3 * u);
  g.fillRoundedRect(2 * u, -2 * u, 10 * u, 10 * u, 3 * u);
  g.fillRect(-3 * u, -1 * u, 6 * u, 4 * u);
  g.fillRoundedRect(-9 * u, -8 * u, 6 * u, 7 * u, 2 * u);
  g.fillRoundedRect(3 * u, -8 * u, 6 * u, 7 * u, 2 * u);
  // Dark lens glass.
  g.fillStyle(COLORS.inkLine, 1);
  g.fillCircle(-7 * u, 3 * u, 3 * u);
  g.fillCircle(7 * u, 3 * u, 3 * u);
  return g;
}

/**
 * A small gold trophy drawn with shapes, about `size` tall, centred on (x, y): marks where a
 * championship's next round is on the road menu (Boss, 2 Nov 2026).
 */
/** The road menu's mark for where the task is (Boss, 2 Nov 2026): the orange "!" of the task markers. */
export const TASK_MARK = '__task';

export function trophyIcon(scene: Phaser.Scene, x: number, y: number, size = 30): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const u = size / 30;
  const gold = 0xf2c14e;
  const dark = 0x8a5a12;
  g.lineStyle(2 * u, dark, 1);
  // Handles, then the cup, stem and base over them.
  g.strokeCircle(-9 * u, -6 * u, 5 * u);
  g.strokeCircle(9 * u, -6 * u, 5 * u);
  g.fillStyle(gold, 1);
  g.beginPath();
  g.moveTo(-10 * u, -14 * u);
  g.lineTo(10 * u, -14 * u);
  g.lineTo(7 * u, 0);
  g.lineTo(2 * u, 3 * u);
  g.lineTo(-2 * u, 3 * u);
  g.lineTo(-7 * u, 0);
  g.closePath();
  g.fillPath();
  g.strokePath();
  g.fillRect(-2 * u, 3 * u, 4 * u, 6 * u);
  g.fillRect(-8 * u, 9 * u, 16 * u, 5 * u);
  g.strokeRect(-8 * u, 9 * u, 16 * u, 5 * u);
  g.fillStyle(0xfff3c4, 0.8);
  g.fillRect(-6 * u, -12 * u, 3 * u, 8 * u);
  return g;
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
  format: (v: number) => string = String,
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
    label.setText(format(v));
    if (notify && v !== value) {
      value = v;
      onChange(v);
      audio.play('slider');
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
    audio.play(value ? 'toggleOn' : 'toggleOff');
  });
  return c;
}

export interface StatBar extends Phaser.GameObjects.Container {
  setValue(v: number): StatBar;
}

/** A labelled bar with the number beside it, for bike stats and condition. */
export function statBar(scene: Phaser.Scene, x: number, y: number, label: string, width: number, max: number, labelWidth = 130): StatBar {
  const name = scene.add.text(0, 0, label, textStyle(16)).setOrigin(0, 0.5);
  const back = scene.add.rectangle(labelWidth, 0, width, 12, COLORS.panelLight).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(labelWidth, 0, 0, 12, COLORS.accent).setOrigin(0, 0.5);
  const num = scene.add.text(labelWidth + width + 12, 0, '', textStyle(16)).setOrigin(0, 0.5);
  const c = scene.add.container(x, y, [name, back, fill, num]) as StatBar;
  c.setValue = (v: number) => {
    fill.width = Math.max(0, Math.min(1, v / max)) * width;
    num.setText(String(v));
    return c;
  };
  return c;
}

export interface TextInput {
  value(): string;
  focused(): boolean;
}

/**
 * A real text box laid over the canvas, so typing works with any keyboard, including phone
 * keyboards. It sits on top of `box` (a rectangle with a centre origin inside `root`) and is
 * removed when the scene shuts down.
 */
export function textInput(scene: Phaser.Scene, root: Phaser.GameObjects.Container, box: Phaser.GameObjects.Rectangle, opts: { maxLength: number; placeholder: string }): TextInput {
  const el = document.createElement('input');
  el.type = 'text';
  el.maxLength = opts.maxLength;
  el.placeholder = opts.placeholder;
  el.autocomplete = 'off';
  el.spellcheck = false;
  Object.assign(el.style, {
    position: 'absolute',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: hex(COLORS.cream),
    fontFamily: FONT,
    padding: '0 12px',
    boxSizing: 'border-box',
    zIndex: '10',
  });
  document.body.appendChild(el);
  const place = () => {
    const canvas = scene.game.canvas.getBoundingClientRect();
    const css = (canvas.width / scene.scale.width) * scene.cameras.main.zoom;
    const k = root.scale;
    el.style.left = `${canvas.left + (root.x + (box.x - box.width / 2) * k) * css}px`;
    el.style.top = `${canvas.top + (root.y + (box.y - box.height / 2) * k) * css}px`;
    el.style.width = `${box.width * k * css}px`;
    el.style.height = `${box.height * k * css}px`;
    el.style.fontSize = `${20 * k * css}px`;
  };
  place();
  window.addEventListener('resize', place);
  // Phaser listens for keys on the window: stop them reaching the game while typing.
  const stop = (e: KeyboardEvent) => e.stopPropagation();
  el.addEventListener('keydown', stop);
  el.addEventListener('input', () => audio.play('type'));
  el.addEventListener('keyup', stop);
  scene.events.once('shutdown', () => {
    window.removeEventListener('resize', place);
    el.remove();
  });
  return { value: () => el.value, focused: () => document.activeElement === el };
}

export interface PenMeter extends Phaser.GameObjects.Container {
  /** How many segments still hold ink, filled from the left. */
  setLevel(full: number): PenMeter;
}

/**
 * The pen that writes pit board messages, drawn as its own meter: a marker lying on its side whose
 * clear barrel holds the ink in `segments` equal sections, one per message change, with the nib to
 * the right. x, y is the middle of its left end. The section count comes from the caller (racing
 * data's ink), so more message abilities later only change that number.
 */
export function penMeter(scene: Phaser.Scene, x: number, y: number, segments: number, width = 116, height = 22): PenMeter {
  const g = scene.add.graphics();
  const c = scene.add.container(x, y, [g]) as PenMeter;
  const n = Math.max(1, Math.round(segments));
  const barrel = width * 0.74;
  const h = height / 2;
  const pad = 3;
  const draw = (full: number) => {
    g.clear();
    // Nib: a collar tapering to the tip, behind the barrel's outline.
    const neck = barrel + width * 0.1;
    g.fillStyle(0x0d0d12, 1).lineStyle(1.5, COLORS.cream, 1);
    g.beginPath();
    g.moveTo(barrel - 2, -h * 0.82);
    g.lineTo(neck, -h * 0.5);
    g.lineTo(neck, -h * 0.22);
    g.lineTo(width, -h * 0.06);
    g.lineTo(width, h * 0.06);
    g.lineTo(neck, h * 0.22);
    g.lineTo(neck, h * 0.5);
    g.lineTo(barrel - 2, h * 0.82);
    g.closePath();
    g.fillPath().strokePath();
    // Barrel and its clear window.
    g.fillStyle(0x0d0d12, 1).fillRoundedRect(0, -h, barrel, height, h * 0.7);
    g.lineStyle(1.5, COLORS.cream, 1).strokeRoundedRect(0, -h, barrel, height, h * 0.7);
    const wx = pad + 2;
    const ww = barrel - 2 * pad - 4;
    const seg = ww / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle(i < full ? COLORS.accentDark : 0x34363f, 1).fillRect(wx + i * seg + (i ? 1 : 0), -h + pad, seg - (i ? 1 : 0) - (i < n - 1 ? 1 : 0), height - 2 * pad);
    }
    // The section marks, drawn like the pen's printed ink lines.
    g.lineStyle(2, 0x0d0d12, 1);
    for (let i = 1; i < n; i++) g.lineBetween(wx + i * seg, -h + pad - 1, wx + i * seg, h - pad + 1);
  };
  c.setLevel = (full: number) => {
    draw(full);
    return c;
  };
  draw(n);
  c.setSize(width, height);
  return c;
}
