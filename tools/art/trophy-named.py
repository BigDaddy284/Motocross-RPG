"""Draft trophies for the championships that had none (Boss, 6 Nov 2026: "give me a draft for each
championship missing one, make it relevant to the name of the championship where possible").

The type championships, the Legends, the vets championships and the Ultimate Event: 27 in all. Each
is shaped after its name (a tornado for the Sandstorm MX Championship, a crown for the National
Crown and so on), in gold on a stem over the dark plinth with its CHAMPION plaque, as the Area
Championship trophies are (tools/art/trophy-part.py). The Silver Trail is silver. Placeholders until
Boss draws his own.

Drawn on a 64 x 64 grid and doubled, for the style guide's 2 px pixel clusters, with every colour
snapped to the reference palette (art/palette/palette-ref-v1.hex). Writes trophy-<id>.png (128 px,
the championship id with dots as dashes) and a 4x preview:

    python3 tools/art/trophy-named.py <palette.hex> <out-dir> [ids, default all]
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
CX = 31.5


# ---- shape helpers: each takes (x, y) and says whether the pixel is metal ----

def circ(x, y, cx, cy, r):
    return math.hypot(x - cx, y - cy) <= r


def ell(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1


def box(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1


def seg(x, y, ax, ay, bx, by, r):
    vx, vy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
    return math.hypot(x - (ax + t * vx), y - (ay + t * vy)) <= r


def poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def star(x, y, cx, cy, r0, r1, points, turn=-math.pi / 2):
    pts = []
    for k in range(points * 2):
        a = turn + k * math.pi / points
        r = r1 if k % 2 == 0 else r0
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(x, y, pts)


# ---- the 27 trophies, by championship id ----

def sandstorm(x, y):
    # A twisting sand tornado, wide at the top, with gaps for its swirl.
    if not 2 <= y <= 35:
        return False
    t = (y - 2) / 33
    w = 2.5 + 17 * (1 - t) ** 0.9
    c = CX + 4 * math.sin(y / 4.5)
    if abs(x - c) > w:
        return False
    return not (y % 6 == 4 and abs(x - c) < w - 2.5)


def seafront(x, y):
    # A seafront lighthouse: a tapering striped tower, its lamp room and cap, on the harbour wall.
    t = (y - 12) / 20
    tower = 12 <= y <= 31 and abs(x - CX) <= 5 + 4 * t and not (y % 7 == 3 and abs(x - CX) <= 3 + 4 * t)
    lamp = box(x, y, 26, 6, 37, 11) and not box(x, y, 29, 7, 34, 10)
    cap = poly(x, y, [(24, 6), (CX, 0.5), (39, 6)])
    beams = poly(x, y, [(25, 8), (6, 3), (6, 13)]) or poly(x, y, [(38, 8), (57, 3), (57, 13)])
    wall = box(x, y, 10, 31, 53, 35)
    return tower or lamp or cap or beams or wall


def driftwood(x, y):
    # A gnarled log washed up, with two broken branches and a knot.
    log = poly(x, y, [(6, 24), (14, 18), (34, 20), (52, 16), (58, 21), (55, 29), (36, 30), (16, 33), (7, 31)])
    branches = seg(x, y, 22, 21, 15, 7, 2.6) or seg(x, y, 40, 19, 47, 5, 2.6)
    knot = ell(x, y, 30, 25.5, 3.5, 2.5) and not ell(x, y, 30, 25.5, 1.2, 0.8)
    return (log and not knot) or branches


def dune_run(x, y):
    # Two dunes with a sidecar's track rippling across them.
    top = 31 - 15 * math.exp(-((x - 23) / 8.5) ** 2) - 10 * math.exp(-((x - 43) / 7) ** 2)
    if not (6 <= x <= 57 and top <= y <= 34):
        return False
    return not (abs(y - (top + 4)) < 0.7 and 10 <= x <= 54)


def ironworks(x, y):
    # A blacksmith's anvil.
    return poly(x, y, [(8, 9), (20, 9), (26, 6), (54, 6), (54, 13), (44, 15), (41, 21), (47, 26), (47, 30), (16, 30), (16, 26), (22, 21), (20, 15), (14, 14)])


def highland_clash(x, y):
    # Two crossed claymores: blades, guards and pommels.
    out = False
    for s in (1, -1):
        out = (out or seg(x, y, CX - 13 * s, 29, CX + 14 * s, 3, 2.6)
               or seg(x, y, CX - 15 * s, 22, CX - 6 * s, 31, 2.2)
               or circ(x, y, CX - 17 * s, 33, 3))
    return out


def thunder_glen(x, y):
    # A lightning bolt.
    return poly(x, y, [(36, 2), (20, 20), (30, 20), (22, 36), (44, 14), (33, 14), (41, 2)])


def moorland(x, y):
    # A thistle: spiky crown, round head and two leaves.
    head = ell(x, y, CX, 21, 9, 8) and not (abs(y - 21) < 0.6 and abs(x - CX) < 6)
    crown = poly(x, y, [(21, 16), (22, 3), (26, 11), (CX, 1), (37, 11), (41, 3), (42, 16)])
    leaves = poly(x, y, [(24, 25), (7, 19), (12, 25), (6, 31), (19, 31), (26, 29)]) or poly(x, y, [(39, 25), (56, 19), (51, 25), (57, 31), (44, 31), (37, 29)])
    return head or crown or leaves


def ben_mor(x, y):
    # A big mountain with a smaller one beside it, the snow line cut in.
    big = poly(x, y, [(6, 34), (28, 4), (52, 34)])
    small = poly(x, y, [(34, 34), (46, 16), (58, 34)])
    snow = big and abs(y - 12 - abs(x - 28) * 0.4) < 0.6
    return (big or small) and not snow


def glen_sprint(x, y):
    # A stag's antlers.
    out = False
    for s in (1, -1):
        bx = CX + 4 * s
        out = (out or seg(x, y, bx, 33, bx + 9 * s, 19, 2.6) or seg(x, y, bx + 9 * s, 19, bx + 13 * s, 3, 2.3)
               or seg(x, y, bx + 7 * s, 23, bx + 19 * s, 18, 2.2) or seg(x, y, bx + 11 * s, 11, bx + 21 * s, 6, 2.1))
    return out or ell(x, y, CX, 33, 8, 3)


def seven_towns(x, y):
    # A seven-pointed star with a ring of seven dots.
    s = star(x, y, CX, 19, 7.5, 16, 7)
    hole = circ(x, y, CX, 19, 3)
    return s and not hole


def neon_nights(x, y):
    # A crescent moon and a star.
    moon = circ(x, y, 26, 19, 14) and not circ(x, y, 33, 15, 11.5)
    return moon or star(x, y, 44, 22, 2.8, 7, 5)


def long_road(x, y):
    # A signpost with two arrow boards.
    post = box(x, y, 30, 4, 33, 35)
    a1 = poly(x, y, [(14, 7), (46, 7), (52, 11), (46, 15), (14, 15)])
    a2 = poly(x, y, [(48, 18), (18, 18), (12, 22), (18, 26), (48, 26)])
    return post or a1 or a2


def metro_derby(x, y):
    # A metro roundel: a thick ring with a bar across it.
    ring = circ(x, y, CX, 19, 16) and not circ(x, y, CX, 19, 9.5)
    bar = box(x, y, 7, 15, 56, 23)
    return ring or bar


def city_limits(x, y):
    # A city skyline with windows.
    blocks = [(8, 20, 15), (15, 12, 21), (21, 4, 28), (28, 16, 34), (34, 8, 41), (41, 18, 47), (47, 13, 55)]
    for x0, top, x1 in blocks:
        if x0 <= x < x1 and top <= y <= 34:
            window = (x - x0) % 3 == 1 and (y - top) % 4 == 2 and y < 31 and x1 - x0 > 5
            return not window
    return box(x, y, 31, 1, 31, 4)


def warehouse_wars(x, y):
    # A warehouse with a sawtooth roof and roller door.
    if not (8 <= x <= 55 and 6 <= y <= 34):
        return False
    roof = 6 + ((x - 8) % 12) * 0.75
    if y < roof:
        return False
    door = box(x, y, 24, 22, 39, 34) and (y % 3 == 0)
    return not door


def national_crown(x, y):
    # A crown with five points, jewels on the points and a band.
    body = poly(x, y, [(10, 32), (10, 12), (19, 22), (25, 8), (CX, 19), (38, 8), (44, 22), (53, 12), (53, 32)])
    balls = any(circ(x, y, bx, by, 2.4) for bx, by in ((10, 10), (25, 6), (38, 6), (53, 10)))
    band_gap = y == 27 and 12 <= x <= 51
    return (body and not band_gap) or balls


def supernova(x, y):
    # A starburst.
    return star(x, y, CX, 18, 8, 17, 12) or circ(x, y, CX, 18, 8.5) or box(x, y, 29, 30, 34, 36)


def kingdom_trail(x, y):
    # A castle tower: battlements, an arrow slit and a gate.
    tower = box(x, y, 18, 8, 45, 34)
    merlons = y < 8 and y >= 3 and 18 <= x <= 45 and ((x - 18) // 4) % 2 == 0
    slit = box(x, y, 31, 13, 32, 19)
    gate = (box(x, y, 26, 26, 37, 34) or circ(x, y, 31.5, 26, 5.5)) and y >= 21
    return (tower or merlons) and not slit and not gate


def royal_classic(x, y):
    # A royal orb with its cross and band.
    orb = circ(x, y, CX, 23, 11.5)
    cross = box(x, y, 30, 2, 33, 12) or box(x, y, 26, 5, 37, 8)
    band = abs(y - 22) < 0.7 and orb or (abs(x - CX) < 0.7 and orb and y < 22)
    return (orb and not band) or cross


def royal_park(x, y):
    # An oak tree.
    canopy = any(circ(x, y, cx, cy, r) for cx, cy, r in ((22, 15, 9), (CX, 10, 10), (42, 15, 9), (27, 22, 8), (37, 22, 8)))
    trunk = poly(x, y, [(28, 24), (35, 24), (36, 34), (27, 34)])
    return canopy or trunk


def dome_gauntlet(x, y):
    # A stadium dome with its ribs and spire.
    dome = y <= 32 and circ(x, y, CX, 32, 22) and y >= 10
    base = box(x, y, 8, 32, 55, 35)
    rib = dome and any(abs(math.atan2(y - 32, x - CX) - a) < 0.045 for a in (-0.6, -1.15, -1.99, -2.54))
    spire = box(x, y, 30, 2, 33, 10)
    return (dome and not rib) or base or spire


def legends(x, y):
    # A laurel wreath, open at the top and tied at the bottom.
    out = False
    for s in (1, -1):
        for k in range(7):
            a = math.pi / 2 + s * (0.35 + k * 0.38)
            lx, ly = CX + 13 * math.cos(a), 19 + 13 * math.sin(a)
            ang = a + s * (math.pi / 2 + 0.6)
            u = (x - lx) * math.cos(ang) + (y - ly) * math.sin(ang)
            v = -(x - lx) * math.sin(ang) + (y - ly) * math.cos(ang)
            if (u / 5.5) ** 2 + (v / 2.8) ** 2 <= 1:
                out = True
    return out or circ(x, y, CX, 33, 3)


def old_guard(x, y):
    # A shield with a raised boss and a chevron.
    shield = poly(x, y, [(12, 3), (51, 3), (51, 17), (CX, 35), (12, 17)])
    chevron = abs(y - (10 + abs(x - CX) * -0.45 + 12)) < 0.8 and 14 < x < 49
    ring = circ(x, y, CX, 13, 5) and not circ(x, y, CX, 13, 3.8)
    return shield and not chevron and not ring


def silver_trail(x, y):
    # A compass rose in its ring, for finding the trail.
    rose = star(x, y, CX, 18, 4, 16, 4, -math.pi / 2) or star(x, y, CX, 18, 3, 11, 4, -math.pi / 4)
    ring = circ(x, y, CX, 18, 12.5) and not circ(x, y, CX, 18, 9.5)
    return rose or ring or box(x, y, 29, 30, 34, 36)


def evergreen(x, y):
    # A fir tree.
    tiers = any(poly(x, y, [(CX, top), (CX - w, top + 11), (CX + w, top + 11)]) for top, w in ((1, 9), (8, 13), (15, 17)))
    trunk = box(x, y, 29, 26, 34, 34)
    return tiers or trunk


def ultimate(x, y):
    # The big one: a tall cup with feathered wings and a star over it.
    t = (y - 9) / 22
    bowl = 9 <= y <= 31 and abs(x - CX) <= 12 - 7 * t ** 1.5
    lip = box(x, y, 17, 7, 46, 9)
    wings = False
    for s in (1, -1):
        wx = lambda d: CX + s * d
        wings = wings or poly(x, y, [(wx(11), 10), (wx(30), 2), (wx(29), 8), (wx(26), 9), (wx(28), 13), (wx(24), 14), (wx(25), 18), (wx(20), 18), (wx(11), 20)])
    return bowl or lip or wings or star(x, y, CX, 3, 1.5, 3.8, 5)


TROPHIES = {
    'area3.mx': sandstorm, 'area3.sx': seafront, 'area3.enduro': driftwood, 'area3.sidecar': dune_run,
    'area5.sprint': ironworks,
    'area6.mx': highland_clash, 'area6.sx': thunder_glen, 'area6.enduro': moorland, 'area6.sidecar': ben_mor, 'area6.sprint': glen_sprint,
    'area7.mx': seven_towns, 'area7.sx': neon_nights, 'area7.enduro': long_road, 'area7.sidecar': metro_derby, 'area7.sprint': city_limits, 'area7.endurocross': warehouse_wars,
    'area8.mx': national_crown, 'area8.sx': supernova, 'area8.enduro': kingdom_trail, 'area8.sidecar': royal_classic, 'area8.sprint': royal_park, 'area8.endurocross': dome_gauntlet,
    'legends': legends, 'vets.40': old_guard, 'vets.50': silver_trail, 'vets.60': evergreen, 'ultimate': ultimate,
}
SILVER = {'vets.50'}


def draw(pal, cid):
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = img.load()
    col = lambda rgb: badge.snap(pal, rgb) + (255,)
    outline = col((0x27, 0x29, 0x2c))
    if cid in SILVER:
        metal, metal_hi, metal_lo = col((0xb1, 0xae, 0xaf)), col((0xea, 0xeb, 0xeb)), col((0x7a, 0x78, 0x80))
    else:
        metal, metal_hi, metal_lo = col((0xe0, 0xb0, 0x40)), col((0xf6, 0xdc, 0x80)), col((0xa8, 0x78, 0x28))
    plinth = col((0x3b, 0x3c, 0x45))
    plinth_hi = col((0x55, 0x55, 0x5e))
    plaque = col((0xf2, 0xe8, 0xcc))
    black = col((0x20, 0x20, 0x24))
    white = col((0xfa, 0xfa, 0xf2))

    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px[x, y] = c

    shape = TROPHIES[cid]
    mask = [[y < 37 and shape(x + 0.5, y + 0.5) for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            if mask[y][x]:
                px[x, y] = metal
    # The stem from the shape's lowest point over it down to the foot, then the plinth and plaque.
    top = max((y for y in range(37) for x in range(29, 35) if mask[y][x]), default=30)
    for y in range(min(top, 36), 38):
        rect(29, y, 34, y, metal)
    rect(22, 38, 41, 40, metal)
    rect(12, 41, 51, 60, plinth)
    rect(12, 41, 51, 42, plinth_hi)
    rect(15, 45, 48, 57, plaque)
    filled = [[px[x, y][3] > 0 for x in range(N)] for y in range(N)]
    at = lambda x, y: 0 <= x < N and 0 <= y < N and filled[y][x]
    for y in range(N):
        for x in range(N):
            if px[x, y] == metal:
                if not (at(x, y - 2) and at(x - 2, y) and at(x - 1, y - 1)):
                    px[x, y] = metal_hi
                elif not (at(x, y + 2) and at(x + 2, y) and at(x + 1, y + 1)):
                    px[x, y] = metal_lo
    for y in range(N):
        for x in range(N):
            if filled[y][x] and any(not at(x + i, y + j) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = outline
    for x in range(15, 49):
        px[x, 44] = outline
        px[x, 58] = outline
    font = trophy.FONT
    x0 = int(31.5 - (8 * 4 - 1) / 2 + 0.5)
    for n, ch in enumerate('CHAMPION'):
        for j, row in enumerate(font[ch]):
            for i, v in enumerate(row):
                if v == '#':
                    px[x0 + n * 4 + i, 47 + j] = black
    for i in range(30):
        for j in range(2):
            px[17 + i, 54 + j] = black if (i // 2 + j) % 2 == 0 else white
    return img


def file_name(cid):
    return f"trophy-{cid.replace('.', '-')}"


def main():
    pal = badge.load_palette(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ids = sys.argv[3].split(',') if len(sys.argv) > 3 else list(TROPHIES)
    for cid in ids:
        img = draw(pal, cid)
        img.resize((N * 2, N * 2), Image.NEAREST).save(out / f'{file_name(cid)}.png')
        img.resize((N * 4, N * 4), Image.NEAREST).save(out / f'{file_name(cid)}-preview.png')


if __name__ == '__main__':
    main()
