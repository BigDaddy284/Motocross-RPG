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
        // The track editor saves player-made tracks here while developing: POST /__mods/tracks/<name>.track.json.
        server.middlewares.use('/__mods/tracks/', (req, res) => {
          const name = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
          const fail = (code: number, message: string) => {
            res.statusCode = code;
            res.end(message);
          };
          if (req.method !== 'POST') return fail(405, 'POST a track file');
          if (!/^[a-z0-9][a-z0-9_-]{0,60}\.track\.json$/.test(name)) return fail(400, 'The file name must be letters, digits, - and _, ending .track.json');
          let body = '';
          req.setEncoding('utf8');
          req.on('data', (c: string) => {
            body += c;
            if (body.length > 4_000_000) req.destroy();
          });
          req.on('end', () => {
            try {
              JSON.parse(body);
            } catch {
              return fail(400, 'Not JSON');
            }
            mkdirSync(MOD_DIR, { recursive: true });
            writeFileSync(`${MOD_DIR}/${name}`, body);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ saved: `${MOD_DIR}/${name}` }));
          });
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
