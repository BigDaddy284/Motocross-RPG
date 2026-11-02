"""Draws each area house's "sold" patch: the house front with its For Sale sign taken away.

Placeholders (Boss, 2 Nov 2026: "once a house is purchased the for sale sign needs removing"). The
signs are painted into the exterior sheets, so each patch is that house's sheet cut around the
sign, with the sign's pixels filled from the wall beside, above or mirrored across a window. The
game draws the patch over the house once it is bought (areas.json house.sold).

    python3 tools/art/house-sold.py [out-dir, default public/assets/art/buildings/sold]

Prints each patch's offset on its house (the `at` for areas.json).
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'public/assets/art/buildings/sheets'

# Per house: the house's crop on its sheet, the sign's pieces (x0, y0, x1, y1, inclusive, in crop
# pixels) and how each is filled: ('left', p) repeats the wall p pixels to the left, ('up', p)
# the wall p pixels above, ('mirror', c) mirrors across column c (a window's middle).
SIGNS = {
    2: {'crop': (0, 0, 448, 320), 'fill': [((228, 249, 268, 273), ('left', 30)), ((249, 273, 258, 316), ('left', 30))]},
    3: {'crop': (0, 0, 512, 320), 'fill': [((101, 249, 140, 274), ('left', 20)), ((122, 274, 129, 316), ('left', 20))]},
    4: {'crop': (0, 0, 512, 320), 'fill': [((101, 249, 140, 274), ('left', 20)), ((122, 274, 129, 316), ('left', 20))]},
    5: {'crop': (0, 0, 512, 320), 'fill': [((127, 245, 176, 270), ('left', 20)), ((148, 270, 156, 313), ('left', 20))]},
    6: {'crop': (0, 0, 512, 320), 'fill': [((397, 245, 409, 270), ('mirror', 392)), ((410, 245, 446, 270), ('up', 26)), ((418, 270, 426, 313), ('left', 9))]},
    7: {'crop': (0, 0, 512, 320), 'fill': [((381, 241, 430, 266), ('up', 26)), ((402, 266, 409, 313), ('left', 8))]},
}


def patch(area):
    spec = SIGNS[area]
    cx, cy, cw, ch = spec['crop']
    house = Image.open(SHEETS / f'buildings-exterior-a{area}.png').convert('RGBA').crop((cx, cy, cx + cw, cy + ch))
    px = house.load()
    for (x0, y0, x1, y1), (how, p) in spec['fill']:
        if how == 'up':
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    px[x, y] = px[x, y - p]
        elif how == 'mirror':
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    px[x, y] = px[2 * p - x, y]
        else:
            # Left to right, so a wide gap repeats the strip beside it.
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    px[x, y] = px[x - p, y]
    xs = [b[0][0] for b in spec['fill']] + [b[0][2] for b in spec['fill']]
    ys = [b[0][1] for b in spec['fill']] + [b[0][3] for b in spec['fill']]
    box = (min(xs), min(ys), max(xs) + 1, min(max(ys) + 1, ch))
    return house.crop(box), box[:2], house


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public/assets/art/buildings/sold'
    out.mkdir(parents=True, exist_ok=True)
    for area in SIGNS:
        img, at, whole = patch(area)
        img.save(out / f'house-a{area}.png')
        whole.save(out.parent / f'.house-a{area}-preview.png') if '--preview' in sys.argv else None
        print(area, list(at))


if __name__ == '__main__':
    main()
