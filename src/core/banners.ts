// Banner pictures (Boss, 1 Nov 2026: "add the ability to add png's and the image loads on them as an
// option"). A banner or sponsor board shows the words typed for it in the track editor, or, picked
// there instead, a PNG from public/mods/banners/. The folder is listed in its index.json, which
// vite.config.ts makes from the folder in dev and on build, as for mod tracks and models. The
// picture is stretched over the face: drawn at the size below, it fits a default-sized item exactly.

/** The folder of banner pictures, from the game's root. */
export const BANNER_DIR = 'mods/banners/';
/** Its list of pictures (file names), made by vite.config.ts. */
export const BANNER_INDEX = `${BANNER_DIR}index.json`;
/** A picture's name as an item keeps it: the file name without .png, lower-case letters, digits, - and _. */
export const BANNER_NAME = /^[a-z0-9][a-z0-9_-]{0,47}$/;
/** A file the folder accepts. */
export const BANNER_FILE = /^[a-z0-9][a-z0-9_-]{0,47}\.png$/;
/**
 * The items that can show a picture: every item whose own words are on a face (Boss, 2 Nov 2026:
 * "do the same for sponsor banner and flags ect ... so pngs can be used"), on the game's own item and
 * on a model's Text material alike. Not the start official's board (a number), nor the lighting truss
 * (no words unless typed).
 */
export const PICTURE_ITEMS: ReadonlySet<string> = new Set([
  'banner', 'sponsor_board', 'feather_flags', 'inflatable', 'finish_arch', 'sprint_start', 'time_check',
  'pit_setup', 'trade_stand', 'catering_van', 'press_tent', 'signing_table', 'merch_trailer',
  'podium', 'holeshot_board', 'stadium_tunnel',
]);
/**
 * The best size for each item's picture, in pixels: the shape of its words' face on a default-sized
 * item (a banner 10 to 1, a sponsor board about 4.6 to 1, a feather flag tall and thin). Another size
 * is stretched to fit. A sponsor inflatable's column has tall faces (about 300 × 900) instead. On a
tall face a wide picture is turned to read upwards, as the words are (world/RaceView.ts uprightPicture).
 */
export const BANNER_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  banner: [2000, 200],
  sponsor_board: [1200, 260],
  feather_flags: [200, 1000],
  inflatable: [1240, 200],
  finish_arch: [2000, 200],
  sprint_start: [1400, 200],
  time_check: [1000, 100],
  pit_setup: [1500, 100],
  trade_stand: [1000, 100],
  catering_van: [1200, 150],
  press_tent: [1300, 100],
  signing_table: [1000, 150],
  merch_trailer: [1200, 160],
  podium: [1200, 250],
  holeshot_board: [1000, 200],
  stadium_tunnel: [1360, 200],
};

/** The picture's path from the game's root, for an item's image name; null for none or a bad name. */
export function bannerPath(image: string | undefined): string | null {
  return image && BANNER_NAME.test(image) ? `${BANNER_DIR}${image}.png` : null;
}

/** The picture names in the folder's index, as the editor offers them. */
export function bannerNames(index: unknown): string[] {
  return Array.isArray(index) ? index.filter((f): f is string => typeof f === 'string' && BANNER_FILE.test(f)).map((f) => f.slice(0, -4)).sort() : [];
}
