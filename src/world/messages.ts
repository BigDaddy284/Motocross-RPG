import type { MapObject } from '../core/mapTypes';

// What clicking a usable object says in the test build. Each action id comes from the
// buildings and area map data; the systems behind them arrive in later builds.

const ACTIONS: Record<string, string> = {
  outfit: 'Changing outfits',
  'storage.parts': 'Parts storage',
  'storage.tools': 'Tool storage',
  'train.bodyweight': 'Bodyweight training',
  'workshop.fit_tune': 'Fitting and tuning',
  'workshop.bike': 'Working on bikes',
  'train.engine_strip': 'Engine strip training',
  'train.tyre_change': 'Tyre change training',
  'service.paid_repair': 'Paid repairs',
  'jobs.customer_repairs': 'Customer repair jobs',
  'info.standings': 'Championship standings',
  'shop.display_bike': 'The display bike',
  'shop.bike_parts': 'The parts shop',
  'shop.tyres_wheels': 'The tyres and wheels shop',
  'shop.tool_sets': 'The tool set shop',
  'shop.van': 'Buying the van',
  'story.neighbour_pc': "The neighbour's computer",
  'job.shift': 'Work shifts',
  'train.welding': 'Welding training',
  'train.bodywork_fitting': 'Bodywork fitting training',
  'jobs.fabrication': 'Fabrication jobs',
  'train.machining': 'Machining training',
  'train.engine_build': 'Engine building',
  'jobs.engine': 'Engine jobs',
  'story.modifier_machine': 'The modifier machine',
};

const pretty = (s: string) => s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** The message for a usable object, or null if clicking it should just walk there. */
export function actionMessage(o: MapObject): string | null {
  switch (o.type) {
    case 'interact': {
      const action = String(o.props.action ?? '');
      const what = ACTIONS[action] ?? pretty(action || o.name);
      return `${pretty(o.name)}: ${what} comes in a later build.`;
    }
    case 'click':
      return `${o.name}: nobody's in right now.`;
    case 'venue':
      return `${o.name}: practice and racing come in a later build.`;
    case 'gate':
      return `${o.name} is locked.`;
    case 'travel':
      return `${o.name}: the world map comes in a later build.`;
    default:
      return null;
  }
}
