"""Draws the track editor's mixed ground tiles: one ground showing through another in patches.

Each tile mixes two of the area map's own fill tiles (grass, dirt for mud, gravel, long grass,
concrete) through a blob mask that wraps round the tile's edges, so a tile laid next to itself
joins up. The mask is drawn on a 32 x 32 grid and doubled, for the style guide's 2 px pixel
clusters, and the edges are drawn as on the corner (Wang) sets: a dark line on the first ground's
side and a shaded band on the second's. Every colour is snapped to the reference palette.

    python3 tools/art/ground-mix.py <tiles-dir> <palette.hex> <out-dir>

tiles-dir is art/area-map/tiled/tiles in the shared art folder; out-dir gets ground-mix/*.png.
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image

N = 32  # mask cells; each is 2 x 2 pixels of the 64 px tile
FILLS = {
    'grass': 'terrain-common/grass-plain-1',
    'mud': 'terrain-common/dirt-1',
    'gravel': 'ground-edges/gravel-1',
    'longgrass': 'ground-edges/long-grass-1',
    'concrete': 'terrain-common/concrete-slabs',
}
# The line drawn on a ground's side of an edge, as on the corner sets (grass-dirt-03: 4d7437).
OUTLINE = {'grass': (0x4d, 0x74, 0x37), 'longgrass': (0x3e, 0x62, 0x2c)}
# The pairs (first ground, the one showing through) and the patterns of each.
PAIRS = [('grass', 'mud'), ('grass', 'gravel'), ('gravel', 'mud'), ('longgrass', 'mud'), ('concrete', 'mud'), ('concrete', 'grass')]
# (name, how much of the second ground shows, blob lattice: more points for smaller blobs, seed)
PATTERNS = [('light', 0.2, 8, 1), ('patchy-a', 0.5, 4, 2), ('patchy-b', 0.5, 4, 3), ('heavy', 0.8, 4, 4)]


def load_palette(path):
    return [tuple(int(w[i:i + 2], 16) for i in (0, 2, 4)) for w in Path(path).read_text().split()]


def snap(pal, rgb):
    return min(pal, key=lambda p: sum((a - b) ** 2 for a, b in zip(p, rgb)))


def blob_field(cells, seed):
    """Smooth blobs that wrap round the tile: value noise on lattices of cells, cells * 2 and
    cells * 4 points across (each dividing the mask), summed with halving weights."""
    rnd = random.Random(seed)
    field = [[0.0] * N for _ in range(N)]
    for octave, g in enumerate((cells, cells * 2, cells * 4)):
        if g > N:
            break
        lat = [[rnd.random() for _ in range(g)] for _ in range(g)]
        step = N / g
        w = 0.5 ** octave
        for y in range(N):
            for x in range(N):
                gx, gy = x / step, y / step
                x0, y0 = int(gx), int(gy)
                tx, ty = gx - x0, gy - y0
                sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
                v00, v10 = lat[y0 % g][x0 % g], lat[y0 % g][(x0 + 1) % g]
                v01, v11 = lat[(y0 + 1) % g][x0 % g], lat[(y0 + 1) % g][(x0 + 1) % g]
                field[y][x] += w * ((v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy)
    return field


def ruts(vertical):
    """Two wavy tyre ruts across the tile, wrapping top to bottom (or side to side)."""
    f = [[0.0] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            u, v = (x, y) if vertical else (y, x)
            d = min(abs(u - (11 + 1.5 * math.sin(math.tau * v / N))), abs(u - (21 + 1.5 * math.sin(math.tau * (v + 8) / N))))
            f[y][x] = 2.2 - d
    return f


def mask_from(field, cover):
    vals = sorted(v for row in field for v in row)
    cut = vals[int((1 - cover) * (len(vals) - 1))]
    return [[field[y][x] >= cut for x in range(N)] for y in range(N)]


def near(mask, x, y, want, r):
    return any(mask[(y + dy) % N][(x + dx) % N] == want for dy in range(-r, r + 1) for dx in range(-r, r + 1) if max(abs(dx), abs(dy)) == r or abs(dx) + abs(dy) <= r)


def draw(mask, a, b, fills, pal):
    out = Image.new('RGB', (64, 64))
    fa, fb = fills[a], fills[b]
    shade_b = snap(pal, tuple(int(c * 0.8) for c in mean(fb)))
    line_a = snap(pal, OUTLINE.get(a, tuple(int(c * 0.72) for c in mean(fa))))
    for y in range(N):
        for x in range(N):
            for py in (0, 1):
                for px in (0, 1):
                    X, Y = 2 * x + px, 2 * y + py
                    if not mask[y][x]:
                        c = line_a if near(mask, x, y, True, 1) else fa.getpixel((X, Y))
                    else:
                        c = shade_b if near(mask, x, y, False, 1) else fb.getpixel((X, Y))
                    out.putpixel((X, Y), c)
    return out


def mean(img):
    px = list(img.getdata())
    return tuple(sum(p[i] for p in px) // len(px) for i in range(3))


def main(tiles, palette, out_dir):
    pal = load_palette(palette)
    fills = {k: Image.open(Path(tiles) / f'{v}.png').convert('RGB') for k, v in FILLS.items()}
    out = Path(out_dir) / 'ground-mix'
    out.mkdir(parents=True, exist_ok=True)
    made = []
    for i, (a, b) in enumerate(PAIRS):
        for name, cover, freqs, seed in PATTERNS:
            img = draw(mask_from(blob_field(freqs, 100 * i + seed), cover), a, b, fills, pal)
            made.append(f'{a}-{b}-{name}')
            img.save(out / f'{made[-1]}.png')
    for vertical, name in ((True, 'ruts-v'), (False, 'ruts-h')):
        img = draw(mask_from(ruts(vertical), 0.27), 'grass', 'mud', fills, pal)
        made.append(f'grass-mud-{name}')
        img.save(out / f'{made[-1]}.png')
    print('\n'.join(made))


if __name__ == '__main__':
    main(*sys.argv[1:4])
