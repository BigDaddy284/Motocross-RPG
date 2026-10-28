import type Phaser from 'phaser';

// The canvas is drawn at the screen's real resolution (CSS pixels × device pixel ratio), so text and
// shapes stay sharp on phones and high-DPI monitors. Scenes lay out in CSS pixels: view() zooms a
// scene's camera by the pixel ratio and returns the screen size in those CSS pixels.

/** Device pixels per CSS pixel, capped at 3 to keep the canvas a sensible size. */
export const DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1));

/** Sets the scene's camera to CSS pixels (top-left at 0, 0) and returns the screen size in them. */
export function view(scene: Phaser.Scene): { width: number; height: number } {
  scene.cameras.main.setOrigin(0, 0).setZoom(DPR).setScroll(0, 0);
  return { width: scene.scale.width / DPR, height: scene.scale.height / DPR };
}

/** The screen size in CSS pixels, without touching any camera. */
export function cssSize(scene: Phaser.Scene): { width: number; height: number } {
  return { width: scene.scale.width / DPR, height: scene.scale.height / DPR };
}

/**
 * The height of the HUD's button row along the bottom of the world screen, in CSS pixels (Boss,
 * 28 Oct 2026). The world lets the camera run this far past a map's bottom edge, so a south exit
 * is never stuck under the buttons.
 */
export const HUD_BAR = 52;
