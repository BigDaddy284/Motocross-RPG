"""Recolours the race kits for each bike brand, so the kit matches the bike (Boss, 2 Nov 2026).

The rack's kits are drawn in one colour each (the MX race kit red for men and pink for women, the
no-helmet kit orange). This writes a copy of every sheet (walk, act, fit) per brand with the kit's
main colour swapped for the brand's: Yamamoto blue, Kwakmoto lime, Sukimoto yellow, Hondmoto red.
Only strongly coloured pixels in the kit's hue band change, so skin, hair, white trim, greys and
the goggles stay as drawn. Writes <sheet>-<brand>.png next to the originals:

    python3 tools/art/kit-brands.py [player-dir, default public/assets/art/characters/player]
"""
import colorsys
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]

# Sheet: (the kit's hue band in degrees, lowest saturation that counts as kit).
KITS = {
    'player-m-mxgear': ((340, 15), 0.55),
    'player-f-mxgear': ((295, 330), 0.45),
    'player-m-mx-nohelmet': ((214, 246), 0.55),
}
# Brand: (hue in degrees, saturation scale, lightness shift) for the kit's colour.
BRANDS = {
    'yamamoto': (220, 1.0, 0.0),
    'kwakmoto': (95, 0.95, 0.06),
    'sukimoto': (50, 1.0, 0.1),
    'hondmoto': (2, 1.0, 0.0),
}
PARTS = ['', '.act', '.fit']


def in_band(h, band):
    lo, hi = band
    return lo <= h <= hi if lo <= hi else h >= lo or h <= hi


def skin(p):
    r, g, b, a = p
    if a == 0:
        return False
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return 10 <= h * 360 <= 35 and 0.3 <= s <= 0.8 and 0.4 <= l <= 0.8


def recolour(img, band, min_s, brand):
    hue, s_scale, l_shift = BRANDS[brand]
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s < min_s or not in_band(h * 360, band) or l < 0.12 or l > 0.92:
                continue
            # Eyes sit in the skin: a pixel touching skin is left as drawn.
            if any(skin(img.getpixel((x + i, y + j))) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + i < img.width and 0 <= y + j < img.height):
                continue
            nr, ng, nb = colorsys.hls_to_rgb(hue / 360, min(0.9, l + l_shift), min(1, s * s_scale))
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def main():
    d = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public/assets/art/characters/player'
    for sheet, (band, min_s) in KITS.items():
        for part in PARTS:
            src = d / f'{sheet}{part}.png'
            img = Image.open(src).convert('RGBA')
            for brand in BRANDS:
                recolour(img, band, min_s, brand).save(d / f'{sheet}-{brand}{part}.png')
        print(sheet)


if __name__ == '__main__':
    main()
