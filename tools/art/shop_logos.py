"""The shop logos for Lee's T's & Wheels and J's Tools (Boss, 31 Oct 2026: "I want the signs to be
unique too"), drawn at any board size like Moto78's chrome logo, so the Home Town boards and every
area's Lee's T's & Wheels carry the same mark.

  Lee's T's & Wheels: a black board edged with tyre tread, a tyre with a chrome hub, LEE'S in orange
  heavy slanted letters and T'S & WHEELS in white.
  J's Tools: a red board, two crossed spanners, J'S in yellow outlined in black, TOOLS in white.
"""
import math

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf'
INK = (24, 26, 30, 255)
S = 4  # drawn at 4x, then reduced with no blending so the pixels stay crisp


def _fit(d, text, max_w, max_h):
    size = max_h
    while size > 6:
        f = ImageFont.truetype(FONT, size)
        b = d.textbbox((0, 0), text, font=f)
        if b[2] - b[0] <= max_w and b[3] - b[1] <= max_h:
            return f, b
        size -= 1
    return f, b


def _outlined(d, xy, text, f, fill, edge, r):
    x, y = xy
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                d.text((x + dx, y + dy), text, font=f, fill=edge)
    d.text((x, y), text, font=f, fill=fill)


def _runs(d, parts, x, h, gap):
    """Lay out [(text, font, bbox, fill, edge)] left to right from x, centred on the board's height."""
    for text, f, b, fill, edge in parts:
        _outlined(d, (x - b[0], (h - (b[3] - b[1])) / 2 - b[1]), text, f, fill, edge, int(1.2 * S))
        x += b[2] - b[0] + gap
    return x


def _done(big, w, h):
    return big.resize((w, h), Image.NEAREST)


def lee_logo(w, h):
    W, H = w * S, h * S
    big = Image.new('RGBA', (W, H), INK)
    d = ImageDraw.Draw(big)
    # tread along the top and bottom edges
    t = max(S, H // 10)
    for x in range(0, W, 3 * S):
        for y0 in (0, H - t):
            d.polygon([(x, y0), (x + 2 * S, y0), (x + 3 * S, y0 + t), (x + S, y0 + t)], fill=(70, 72, 78, 255))
    # the tyre
    cy, r = H / 2, H * 0.38
    cx = r + 3 * S
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(44, 46, 52, 255), outline=(110, 114, 122, 255), width=S)
    for k in range(12):
        a = k * math.pi / 6
        x1, y1 = cx + (r - S) * math.cos(a), cy + (r - S) * math.sin(a)
        d.ellipse((x1 - S, y1 - S, x1 + S, y1 + S), fill=(90, 94, 102, 255))
    rh = r * 0.5
    d.ellipse((cx - rh, cy - rh, cx + rh, cy + rh), fill=(214, 218, 226, 255), outline=(150, 154, 162, 255), width=S)
    d.ellipse((cx - rh * 0.3, cy - rh * 0.3, cx + rh * 0.3, cy + rh * 0.3), fill=(90, 94, 102, 255))
    x = cx + r + 3 * S
    room = W - x - 3 * S
    fa, ba = _fit(d, "LEE'S", room * 0.42, H - 2 * t - 2 * S)
    fb, bb = _fit(d, "T'S & WHEELS", room * 0.56, int((H - 2 * t) * 0.62))
    total = (ba[2] - ba[0]) + (bb[2] - bb[0]) + 3 * S
    x += (room - total) / 2
    _runs(d, [("LEE'S", fa, ba, (255, 132, 32, 255), INK), ("T'S & WHEELS", fb, bb, (240, 240, 236, 255), INK)], x, H, 3 * S)
    return _done(big, w, h)


def _spanner(d, x0, y0, x1, y1, w, col, edge):
    d.line((x0, y0, x1, y1), fill=edge, width=w + 2 * S)
    d.line((x0, y0, x1, y1), fill=col, width=w)
    for (x, y) in ((x0, y0), (x1, y1)):
        r = w * 1.3
        d.ellipse((x - r - S, y - r - S, x + r + S, y + r + S), fill=edge)
        d.ellipse((x - r, y - r, x + r, y + r), fill=col)
        d.ellipse((x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45), fill=(196, 30, 36, 255))


def js_logo(w, h):
    W, H = w * S, h * S
    RED = (196, 30, 36, 255)
    big = Image.new('RGBA', (W, H), RED)
    d = ImageDraw.Draw(big)
    d.rectangle((0, 0, W - 1, H - 1), outline=(250, 250, 246, 255), width=S)
    d.rectangle((2 * S, 2 * S, W - 1 - 2 * S, H - 1 - 2 * S), outline=INK, width=S)
    # two crossed spanners
    m = H * 0.2
    sx0, sx1 = 5 * S, 5 * S + H * 0.8
    _spanner(d, sx0 + m * 0.4, m, sx1 - m * 0.4, H - m, int(S * 2.2), (232, 234, 238, 255), INK)
    _spanner(d, sx1 - m * 0.4, m, sx0 + m * 0.4, H - m, int(S * 2.2), (232, 234, 238, 255), INK)
    x = sx1 + 3 * S
    room = W - x - 4 * S
    fa, ba = _fit(d, "J'S", room * 0.36, H - 7 * S)
    fb, bb = _fit(d, 'TOOLS', room * 0.58, int((H - 7 * S) * 0.8))
    total = (ba[2] - ba[0]) + (bb[2] - bb[0]) + 3 * S
    x += (room - total) / 2
    _runs(d, [("J'S", fa, ba, (255, 200, 40, 255), INK), ('TOOLS', fb, bb, (250, 250, 246, 255), INK)], x, H, 3 * S)
    return _done(big, w, h)
