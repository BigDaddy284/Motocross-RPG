// Fluidity over many races (Boss, 4 Nov 2026: "run 1000 test races until you nail the fluidity"):
//   npx vite-node tools/sim/fluidity.ts [seeds per track] [track id…]
// Runs every track (or the ones named) with that many seeds through the rider AI and the
// fluidity check (tests/fluidity.ts), and reports every fault and the worst figures seen.
import { readFileSync } from 'node:fs';
import { readModTrack, registerModTracks } from '../../src/core/modTracks';
import { checkFluidity, type Fault } from '../../tests/fluidity';
import { isSprint } from '../../src/core/trackGeom';
import { content, race } from '../../tests/raceHelpers';

const args = process.argv.slice(2);
const seeds = Number(args[0] ?? 5);
const only = args.slice(1);
for (const file of ['first-try-mx', 'quarry-sprint', 'takedown-strip']) {
  const mod = readModTrack(content as never, `${file}.track.json`, readFileSync(`public/mods/tracks/${file}.track.json`, 'utf8'), 'folder');
  if (mod.track) registerModTracks(content, [...content.tracks.tracks.filter((t) => t.id.startsWith('mod.')).map((t) => ({ file: t.id, source: 'folder' as const, name: t.name, track: t, problems: [] })), mod]);
}
// Enduro sprints are a different race (riders queue at the line and roll down a return lane), checked by tests/sprint.test.ts.
const tracks = content.tracks.tracks.filter((t) => !t.practiceOnly && !isSprint(t) && (!only.length || only.includes(t.id)));
let races = 0;
let faults = 0;
let worst = { accel: 0, brake: 0, warp: 1, minSpeed: Infinity };
const byKind = new Map<string, number>();
const byTrack = new Map<string, number>();
const examples: string[] = [];
const t0 = Date.now();
for (const track of tracks) {
  for (let seed = 1; seed <= seeds; seed++) {
    let out;
    try {
      out = race(track.id, seed, true);
    } catch (e) {
      console.log(`${track.id} seed ${seed}: ${(e as Error).message}`);
      continue;
    }
    const { sim, dir, traces } = out;
    const r = checkFluidity(sim, dir, traces, (dir as { metres: number }).metres);
    races++;
    faults += r.faults.length;
    byTrack.set(track.id, (byTrack.get(track.id) ?? 0) + r.faults.length);
    worst = { accel: Math.max(worst.accel, r.maxAccel), brake: Math.max(worst.brake, r.maxBrake), warp: Math.max(worst.warp, r.maxWarp), minSpeed: Math.min(worst.minSpeed, r.minSpeed) };
    for (const f of r.faults) {
      const kind = f.what.replace(/[-\d.]+/g, '#');
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      if (examples.length < 40) examples.push(`${track.id} seed ${seed} ${f.rider} t=${f.t.toFixed(2)} d=${f.dist.toFixed(4)}: ${f.what}`);
    }
    if (r.maxWarp > 1.15 && examples.length < 60) examples.push(`${track.id} seed ${seed}: warp ${r.maxWarp.toFixed(3)}`);
  }
}
console.log(`${races} races on ${tracks.length} tracks in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${faults} faults`);
console.log(`worst: accel ${worst.accel.toFixed(1)} m/s², brake ${worst.brake.toFixed(1)} m/s², slowest on the ground ${worst.minSpeed.toFixed(2)} m/s, warp ${worst.warp.toFixed(3)}`);
for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${k}`);
for (const [k, n] of [...byTrack].sort((a, b) => b[1] - a[1])) if (n) console.log(`  ${k}: ${n}`);
for (const e of examples) console.log('  ' + e);
const _f: Fault | null = null;
void _f;
