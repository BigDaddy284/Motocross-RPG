"""Draws the Area Championship trophies: a gold cup with two handles on a dark plinth, with
"AREA n" on the cup and "CHAMPION" on the plinth's plaque.

Placeholders for Areas 1 to 8, the same trophy with its own number, in the same style as the area
badges (Boss, 2 Nov 2026: "add a Trophy with Area * Champion on it as a placeholder the same as the
area badges").

Drawn on a 64 x 64 grid and doubled, for the style guide's 2 px pixel clusters, with every colour
snapped to the reference palette (art/palette/palette-ref-v1.hex). Writes the game's 128 px trophy
and a 4x preview:

    python3 tools/art/trophy-area.py <palette.hex> <out-dir> [areas, default 1-8]
"""
import importlib.util
import sys
from pathlib import Path

from PIL import Image

# The badge script's palette, letters and digits.
_spec = importlib.util.spec_from_file_location('badge', Path(__file__).with_name('badge-area1.py'))
badge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(badge)

N = 64
FONT = {
    **badge.FONT,
    'C': ['###', '#..', '#..', '#..', '###'],
    'H': ['#.#', '#.#', '###', '#.#', '#.#'],
    'M': ['#.#', '###', '###', '#.#', '#.#'],
    'P': ['##.', '#.#', '##.', '#..', '#..'],
    'I': ['###', '.#.', '.#.', '.#.', '###'],
    'O': ['###', '#.#', '#.#', '#.#', '###'],
    'N': ['#.#', '###', '###', '###', '#.#'],
}


def draw(pal, area=1):
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = img.load()
    col = lambda rgb: badge.snap(pal, rgb) + (255,)
    outline = col((0x27, 0x29, 0x2c))
    gold = col((0xe0, 0xb0, 0x40))
    gold_hi = col((0xf6, 0xdc, 0x80))
    gold_lo = col((0xa8, 0x78, 0x28))
    plinth = col((0x3b, 0x3c, 0x45))
    plinth_hi = col((0x55, 0x55, 0x5e))
    plaque = col((0xf2, 0xe8, 0xcc))
    face = col((0xef, 0x6c, 0x18))
    black = col((0x20, 0x20, 0x24))
    white = col((0xfa, 0xfa, 0xf2))

    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px[x, y] = c

    def shade(x, xl, xr):
        # Light from the left: a bright band, then gold, then a dark right edge.
        t = (x - xl) / max(1, xr - xl)
        return gold_hi if t < 0.28 else gold_lo if t > 0.78 else gold

    cx = 31.5
    # The cup: a bowl that narrows from 40 wide at the rim to 14 at its foot (rows 6 to 30).
    for y in range(6, 31):
        t = (y - 6) / 24
        half = 20 - 13 * t ** 1.6
        xl, xr = int(cx - half + 0.5), int(cx + half + 0.5)
        for x in range(xl, xr):
            px[x, y] = shade(x, xl, xr)
    # The rim's lip.
    rect(11, 4, 52, 6, gold_hi)
    # Handles: thick half rings either side of the bowl, joined to it.
    for side in (-1, 1):
        hx = 12 if side < 0 else 51
        for y in range(7, 25):
            for x in range(N):
                dx, dy = (x - hx) * side, y - 15
                if dx < 0:
                    continue
                d_out = (dx / 9) ** 2 + (dy / 8.5) ** 2
                d_in = (dx / 5.5) ** 2 + (dy / 5) ** 2
                if d_out <= 1 and d_in > 1 and px[x, y][3] == 0:
                    px[x, y] = gold_hi if dy < -3 else gold_lo if dy > 3 else gold
    # Stem and foot.
    for y in range(31, 38):
        rect(28, y, 35, y, gold)
        px[28, y] = gold_hi
        px[35, y] = gold_lo
    rect(22, 38, 41, 40, gold)
    rect(22, 38, 25, 40, gold_hi)
    rect(38, 38, 41, 40, gold_lo)
    # The plinth, with a cream plaque.
    rect(12, 41, 51, 60, plinth)
    rect(12, 41, 51, 42, plinth_hi)
    rect(15, 45, 48, 57, plaque)

    # Outline every filled pixel next to an empty one.
    filled = [[px[x, y][3] > 0 for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            if filled[y][x] and any(not (0 <= x + i < N and 0 <= y + j < N and filled[y + j][x + i]) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = outline
    for x in range(15, 49):
        px[x, 44] = outline
        px[x, 58] = outline

    def put(pattern, ox, oy, c, sh=None):
        if sh:
            for j, row in enumerate(pattern):
                for i, ch in enumerate(row):
                    if ch == '#':
                        px[ox + i + 1, oy + j + 1] = sh
        for j, row in enumerate(pattern):
            for i, ch in enumerate(row):
                if ch == '#':
                    px[ox + i, oy + j] = c

    def word(text, y, c, sh=None):
        x0 = int(cx - (len(text) * 4 - 1) / 2 + 0.5)
        for n, ch in enumerate(text):
            put(FONT[ch], x0 + n * 4, y, c, sh)

    # AREA and its big number on the cup, CHAMPION on the plaque over a checkered strip.
    word('AREA', 9, face, gold_lo)
    put(badge.DIGITS[area], int(cx) - 3, 15, white, outline)
    word('CHAMPION', 47, black)
    for i in range(30):
        for j in range(2):
            px[17 + i, 54 + j] = black if (i // 2 + j) % 2 == 0 else white
    return img


def main():
    pal = badge.load_palette(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for area in badge.areas(sys.argv[3] if len(sys.argv) > 3 else '1-8'):
        img = draw(pal, area)
        img.resize((N * 2, N * 2), Image.NEAREST).save(out / f'trophy-area{area}.png')
        img.resize((N * 4, N * 4), Image.NEAREST).save(out / f'trophy-area{area}-preview.png')


if __name__ == '__main__':
    main()
