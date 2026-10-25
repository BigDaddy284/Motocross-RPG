// Race-day bike colours (Boss's brief, 24 Oct 2026: "Race day bike colours.png"). The race view's
// bike and rider keep their shape; only their colours change: the plastics, frame and number plate
// in the bike's brand colours, and the rider in their own gear colours. Visual only: nothing here
// feeds back into the race.

type Ramp = number;
const BLACK = 0x3b3c45;
const GREY = 0x918e93;
const WHITE = 0xcfc5bf;
const BRIGHT_WHITE = 0xeaebeb;
const RED = 0xc21c15;
const BLUE = 0x3b86da;
const LIME = 0xa0c33e;
const YELLOW = 0xecbe2a;
const HIVIS = 0xdad65d;
const PINK = 0xf067d5;
const ORANGE = 0xef6c18;
const CAMO = 0x6a9f50;
const SILVER = 0xb1aeaf;

/** Brand colours (Boss, 22 Oct): blue Yamamoto, green Kwakmoto, yellow Sukimoto, red Hondmoto. */
export const BRAND_COLOURS: Record<string, { body: Ramp; body2: Ramp; frame: Ramp; frame2: Ramp; plate: Ramp }> = {
  yamamoto: { body: BLUE, body2: BRIGHT_WHITE, frame: BLUE, frame2: BLACK, plate: BRIGHT_WHITE },
  kwakmoto: { body: LIME, body2: BLACK, frame: LIME, frame2: BLACK, plate: LIME },
  sukimoto: { body: YELLOW, body2: BLUE, frame: SILVER, frame2: BLACK, plate: YELLOW },
  hondmoto: { body: RED, body2: BRIGHT_WHITE, frame: RED, frame2: BLACK, plate: BRIGHT_WHITE },
};

/** Gear colourways from the rider atlas: each item's main colour and its accent. */
const COLOURWAYS: Record<string, [Ramp, Ramp]> = {
  black: [BLACK, GREY],
  red: [RED, WHITE],
  hivis: [HIVIS, BLACK],
  blue: [BLUE, WHITE],
  pink: [PINK, BLACK],
  orange: [ORANGE, BLACK],
  white: [WHITE, GREY],
  camo: [CAMO, BLACK],
};

export interface Gear {
  helmet: Ramp;
  helmet2: Ramp;
  visor: Ramp;
  jersey: Ramp;
  glove: Ramp;
  pants: Ramp;
  boot: Ramp;
}

function gear(helmet: string, goggles: string, top: string, gloves: string, bottoms: string, boots: string): Gear {
  const c = (k: string, i = 0) => COLOURWAYS[k][i];
  return { helmet: c(helmet), helmet2: c(helmet, 1), visor: c(goggles), jersey: c(top), glove: c(gloves), pants: c(bottoms), boot: c(boots) };
}

/** The gear sets drawn on the race sheets: the player's starter kit and the CPU riders' kits. */
export const GEAR_SETS: Record<string, Gear> = {
  'player-default': gear('white', 'orange', 'orange', 'black', 'black', 'white'),
  'cpu-red': gear('red', 'red', 'red', 'red', 'red', 'red'),
  'cpu-hivis': gear('hivis', 'hivis', 'black', 'hivis', 'black', 'black'),
  'cpu-blue': gear('blue', 'blue', 'blue', 'blue', 'blue', 'blue'),
  'cpu-pink': gear('pink', 'pink', 'pink', 'pink', 'pink', 'white'),
  'cpu-camo': gear('black', 'white', 'white', 'camo', 'camo', 'camo'),
  'cpu-black': gear('black', 'orange', 'black', 'black', 'black', 'black'),
  'cpu-champion': gear('hivis', 'hivis', 'hivis', 'black', 'black', 'black'),
};

/** CPU kits in the order the field is dressed. The Local Champion wears hi-vis. */
export const CPU_GEAR = ['cpu-red', 'cpu-blue', 'cpu-pink', 'cpu-camo', 'cpu-black', 'cpu-hivis'];

/**
 * The colour that stands for a rider on the race screen's map and labels: their jersey, so the
 * dot matches the rider on the track (grey for a black jersey, which would vanish on the map).
 */
export function gearColour(g: Gear): number {
  return g.jersey === BLACK ? GREY : g.jersey;
}

/** How one rider looks on race day. */
export interface RaceLook {
  brand: string;
  gear: Gear;
}

/** The colour of each part of the race view's bike and rider (RaceView.makeBike). */
export interface BikeColours {
  plastics: number;
  frame: number;
  plate: number;
  legs: number;
  torso: number;
  arms: number;
  helmet: number;
  visor: number;
}

const DARK = 0x1c1c22;
const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 0xff) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * The colours for one rider. Without a look, the original single-colour scheme: everything in the
 * rider's colour, with darker kit and a white helmet for the player.
 */
export function bikeColours(color: number, player: boolean, look?: RaceLook): BikeColours {
  if (!look) {
    const kit = shade(color, 0.75);
    return { plastics: color, frame: 0x9a9aa0, plate: 0xf4f4f4, legs: kit, torso: color, arms: kit, helmet: player ? 0xffffff : shade(color, 1.15), visor: DARK };
  }
  const b = BRAND_COLOURS[look.brand] ?? BRAND_COLOURS.hondmoto;
  const g = look.gear;
  return { plastics: b.body, frame: b.frame, plate: b.plate, legs: g.pants, torso: g.jersey, arms: g.jersey, helmet: g.helmet, visor: g.visor };
}
