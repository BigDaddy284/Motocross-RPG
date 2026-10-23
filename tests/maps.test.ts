import { describe, expect, it } from 'vitest';
import { checkContent, npcsOnMap } from '../src/core/content';
import { Grid } from '../src/core/grid';
import { reachable, standingTiles } from '../src/core/pathfinding';
import { Travel, spawnTile, stepTriggerAt } from '../src/core/travel';
import { objectTile } from '../src/core/mapTypes';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const travel = new Travel(maps);
const home = maps.get('area1-home-town')!;
const { content } = checkContent(rawContent(), loadManifest(), maps);

describe('Area 1 maps', () => {
  it('Home Town has a new-game spawn on a free tile', () => {
    const t = spawnTile(home, 'new_game')!;
    expect(Grid.fromMap(home).isFree(t.x, t.y)).toBe(true);
  });

  for (const area of ['area1-home-town', 'area1-industrial-zone']) {
    it(`${area}: every door leads into its interior and back out to a free tile`, () => {
      const m = maps.get(area)!;
      const doors = m.objects.filter((o) => o.type === 'door');
      expect(doors.length).toBeGreaterThan(0);
      for (const d of doors) {
        const r = travel.resolve(m, d);
        expect(r?.kind, d.name).toBe('travel');
        if (r?.kind !== 'travel') continue;
        const inside = maps.get(r.to.map)!;
        const g = Grid.fromMap(inside);
        expect(g.isFree(r.to.tile.x, r.to.tile.y), `${inside.id} spawn`).toBe(true);
        const exit = inside.objects.find((o) => o.type === 'exit')!;
        const exitTile = objectTile(exit, inside.tileSize);
        expect(reachable(g, r.to.tile).has(`${exitTile.x},${exitTile.y}`), `${inside.id} exit reachable`).toBe(true);
        const back = travel.resolve(inside, exit);
        expect(back?.kind).toBe('travel');
        if (back?.kind === 'travel') {
          expect(back.to.map).toBe(area);
          expect(Grid.fromMap(m).isFree(back.to.tile.x, back.to.tile.y), `${d.name} return tile`).toBe(true);
          expect(stepTriggerAt(m, back.to.tile)).toBeUndefined();
        }
      }
    });
  }

  it('the MX garage side door enters and leaves by the living-room doorway', () => {
    const door = home.objects.find((o) => o.type === 'door' && o.props.spawn === 'side_door')!;
    const r = travel.resolve(home, door);
    expect(r?.kind === 'travel' && r.to).toEqual({ map: 'int-home-local-garage', tile: { x: 8, y: 5 } });
    const inside = maps.get('int-home-local-garage')!;
    const exit = inside.objects.find((o) => o.type === 'exit' && o.props.return === 'side_door')!;
    const back = travel.resolve(inside, exit);
    expect(back?.kind === 'travel' && back.to).toEqual({ map: 'area1-home-town', tile: { x: 36, y: 19 } });
    for (const x of [36, 37]) expect(Grid.fromMap(home).isFree(x, 18), 'door tile').toBe(true);
    const front = travel.resolve(inside, inside.objects.find((o) => o.type === 'exit' && !o.props.return)!);
    expect(front?.kind === 'travel' && front.to.tile).toEqual({ x: 34, y: 19 });
  });

  it('the road between Home Town and the Industrial Zone works both ways', () => {
    const iz = maps.get('area1-industrial-zone')!;
    const toIz = travel.resolve(home, home.objects.find((o) => o.name === 'To the Industrial Zone')!);
    expect(toIz?.kind === 'travel' && toIz.to.map).toBe('area1-industrial-zone');
    const toHome = travel.resolve(iz, iz.objects.find((o) => o.name === 'To Home Town')!);
    expect(toHome?.kind === 'travel' && toHome.to.map).toBe('area1-home-town');
  });

  it('every placed NPC can be reached and talked to', () => {
    for (const m of maps.values()) {
      const placements = npcsOnMap(content!, m);
      if (!placements.length) continue;
      const g = Grid.fromMap(m);
      for (const p of placements) g.setOccupied(p, true);
      const start = m.kind === 'interior' ? spawnTile(m)! : spawnTile(m, m.id === 'area1-home-town' ? 'new_game' : undefined)!;
      const reach = reachable(g, start);
      for (const p of placements) {
        const stands = standingTiles(g, [p]);
        expect(stands.some((s) => reach.has(`${s.x},${s.y}`)), `${p.npc.id} on ${m.id}`).toBe(true);
      }
    }
  });
});
