// Shape of a baked map in public/assets/maps/<id>.json, written by tools/import-art.mjs.

export type MapKind = 'area' | 'interior';

export interface GroundLayer {
  name: string;
  /** One entry per cell, row by row: an index into `images`, or -1 for empty. */
  cells: number[];
}

export interface MapSprite {
  img: number;
  /** Source rectangle [x, y, w, h] when the image is a sheet. */
  crop?: [number, number, number, number];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Y value used for depth sorting against characters (usually the sprite's bottom edge). */
  depth: number;
  overhead: boolean;
  frames?: { img: number; ms: number }[];
}

export interface MapObject {
  type: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  point?: boolean;
  props: Record<string, string | number | boolean | null>;
}

export interface BakedMap {
  id: string;
  title: string;
  kind: MapKind;
  width: number;
  height: number;
  tileSize: number;
  props: Record<string, unknown>;
  images: string[];
  ground: GroundLayer[];
  sprites: MapSprite[];
  /** One string per row: '#' blocked, '.' free. */
  blocked: string[];
  /** Thin walls on tile edges, as [x1, y1, x2, y2] in tile-corner units. */
  edgeWalls: [number, number, number, number][];
  objects: MapObject[];
}

export interface Tile {
  x: number;
  y: number;
}

export type Facing = 'down' | 'left' | 'right' | 'up';

/** Tile under an object's top-left corner, or under a point object. */
export function objectTile(o: MapObject, tileSize: number): Tile {
  return { x: Math.floor(o.x / tileSize), y: Math.floor(o.y / tileSize) };
}

/** Every tile an object's rectangle covers (a point object covers one tile). */
export function objectTiles(o: MapObject, tileSize: number): Tile[] {
  const t0 = objectTile(o, tileSize);
  if (o.point || !o.w || !o.h) return [t0];
  const tiles: Tile[] = [];
  const w = Math.max(1, Math.round(o.w / tileSize));
  const h = Math.max(1, Math.round(o.h / tileSize));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push({ x: t0.x + x, y: t0.y + y });
  return tiles;
}
