// Colours from the reference palette (art/palette/palette-ref-v1) and shared text styles.

export const COLORS = {
  ink: 0x14141e,
  inkLine: 0x272a2c,
  panel: 0x26191f,
  panelLight: 0x3b3c45,
  cream: 0xe8dbb8,
  accent: 0xef6c18,
  accentDark: 0xc25b2a,
  blue: 0x3b86da,
  muted: 0x918e93,
} as const;

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

export function textStyle(size: number, color: number = COLORS.cream, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color: hex(color), resolution: 2, ...extra };
}
