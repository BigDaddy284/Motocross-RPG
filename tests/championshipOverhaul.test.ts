import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { champById, champPool, champProblem, checkChampionships, drawChampField, enter, recordRound, roundEntry, roundOptions, standings } from '../src/core/championship';
import { stockBike } from '../src/core/classes';
import { checkContent } from '../src/core/content';
import { PLAYER_ID, RaceDay, playerEntrant } from '../src/core/raceDay';
import { isNoTurn } from '../src/core/trackGeom';
import { loadManifest, loadMaps, rawContent } from './helpers';

// The championship overhaul from Boss's planner sheet (Boss, 4 Nov 2026): the Area Championships
// take bike-part names and the Area 5 to 8 ones race the new tracks too, each area's story opens
// MX, SX, Enduro, Sprint Enduro and EnduroCross Series across the areas open by then, and the
// Legends Championship races every MX track, then every SX track. Rounds are the sheet's row totals.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const champ = (id: string) => champById(content.championships, id)!;
const venue = (id: string) => content.tracks.venues.find((v) => v.id === id)!;
const MX = ['venue-farmland', 'venue-a2-mx', 'venue-a3-mx', 'venue-a4-mx', 'venue-a5-mx', 'venue-a6-mx', 'venue-a7-mx', 'venue-a8-mx'];
const SX = ['venue-riverside', 'venue-a2-sx', 'venue-a3-sx', 'venue-a4-sx', 'venue-a5-sx', 'venue-a6-sx', 'venue-a7-sx', 'venue-a8-sx'];
const EN = ['venue-longmoor', 'venue-a2-enduro', 'venue-a3-enduro', 'venue-a4-enduro', 'venue-a5-enduro', 'venue-a6-enduro', 'venue-a7-enduro', 'venue-a8-enduro'];
const SPRINT = (a: number) => [`venue-a${a}-sprint-1`, `venue-a${a}-sprint-2`];
const EXC = (a: number) => [`venue-a${a}-exc-1`, `venue-a${a}-exc-2`];
const each = (venues: string[], n: number) => Object.fromEntries(venues.map((v) => [v, n]));
const counts = (rounds: string[]) => rounds.reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});

/** Boss's sheet, row by row: how many times each championship races each track. */
const SHEET: Record<string, Record<string, number>> = {
  'area1.local_champion': each(['venue-farmland', 'venue-riverside', 'venue-longmoor'], 1),
  'area1.main': each(['venue-farmland', 'venue-riverside', 'venue-longmoor'], 2),
  'area2.local_champion': each(['venue-a2-mx', 'venue-a2-sx', 'venue-a2-enduro'], 1),
  'area2.main': each(['venue-a2-mx', 'venue-a2-sx', 'venue-a2-enduro'], 2),
  'area3.mx': each(MX.slice(0, 3), 2),
  'area3.sx': each(SX.slice(0, 3), 2),
  'area3.enduro': each(EN.slice(0, 3), 2),
  'area3.local_champion': each(['venue-a3-mx', 'venue-a3-sx', 'venue-a3-enduro'], 1),
  'area3.main': each(['venue-a3-mx', 'venue-a3-sx', 'venue-a3-enduro'], 2),
  'area4.local_champion': each(['venue-a4-mx', 'venue-a4-sx', 'venue-a4-enduro'], 1),
  'area4.main': each(['venue-a4-mx', 'venue-a4-sx', 'venue-a4-enduro'], 2),
  'area5.sprint': each(SPRINT(5), 2),
  'area5.local_champion': { ...each(['venue-a5-mx', 'venue-a5-sx', 'venue-a5-enduro'], 1), 'venue-a5-sprint-1': 1 },
  'area5.main': { ...each(['venue-a5-mx', 'venue-a5-sx', 'venue-a5-enduro'], 2), ...each(SPRINT(5), 1) },
  'area6.mx': each(MX.slice(3, 6), 2),
  'area6.sx': each(SX.slice(3, 6), 2),
  'area6.enduro': each(EN.slice(3, 6), 2),
  'area6.sprint': each([...SPRINT(5), ...SPRINT(6)], 1),
  'area6.local_champion': { ...each(['venue-a6-mx', 'venue-a6-sx', 'venue-a6-enduro'], 1), ...each(SPRINT(6), 1) },
  'area6.main': { ...each(['venue-a6-mx', 'venue-a6-sx', 'venue-a6-enduro'], 2), ...each(SPRINT(6), 1) },
  'area7.mx': each(MX.slice(0, 7), 1),
  'area7.sx': each(SX.slice(0, 7), 1),
  'area7.enduro': each(EN.slice(0, 7), 1),
  'area7.sprint': each([...SPRINT(5), ...SPRINT(6), ...SPRINT(7)], 1),
  'area7.endurocross': each(EXC(7), 2),
  'area7.local_champion': { ...each(['venue-a7-mx', 'venue-a7-sx', 'venue-a7-enduro'], 1), ...each(SPRINT(7), 1), ...each(EXC(7), 1) },
  'area7.main': { ...each(['venue-a7-mx', 'venue-a7-sx', 'venue-a7-enduro'], 2), ...each(SPRINT(7), 1), ...each(EXC(7), 1) },
  'area8.mx': each(MX, 1),
  'area8.sx': each(SX, 1),
  'area8.enduro': each(EN, 1),
  'area8.sprint': each([...SPRINT(5), ...SPRINT(6), ...SPRINT(7), ...SPRINT(8)], 1),
  'area8.endurocross': each([...EXC(7), ...EXC(8)], 2),
  // Area 8's Local races its MX, SX and Enduro twice, as the sheet has it ("stick to the doc", Boss, 4 Nov 2026).
  'area8.local_champion': { ...each(['venue-a8-mx', 'venue-a8-sx', 'venue-a8-enduro'], 2), ...each(SPRINT(8), 1), ...each(EXC(8), 1) },
  'area8.main': { ...each(['venue-a8-mx', 'venue-a8-sx', 'venue-a8-enduro'], 2), ...each(SPRINT(8), 1), ...each(EXC(8), 2) },
  legends: { ...each(MX, 1), ...each(SX, 1) },
};

describe('the championship overhaul (Boss, 4 Nov 2026)', () => {
  it("races every track as many times as Boss's sheet says, and passes every check", () => {
    // The sidecar championships come through Ray Crispy (Boss, 4 Nov 2026), outside this sheet's rows here.
    const ids = content.championships.championships.filter((c) => !(c as { sidecar?: boolean }).sidecar).map((c) => c.id);
    expect(ids.sort()).toEqual(Object.keys(SHEET).sort());
    for (const [id, want] of Object.entries(SHEET)) expect(counts(champ(id).rounds), id).toEqual(want);
    expect(checkChampionships(content.championships, content)).toEqual([]);
  });

  it('names the Area Championships after bike parts, and the badges after the towns', () => {
    const cups = ['Sprocket Cup', 'Chain Cup', 'Spark Plug Cup', 'Clutch Cup', 'Gearbox Cup', 'Handlebar Cup', 'Exhaust Cup', 'Crankshaft Cup'];
    const towns = ['Home Town', 'Mountain Town', 'Beach Town', 'Forest Town', 'Western Works', 'Highlands', 'The City', 'Capital'];
    cups.forEach((name, i) => {
      expect(champ(`area${i + 1}.main`).name).toBe(name);
      expect(champ(`area${i + 1}.local_champion`).rewards[0].title).toMatch(new RegExp(`${towns[i]} badge$`));
    });
  });

  it("opens each area's series with its story, and Legends after the Crankshaft Cup", () => {
    for (const a of [3, 6, 7, 8]) for (const k of ['mx', 'sx', 'enduro']) expect(champ(`area${a}.${k}`).needs).toEqual([`area${a}.intro_done`]);
    for (const a of [5, 6, 7, 8]) expect(champ(`area${a}.sprint`).needs).toEqual([`area${a}.intro_done`]);
    expect(champ('legends').needs).toEqual([champ('area8.main').rewards[0].flag]);
    // Legends: every area's MX track first, then back to Area 1 for the SX tracks.
    expect(champ('legends').rounds).toEqual([...MX, ...SX]);
  });

  it('keeps the No-Turn Takedowns out of every championship: they are their own special event', () => {
    for (const c of content.championships.championships) for (const v of c.rounds) expect(isNoTurn(content.tracks.tracks.find((t) => t.id === venue(v).track)!), `${c.id} ${v}`).toBe(false);
  });

  it("draws a series' field at random from every area open by then, with no champion to beat", () => {
    const def = champ('area3.mx');
    expect(def.main).toBeUndefined();
    const pool = champPool(content, def);
    const areaOf = (id: string) => content.riders.riders.find((r) => r.id === id)!.areas;
    // Riders of Areas 1 to 3, and nobody who races only later.
    expect(pool.every((id) => areaOf(id).some((a) => a <= 3))).toBe(true);
    for (const a of [1, 2, 3]) expect(pool.some((id) => areaOf(id).includes(a) && areaOf(id).every((b) => b === a))).toBe(true);
    const fields = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => drawChampField(content, def, s));
    for (const f of fields) {
      expect(f).toHaveLength(def.size);
      expect(new Set(f).size).toBe(f.length);
      expect(f.every((id) => pool.includes(id))).toBe(true);
    }
    // No regulars: no rider is in every field drawn.
    expect(pool.some((id) => fields.every((f) => f.includes(id)))).toBe(false);
  });

  it("races a series' old tracks on the rider's own bike: too small a bike can't enter", () => {
    const career = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    const flags = { 'area3.intro_done': true, 'found.venue-farmland': true, 'area2.intro_done': true };
    const def = champ('area3.mx');
    expect(champProblem(content, def, flags, '65cc')).toMatch(/too small/);
    expect(champProblem(content, def, flags, '85cc-small')).toBeNull();
    expect(champProblem(content, def, flags, '250f')).toBeNull();
    // A 250 F at Farmland: the whole field rides 250 Fs, at Area 3's level or better.
    career.bike = stockBike(content.bikes, 'hondmoto', '250f');
    const active = enter(career, content, def, 5);
    const day = new RaceDay(content, venue('venue-farmland'), playerEntrant(content, career, 'Test'), 9, roundEntry(content, def, '250f'), roundOptions(content, def, active));
    expect(day.cls).toBe('250f');
    expect(day.field.every((e) => e.bike.class === '250f')).toBe(true);
    expect(day.field.filter((e) => !e.player).every((e) => (e.riderLevel ?? 0) >= 0)).toBe(true);
  });

  it('scores a Sprint Enduro round on the same points table as any other round', () => {
    const career = newCareerState(content.bikes, content.story, 'hondmoto', () => 0.5);
    career.bike = stockBike(content.bikes, 'hondmoto', '125cc-youth');
    const def = champ('area5.local_champion');
    const active = enter(career, content, def, 3);
    const v = venue('venue-a5-sprint-1');
    const day = new RaceDay(content, v, playerEntrant(content, career, 'Test'), 4, roundEntry(content, def), roundOptions(content, def, active));
    expect(day.sprint).toBe(true);
    const q = day.startQualifying('steady');
    q.runToEnd();
    day.finishQualifying(q);
    for (let m = 0; m < 2; m++) {
      const sim = day.startMoto('steady');
      sim.runToEnd();
      day.finishMoto(sim);
    }
    recordRound(active, v, day);
    const table = standings(content.racing.points, active);
    expect(table).toHaveLength(def.size + 1);
    const me = table.find((r) => r.id === PLAYER_ID)!;
    const mine = day.motos.reduce((a, m) => a + (m.results.find((r) => r.player)!.retired ? 0 : (content.racing.points[m.results.find((r) => r.player)!.position - 1] ?? 0)), 0);
    expect(me.points).toBe(mine);
  });
});
