"""Draws the Area 1 badge: a knobbly motocross tyre with the badge medallion in its hub.

Drawn on a 64 x 64 grid and doubled, for the style guide's 2 px pixel clusters, with every colour
snapped to the reference palette (art/palette/palette-ref-v1.hex). Writes the game's 128 px badge
and a 4x preview:

    python3 tools/art/badge-area1.py <palette.hex> <out-dir>
"""
import math
import sys
from pathlib import Path

from PIL import Image

N = 64
C = (N - 1) / 2


def load_palette(path):
    out = []
    for line in Path(path).read_text().split():
        out.append(tuple(int(line[i:i + 2], 16) for i in (0, 2, 4)))
    return out


def snap(pal, rgb):
    return min(pal, key=lambda p: sum((a - b) ** 2 for a, b in zip(p, rgb)))


# 3 x 5 letters for the medallion.
FONT = {
    'A': ['.#.', '#.#', '###', '#.#', '#.#'],
    'R': ['##.', '#.#', '##.', '#.#', '#.#'],
    'E': ['###', '#..', '##.', '#..', '###'],
}
# The big 1, 7 x 13.
ONE = [
    '..###..',
    '.####..',
    '#####..',
    '..###..',
    '..###..',
    '..###..',
    '..###..',
    '..###..',
    '..###..',
    '..###..',
    '..###..',
    '#######',
    '#######',
]


def draw(pal):
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = img.load()
    col = lambda rgb: snap(pal, rgb) + (255,)
    outline = col((0x27, 0x29, 0x2c))
    rubber = col((0x3b, 0x3c, 0x45))
    rubber_hi = col((0x55, 0x55, 0x5e))
    rubber_lo = col((0x2c, 0x2d, 0x33))
    gold = col((0xe0, 0xb0, 0x40))
    gold_hi = col((0xf6, 0xdc, 0x80))
    gold_lo = col((0xa8, 0x78, 0x28))
    face = col((0xef, 0x6c, 0x18))
    face_lo = col((0xc2, 0x5b, 0x2a))
    cream = col((0xf2, 0xe8, 0xcc))
    white = col((0xfa, 0xfa, 0xf2))
    black = col((0x20, 0x20, 0x24))

    knobs = 18
    for y in range(N):
        for x in range(N):
            dx, dy = x - C, y - C
            r = math.hypot(dx, dy)
            a = math.atan2(dy, dx)
            # Light from the top left.
            lit = -(dx + dy) / (r + 1e-9)
            turn = (a + math.pi) / (2 * math.pi)
            k = (turn * knobs) % 1
            # Tread knobs round the edge, and a staggered row of shoulder knobs inside them.
            on_knob = 0.2 < k < 0.8 and r <= 31.2
            on_shoulder = (k < 0.22 or k > 0.78) and 25.0 < r <= 27.2
            if r > 31.2 or (r > 27.4 and not on_knob):
                continue
            if r > 27.4 or on_shoulder:
                c = rubber_hi if lit > 0.3 else rubber
            elif r > 19.0:
                # The tyre's sidewall, with its maker's lettering as arcs of cream over the top and bottom.
                c = rubber_hi if lit > 0.6 and r > 23 else rubber_lo if lit < -0.5 else rubber
                ang = turn * 360
                if 21.6 < r < 22.6 and (35 < ang < 145 or 215 < ang < 325) and int(turn * 72) % 3 != 0:
                    c = cream
            elif r > 16.6:
                c = gold_hi if lit > 0.45 else gold_lo if lit < -0.45 else gold
            else:
                c = face_lo if lit < -0.55 and r > 13 else face
            px[x, y] = c

    # Outlines: any filled pixel next to an empty one, and the rings between parts.
    filled = [[px[x, y][3] > 0 for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            if not filled[y][x]:
                continue
            edge = any(not (0 <= x + i < N and 0 <= y + j < N and filled[y + j][x + i]) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            r = math.hypot(x - C, y - C)
            if edge or 18.6 < r <= 19.5 or 16.1 < r <= 16.9 or (24.6 < r <= 25.2 and px[x, y] != rubber_hi):
                px[x, y] = outline

    def put(pattern, ox, oy, c, shadow=None):
        for j, row in enumerate(pattern):
            for i, ch in enumerate(row):
                if ch == '#':
                    if shadow:
                        px[ox + i + 1, oy + j + 1] = shadow
        for j, row in enumerate(pattern):
            for i, ch in enumerate(row):
                if ch == '#':
                    px[ox + i, oy + j] = c

    # AREA over the 1, a checkered strip under it.
    word = 'AREA'
    x0 = int(C - (len(word) * 4 - 1) / 2) + 1
    for n, ch in enumerate(word):
        put(FONT[ch], x0 + n * 4, 18, cream, face_lo)
    put(ONE, int(C) - 3, 24, white, outline)
    for i in range(14):
        for j in range(2):
            x, y = int(C) - 6 + i, 40 + j
            px[x, y] = black if (i // 2 + j) % 2 == 0 else white
    return img


def main():
    pal = load_palette(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    img = draw(pal)
    img.resize((N * 2, N * 2), Image.NEAREST).save(out / 'badge-area1.png')
    img.resize((N * 4, N * 4), Image.NEAREST).save(out / 'badge-area1-preview.png')


if __name__ == '__main__':
    main()
