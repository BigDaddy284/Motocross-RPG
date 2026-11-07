// How the day's weather looks on the race screen (Boss, 5 Nov 2026: "yes please", to rain and wet
// ground in the race view). racing.json weather sets what it does to the riders (slower, more
// mistakes); this is only the picture: the light, the falling rain, the wet track and its puddles,
// and the spray off the back wheel. Pure numbers, no graphics: RaceView draws them.

export interface WeatherLook {
  /** The sky light's strength (the dry day's is 1.1) and colour. */
  sky: number;
  skyColour: number;
  /** The sun's strength (the dry day's is 2.2): weaker under cloud, so the shadows fade. */
  sun: number;
  /** How wet the ground is, 0 (dry) to 1 (soaked): the track and grass go darker. */
  wet: number;
  /** Rain streaks falling over the view at once (0 for none). */
  drops: number;
  /** Puddles on the racing surface per 100 grid units of lap. */
  puddles: number;
  /** The colour of the spray off the back wheel: dust when dry, mud when wet. */
  spray: number;
}

const DRY: WeatherLook = { sky: 1.1, skyColour: 0xe8f0ff, sun: 2.2, wet: 0, drops: 0, puddles: 0, spray: 0xcaa478 };

export const WEATHER_LOOKS: Record<string, WeatherLook> = {
  dry: DRY,
  overcast: { sky: 1.05, skyColour: 0xd8dde4, sun: 0.9, wet: 0, drops: 0, puddles: 0, spray: 0xb89a74 },
  light_rain: { sky: 0.95, skyColour: 0xc8d0da, sun: 0.55, wet: 0.55, drops: 450, puddles: 2, spray: 0x6e5638 },
  heavy_rain: { sky: 0.85, skyColour: 0xb4bcc8, sun: 0.25, wet: 1, drops: 1400, puddles: 5, spray: 0x5a4430 },
};

/** The look of a weather kind (racing.json weather id); an unknown or missing one is a dry day. */
export function weatherLook(kind: string | undefined): WeatherLook {
  return (kind && WEATHER_LOOKS[kind]) || DRY;
}

/** A colour darkened for wet ground: wet 1 takes it to 70%, a little bluer. */
export function wetShade(colour: number, wet: number): number {
  if (wet <= 0) return colour;
  const k = 1 - 0.3 * wet;
  const r = Math.round(((colour >> 16) & 255) * k);
  const g = Math.round(((colour >> 8) & 255) * k);
  const b = Math.min(255, Math.round((colour & 255) * (k + 0.06 * wet)));
  return (r << 16) | (g << 8) | b;
}
