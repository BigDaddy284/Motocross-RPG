#!/usr/bin/env node
// One-off sync of the shared art folder with the game (Boss, 31 Oct 2026: "Can you do it so the
// latest art work is where it needs to be"). Copies into the art folder every game image it lacks
// or holds a different file for (the game's copies are the newer ones, or the same pixels saved
// differently), brings characters/characters.json in line with the game's NPC list, then exports
// the game's maps as Tiled maps (tools/export-tmj.mjs). Every file it replaces is first copied into
// the backup folder, keeping its path.
//
//     node tools/sync-art-folder.mjs /path/to/art /path/to/backup [--dry-run]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [art, backup] = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => path.resolve(a));
const DRY = process.argv.includes('--dry-run');
if (!art || !backup) throw new Error('usage: sync-art-folder.mjs <art> <backup> [--dry-run]');
const GAME_ART = path.join(ROOT, 'public/assets/art');
// Made in this repo (tools/art/*.py), not by the art threads; and the bike-on-stand picture the
// vehicles thread draws in place of the buildings one (import-art OVERRIDES).
const SKIP = [/^ui\//, /^buildings\/tiled\/tiles\/interior-furniture\/bike_on_stand\+shadow\.png$/];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const replaced = [];
const added = [];
function put(rel, data) {
  const dest = path.join(art, rel);
  if (fs.existsSync(dest)) {
    if (Buffer.compare(fs.readFileSync(dest), data) === 0) return;
    replaced.push(rel);
    if (!DRY) {
      fs.mkdirSync(path.dirname(path.join(backup, rel)), { recursive: true });
      fs.copyFileSync(dest, path.join(backup, rel));
    }
  } else added.push(rel);
  if (!DRY) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
}

for (const file of walk(GAME_ART)) {
  const rel = path.relative(GAME_ART, file).split(path.sep).join('/');
  if (SKIP.some((r) => r.test(rel))) continue;
  put(rel, fs.readFileSync(file));
}

// The NPC list, names and sheets as the game has them.
const charsFile = path.join(art, 'characters/characters.json');
const chars = JSON.parse(fs.readFileSync(charsFile, 'utf8'));
const sheets = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8')).characters.sheets;
const byId = new Map(chars.npcs.map((n) => [n.id, n]));
chars.npcs = Object.entries(sheets)
  .filter(([id]) => !chars.players.includes(id))
  .map(([id, s]) => ({ ...(byId.get(id) ?? { id }), name: s.name, walk: s.walk.replace(/^art\/characters\//, ''), act: s.act.replace(/^art\/characters\//, '') }));
put('characters/characters.json', Buffer.from(JSON.stringify(chars, null, 1)));

// The maps, with their own tilesets; the .tmj and .tsj files they replace are backed up first.
const before = new Map();
for (const dir of ['area-map/tiled/maps', 'buildings/tiled/maps/interiors', 'area-map/tiled/exported']) {
  const full = path.join(art, dir);
  if (fs.existsSync(full)) for (const f of fs.readdirSync(full)) before.set(`${dir}/${f}`, fs.readFileSync(path.join(full, f)));
}
if (!DRY) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/export-tmj.mjs'), art], { stdio: 'inherit' });
  for (const [rel, data] of before) {
    const now = path.join(art, rel);
    if (fs.existsSync(now) && Buffer.compare(fs.readFileSync(now), data) !== 0) {
      replaced.push(rel);
      fs.mkdirSync(path.dirname(path.join(backup, rel)), { recursive: true });
      fs.writeFileSync(path.join(backup, rel), data);
    }
  }
}
console.log(JSON.stringify({ added, replaced }, null, 1));
