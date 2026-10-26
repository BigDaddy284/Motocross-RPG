/// <reference types="vitest/config" />
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Mod tracks (src/core/modTracks.ts): a website can't list a folder, so the game reads an index
// of public/mods/tracks/, made here from whatever track files are in it.
const MOD_DIR = 'public/mods/tracks';
const modIndex = () => JSON.stringify(existsSync(MOD_DIR) ? readdirSync(MOD_DIR).filter((f) => /\.json$/i.test(f) && f !== 'index.json').sort() : []);

export default defineConfig({
  // Relative paths so the build runs from any folder (desktop wrapper, file share, static host).
  base: './',
  plugins: [
    {
      // Read fresh on every request while developing, so a dropped-in track shows on the next load.
      name: 'mod-track-index',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.split('?')[0].endsWith('/mods/tracks/index.json')) return next();
          res.setHeader('Content-Type', 'application/json');
          res.end(modIndex());
        });
      },
      closeBundle() {
        if (!existsSync('dist')) return;
        mkdirSync('dist/mods/tracks', { recursive: true });
        writeFileSync('dist/mods/tracks/index.json', `${modIndex()}\n`);
      },
    },
    {
      // The track editor is one plain HTML file: published beside the game as it is, so it can be
      // used from the published site, where its race view runs the game one folder up.
      name: 'copy-track-editor',
      apply: 'build',
      closeBundle() {
        mkdirSync('dist/tools', { recursive: true });
        copyFileSync('tools/track-editor.html', 'dist/tools/track-editor.html');
      },
    },
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
