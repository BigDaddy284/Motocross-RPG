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
/** The items that can show a picture: those with words on a face. */
export const PICTURE_ITEMS: ReadonlySet<string> = new Set(['banner', 'sponsor_board']);
/**
 * The best size for each item's picture, in pixels: the shape of the face on a default-sized item
 * (a banner 10 to 1, a sponsor board about 4.6 to 1). Another size is stretched to fit.
 */
export const BANNER_SIZES: Readonly<Record<string, readonly [number, number]>> = { banner: [2000, 200], sponsor_board: [1200, 260] };

/** The picture's path from the game's root, for an item's image name; null for none or a bad name. */
export function bannerPath(image: string | undefined): string | null {
  return image && BANNER_NAME.test(image) ? `${BANNER_DIR}${image}.png` : null;
}

/** The picture names in the folder's index, as the editor offers them. */
export function bannerNames(index: unknown): string[] {
  return Array.isArray(index) ? index.filter((f): f is string => typeof f === 'string' && BANNER_FILE.test(f)).map((f) => f.slice(0, -4)).sort() : [];
}
