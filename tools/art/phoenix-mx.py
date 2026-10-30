"""Phoenix MX (Boss, 29 Oct 2026): the garage's sign and Paul Phoenix, its mechanic.

Redraws the garage sign on the exterior sheet in the Phoenix MX logo's style (slanted white-edged
letters, blue for PHOENIX and red for MX, the phoenix rising over the MX) and turns the garage
mechanic's sheets into Paul: an older white man with stubble on his head instead of a cap, in a
white Phoenix MX T-shirt and blue jeans. Writes the sheets in place and 4x previews:

    python3 tools/art/phoenix-mx.py <repo> <preview-dir>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTLINE = (39, 42, 44, 255)
# The sheet's colours and Paul's.
SKIN = {(192, 141, 86): (236, 196, 164), (168, 119, 80): (214, 168, 136), (216, 157, 96): (246, 214, 186), (142, 94, 62): (176, 130, 100), (107, 74, 49): (130, 92, 70)}
CAP = {(194, 28, 21), (238, 25, 29), (168, 39, 39), (100, 32, 31)}
BLUE = {(33, 108, 228): 'mid', (33, 80, 153): 'shade', (120, 181, 233): 'hi', (20, 41, 71): 'dark'}
SHIRT = {'mid': (240, 240, 236), 'shade': (204, 204, 210), 'hi': (252, 252, 250), 'dark': (150, 150, 160)}
JEANS = {'mid': (62, 104, 176), 'shade': (42, 72, 132), 'hi': (96, 146, 206), 'dark': (26, 42, 82)}
SKIN_MID = (236, 196, 164)
STUBBLE = (204, 170, 146)
HAIR = {(177, 174, 175), (145, 142, 147)}
EYE = (234, 235, 235)
BUTTON = (232, 209, 132)
# The chest mark: the phoenix in three flame tones over a blue MX bar.
Y, O, R, B = (250, 220, 60), (240, 130, 30), (210, 40, 30), (33, 80, 153)
MARK = [
    [R, 0, R, 0, R],
    [0, R, O, R, 0],
    [0, 0, Y, 0, 0],
    [B, B, B, B, B],
]


def paul(sheet: Image.Image, fw=64, fh=64) -> Image.Image:
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
    # Where the body (blue) and the face (skin) are, to split shirt from jeans and cap from face.
    body = [y for y in rows if any(rgb(x, y) in BLUE for x in cols)]
    skin = [y for y in rows if any(rgb(x, y) in SKIN for x in cols)]
    if not body or not skin:
        return
    waist = body[0] + (body[-1] - body[0]) // 2 + 1
    face_top = skin[0]
    # The face's width just under the cap: the cap's brim and peak stick out beyond it and go.
    span = {}
    for y in rows:
        xs = [x for x in cols if px[x, y][3] and rgb(x, y) not in CAP and rgb(x, y) != OUTLINE[:3]]
        if xs:
            span[y] = (min(xs), max(xs))
    head = span.get(face_top) or span.get(face_top + 1)
    for y in rows:
        for x in cols:
            c = rgb(x, y)
            if not px[x, y][3]:
                continue
            if c in SKIN:
                px[x, y] = SKIN[c] + (255,)
            elif c in BLUE:
                px[x, y] = (SHIRT if y < waist else JEANS)[BLUE[c]] + (255,)
            elif c in CAP or (y < face_top and (c in {(234, 235, 235), (207, 197, 191)} or (c in HAIR and head and head[0] + 2 < x < head[1] - 2))):
                # The cap: its crown is the top of the head now; the cap's badge is skin too.
                px[x, y] = SKIN_MID + (255,)
            elif c == BUTTON:
                px[x, y] = SHIRT['mid'] + (255,)
    # The brim and peak beyond the head go, outline and all, from the cap rows down to the brow.
    if head:
        for y in range(fy, face_top + 2):
            for x in cols:
                if x < head[0] - 1 or x > head[1] + 1:
                    px[x, y] = (0, 0, 0, 0)
        # Lower down, the peak's last pixels stand apart from the face: short runs off the head go.
        mid = (head[0] + head[1]) // 2
        for y in range(face_top + 2, face_top + 8):
            run = []
            for x in list(cols) + [fx + fw]:
                if x < fx + fw and px[x, y][3]:
                    run.append(x)
                elif run:
                    if len(run) <= 6 and not (run[0] <= mid <= run[-1]):
                        for rx in run:
                            px[rx, y] = (0, 0, 0, 0)
                    run = []
    # Stubble: a sparse checker over the former crown, above the forehead.
    for y in range(fy, face_top - 3):
        for x in cols:
            if px[x, y][:3] == SKIN_MID and (x + 2 * y) % 4 == 0:
                px[x, y] = STUBBLE + (255,)
    # Outline pixels left beside the removed brim go; then every edge gets its outline back.
    for y in rows:
        for x in cols:
            if px[x, y][:3] == OUTLINE[:3] and y < face_top:
                near = [(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy)]
                if not any(fx <= nx < fx + fw and fy <= ny < fy + fh and px[nx, ny][3] and px[nx, ny][:3] != OUTLINE[:3] for nx, ny in near):
                    px[x, y] = (0, 0, 0, 0)
    for y in rows:
        for x in cols:
            if px[x, y][3]:
                continue
            near = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            if any(fx <= nx < fx + fw and fy <= ny < fy + fh and px[nx, ny][3] and px[nx, ny][:3] != OUTLINE[:3] for nx, ny in near):
                px[x, y] = OUTLINE
    # Front frames (the eyes show): the overalls' bib lines come off the shirt and the chest mark goes on.
    eyes = any(px[x, y][:3] == EYE for y in range(face_top, body[0]) for x in cols)
    if eyes:
        y0 = body[0] + 4
        xs = [x for x in cols if px[x, y0 + 1][:3] in SHIRT.values()]
        if xs:
            cx = (min(xs) + max(xs)) // 2
            # The bib's pocket lines, in the middle of the chest, become plain shirt.
            for y in range(body[0] + 2, waist - 2):
                for x in range(cx - 7, cx + 8):
                    if px[x, y][:3] in (SHIRT['shade'], SHIRT['hi'], SHIRT['dark']):
                        px[x, y] = SHIRT['mid'] + (255,)
            for j, row in enumerate(MARK):
                for i, c in enumerate(row):
                    if c and px[cx - 2 + i, y0 + j][:3] in SHIRT.values():
                        px[cx - 2 + i, y0 + j] = c + (255,)


def logo(w: int, h: int) -> Image.Image:
    """The Phoenix MX logo on a dark sign: slanted letters, blue then red, the bird over the MX."""
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    S = 4
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    font = ImageFont.truetype('/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf', int(h * S * 0.8))
    text_y = int(h * S * 0.08)
    x = int(w * S * 0.03)
    for word, tones in (('PHOENIX', [(120, 181, 233), (33, 108, 228), (20, 41, 120)]), ('MX', [(255, 120, 90), (238, 25, 29), (120, 20, 20)])):
        box = d.textbbox((x, text_y), word, font=font)
        mask = Image.new('L', big.size, 0)
        ImageDraw.Draw(mask).text((x, text_y), word, font=font, fill=255)
        fill = Image.new('RGBA', big.size, (0, 0, 0, 0))
        fp = fill.load()
        mp = mask.load()
        for yy in range(box[1], box[3] + 1):
            t = (yy - box[1]) / max(1, box[3] - box[1])
            tone = tones[0] if t < 0.3 else tones[1] if t < 0.72 else tones[2]
            for xx in range(box[0], box[2] + 1):
                if mp[xx, yy] > 128:
                    fp[xx, yy] = tone + (255,)
        # White edge then dark edge round the letters.
        for dx in range(-S * 2, S * 2 + 1):
            for dy in range(-S * 2, S * 2 + 1):
                if abs(dx) + abs(dy) <= S * 3:
                    d.text((x + dx, text_y + dy), word, font=font, fill=(30, 32, 36, 255))
        for dx in range(-S, S + 1):
            for dy in range(-S, S + 1):
                d.text((x + dx, text_y + dy), word, font=font, fill=(250, 250, 248, 255))
        big.alpha_composite(fill)
        x = box[2] + int(S * 1.5)
    # The phoenix: wings up and out, head turned, tail trailing, flame tones top to bottom.
    bx = int(w * S * 0.74)
    by = int(h * S * 0.04)
    bw = int(w * S * 0.24)
    bh = int(h * S * 0.62)
    P = lambda u, v: (bx + u * bw, by + v * bh)
    body = [P(0.5, 1.0), P(0.44, 0.75), P(0.25, 0.55), P(0.0, 0.35), P(0.08, 0.22), P(0.14, 0.3), P(0.18, 0.08), P(0.24, 0.25), P(0.3, 0.0), P(0.34, 0.28), P(0.42, 0.3), P(0.44, 0.25), P(0.47, 0.1), P(0.52, 0.05), P(0.56, 0.12), P(0.55, 0.28), P(0.62, 0.28), P(0.7, 0.0), P(0.76, 0.25), P(0.82, 0.08), P(0.86, 0.3), P(0.92, 0.22), P(1.0, 0.35), P(0.75, 0.55), P(0.56, 0.75)]
    bird = Image.new('RGBA', big.size, (0, 0, 0, 0))
    ImageDraw.Draw(bird).polygon(body, fill=(255, 255, 255, 255), outline=(30, 32, 36, 255), width=S)
    bp = bird.load()
    for yy in range(by, by + bh + 1):
        t = (yy - by) / bh
        tone = (250, 220, 60) if t < 0.25 else (240, 130, 30) if t < 0.55 else (210, 40, 30)
        for xx in range(bx - 2, bx + bw + 3):
            if 0 <= xx < big.width and 0 <= yy < big.height and bp[xx, yy][3]:
                bp[xx, yy] = tone + (255,)
    big.alpha_composite(bird)
    return big.resize((w, h), Image.LANCZOS)


def main(repo: Path, preview: Path):
    npcs = repo / 'public/assets/art/characters/npcs'
    for name in ('npc-01-garage-mechanic.png', 'npc-01-garage-mechanic.act.png'):
        sheet = Image.open(npcs / name).convert('RGBA')
        out = paul(sheet)
        out.save(npcs / name)
        out.resize((out.width * 4, out.height * 4), Image.NEAREST).save(preview / f'paul-{name}')
    sheet_path = repo / 'public/assets/art/buildings/sheets/buildings-exterior-v3.png'
    sheet = Image.open(sheet_path).convert('RGBA')
    # The garage's sign panel on the exterior (the building's crop is 1216,0 576x256).
    x0, y0, x1, y1 = 1216 + 58, 108, 1216 + 336, 148
    d = ImageDraw.Draw(sheet)
    d.rectangle((x0, y0, x1 - 1, y1 - 1), fill=(32, 34, 38, 255), outline=(60, 62, 66, 255))
    lg = logo(x1 - x0 - 4, y1 - y0 - 4)
    sheet.alpha_composite(lg, (x0 + 2, y0 + 2))
    sheet.save(sheet_path)
    crop = sheet.crop((1216, 0, 1216 + 576, 256))
    crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST).save(preview / 'phoenix-mx-garage.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
