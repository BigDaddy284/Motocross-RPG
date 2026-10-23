import Phaser from 'phaser';
import { CONTENT_FILES, checkContent, type Manifest, type RawContent } from '../core/content';
import type { BakedMap } from '../core/mapTypes';
import { Travel } from '../core/travel';
import { formatError } from '../core/validate';
import { services } from '../services';
import { COLORS, textStyle } from '../ui/theme';

// Loads the manifest, every baked map's data and the content files, checks them all, then loads
// the character sheets. Map images load later, the first time each map is visited.

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Loading…', textStyle(22)).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`Loading… ${Math.round(v * 100)}%`));
    this.load.json('manifest', 'assets/manifest.json');
    for (const [k, file] of Object.entries(CONTENT_FILES)) this.load.json(`content:${k}`, file);
  }

  create(): void {
    const manifest = this.cache.json.get('manifest') as Manifest;
    for (const m of manifest.maps) this.load.json(`map:${m.id}`, `assets/maps/${m.id}.json`);
    for (const [id, sheet] of Object.entries(manifest.characters.sheets)) {
      const [fw, fh] = manifest.characters.frame;
      this.load.spritesheet(`chr:${id}:walk`, `assets/${sheet.walk}`, { frameWidth: fw, frameHeight: fh });
      this.load.spritesheet(`chr:${id}:act`, `assets/${sheet.act}`, { frameWidth: fw, frameHeight: fh });
    }
    this.load.once('complete', () => this.finish(manifest));
    this.load.start();
  }

  private finish(manifest: Manifest): void {
    const maps = new Map<string, BakedMap>();
    for (const m of manifest.maps) maps.set(m.id, this.cache.json.get(`map:${m.id}`) as BakedMap);
    const raw = Object.fromEntries(Object.keys(CONTENT_FILES).map((k) => [k, this.cache.json.get(`content:${k}`)])) as RawContent;
    const { content, errors } = checkContent(raw, manifest, maps);
    if (!content || errors.length) {
      this.showErrors(errors.map(formatError));
      return;
    }
    services.manifest = manifest;
    services.content = content;
    services.maps = maps;
    services.travel = new Travel(maps, content.world.locks);
    this.scene.start('menu');
  }

  /** A content problem stops the game with the file and field named, rather than failing later. */
  private showErrors(lines: string[]): void {
    this.children.removeAll();
    const { width } = this.scale;
    this.add.text(width / 2, 60, 'The game data has problems and cannot start', textStyle(24, COLORS.accent)).setOrigin(0.5);
    this.add.text(40, 110, lines.slice(0, 20).join('\n'), textStyle(16, COLORS.cream, { wordWrap: { width: width - 80 } }));
    for (const l of lines) console.error(l);
  }
}
