"""The world map (Boss, 28 Oct 2026): Boss's layout of the areas redrawn in the game's palette.

Drawn at half size and doubled for the 2 px pixel look, with every colour snapped to the reference
palette; the words go on at full size. Writes, into <out-dir>:

- world-map.png, and world-map-<zone>.png for the zones with a picture of their own (home, iz), with
  that zone's little picture left off so the bike marker stands in its place;
- world-map-bikes/<class>-<brand>.png: the side-on map bike for every class and brand in
  <sheets-dir> (art/vehicles/sheets/map), doubled, with its shadow. The game draws the rider's
  biggest bike at the zone's marker point (data/world.json worldMap).

    python3 tools/art/world-map.py <palette.hex> <sheets-dir> <out-dir> <title-font.ttf>

The title font is Big Shoulders Bold.
"""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFont
PAL = [tuple(int(l[i:i+2], 16) for i in (0, 2, 4)) for l in open(sys.argv[1]).read().split()]
SHEETS, OUTDIR, TITLE_FONT = sys.argv[2], sys.argv[3], sys.argv[4]
from PIL import Image, ImageDraw, ImageFont
PAL = [tuple(int(l[i:i+2], 16) for i in (0, 2, 4)) for l in open(sys.argv[1]).read().split()]
def near(c):
    return min(PAL, key=lambda p: (p[0]-c[0])**2 + (p[1]-c[1])**2 + (p[2]-c[2])**2)
H = lambda s: near(tuple(int(s[i:i+2], 16) for i in (1, 3, 5)))
INK=H('#272a2c'); INK0=H('#14141e'); ROAD=H('#3b3c45'); ROAD_E=H('#6c686b'); DASH=H('#eaebeb'); CREAM=H('#e8dbb8')
G1=H('#447f3c'); G2=H('#326136'); G3=H('#6e8b35'); G4=H('#5d6c33'); TREE=H('#29492a'); TREE_H=H('#447f3c'); TRUNK=H('#47302d')
WATER=H('#216ce4'); WATER_D=H('#215099'); WATER_H=H('#78b5e9'); ROCK=H('#918e93'); ROCK_D=H('#6c686b'); ROCK_H=H('#b1aeaf')
DIRT=H('#a87750'); DIRT_D=H('#7c4c37'); YEL=H('#ecbe2a'); YEL_D=H('#b97f30'); ORANGE=H('#ef6c18'); ORANGE_D=H('#c25b2a')
GREEN=H('#326136'); GREEN_D=H('#29492a'); WHITE=H('#eaebeb'); RED=H('#c21c15'); BLUE=H('#216ce4'); TEAL=H('#62957f'); GREY=H('#4b4c57')

def draw(HERE, OUT):
    W, HH = 720, 540
    im = Image.new('RGB', (W, HH), G1); d = ImageDraw.Draw(im)
    rnd = random.Random(7)
    # Grass texture, dirt trails, a river and rocky corners.
    for _ in range(9000):
        x, y = rnd.randrange(W), rnd.randrange(HH); d.point((x, y), fill=rnd.choice([G2, G3, G1, G4]))
    def trail(pts, w=3):
        d.line(pts, fill=DIRT_D, width=w+2); d.line(pts, fill=DIRT, width=w)
    trail([(20,140),(60,120),(110,135),(150,110)]); trail([(560,30),(600,60),(650,40),(700,70)]); trail([(600,470),(640,440),(700,455)])
    trail([(30,330),(70,350),(120,330)]); trail([(250,520),(300,500),(350,515)])
    river = [(-5,300),(30,295),(70,305),(110,300),(140,330),(130,370),(90,400),(40,420),(10,450),(-5,470)]
    river2 = [(560,-5),(590,20),(640,30),(690,15),(725,25)]
    river3 = [(60,545),(110,500),(170,480),(230,470),(300,490),(330,545)]
    for r in (river, river2, river3):
        d.line(r, fill=WATER_D, width=16); d.line(r, fill=WATER, width=12); d.line([(x+2, y-2) for x, y in r], fill=WATER_H, width=1)
    def rocks(cx, cy, n, s=16):
        for _ in range(n):
            x, y = cx + rnd.randint(-s*2, s*2), cy + rnd.randint(-s, s); r = rnd.randint(5, 11)
            d.polygon([(x-r,y+r//2),(x-r//2,y-r),(x+r//2,y-r),(x+r,y+r//2)], fill=ROCK, outline=ROCK_D); d.line([(x-r//2,y-r+1),(x+r//2-1,y-r+1)], fill=ROCK_H)
    for c in [(20,20),(60,15),(700,520),(660,530),(15,520),(700,20)]: rocks(*c, 6)
    # Trees everywhere except where plates and roads go.
    trees = [(rnd.randrange(W), rnd.randrange(HH)) for _ in range(1300)]
    for x, y in sorted(trees, key=lambda p: p[1]):
        d.polygon([(x, y-7), (x-4, y+2), (x+4, y+2)], fill=TREE, outline=INK0)
        d.point((x-1, y-3), fill=TREE_H); d.line([(x, y+2), (x, y+3)], fill=TRUNK)
    # ---- layout, in full-size coordinates (halved for drawing) ----
    P = {'a4': (340,215), 'a3': (720,215), 'a2': (1100,215), 'a5': (340,480), 'hub': (720,520), 'home': (1110,480), 'iz': (1345,480),
         'a6': (340,790), 'a7': (720,820), 'a8': (1100,790)}
    T = [(720,72,'a3'), (92,230,'a4'), (1348,230,'a2'), (92,520,'a5'), (92,830,'a6'), (720,1010,'a7'), (1348,830,'a8')]
    h = lambda p: (p[0]//2, p[1]//2)
    roads = [('a4','a3'),('a3','a2'),('a4','a5'),('a5','a6'),('a6','a7'),('a7','a8'),('a2','home'),('home','a8'),('home','iz'),
             ('hub','a3'),('hub','a7'),('hub','a5'),('hub','home'),('hub','a4'),('hub','a2'),('hub','a6'),('hub','a8')]
    def road(a, b):
        a, b = h(a), h(b)
        d.line([a, b], fill=INK0, width=22); d.line([a, b], fill=ROAD_E, width=20); d.line([a, b], fill=ROAD, width=16)
        L = math.dist(a, b); n = int(L // 10)
        for i in range(1, n, 2):
            t0, t1 = i/n, (i+0.5)/n
            d.line([(a[0]+(b[0]-a[0])*t0, a[1]+(b[1]-a[1])*t0), (a[0]+(b[0]-a[0])*t1, a[1]+(b[1]-a[1])*t1)], fill=DASH, width=1)
    for a, b in roads: road(P[a], P[b])
    for x, y, z in T: road((x, y), P[z])
    def stripes(x0, y0, x1, y1):
        for x in range(x0 - (y1-y0), x1, 8):
            d.polygon([(x,y1),(x+4,y1),(x+4+(y1-y0),y0),(x+(y1-y0),y0)], fill=INK0)
    def plate(c, w=136, hgt=76):
        x, y = h(c); x0, y0, x1, y1 = x-w//2, y-hgt//2, x+w//2, y+hgt//2
        d.rectangle([x0-3, y0-3, x1+3, y1+3], fill=GREY, outline=INK0)
        for bx, by in [(x0-1,y0-1),(x1-1,y0-1),(x0-1,y1-1),(x1-1,y1-1)]: d.rectangle([bx,by,bx+2,by+2], fill=ROCK_H)
        d.rectangle([x0, y0, x1, y1], fill=YEL, outline=INK0)
        d.rectangle([x0, y0, x1, y0+7], fill=YEL); stripes(x0, y0, x1, y0+7); d.rectangle([x0, y0, x1, y0+7], outline=INK0)
        d.rectangle([x0, y1-7, x1, y1], fill=YEL); stripes(x0, y1-7, x1, y1); d.rectangle([x0, y1-7, x1, y1], outline=INK0)
        d.rectangle([x0+6, y1-21, x1-6, y1-10], fill=INK)
        for _ in range(40): d.point((rnd.randint(x0+2, x1-2), rnd.randint(y0+9, y1-23)), fill=YEL_D)
        # rider on a bike
        bx, by = x, y0 + 17
        d.ellipse([bx-11, by+2, bx-5, by+8], outline=INK0, width=2); d.ellipse([bx+5, by+2, bx+11, by+8], outline=INK0, width=2)
        d.polygon([(bx-8,by+4),(bx-2,by-1),(bx+6,by-1),(bx+8,by+4),(bx+2,by+4)], fill=INK0); d.ellipse([bx-2,by-9,bx+3,by-4], fill=INK0); d.line([(bx,by-4),(bx-2,by)], fill=INK0, width=2)
        return (x0, y0, x1, y1)
    plates = {k: plate(P[k]) for k in ['a2','a3','a4','a5','a6','a7','a8']}
    # Home Town: a green road sign.
    x, y = h(P['home']); hx0, hy0, hx1, hy1 = x-74, y-46, x+74, y+46
    d.rectangle([hx0-3, hy0-3, hx1+3, hy1+3], fill=ROCK_D, outline=INK0); d.rectangle([hx0, hy0, hx1, hy1], fill=GREEN, outline=WHITE)
    d.rectangle([hx0+3, hy0+3, hx1-3, hy1-3], outline=GREEN_D)
    for i, (tx, ty) in enumerate([(x-50,y+22),(x+52,y+22),(x-36,y+26),(x+40,y+26)]): d.polygon([(tx,ty-9),(tx-4,ty),(tx+4,ty)], fill=TEAL)
    BIKE_HERE = HERE
    if BIKE_HERE != 'home':
      d.rectangle([x-12, y+12, x+12, y+30], fill=WHITE); d.polygon([(x-16,y+13),(x,y+2),(x+16,y+13)], fill=WHITE); d.rectangle([x-3,y+20,x+3,y+30], fill=GREEN)
      d.rectangle([x-30,y+20,x-20,y+30], fill=TEAL); d.rectangle([x+20,y+18,x+30,y+30], fill=TEAL); d.rectangle([x+34,y+10,x+37,y+30], fill=TEAL); d.polygon([(x+33,y+10),(x+35,y+4),(x+38,y+10)], fill=TEAL)
      for i in range(6): d.rectangle([x-12+i*4, y+33+(i%2)*2, x-10+i*4, y+35+(i%2)*2], fill=WHITE)
    # Industrial Zone: a dark panel with a factory, over a little yard.
    x, y = h(P['iz']); ix0, iy0, ix1, iy1 = x-34, y-46, x+34, y+28
    for k in range(5):
        bx = x - 30 + (k % 3) * 22; by = y + 44 + (k // 3) * 16
        d.rectangle([bx, by, bx+16, by+10], fill=ROCK_D, outline=INK0); d.rectangle([bx, by, bx+16, by+3], fill=H('#4771a2'))
    d.rectangle([x-40, y+40, x+38, y+78], outline=ROCK_D)
    d.rectangle([ix0-3, iy0-3, ix1+3, iy1+3], fill=ROCK_D, outline=INK0); d.rectangle([ix0, iy0, ix1, iy1], fill=INK)
    fx, fy = x, y + 12
    if BIKE_HERE != 'iz':
      d.rectangle([fx-16, fy, fx+16, fy+10], fill=WHITE); d.polygon([(fx-16,fy),(fx-10,fy-5),(fx-10,fy),(fx-4,fy-5),(fx-4,fy),(fx+2,fy-5),(fx+2,fy)], fill=WHITE)
      d.rectangle([fx+6, fy-12, fx+9, fy], fill=WHITE); d.rectangle([fx+11, fy-9, fx+14, fy], fill=WHITE)
      for i in range(4): d.rectangle([fx-13+i*7, fy+4, fx-10+i*7, fy+7], fill=INK)
    # Race Hub: a big MX tyre.
    x, y = h(P['hub']); R = 86
    d.ellipse([x-R-2, y-R-2, x+R+2, y+R+2], fill=INK0)
    for a in range(0, 360, 9):
        r = math.radians(a); d.polygon([(x+math.cos(r-0.05)*(R-10), y+math.sin(r-0.05)*(R-10)), (x+math.cos(r-0.04)*R, y+math.sin(r-0.04)*R), (x+math.cos(r+0.04)*R, y+math.sin(r+0.04)*R), (x+math.cos(r+0.05)*(R-10), y+math.sin(r+0.05)*(R-10))], fill=GREY)
    d.ellipse([x-R+12, y-R+12, x+R-12, y+R-12], fill=INK, outline=INK0)
    d.ellipse([x-R+16, y-R+16, x+R-16, y+R-16], outline=YEL, width=2)
    d.ellipse([x-R+20, y-R+20, x+R-20, y+R-20], fill=INK0)
    for yy in (y-R+3, y+R-12): d.rectangle([x-12, yy, x+12, yy+9], fill=YEL)
    # tracks badges
    def badge(cx, cy):
        x, y = h((cx, cy)); r = 30
        d.ellipse([x-r-3, y-r-3, x+r+3, y+r+3], fill=INK0); d.ellipse([x-r, y-r, x+r, y+r], fill=INK, outline=YEL, width=2)
        d.ellipse([x-r+6, y-r+6, x+r-6, y+r-6], fill=G2)
        d.ellipse([x-18, y-12, x+18, y+8], fill=DIRT_D); d.ellipse([x-15, y-10, x+15, y+5], fill=DIRT)
        d.line([(x-10,y-3),(x-2,y-6),(x+6,y-1),(x+12,y-5)], fill=DIRT_D, width=2)
        d.ellipse([x-1,y-17,x+4,y-14], outline=WHITE); d.ellipse([x+7,y-17,x+12,y-14], outline=WHITE); d.polygon([(x+1,y-16),(x+5,y-20),(x+10,y-16)], fill=WHITE); d.ellipse([x+4,y-24,x+8,y-20], fill=WHITE)
        d.rectangle([x-r+6, y+8, x+r-6, y+20], fill=INK0)
    for t in T: badge(t[0], t[1])
    big = im.resize((W*2, HH*2), Image.NEAREST); D = ImageDraw.Draw(big)
    FB = lambda s: ImageFont.truetype(TITLE_FONT, s)
    def ctext(x, y, s, font, fill, stroke=0, sfill=INK0):
        D.text((x, y), s, font=font, fill=fill, anchor='mm', stroke_width=stroke, stroke_fill=sfill)
    names = {'a2':'AREA 2','a3':'AREA 3','a4':'AREA 4','a5':'AREA 5','a6':'AREA 6','a7':'AREA 7','a8':'AREA 8'}
    for k, (x0, y0, x1, y1) in plates.items():
        ctext((x0+x1), (y0+y1) + 2, names[k], FB(50), INK0)
        ctext((x0+x1), (y1-15)*2, 'COMING SOON', FB(22), WHITE)
    x, y = P['home']; ctext(x, y - 44, 'HOME TOWN', FB(50), WHITE, 3, GREEN_D)
    x, y = P['iz']; ctext(x, y - 66, 'INDUSTRIAL', FB(22), WHITE); ctext(x, y - 42, 'ZONE', FB(22), WHITE)
    x, y = P['hub']; ctext(x, y - 150, 'MX', FB(22), INK0); ctext(x, y + 150, 'MX', FB(22), INK0)
    ctext(x, y - 98, 'RACE HUB', FB(46), WHITE, 3, INK0)
    D.line([(x-76, y-72), (x+76, y-72)], fill=YEL, width=3)
    items = [('FARMLAND', G1), ('RIVERSIDE', WATER), ('LONGMOOR', ORANGE), ('MOD TRACKS', RED)]
    for i, (s, col) in enumerate(items):
        yy = y - 50 + i * 27
        D.ellipse([x-84, yy-10, x-64, yy+10], fill=col, outline=INK0, width=2)
        D.text((x-54, yy), s, font=FB(23), fill=WHITE, anchor='lm')
    for tx, ty, _ in T: ctext(tx, ty + 28, 'TRACKS', FB(22), WHITE)
    big.convert('RGB').save(OUT)

CLASSES = {'50': '50cc', '65': '65cc', '85sw': '85cc-small', '85bw': '85cc-big'}

def bike(path, out):
    """The map bike side-on, cropped, doubled, with a soft shadow under the wheels."""
    spr = Image.open(path).convert('RGBA').crop((0, 0, 128, 128))
    spr = spr.crop(spr.getbbox()); pad = 4
    c = Image.new('RGBA', (spr.width + pad*2, spr.height + pad*2 + 3), (0,0,0,0))
    ImageDraw.Draw(c).ellipse([pad + spr.width*0.08, c.height - 10, pad + spr.width*0.92, c.height - 1], fill=(20,20,30,120))
    c.alpha_composite(spr, (pad, pad))
    c.resize((c.width*2, c.height*2), Image.NEAREST).save(out)

os.makedirs(f'{OUTDIR}/world-map-bikes', exist_ok=True)
draw('', f'{OUTDIR}/world-map.png')
for z in ('home', 'iz'): draw(z, f'{OUTDIR}/world-map-{z}.png')
for f in sorted(os.listdir(SHEETS)):
    parts = f[:-4].split('-')
    if len(parts) == 3 and parts[0] == 'map' and parts[1] in CLASSES and f.endswith('.png'):
        bike(f'{SHEETS}/{f}', f'{OUTDIR}/world-map-bikes/{CLASSES[parts[1]]}-{parts[2]}.png')
print('ok')
