"""Nicholls Used Motors (Boss, 29 Oct 2026): the banner across the front of the Used Motors building
and Jedrick Nicholls, its seller, with ginger hair.

Writes the sheets in place and 2x/4x previews:

    python3 tools/art/nicholls-used-motors.py <repo> <preview-dir>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTLINE = (39, 42, 44)
SKIN = {(215, 161, 117), (203, 142, 87), (235, 182, 141), (165, 103, 63), (142, 94, 62)}
HAIR = {(20, 20, 30): (120, 48, 14), (59, 60, 69): (196, 88, 28), (85, 85, 94): (232, 132, 62)}
JACKET = {(168, 119, 80), (107, 74, 49), (217, 192, 150)}


def ginger(sheet: Image.Image, fw=64, fh=64) -> Image.Image:
    out = sheet.copy()
    px = out.load()
    for fy in range(0, sheet.height, fh):
        for fx in range(0, sheet.width, fw):
            rows = range(fy, fy + fh)
            cols = range(fx, fx + fw)
            rgb = lambda x, y: px[x, y][:3]
            body = [y for y in rows if any(rgb(x, y) in JACKET for x in cols)]
            if not body:
                continue
            # The sunglasses: the six rows above the blue glint under them, within the cheeks' span.
            blue = [y for y in rows if any(rgb(x, y) == (33, 80, 153) for x in cols)]
            glasses = set(range(min(blue) - 6, max(blue) + 1)) if blue else set()
            cheeks = [x for x in cols if blue and rgb(x, max(blue) + 1) in SKIN]
            span = (min(cheeks), max(cheeks)) if cheeks else None
            for y in range(fy, body[0]):
                for x in cols:
                    c = rgb(x, y)
                    if c not in HAIR:
                        continue
                    if y in glasses and span and span[0] <= x <= span[1]:
                        continue
                    px[x, y] = HAIR[c] + (255,)
    return out


def banner(w: int, h: int) -> Image.Image:
    """A cream banner with red lettering, tied at both ends, drawn big and brought down."""
    S = 4
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    tie = 6 * S
    # The fabric, with a slight sag and a dark edge; rope and a ring at each end.
    body = [(tie, 2 * S), (w * S - tie, 2 * S), (w * S - tie, h * S - 4 * S), (w * S / 2, h * S - 2 * S), (tie, h * S - 4 * S)]
    d.polygon(body, fill=(242, 228, 196, 255), outline=(60, 50, 40, 255), width=S)
    d.line([(2 * S, S), (tie, 4 * S)], fill=(120, 90, 50, 255), width=S)
    d.line([(2 * S, h * S - 2 * S), (tie, h * S - 6 * S)], fill=(120, 90, 50, 255), width=S)
    d.line([(w * S - 2 * S, S), (w * S - tie, 4 * S)], fill=(120, 90, 50, 255), width=S)
    d.line([(w * S - 2 * S, h * S - 2 * S), (w * S - tie, h * S - 6 * S)], fill=(120, 90, 50, 255), width=S)
    # A folded shadow band along the bottom of the fabric.
    d.polygon([(tie + S, h * S - 7 * S), (w * S - tie - S, h * S - 7 * S), (w * S - tie - S, h * S - 5 * S), (w * S / 2, h * S - 3 * S), (tie + S, h * S - 5 * S)], fill=(222, 206, 170, 255))
    text = 'NICHOLLS USED MOTORS'
    size = int(h * S * 0.58)
    while size > 8:
        font = ImageFont.truetype('/usr/share/fonts/truetype/freefont/FreeSansBold.ttf', size)
        box = d.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= w * S - 2 * tie - 6 * S:
            break
        size -= 1
    tx = (w * S - (box[2] - box[0])) / 2 - box[0]
    ty = (h * S - (box[3] - box[1])) / 2 - box[1] - S
    for dx in (-S, 0, S):
        for dy in (-S, 0, S):
            d.text((tx + dx, ty + dy), text, font=font, fill=(90, 20, 20, 255))
    d.text((tx, ty), text, font=font, fill=(200, 36, 30, 255))
    return big.resize((w, h), Image.LANCZOS)


def main(repo: Path, preview: Path):
    npcs = repo / 'public/assets/art/characters/npcs'
    for name in ('npc-02-van-seller.png', 'npc-02-van-seller.act.png'):
        sheet = Image.open(npcs / name).convert('RGBA')
        out = ginger(sheet)
        out.save(npcs / name)
    sheet_path = repo / 'public/assets/art/buildings/sheets/buildings-exterior-v3.png'
    sheet = Image.open(sheet_path).convert('RGBA')
    # The Used Motors front (crop 1024,320 320x256): the banner hangs across the eave over the old sign.
    cx, cy = 1024, 320
    bw, bh = 250, 36
    bx, by = cx + 4, cy + 126
    # Wall and eave under the old sign, from the stretch beside it, so nothing of the sign shows past the banner.
    patch = sheet.crop((cx + 10, cy + 128, cx + 120, cy + 170))
    sheet.alpha_composite(patch, (cx + 130, cy + 128))
    sheet.alpha_composite(banner(bw, bh), (bx, by))
    sheet.save(sheet_path)
    crop = sheet.crop((cx, cy, cx + 320, cy + 256))
    crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST).save(preview / 'nicholls-used-motors.png')
    v = Image.open(npcs / 'npc-02-van-seller.png')
    a = Image.open(npcs / 'npc-02-van-seller.act.png')
    out = Image.new('RGBA', (64 * 6 * 6, 64 * 6), (90, 90, 90, 255))
    fs = [v.crop((0, d * 64, 64, (d + 1) * 64)) for d in range(4)] + [a.crop((i * 64, 0, (i + 1) * 64, 64)) for i in (1, 2)]
    for i, f in enumerate(fs):
        f = f.resize((384, 384), Image.NEAREST)
        out.paste(f, (i * 384, 0), f)
    out.save(preview / 'jedrick-nicholls.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
