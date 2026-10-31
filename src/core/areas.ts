// The eight areas (Spec 18.1; Areas 2 to 8 plan). Area 1 is always open; Area N opens when the
// flag area.N.open is set, by winning the main championship of Area N − 1 (Spec 18.2).

export const AREA_COUNT = 8;

/** The flag that opens an area (Area 1 needs none). */
export const areaFlag = (area: number) => `area.${area}.open`;

/** How many areas are open to the rider, counting up from Area 1 until one is shut. */
export function openAreas(flags: Record<string, boolean>): number {
  let n = 1;
  while (n < AREA_COUNT && flags[areaFlag(n + 1)]) n++;
  return n;
}
