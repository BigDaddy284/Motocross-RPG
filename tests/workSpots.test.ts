import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { JobDef } from '../src/core/career';
import { workSpots, type BoardDef } from '../src/core/jobBoard';
import type { BakedMap } from '../src/core/mapTypes';

const load = (id: string): BakedMap => JSON.parse(fs.readFileSync(`public/assets/maps/${id}.json`, 'utf8'));
const jobs: JobDef[] = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')).jobs;
const boards: BoardDef[] = JSON.parse(fs.readFileSync('public/data/jobboard.json', 'utf8')).boards;
const all = { tutorial_done: true };

// Boss, 7 Nov 2026: "All the first machines that start a batch should have the orange circle round
// them to indicate they do something, same for the job board."
describe('the places that start work', () => {
  it('every shift job has its first machine ringed on its map', () => {
    for (const j of jobs) {
      const spots = workSpots(load(j.map), jobs, boards, all);
      expect(spots.some((o) => o.name === j.start), j.id).toBe(true);
    }
  });

  it('every job board is ringed on its map', () => {
    for (const b of boards) {
      const spots = workSpots(load(b.map), jobs, boards, all);
      expect(spots.some((o) => o.props.action === b.action), b.id).toBe(true);
    }
  });

  it('only the first machine of a batch, not the stations after it', () => {
    const map = load('int-iz-engine-rebuilder');
    expect(new Set(workSpots(map, jobs, boards, all).map((o) => o.name))).toEqual(new Set(['bench_long']));
  });

  it("not before the rider may use them (Phoenix MX's board and the Industrial Zone shifts wait for the tutorial)", () => {
    expect(workSpots(load('int-home-local-garage'), jobs, boards, {})).toEqual([]);
    expect(workSpots(load('int-iz-fabrication-shop'), jobs, boards, {})).toEqual([]);
    expect(workSpots(load('int-home-local-garage'), jobs, boards, all).length).toBeGreaterThan(0);
  });
});
