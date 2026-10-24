import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { NewCareerScene } from './scenes/NewCareerScene';
import { RaceScene } from './scenes/RaceScene';
import { SettingsScene } from './scenes/SettingsScene';
import { TrackEditScene } from './scenes/TrackEditScene';
import { WorldScene } from './scenes/WorldScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14141e',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, NewCareerScene, SettingsScene, WorldScene, HudScene, RaceScene, TrackEditScene],
});

// Exposed for automated playtests and debugging in the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
