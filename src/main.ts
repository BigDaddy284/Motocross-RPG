import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { NewCareerScene } from './scenes/NewCareerScene';
import { RaceScene } from './scenes/RaceScene';
import { SettingsScene } from './scenes/SettingsScene';
import { TrackEditScene } from './scenes/TrackEditScene';
import { WorldScene } from './scenes/WorldScene';
import { DPR } from './ui/view';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14141e',
  pixelArt: true,
  roundPixels: true,
  // Drawn at the screen's real resolution and shown at CSS size (see ui/view.ts); fitScreen keeps it full-window.
  scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, NewCareerScene, SettingsScene, WorldScene, HudScene, RaceScene, TrackEditScene],
});

function fitScreen(): void {
  const w = Math.round(window.innerWidth * DPR);
  const h = Math.round(window.innerHeight * DPR);
  if (w !== game.scale.width || h !== game.scale.height) game.scale.resize(w, h);
}
window.addEventListener('resize', fitScreen);
window.addEventListener('orientationchange', () => setTimeout(fitScreen, 200));
window.visualViewport?.addEventListener('resize', fitScreen);

// Exposed for automated playtests and debugging in the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
