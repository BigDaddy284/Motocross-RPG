import { currentStep, type CareerState, type WorldData } from './career';
import type { Content } from './content';
import { routeFor, routePlaces } from './guides';
import type { BakedMap, MapObject } from './mapTypes';
import type { Travel } from './travel';

// Tutorial markers (Boss, 28 Oct 2026): every step of the opening chain shows the player where to
// go next. The step's NPC gets a "!" bubble and its equipment a glowing outline; on any other map,
// the door or exit that leads there gets an arrow, and an arrow at the screen edge points the way
// while the marker is off screen. What is marked is read from story.json and the maps' doors and
// exits, so a new step or building needs no marker data of its own. Pure rules with no graphics.

/** What the current story step wants the player to reach, and the map it is on. */
export type Goal =
  | { kind: 'npc'; map: string; npc: string; name: string }
  | { kind: 'object'; map: string; action: string };

/** The first door or exit on the way to another map: every object with that name leading there. */
export interface Hop {
  kind: 'door' | 'exit';
  via: MapObject[];
  /** The map it leads to next. */
  to: string;
}

/** The map an NPC stands on: their own map, or the map with an NPC object naming them. */
function npcMap(content: Content, maps: Map<string, BakedMap>, id: string): string | null {
  const npc = content.npcs.find((n) => n.id === id);
  if (npc?.map) return npc.map;
  for (const m of maps.values()) if (m.objects.some((o) => o.type === 'npc' && o.props.npc === id)) return m.id;
  return null;
}

/** The current step's NPC or equipment, or null once the opening chain is over. */
export function storyGoal(content: Content, maps: Map<string, BakedMap>, career: CareerState): Goal | null {
  const step = currentStep(content.story, career);
  if (!step) return null;
  if (step.on.talk) {
    const map = npcMap(content, maps, step.on.talk);
    const npc = content.npcs.find((n) => n.id === step.on.talk);
    return map && npc ? { kind: 'npc', map, npc: npc.id, name: npc.name } : null;
  }
  const action = step.on.use!;
  const map = step.on.map ?? [...maps.values()].find((m) => m.objects.some((o) => o.props.action === action))?.id;
  return map ? { kind: 'object', map, action } : null;
}

/** The equipment on this map for the step: the ones not used yet, for a step that needs a few. */
export function goalObjects(map: BakedMap, action: string, used: string[]): MapObject[] {
  return map.objects.filter((o) => o.props.action === action && !used.includes(`${map.id}:${o.name}:${o.x},${o.y}`));
}

/** Where each open door and exit on a map leads: a route leads to every place along it. */
function links(map: BakedMap, maps: Map<string, BakedMap>, world: WorldData, travel: Travel, flags: Record<string, boolean>): { via: MapObject; to: string }[] {
  const out: { via: MapObject; to: string }[] = [];
  for (const via of map.objects) {
    if (via.type !== 'door' && via.type !== 'exit') continue;
    const r = travel.resolve(map, via, flags);
    if (r?.kind === 'travel') out.push({ via, to: r.to.map });
    else if (r?.kind === 'route') {
      const route = routeFor(world, map, via);
      for (const p of route ? routePlaces(world, maps, route) : []) if (!p.mods) out.push({ via, to: p.map });
    }
  }
  return out;
}

/** The first door or exit on the shortest way from one map to another, or null if there's no open way. */
export function nextHop(maps: Map<string, BakedMap>, world: WorldData, travel: Travel, flags: Record<string, boolean>, from: string, to: string): Hop | null {
  const start = maps.get(from);
  if (!start || from === to) return null;
  // Breadth first over maps, remembering the first link taken out of the start map.
  const first = new Map<string, { via: MapObject; to: string }>();
  const queue: string[] = [];
  for (const l of links(start, maps, world, travel, flags)) {
    if (first.has(l.to) || l.to === from) continue;
    first.set(l.to, l);
    queue.push(l.to);
  }
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) {
      const l = first.get(id)!;
      const via = start.objects.filter((o) => o.type === l.via.type && o.name === l.via.name);
      return { kind: start.kind === 'area' && l.via.type === 'door' ? 'door' : 'exit', via, to: l.to };
    }
    const m = maps.get(id);
    if (!m) continue;
    for (const l of links(m, maps, world, travel, flags)) {
      if (first.has(l.to) || l.to === from) continue;
      first.set(l.to, first.get(id)!);
      queue.push(l.to);
    }
  }
  return null;
}
