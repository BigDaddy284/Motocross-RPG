"""Lee's T's & Wheels and J's Tools (Boss, 30 Oct 2026; drawn 31 Oct 2026): the Home Town shop signs.

The tyre shop's board carries Lee's T'S & WHEELS logo and the tool shop's the J'S TOOLS logo
(tools/art/shop_logos.py; Boss, 31 Oct 2026: "I want the signs to be unique too"). The two owners' sprites
come from the art folder's characters/tools/make_characters.py (npc-04-tyre-specialist is Lee
Stocky, npc-20-jason-styles is Jason Styles). Writes the sheet in place and previews:

    python3 tools/art/lee-and-jason.py <repo> <preview-dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FACE = (39, 42, 44)
INK = (234, 235, 235)
RED = (194, 28, 21)
FONT = '/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf'
# Each board on buildings-exterior-v3.png: the building's crop origin, then the board's face box in it.
BOARDS = [
    ((512, 320), (24, 106, 319, 144), "LEE'S T'S & WHEELS"),
    ((512, 960), (82, 117, 287, 154), "J'S TOOLS"),
]


def repaint(sheet: Image.Image, origin, box, text):
    ox, oy = origin
    x0, y0, x1, y1 = box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy
    a = np.array(sheet)
    sub = a[y0:y1 + 1, x0:x1 + 1]
    rgb = sub[..., :3].astype(int)
    letters = (np.abs(rgb - INK).sum(-1) < 8) | (np.abs(rgb - RED).sum(-1) < 90)
    ys = np.where(letters.any(1))[0]
    ty0, ty1 = y0 + ys.min(), y0 + ys.max()
    sub[letters, :3] = FACE
    a[y0:y1 + 1, x0:x1 + 1] = sub
    out = Image.fromarray(a)
    h = ty1 - ty0 + 1
    d = ImageDraw.Draw(out)
    size = h + 6
    while size > 6:
        f = ImageFont.truetype(FONT, size)
        b = d.textbbox((0, 0), text, font=f)
        if b[2] - b[0] <= (x1 - x0) - 34 and b[3] - b[1] <= h:
            break
        size -= 1
    tw, th = b[2] - b[0], b[3] - b[1]
    tx = x0 + 22 + ((x1 - x0) - 22 - tw) // 2 - b[0]
    ty = ty0 + (h - th) // 2 - b[1]
    layer = Image.new('RGBA', out.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.fontmode = '1'
    ld.text((tx, ty), text, font=f, fill=INK + (255,))
    out.alpha_composite(layer)
    # the red flash in front of the first letters, as the old boards had
    d = ImageDraw.Draw(out)
    d.rectangle((x0 + 8, ty1 - 1, x0 + 8 + 28, ty1), fill=RED + (255,))
    return out


def main(repo: Path, preview: Path):
    sys.path.insert(0, str(Path(__file__).parent))
    from shop_logos import lee_logo, js_logo_e as js_logo  # Boss chose option E, 1 Nov 2026
    path = repo / 'public/assets/art/buildings/sheets/buildings-exterior-v3.png'
    sheet = Image.open(path).convert('RGBA')
    for ((ox, oy), (x0, y0, x1, y1), text), logo in zip(BOARDS, (lee_logo, js_logo)):
        sheet.alpha_composite(logo(x1 - x0 + 1, y1 - y0 + 1), (ox + x0, oy + y0))
    sheet.save(path)
    preview.mkdir(parents=True, exist_ok=True)
    for (ox, oy), _, text in BOARDS:
        crop = sheet.crop((ox, oy, ox + 512, oy + 256))
        crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST).save(preview / ('lees-shop.png' if 'LEE' in text else 'js-tools-shop.png'))


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
