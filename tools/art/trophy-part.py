"""Draws the Area Championship trophies, each shaped like the bike part its cup is named after
(Boss, 4 Nov 2026: "All Area Championships to be renamed to something Motocross Bike related, e.g.
Area 1 Championship to Sprocket Cup. Trophys to be in shape of the referenced item").

Placeholders until Boss draws his own: a gold part on a stem over the dark plinth with its CHAMPION
plaque, as the cup trophies were (tools/art/trophy-area.py).

    1 Sprocket Cup   2 Chain Cup     3 Spark Plug Cup   4 Clutch Cup
    5 Gearbox Cup    6 Handlebar Cup 7 Exhaust Cup      8 Crankshaft Cup

Drawn on a 64 x 64 grid and doubled, for the style guide's 2 px pixel clusters, with every colour
snapped to the reference palette (art/palette/palette-ref-v1.hex). Writes the game's 128 px trophy
and a 4x preview:

    python3 tools/art/trophy-part.py <palette.hex> <out-dir> [areas, default 1-8]
"""
import importlib.util
import math
import sys
from pathlib import Path

from PIL import Image

_here = Path(__file__).parent
_spec = importlib.util.spec_from_file_location('trophy', _here / 'trophy-area.py')
trophy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(trophy)
badge = trophy.badge

N = 64
CX, CY = 31.5, 17.5


def ring(x, y, cx, cy, r0, r1):
    d = math.hypot(x - cx, y - cy)
    return r0 <= d <= r1


def gear(x, y, cx, cy, r, teeth, depth, hole):
    """A gear of radius r with square-ish teeth and a hole in the middle."""
    d = math.hypot(x - cx, y - cy)
    if d < hole:
        return False
    a = (math.atan2(y - cy, x - cx) / (2 * math.pi) * teeth) % 1
    return d <= r - depth or (d <= r and 0.25 < a < 0.75)


def sprocket(x, y):
    if not gear(x, y, CX, CY, 16, 18, 2.6, 3.5):
        return False
    # Five lightening holes round the hub.
    for k in range(5):
        a = k * 2 * math.pi / 5 - math.pi / 2
        if math.hypot(x - (CX + 8.5 * math.cos(a)), y - (CY + 8.5 * math.sin(a))) < 2.2:
            return False
    return True


def chain(x, y):
    # Three links standing up, each a rounded slot, the middle one turned to face us side on.
    def link(cy, w, h, t):
        dx, dy = abs(x - CX), abs(y - cy)
        ox, oy = max(0, dx - (w / 2 - h / 4)), dy
        outer = math.hypot(ox, max(0, oy - h / 4)) <= h / 4 + 0.5 if dx > w / 2 - h / 4 else dy <= h / 2
        inner = dx <= w / 2 - t and dy <= h / 2 - t
        return outer and not inner

    def slot(cy, w, h, t):
        r = w / 2
        dx, dy = abs(x - CX), abs(y - cy)
        inside = (dy <= h / 2 - r and dx <= r) or math.hypot(dx, max(0, dy - (h / 2 - r))) <= r
        hole = (dy <= h / 2 - r and dx <= r - t) or math.hypot(dx, max(0, dy - (h / 2 - r))) <= r - t
        return inside and not hole

    # Two links joined by the side plates of the one between them, seen edge on.
    return slot(9, 14, 17, 3.2) or slot(26, 14, 17, 3.2) or (abs(abs(x - CX) - 4) <= 1 and 14 <= y <= 21)


def spark_plug(x, y):
    dx = abs(x - CX)
    return ((y <= 5 and y >= 2 and dx <= 2.5)          # terminal nut
            or (6 <= y <= 16 and dx <= 4 - (1 if y % 3 == 0 else 0))  # ribbed insulator
            or (17 <= y <= 22 and dx <= 9)            # hex
            or (23 <= y <= 29 and dx <= 5 and not (y % 2 and dx > 4))  # thread
            or (30 <= y <= 31 and dx <= 1.5)          # centre electrode
            or (y == 33 and -4 <= x - CX <= 1.5) or (31 <= y <= 33 and 3 <= CX - x <= 4.5))  # ground strap


def clutch(x, y):
    d = math.hypot(x - CX, y - CY)
    if d < 4.5:
        return False
    a = (math.atan2(y - CY, x - CX) / (2 * math.pi) * 8) % 1
    plate = d <= 13.5 or (d <= 16.5 and 0.3 < a < 0.7)
    # A ring of rivets, and the pressure plate's spring holes.
    for k in range(6):
        t = k * math.pi / 3
        if math.hypot(x - (CX + 8 * math.cos(t)), y - (CY + 8 * math.sin(t))) < 1.6:
            return False
    return plate


def gearbox(x, y):
    return gear(x, y, 26, 20, 12, 12, 2.4, 3.5) or gear(x, y, 42, 11, 8, 9, 2.2, 2.5)


def handlebar(x, y):
    # A bar dipping in the middle and rising to the ends, a cross brace, grips and the clamp.
    def bar(px_):
        t = (px_ - CX) / 26
        return 20 - 10 * t * t
    on_bar = 6 <= x <= 57 and abs(y - bar(x)) <= 1.6
    brace = 19 <= x <= 44 and abs(y - 14) <= 1.0
    clamp = abs(x - CX) <= 4 and 17 <= y <= 25
    grip = (x <= 12 or x >= 51) and 6 <= x <= 57 and abs(y - bar(x)) <= 2.6
    return on_bar or brace or clamp or grip


def exhaust(x, y):
    # A two-stroke pipe: thin header, fat belly, then the stinger and a silencer.
    if 5 <= x <= 40:
        t = (x - 5) / 35
        cy = 24 - 9 * t
        r = 1.8 + 6.5 * math.sin(t * math.pi) ** 1.3
        if abs(y - cy) <= r:
            return True
    # The stinger, then the silencer, a fat can at the back.
    if 40 <= x <= 47 and abs(y - (15 - (x - 40) * 0.3)) <= 1.4:
        return True
    return 46 <= x <= 59 and abs(y - (13 - (x - 46) * 0.3)) <= 4


def crankshaft(x, y):
    # Seen from the side: the main shafts, two flywheels and the crank pin between them.
    shaft = abs(y - 22) <= 1.6 and (8 <= x <= 20 or 43 <= x <= 55)
    wheels = any(abs(x - wx) <= 3 and math.hypot((x - wx) / 3.2, (y - 18) / 15) <= 1 for wx in (23, 40))
    pin = abs(y - 10) <= 1.8 and 23 <= x <= 40
    rod = abs(x - CX) <= 2 and 3 <= y <= 10
    return shaft or wheels or pin or rod


PARTS = {1: sprocket, 2: chain, 3: spark_plug, 4: clutch, 5: gearbox, 6: handlebar, 7: exhaust, 8: crankshaft}


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
    black = col((0x20, 0x20, 0x24))
    white = col((0xfa, 0xfa, 0xf2))

    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px[x, y] = c

    shape = PARTS[area]
    mask = [[shape(x, y) for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            if mask[y][x]:
                px[x, y] = gold
    # Stem and foot (the part stands on them, the stem reaching up to its lowest point over the
    # stem), then the plinth with its plaque.
    top = max((y for y in range(38) for x in range(26, 38) if mask[y][x]), default=30)
    for y in range(min(top - 1, 36), 38):
        rect(29, y, 34, y, gold)
    rect(22, 38, 41, 40, gold)
    rect(12, 41, 51, 60, plinth)
    rect(12, 41, 51, 42, plinth_hi)
    rect(15, 45, 48, 57, plaque)
    # A bevel just inside the outline: lit up and to the left, shaded down and to the right.
    filled = [[px[x, y][3] > 0 for x in range(N)] for y in range(N)]
    at = lambda x, y: 0 <= x < N and 0 <= y < N and filled[y][x]
    for y in range(N):
        for x in range(N):
            if px[x, y] == gold:
                if not (at(x, y - 2) and at(x - 2, y) and at(x - 1, y - 1)):
                    px[x, y] = gold_hi
                elif not (at(x, y + 2) and at(x + 2, y) and at(x + 1, y + 1)):
                    px[x, y] = gold_lo
    # Outline every filled pixel next to an empty one.
    for y in range(N):
        for x in range(N):
            if filled[y][x] and any(not (0 <= x + i < N and 0 <= y + j < N and filled[y + j][x + i]) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = outline
    for x in range(15, 49):
        px[x, 44] = outline
        px[x, 58] = outline

    font = trophy.FONT

    def word(text, y, c):
        x0 = int(31.5 - (len(text) * 4 - 1) / 2 + 0.5)
        for n, ch in enumerate(text):
            for j, row in enumerate(font[ch]):
                for i, v in enumerate(row):
                    if v == '#':
                        px[x0 + n * 4 + i, y + j] = c

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
