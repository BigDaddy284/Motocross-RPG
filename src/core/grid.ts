import type { BakedMap, Tile } from './mapTypes';

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Walkability for one map: blocked tiles, thin edge walls between tiles, and dynamic blockers
 * such as NPCs standing on a tile.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly blocked: boolean[];
  /** Edges that cannot be crossed, keyed by the two tiles either side. */
  private readonly walls = new Set<string>();
  private readonly occupants = new Set<string>();

  constructor(width: number, height: number, blockedRows: string[], edgeWalls: [number, number, number, number][] = []) {
    this.width = width;
    this.height = height;
    this.blocked = [];
    for (let y = 0; y < height; y++) {
      const row = blockedRows[y] ?? '';
      for (let x = 0; x < width; x++) this.blocked.push(row[x] === '#');
    }
    for (const [x1, y1, x2, y2] of edgeWalls) this.addEdgeWall(x1, y1, x2, y2);
  }

  static fromMap(map: BakedMap): Grid {
    return new Grid(map.width, map.height, map.blocked, map.edgeWalls);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** True when the tile is inside the map, not blocked and not occupied. */
  isFree(x: number, y: number): boolean {
    return this.inBounds(x, y) && !this.blocked[y * this.width + x] && !this.occupants.has(key(x, y));
  }

  isBlocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.blocked[y * this.width + x];
  }

  /** True when a one-tile step between neighbours is allowed. */
  canStep(from: Tile, to: Tile): boolean {
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1) return false;
    if (!this.isFree(to.x, to.y)) return false;
    return !this.walls.has(edgeKey(from, to));
  }

  /** True when no thin wall runs along the edge between two neighbouring tiles. */
  edgeOpen(a: Tile, b: Tile): boolean {
    return !this.walls.has(edgeKey(a, b));
  }

  /** Opens a blocked tile, for map changes such as cleared roadworks. */
  unblock(x: number, y: number): void {
    if (this.inBounds(x, y)) this.blocked[y * this.width + x] = false;
  }

  setOccupied(t: Tile, occupied: boolean): void {
    if (occupied) this.occupants.add(key(t.x, t.y));
    else this.occupants.delete(key(t.x, t.y));
  }

  /**
   * A wall along tile edges from corner (x1, y1) to (x2, y2). A vertical wall at x separates
   * columns x-1 and x; a horizontal wall at y separates rows y-1 and y.
   */
  private addEdgeWall(x1: number, y1: number, x2: number, y2: number): void {
    if (x1 === x2) {
      for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) this.walls.add(edgeKey({ x: x1 - 1, y }, { x: x1, y }));
    } else if (y1 === y2) {
      for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) this.walls.add(edgeKey({ x, y: y1 - 1 }, { x, y: y1 }));
    }
  }
}

function edgeKey(a: Tile, b: Tile): string {
  return a.x < b.x || (a.x === b.x && a.y < b.y) ? `${key(a.x, a.y)}|${key(b.x, b.y)}` : `${key(b.x, b.y)}|${key(a.x, a.y)}`;
}

export const STEPS: readonly Tile[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
];
