// Balance check for the race simulation: runs many race days for a new rider and prints the
// spread of results, crashes, XP, money and wear. Run with: npx vite-node tools/sim/balance.ts [days] [riderLevel]
import { checkContent } from '../../src/core/content';
import { newCareerState } from '../../src/core/career';
import { PLAYER_ID, RaceDay, entryFee, playerEntrant, sumXp, type RaceContent } from '../../src/core/raceDay';
import { xpForLevel } from '../../src/core/skills';
import { loadManifest, loadMaps, rawContent } from '../../tests/helpers';

const days = Number(process.argv[2] ?? 300);
const level = Number(process.argv[3] ?? 1);
const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const rc: RaceContent = content;
const venue = content.tracks.venues.find((v) => v.id === 'venue-farmland')!;

const pos: number[][] = [[], []];
let crashes = 0;
let serious = 0;
let mistakes = 0;
let dnf = 0;
let money = 0;
let xpTotal = 0;
let passes = 0;
const lapTimes: Record<string, number[]> = {};
const wear: Record<string, number> = {};
for (let d = 0; d < days; d++) {
  const career = newCareerState(content.bikes, content.story, 'hondmoto', Math.random);
  career.bike.parts.top_end = { grade: 1, condition: 0.75 };
  for (const c of content.skills.leads[0].children) career.skills.xp[c.id] = xpForLevel(level);
  const before = structuredClone(career.bike);
  const day = new RaceDay(rc, venue, playerEntrant(rc, career, 'You'), (Math.random() * 2 ** 32) >>> 0, entryFee(rc, venue, { first_race_done: true }));
  for (let m = 0; m < 2; m++) {
    const { free } = day.gatesForPlayer();
    day.assignGates(free[0]);
    const sim = day.startMoto('steady');
    const laps = sim.runToEnd();
    for (const l of laps) for (const e of l.events) {
      if (e.kind === 'mistake' && e.rider === PLAYER_ID) { mistakes++; if (e.outcome === 'minor_crash') crashes++; if (e.outcome === 'serious_crash') serious++; }
      if (e.kind === 'pass' && e.rider === PLAYER_ID) passes++;
    }
    for (const r of sim.riders) (lapTimes[r.e.name] ??= []).push(...r.lapTimes);
    const rec = day.finishMoto(sim);
    const me = rec.results.find((r) => r.player)!;
    if (me.retired) dnf++; else pos[m].push(me.position);
    money += rec.prize;
  }
  const res = day.dayResult();
  money += res.podiumBonus - 2000;
  const xp = sumXp(...day.motos.map((m) => m.xp));
  xpTotal += Object.values(xp).reduce((a, b) => a + b, 0);
  for (const [s, p] of Object.entries(day.player.bike.parts)) wear[s] = (wear[s] ?? 0) + (before.parts[s].condition - p.condition);
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const hist = (a: number[]) => { const h: Record<number, number> = {}; for (const x of a) h[x] = (h[x] ?? 0) + 1; return h; };
console.log(`days ${days}, rider level ${level}`);
console.log('moto positions', hist([...pos[0], ...pos[1]]), 'avg', avg([...pos[0], ...pos[1]]).toFixed(1));
console.log('per day: mistakes', (mistakes / days).toFixed(2), 'minor crashes', (crashes / days).toFixed(3), 'serious', (serious / days).toFixed(3), 'dnf motos', (dnf / days).toFixed(3), 'passes', (passes / days).toFixed(1));
console.log('net money per day £', (money / days / 100).toFixed(2), 'XP per day', (xpTotal / days).toFixed(0));
console.log('wear per day (condition points)', Object.fromEntries(Object.entries(wear).map(([k, v]) => [k, (v / days * 100).toFixed(1)])));
console.log('avg lap', Object.entries(lapTimes).map(([k, v]) => `${k} ${avg(v).toFixed(1)}`).join(', '));
