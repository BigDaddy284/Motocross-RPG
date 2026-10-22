import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { findPath, findPathToAny, findPathTowards, standingTiles } from '../src/core/pathfinding';

const grid = (rows: string[], walls: [number, number, number, number][] = []) => new Grid(rows[0].length, rows.length, rows, walls);

describe('findPath', () => {
  it('walks around blocked tiles', () => {
    const g = grid(['.....', '.###.', '.....']);
    const p = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(p).toHaveLength(6);
    expect(p.at(-1)).toEqual({ x: 4, y: 1 });
    for (const t of p) expect(g.isFree(t.x, t.y)).toBe(true);
  });

  it('returns null when the goal is cut off', () => {
    const g = grid(['..#..', '..#..']);
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });

  it('does not cross a thin edge wall', () => {
    // A vertical wall on the left edge of column 2, for both rows.
    const g = grid(['....', '....'], [[2, 0, 2, 2]]);
    expect(findPath(g, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeNull();
    const h = grid(['....', '....'], [[2, 0, 2, 1]]);
    expect(findPath(h, { x: 1, y: 0 }, { x: 2, y: 0 })).toHaveLength(3);
  });

  it('treats occupied tiles as blocked', () => {
    const g = grid(['...']);
    g.setOccupied({ x: 1, y: 0 }, true);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    g.setOccupied({ x: 1, y: 0 }, false);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toHaveLength(2);
  });
});

describe('clicks and NPCs', () => {
  it('a click on a blocked tile walks to the nearest reachable tile', () => {
    const g = grid(['.....', '..#..', '.....']);
    const p = findPathTowards(g, { x: 0, y: 1 }, { x: 2, y: 1 });
    const end = p.at(-1)!;
    expect(Math.abs(end.x - 2) + Math.abs(end.y - 1)).toBe(1);
  });

  it('walks to the closest free tile next to an NPC', () => {
    const g = grid(['.....', '.....', '.....']);
    const npc = { x: 3, y: 1 };
    g.setOccupied(npc, true);
    const stands = standingTiles(g, [npc]);
    expect(stands).toHaveLength(4);
    const p = findPathToAny(g, { x: 0, y: 1 }, stands)!;
    expect(p.at(-1)).toEqual({ x: 2, y: 1 });
  });

  it('never stands on the far side of a thin wall', () => {
    const g = grid(['...', '...'], [[0, 1, 3, 1]]);
    expect(standingTiles(g, [{ x: 1, y: 0 }])).not.toContainEqual({ x: 1, y: 1 });
  });
});
