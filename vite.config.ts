/// <reference types="vitest/config" />
import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build runs from any folder (desktop wrapper, file share, static host).
  base: './',
  plugins: [
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
