"""Draws the Enduro venue's gate sign from the MX one (Boss, 30 Oct 2026): the same posts, board
and chequers, with ENDURO in place of MX TRACK, in the same white letters with a dark red shadow.

    python3 tools/art/gate-sign-enduro.py <track-gate-sign.png> <out.png>
"""
import sys

from PIL import Image

FONT = {
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
}
BOARD = (39, 42, 44, 255)
LETTER = (234, 235, 235, 255)
SHADOW = (142, 50, 42, 255)
SCALE = 4  # 4 px strokes, as the MX sign's letters
TEXT_X0, TEXT_X1 = 38, 218  # between the chequers
TEXT_Y0, TEXT_Y1 = 24, 59
TOP = 26  # the letters' top row, as on the MX sign


def main(src, out):
    img = Image.open(src).convert('RGBA')
    px = img.load()
    for y in range(TEXT_Y0, TEXT_Y1):
        for x in range(TEXT_X0, TEXT_X1):
            px[x, y] = BOARD
    word = 'ENDURO'
    width = sum((len(FONT[c][0]) + 1) * SCALE for c in word) - SCALE
    for colour, off in ((SHADOW, 2), (LETTER, 0)):
        x = (TEXT_X0 + TEXT_X1 - width) // 2
        for c in word:
            for gy, row in enumerate(FONT[c]):
                for gx, on in enumerate(row):
                    if on == '#':
                        for dy in range(SCALE):
                            for dx in range(SCALE):
                                px[x + gx * SCALE + dx + off, TOP + gy * SCALE + dy + off] = colour
            x += (len(FONT[c][0]) + 1) * SCALE
    img.save(out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
