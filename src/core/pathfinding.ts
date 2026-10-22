import { Grid, STEPS } from './grid';
import type { Tile } from './mapTypes';

// Movement is four-directional, one tile per step, so every step costs the same and a
// breadth-first search finds the shortest path.

interface Search {
  /** Steps from the start tile, or -1 when unreachable. */
  dist: Int32Array;
  prev: Int32Array;
}

function search(grid: Grid, start: Tile): Search {
  const n = grid.width * grid.height;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  if (!grid.inBounds(start.x, start.y)) return { dist, prev };
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const s = start.y * grid.width + start.x;
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const from = { x: i % grid.width, y: Math.floor(i / grid.width) };
    for (const d of STEPS) {
      const to = { x: from.x + d.x, y: from.y + d.y };
      if (!grid.inBounds(to.x, to.y)) continue;
      const j = to.y * grid.width + to.x;
      if (dist[j] !== -1 || !grid.canStep(from, to)) continue;
      dist[j] = dist[i] + 1;
      prev[j] = i;
      queue[tail++] = j;
    }
  }
  return { dist, prev };
}

function trace(grid: Grid, s: Search, end: number): Tile[] {
  const path: Tile[] = [];
  for (let i = end; s.prev[i] !== -1; i = s.prev[i]) path.push({ x: i % grid.width, y: Math.floor(i / grid.width) });
  return path.reverse();
}

/** Shortest path from start to goal, excluding the start tile. Null when unreachable. */
export function findPath(grid: Grid, start: Tile, goal: Tile): Tile[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!grid.inBounds(goal.x, goal.y)) return null;
  const s = search(grid, start);
  const g = goal.y * grid.width + goal.x;
  return s.dist[g] === -1 ? null : trace(grid, s, g);
}

/** Shortest path to whichever of the goal tiles is closest by walking. Null when none is reachable. */
export function findPathToAny(grid: Grid, start: Tile, goals: Tile[]): Tile[] | null {
  const s = search(grid, start);
  let best = -1;
  for (const g of goals) {
    if (!grid.inBounds(g.x, g.y)) continue;
    const i = g.y * grid.width + g.x;
    if (s.dist[i] !== -1 && (best === -1 || s.dist[i] < s.dist[best])) best = i;
  }
  return best === -1 ? null : trace(grid, s, best);
}

/**
 * Path for a click on any tile. A reachable tile is walked to directly. A blocked or cut-off tile
 * walks to the reachable tile nearest to it in a straight line, breaking ties by walking distance.
 */
export function findPathTowards(grid: Grid, start: Tile, target: Tile): Tile[] {
  const s = search(grid, start);
  const t = target.y * grid.width + target.x;
  if (grid.inBounds(target.x, target.y) && s.dist[t] !== -1) return trace(grid, s, t);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < s.dist.length; i++) {
    if (s.dist[i] === -1) continue;
    const dx = (i % grid.width) - target.x;
    const dy = Math.floor(i / grid.width) - target.y;
    const score = (dx * dx + dy * dy) * 10000 + s.dist[i];
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best === -1 ? [] : trace(grid, s, best);
}

/** The free tiles next to a target that a character could stand on to talk to or use it. */
export function standingTiles(grid: Grid, targets: Tile[]): Tile[] {
  const own = new Set(targets.map((t) => `${t.x},${t.y}`));
  const out: Tile[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    for (const d of STEPS) {
      const n = { x: t.x + d.x, y: t.y + d.y };
      const k = `${n.x},${n.y}`;
      if (own.has(k) || seen.has(k)) continue;
      seen.add(k);
      // Must be able to face the target across the shared edge (no thin wall between them).
      if (grid.isFree(n.x, n.y) && grid.edgeOpen(n, t)) out.push(n);
    }
  }
  return out;
}

/** All tiles reachable on foot from start, including start. */
export function reachable(grid: Grid, start: Tile): Set<string> {
  const s = search(grid, start);
  const out = new Set<string>();
  for (let i = 0; i < s.dist.length; i++) if (s.dist[i] !== -1) out.add(`${i % grid.width},${Math.floor(i / grid.width)}`);
  return out;
}
