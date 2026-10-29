"""Moto78 (Boss, 29 Oct 2026): the bike shop's chrome sign and Bill Rothon, its owner.

The old shop owner's sheets move to npc-17-track-official (a track official's new face), and the
shop owner's sheets become Bill: a white middle-aged man, trimmed sides and a smart top of brown
hair, no glasses, a white Moto78 T-shirt and black combat trousers. The sign is the Moto78 logo: slanted
chrome letters with a dark edge and a light-blue rim, MOTO78 in one run. Writes the sheets in
place and previews:

    python3 tools/art/moto78.py <repo> <preview-dir>
"""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTLINE = (39, 42, 44)
HAIR_OLD = {(20, 20, 30): 'dark', (59, 60, 69): 'mid', (85, 85, 94): 'hi'}
HAIR = {'dark': (70, 44, 24), 'mid': (108, 72, 40), 'hi': (142, 100, 58)}
FADE = (172, 134, 108)
SKIN = {(142, 94, 62): (236, 196, 164), (107, 74, 49): (214, 168, 136), (71, 48, 45): (150, 110, 86), (168, 119, 80): (214, 168, 136)}
RED = {(194, 28, 21): 'mid', (238, 25, 29): 'hi', (168, 39, 39): 'shade', (100, 32, 31): 'dark'}
BAG = {(13, 29, 51), (88, 104, 127), (54, 69, 96), (20, 41, 71), (71, 113, 162), (41, 47, 61), (68, 98, 134)}
TROUSERS_OLD = {(99, 143, 164)}
SHIRT = {'mid': (240, 240, 236), 'hi': (252, 252, 250), 'shade': (204, 204, 210), 'dark': (150, 150, 160)}
COMBO = {'mid': (62, 64, 70), 'shade': (44, 46, 52), 'hi': (84, 86, 94)}
# The chest mark: a light-blue rimmed chrome bar, Moto78's logo at shirt size.
LB, SV, GR = (90, 170, 230), (230, 232, 236), (150, 154, 162)
MARK = [
    [LB, LB, LB, LB, LB, LB],
    [LB, SV, GR, SV, GR, LB],
    [LB, LB, LB, LB, LB, LB],
]


def bill(sheet: Image.Image, fw=64, fh=64) -> Image.Image:
    out = sheet.copy()
    px = out.load()
    for fy in range(0, sheet.height, fh):
        for fx in range(0, sheet.width, fw):
            frame(px, fx, fy, fw, fh)
    return out


def frame(px, fx, fy, fw, fh):
    rows = range(fy, fy + fh)
    cols = range(fx, fx + fw)
    rgb = lambda x, y: px[x, y][:3]
    body = [y for y in rows if any(rgb(x, y) in RED for x in cols)]
    skin = [y for y in rows if any(rgb(x, y) in SKIN for x in cols)]
    if not body or not skin:
        return
    face_top = skin[0]
    # The sides are trimmed: hair beside the face, from the brow down, is a short fade.
    face_span = {}
    for y in range(face_top, body[0]):
        xs = [x for x in cols if rgb(x, y) in SKIN or rgb(x, y) in {(234, 235, 235), (20, 20, 30)} and any(rgb(x + k, y) in SKIN for k in (-2, -1, 1, 2) if fx <= x + k < fx + fw)]
        if xs:
            face_span[y] = (min(xs), max(xs))
    trousers_top = min((y for y in rows if any(rgb(x, y) in TROUSERS_OLD for x in cols)), default=body[-1] + 1)
    # No glasses: the frame's dark pixels inside the face, round and under the eyes, are skin.
    for y in range(face_top + 3, min(face_top + 10, body[0])):
        span = face_span.get(y)
        if not span:
            continue
        for x in range(span[0] + 1, span[1]):
            if rgb(x, y) == (20, 20, 30):
                px[x, y] = (236, 196, 164, 255)
    for y in rows:
        for x in cols:
            c = rgb(x, y)
            if not px[x, y][3]:
                continue
            if c in SKIN:
                px[x, y] = SKIN[c] + (255,)
            elif c in HAIR_OLD:
                span = face_span.get(y)
                if y >= face_top and span and (x < span[0] - 1 or x > span[1] + 1) and y < body[0]:
                    px[x, y] = FADE + (255,)
                elif y < body[0]:
                    px[x, y] = HAIR[HAIR_OLD[c]] + (255,)
            elif c in RED:
                px[x, y] = SHIRT[RED[c]] + (255,)
            elif c in BAG:
                px[x, y] = (SHIRT['mid'] if y < trousers_top else COMBO['mid']) + (255,)
            elif c in TROUSERS_OLD:
                px[x, y] = COMBO['mid'] + (255,)
    # Combat trousers: a darker crease down the middle and a pocket flap on each leg.
    legs = [y for y in range(trousers_top, fy + fh) if any(rgb(x, y) == COMBO['mid'] for x in cols)]
    if legs:
        for y in legs[2:5]:
            xs = [x for x in cols if rgb(x, y) == COMBO['mid']]
            if len(xs) >= 10:
                for x in (xs[1], xs[2], xs[3], xs[-4], xs[-3], xs[-2]):
                    px[x, y] = COMBO['hi' if y == legs[2] else 'shade'] + (255,)
    # The chest mark on front frames (the eyes show).
    eyes = any(rgb(x, y) == (234, 235, 235) for y in range(face_top, body[0]) for x in cols)
    if eyes:
        y0 = body[0] + 4
        xs = [x for x in cols if rgb(x, y0 + 1) in SHIRT.values()]
        if xs:
            cx = (min(xs) + max(xs)) // 2
            for j, row in enumerate(MARK):
                for i, c in enumerate(row):
                    if rgb(cx - 3 + i, y0 + j) in SHIRT.values():
                        px[cx - 3 + i, y0 + j] = c + (255,)


def logo(w: int, h: int) -> Image.Image:
    """MOTO78 in slanted chrome letters: light-blue rim, dark edge, silver that darkens to the base."""
    S = 4
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    text = 'MOTO78'
    size = int(h * S * 0.9)
    while size > 8:
        font = ImageFont.truetype('/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf', size)
        box = d.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= w * S - 10 * S and box[3] - box[1] <= h * S - 8 * S:
            break
        size -= 1
    tx = (w * S - (box[2] - box[0])) / 2 - box[0]
    ty = (h * S - (box[3] - box[1])) / 2 - box[1]
    for r, col in ((3 * S, (70, 150, 220, 255)), (int(1.5 * S), (24, 26, 30, 255))):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r:
                    d.text((tx + dx, ty + dy), text, font=font, fill=col)
    mask = Image.new('L', big.size, 0)
    ImageDraw.Draw(mask).text((tx, ty), text, font=font, fill=255)
    fill = Image.new('RGBA', big.size, (0, 0, 0, 0))
    fp = fill.load()
    mp = mask.load()
    y0, y1 = int(ty + box[1]), int(ty + box[3])
    for yy in range(y0, y1 + 1):
        t = (yy - y0) / max(1, y1 - y0)
        tone = (250, 250, 252) if t < 0.3 else (205, 208, 214) if t < 0.5 else (120, 124, 132) if t < 0.58 else (225, 227, 232) if t < 0.8 else (160, 164, 172)
        for xx in range(big.width):
            if mp[xx, yy] > 128:
                fp[xx, yy] = tone + (255,)
    big.alpha_composite(fill)
    # The logo's letters are wide: stretch the run to most of the board.
    run = big.crop((int(tx + box[0]) - 4 * S, 0, int(tx + box[2]) + 4 * S, h * S))
    target = int(w * S * 0.8)
    run = run.resize((target, h * S), Image.LANCZOS)
    out = Image.new('RGBA', big.size, (0, 0, 0, 0))
    out.alpha_composite(run, ((w * S - target) // 2, 0))
    return out.resize((w, h), Image.LANCZOS)


def main(repo: Path, preview: Path):
    npcs = repo / 'public/assets/art/characters/npcs'
    # The old shop owner becomes a track official's face.
    for suffix in ('.png', '.act.png'):
        src = npcs / f'npc-03-bike-shop-owner{suffix}'
        dst = npcs / f'npc-17-track-official{suffix}'
        if not dst.exists():
            shutil.copy(src, dst)
        out = bill(Image.open(src).convert('RGBA'))
        out.save(src)
    sheet_path = repo / 'public/assets/art/buildings/sheets/buildings-exterior-v3.png'
    sheet = Image.open(sheet_path).convert('RGBA')
    # The bike shop's sign board (the building's crop is 0,320 512x320): the board stays, the logo goes on it.
    x0, y0, x1, y1 = 68, 320 + 184, 382, 320 + 216
    d = ImageDraw.Draw(sheet)
    d.rectangle((x0, y0, x1, y1), fill=(24, 26, 30, 255))
    sheet.alpha_composite(logo(x1 - x0 + 1, y1 - y0 + 1), (x0, y0))
    sheet.save(sheet_path)
    crop = sheet.crop((0, 320, 512, 640))
    crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST).save(preview / 'moto78-shop.png')
    v = Image.open(npcs / 'npc-03-bike-shop-owner.png')
    a = Image.open(npcs / 'npc-03-bike-shop-owner.act.png')
    out = Image.new('RGBA', (64 * 6 * 6, 64 * 6), (90, 90, 90, 255))
    fs = [v.crop((0, dd * 64, 64, (dd + 1) * 64)) for dd in range(4)] + [a.crop((i * 64, 0, (i + 1) * 64, 64)) for i in (1, 2)]
    for i, f in enumerate(fs):
        f = f.resize((384, 384), Image.NEAREST)
        out.paste(f, (i * 384, 0), f)
    out.save(preview / 'bill-rothon.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
