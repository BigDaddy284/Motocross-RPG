import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { MotoSim } from '../src/core/race';
import { loadModTracks, modVenue, readModTrack, TRACK_FILE } from '../src/core/modTracks';
import { PLAYER_ID, RaceDay, entryFee, playerEntrant } from '../src/core/raceDay';
import { directorFor, SPRINT_LEAD } from '../src/core/riderAI';
import { MemoryStore } from '../src/core/storage';
import { layoutProblems, RETURN_MIN } from '../src/core/trackCheck';
import { SPRINT_START_ITEM, sprintPlace, sceneryIssues } from '../src/core/trackClearance';
import { isSprint, lapGeom, lapPlan, RETURN_WIDTH, SPRINT_QUEUE, sprintStart, startGeom, widthShare } from '../src/core/trackGeom';
import { TrackSurface } from '../src/core/trackSurface';
import { loadManifest, loadMaps, rawContent } from './helpers';
import { content, field } from './raceHelpers';

// Enduro sprints (Boss, 29 Oct 2026): one rider at a time off the start line, the interval apart,
// a timed test to the finish line, the return lane at half speed back to the start, and the
// lowest total test time wins.

// The example sprint, kept as a test track since the mods folder holds copies of the game's tracks (Boss, 5 Nov 2026).
const FILE = 'quarry-sprint.track.json';
export function sprintTrack() {
  const m = readModTrack(content, FILE, readFileSync(`tests/fixtures/${FILE}`, 'utf8'), 'folder');
  return { ...m, track: m.track! };
}

function race(seed = 3, laps = 3, riders = 16) {
  const { track } = sprintTrack();
  const entrants = field('50cc', riders);
  entrants.forEach((e, i) => (e.gate = i));
  const sim = new MotoSim(content.racing, content.bikes, track, '50cc', entrants, { laps, motoIndex: 0, seed });
  return { sim, track, traces: sim.runToEnd() };
}

describe('enduro sprints', () => {
  it('the example sprint is a sprint and passes every mod track check', () => {
    const m = sprintTrack();
    expect(m.problems).toEqual([]);
    expect(isSprint(m.track)).toBe(true);
  });

  it('lap 1 is the test from the start line; later laps add the return lane and the queue first', () => {
    const { track } = sprintTrack();
    const start = startGeom(track);
    expect(start.total).toBe(0);
    expect(start.from).toBeCloseTo(sprintStart(track));
    const one = lapPlan(track, 1);
    expect(one.secs[0]).toBe(1);
    expect(one.marks[0]).toBeCloseTo(sprintStart(track));
    expect(one.marks.at(-1)).toBe(1);
    const two = lapPlan(track, 2);
    expect(two.secs.slice(0, 3)).toEqual([0, SPRINT_QUEUE, 1]);
    expect(two.marks[0]).toBe(1);
    expect(two.marks[2]).toBeCloseTo(1 + sprintStart(track));
    expect(two.marks.at(-1)).toBe(2);
  });

  it('sends riders off one at a time, the interval apart, in their start order, every lap', () => {
    const { sim, traces } = race();
    const gap = sim.sprintRules.interval;
    for (const tr of traces) {
      const at = tr.lap === 1 ? 0 : 2;
      const away = Object.entries(tr.times).map(([id, t]) => ({ id, t: t[at] })).sort((a, b) => a.t - b.t);
      for (let i = 1; i < away.length; i++) expect(away[i].t - away[i - 1].t).toBeGreaterThanOrEqual(gap - 1e-9);
      if (tr.lap === 1) away.forEach((a, i) => expect(a.t).toBeCloseTo(i * gap));
    }
    // A lap's first rider waits for the last one of the lap before to have gone.
    const last1 = Math.max(...Object.values(traces[0].times).map((t) => t[0]));
    const first2 = Math.min(...Object.values(traces[1].times).map((t) => t[2]));
    expect(first2 - last1).toBeGreaterThanOrEqual(gap - 1e-9);
  });

  it('rolls the return lane at half the reference speed, single file, and queues in the order riders get there', () => {
    const { sim, traces, track } = race();
    const ref = content.racing.classes['50cc'].refSpeed * sim.sprintRules.returnSpeed;
    const lane = track.sections[0].length;
    for (const tr of traces.slice(1)) {
      const rows = Object.values(tr.times).filter((t) => t.length > 3).map((t) => ({ fin: t[0], arr: t[1], away: t[2] }));
      for (const r of rows) {
        expect(r.arr - r.fin).toBeGreaterThanOrEqual(lane / ref - 1e-6);
        expect(r.away).toBeGreaterThanOrEqual(r.arr - 1e-9);
      }
      const byArr = [...rows].sort((a, b) => a.arr - b.arr);
      const byAway = [...rows].sort((a, b) => a.away - b.away);
      expect(byAway).toEqual(byArr);
    }
  });

  it('ranks riders by the timed tests added up, the return lane and the queue left out', () => {
    const { sim, traces } = race();
    const res = sim.results();
    for (const r of res.filter((x) => !x.retired)) {
      const rider = sim.riders.find((x) => x.e.id === r.id)!;
      let timed = 0;
      for (const tr of traces) {
        const t = tr.times[r.id];
        if (!t) continue;
        timed += t.at(-1)! - (tr.lap === 1 ? t[0] : t[2]);
      }
      expect(r.time).toBeCloseTo(timed, 6);
      expect(rider.lapTimes.reduce((a, b) => a + b, 0)).toBeCloseTo(timed, 6);
    }
    const done = res.filter((x) => !x.retired && x.laps === 3);
    for (let i = 1; i < done.length; i++) expect(done[i].time).toBeGreaterThanOrEqual(done[i - 1].time);
    // Nobody wins on when they crossed the line: the first to leave usually finishes first, but not the winner by default.
    expect(res[0].gap).not.toContain('+');
  });

  it('lets a quick rider catch and pass the rider who left before them', () => {
    let passes = 0;
    for (const seed of [1, 2, 3, 4, 5]) passes += race(seed).traces.flatMap((t) => t.events).filter((e) => e.kind === 'pass').length;
    expect(passes).toBeGreaterThan(0);
  });
});

describe('the return lane', () => {
  it('is a quarter of the track wide, widening to the full width at the finish line and the start line', () => {
    const { track } = sprintTrack();
    const s = new TrackSurface(track);
    const g = lapGeom(track.path);
    const mid = sprintStart(track) / 2;
    expect(widthShare(track, g, mid)).toBeCloseTo(RETURN_WIDTH);
    expect(s.hwAt(mid)).toBeCloseTo(s.hw * RETURN_WIDTH);
    expect(widthShare(track, g, 0)).toBe(1);
    expect(widthShare(track, g, sprintStart(track))).toBeCloseTo(1);
    expect(widthShare(track, g, 0.9)).toBe(1);
    // Every other track is the full width all round.
    const farm = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    expect(new TrackSurface(farm).hwAt(0.3)).toBe(new TrackSurface(farm).hw);
  });

  it('must be the first section, long enough for the queue, and clear of the test', () => {
    const { track } = sprintTrack();
    expect(layoutProblems(track, content.racing.sections)).toEqual([]);
    const msgs = (t: typeof track) => layoutProblems(t, content.racing.sections).map((p) => p.message).join(' | ');
    // No return lane first.
    expect(msgs({ ...track, sections: track.sections.slice(1) })).toMatch(/first section is the return lane/);
    // A return lane on another kind of track, or a second one.
    expect(msgs({ ...track, kind: 'outdoor', start: { path: [[1, 1], [2, 2]] } })).toMatch(/only an Enduro Sprint has/);
    expect(msgs({ ...track, sections: [...track.sections, { type: 'return_lane', length: 20, passing: 0 }] })).toMatch(/an Enduro Sprint has one/);
    // Too short for the queue.
    const lap = track.sections.reduce((a, x) => a + x.length, 0);
    const g = lapGeom(track.path);
    const short = Math.floor(((RETURN_MIN - 4) / g.total) * lap);
    const shortLane = { ...track, sections: [{ ...track.sections[0], length: short }, { type: 'straight', length: track.sections[0].length - short, passing: 0.5 }, ...track.sections.slice(1)] };
    expect(msgs(shortLane)).toMatch(/needs at least 20/);
    // A start straight has no place on a sprint.
    expect(msgs({ ...track, start: { path: [[20, 30], [30, 30]] } })).toMatch(/no start straight/);
    // Running into the test: pull a return-lane point into the middle of the test's bottom straight.
    const path = track.path.map((p) => [...p] as [number, number]);
    path[2] = [35, 53];
    expect(msgs({ ...track, path })).toMatch(/runs into the test/);
  });
});

describe('the sprint start', () => {
  it('stands on the start line square to the track, its posts and officials clear of the racing surface', () => {
    const { track } = sprintTrack();
    const at = sprintPlace(track)!;
    const g = lapGeom(track.path);
    const p = { x: track.path[5][0], y: track.path[5][1] };
    expect(Math.hypot(at.x - p.x, at.y - p.y)).toBeLessThan(0.5);
    void g;
    const placed = { ...track, scenery: [{ type: SPRINT_START_ITEM, ...at }] };
    expect(sceneryIssues(content.trackParts, placed).filter((i) => i.level === 'error')).toEqual([]);
    expect(sprintPlace(content.tracks.tracks.find((t) => t.id === 'farmland')!)).toBeNull();
  });
});

describe('the queue on the race screen', () => {
  it('never has two riders in the same spot in the queue or the return lane, and nobody moves backwards', () => {
    const { track } = sprintTrack();
    const entrants = field('50cc', 16);
    entrants.forEach((e, i) => (e.gate = i));
    const sim = new MotoSim(content.racing, content.bikes, track, '50cc', entrants, { laps: 2, motoIndex: 0, seed: 9 });
    const dir = directorFor(sim, content.bikes, content.racing.messages);
    for (const tr of sim.runToEnd()) dir.addLap(tr);
    const units = lapGeom(track.path).total;
    const line = sprintStart(track);
    const last = new Map<string, number>();
    for (let t = -SPRINT_LEAD; t < 400; t += 0.5) {
      const poses = dir.poses(t);
      // From a bike's length past the finish line: two who finished the test within the simulation's
      // blocked gap of each other cross the line that close, and the lane spaces them out from there.
      const lane = poses.filter((p) => p.state !== 'finished' && p.state !== 'retired' && p.dist - Math.floor(p.dist) <= line + 1e-9 && (p.dist - Math.floor(p.dist)) * units >= 1.5).map((p) => p.dist - Math.floor(p.dist)).sort((a, b) => a - b);
      for (let i = 1; i < lane.length; i++) expect((lane[i] - lane[i - 1]) * units, `t=${t}`).toBeGreaterThan(0.9);
      for (const p of poses) {
        const before = last.get(p.id);
        if (before !== undefined && p.state !== 'finished') expect(p.dist, `${p.id} at ${t}`).toBeGreaterThanOrEqual(before - 1e-6);
        last.set(p.id, p.dist);
      }
    }
    // Before the first rider goes, the whole field is queued in start order, the first on the line.
    const start = dir.poses(-1).sort((a, b) => b.dist - a.dist);
    expect(start.map((p) => p.state)).toEqual(start.map(() => 'grid'));
    expect(start[0].id).toBe(entrants[0].id);
    expect(start[0].dist).toBeCloseTo(line);
    expect(start.map((p) => p.id)).toEqual(entrants.map((e) => e.id));
  });
});

describe('a sprint race day (mod tracks)', () => {
  it('qualifies on one timed lap, then sends riders off fastest first, and moto 2 in moto 1 order', () => {
    const rc = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
    const text = readFileSync(`tests/fixtures/${FILE}`, 'utf8');
    const [mod] = loadModTracks(rc, [{ file: FILE, text }], new MemoryStore());
    expect(mod.problems).toEqual([]);
    const venue = modVenue(mod, 'area1-home-town');
    const career = newCareerState(rc.bikes, rc.story, rc.bikes.brands[0].id);
    const d = new RaceDay(rc, venue, playerEntrant(rc, career, 'Test'), 11, entryFee(rc, venue, {}));
    expect(d.sprint).toBe(true);
    expect(d.laps).toBe(8);
    expect(d.qualifyingDue).toBe(true);
    const q = d.startQualifying('steady');
    expect(q.totalLaps).toBe(1);
    q.runToEnd();
    const rec = d.finishQualifying(q);
    expect(d.qualifyingDue).toBe(false);
    for (const r of rec.results) if (r.bestLap !== null) expect(r.bestLap).toBeCloseTo(q.riders.find((x) => x.e.id === r.id)!.lapTimes[0]);
    expect(d.pickOrder).toEqual(rec.results.map((r) => r.id));
    const m1 = d.startMoto('steady');
    // Gates are the start order: the fastest qualifier leaves first.
    expect([...m1.riders].sort((a, b) => a.e.gate - b.e.gate).map((r) => r.e.id)).toEqual(rec.results.map((r) => r.id));
    expect(m1.totalLaps).toBe(8);
    m1.runToEnd();
    const r1 = d.finishMoto(m1);
    const m2 = d.startMoto('steady');
    expect([...m2.riders].sort((a, b) => a.e.gate - b.e.gate).map((r) => r.e.id)).toEqual(r1.results.map((r) => r.id));
    m2.runToEnd();
    d.finishMoto(m2);
    expect(d.done).toBe(true);
    expect(d.field.some((e) => e.id === PLAYER_ID)).toBe(true);
    void TRACK_FILE;
  });
});

describe("the game's own Enduro Sprints (Boss, 4 Nov 2026)", () => {
  const sprints = [...content.tracks.tracks.filter((t) => isSprint(t)), sprintTrack().track];
  it('has two in each of Areas 5 to 8, each raced at the Enduro Sprint venue', () => {
    expect(sprints.filter((t) => !t.id.startsWith('mod.')).map((t) => t.id).sort()).toEqual(['a5-sprint-1', 'a5-sprint-2', 'a6-sprint-1', 'a6-sprint-2', 'a7-sprint-1', 'a7-sprint-2', 'a8-sprint-1', 'a8-sprint-2']);
    for (const t of sprints.filter((x) => !x.id.startsWith('mod.'))) {
      const venues = content.tracks.venues.filter((v) => v.track === t.id);
      expect(venues.map((v) => v.map), t.id).toEqual(['venue-enduro-sprint']);
      expect(layoutProblems(t, content.racing.sections), t.id).toEqual([]);
      expect(t.scenery?.some((i) => i.type === SPRINT_START_ITEM), t.id).toBe(true);
    }
  });

  for (const track of sprints) {
    it(`rides ${track.id} one at a time: nobody moves backwards, the queue never doubles up, and everyone finishes`, () => {
      const entrants = field('50cc', 16);
      entrants.forEach((e, i) => (e.gate = i));
      const sim = new MotoSim(content.racing, content.bikes, track, '50cc', entrants, { laps: 2, motoIndex: 0, seed: 11 });
      const dir = directorFor(sim, content.bikes, content.racing.messages);
      for (const tr of sim.runToEnd()) dir.addLap(tr);
      const units = lapGeom(track.path).total;
      const line = sprintStart(track);
      const last = new Map<string, number>();
      const end = Math.max(...sim.riders.map((r) => r.time)) + 6;
      // Sampled between departures: at the very moment a rider leaves the line, the next one is
      // already on it.
      for (let t = -SPRINT_LEAD + 0.25; t < end; t += 0.5) {
        const poses = dir.poses(t);
        const lane = poses.filter((p) => p.state !== 'finished' && p.state !== 'retired' && p.dist - Math.floor(p.dist) <= line + 1e-9 && (p.dist - Math.floor(p.dist)) * units >= 1.5).map((p) => p.dist - Math.floor(p.dist)).sort((a, b) => a - b);
        for (let i = 1; i < lane.length; i++) expect((lane[i] - lane[i - 1]) * units, `t=${t}`).toBeGreaterThan(0.9);
        for (const p of poses) {
          const before = last.get(p.id);
          // A queued rider can settle a fraction back onto their spot as the line moves up: under a grid unit (about a bike length).
          if (before !== undefined && p.state !== 'finished') expect(p.dist, `${p.id} at ${t}`).toBeGreaterThanOrEqual(before - 1 / units);
          last.set(p.id, p.dist);
        }
      }
      const finals = dir.poses(end);
      for (const r of sim.results().filter((x) => !x.retired)) expect(finals.find((p) => p.id === r.id)!.state).toBe('finished');
    }, 30000);
  }
});
