import { describe, expect, it } from 'vitest';
import { buyMotor, motorProblem } from '../src/core/areas';
import { newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { Grid } from '../src/core/grid';
import { DriveMap, footprint, haulerAt, sheetFor } from '../src/core/vehicles';
import { loadManifest, loadMaps, rawContent } from './helpers';

const maps = loadMaps();
const manifest = loadManifest();
const content = checkContent(rawContent(), manifest, maps).content!;
const { vehicles, areas, bikes, story } = content;
const FACTORY = { factory_sponsor: true };
const venues = [...maps.keys()].filter((id) => id.startsWith('venue-'));

// The Factory Hauler is never bought or driven (Boss, 31 Oct 2026): with a factory sponsor the team parks it at every venue.
describe('the Factory Hauler', () => {
  it('is nowhere without a factory sponsor, and parked at every venue with one', () => {
    expect(venues.length).toBeGreaterThan(20);
    for (const id of venues) {
      expect(haulerAt(vehicles, {}, id, null)).toBeNull();
      const h = haulerAt(vehicles, FACTORY, id, { design: 'motor-6', map: id });
      expect(h?.design.id).toBe('motor-7');
      expect(h?.room).toEqual({ bikes: 11, parts: 400, tools: 120 });
    }
  });

  it('stays away from the towns', () => {
    for (const a of areas.areas) expect(haulerAt(vehicles, FACTORY, a.map, null)).toBeNull();
  });

  it('fits on its spot, clear of the spawn, so the rider can walk round it', () => {
    for (const id of venues) {
      const m = maps.get(id)!;
      const h = haulerAt(vehicles, FACTORY, id, null)!;
      const dm = new DriveMap(m, Grid.fromMap(m), vehicles);
      dm.setVanLength(h.design.length);
      expect(dm.fits(h.pose, h.design.length), id).toBe(true);
      const spawn = m.objects.find((o) => o.type === 'spawn')!;
      const sp = { x: Math.floor(spawn.x / m.tileSize), y: Math.floor(spawn.y / m.tileSize) };
      expect(footprint(h.pose, h.design.length).some((t) => Math.abs(t.x - sp.x) <= 1 && Math.abs(t.y - sp.y) <= 1), id).toBe(false);
    }
  });

  it('gives way to the same design parked there by the rider (the dev ?van=motor-7)', () => {
    expect(haulerAt(vehicles, FACTORY, 'venue-supercross', { design: 'motor-7', map: 'venue-supercross' })).toBeNull();
    expect(haulerAt(vehicles, FACTORY, 'venue-supercross', { design: 'motor-7', map: 'venue-motocross' })).not.toBeNull();
  });

  it('blocks the van once its tiles are marked parked', () => {
    const m = maps.get('venue-motocross')!;
    const h = haulerAt(vehicles, FACTORY, m.id, null)!;
    const dm = new DriveMap(m, Grid.fromMap(m), vehicles);
    dm.setVanLength(2);
    expect(dm.fits({ ...h.pose, heading: 'east' }, 2)).toBe(true);
    dm.setParkedTiles(footprint(h.pose, h.design.length));
    expect(dm.fits({ ...h.pose, heading: 'east' }, 2)).toBe(false);
  });
});

// The sports car (Boss, 31 Oct 2026): £250,000 at Nicholls in the Capital, factory riders only; it needs new vehicle art.
describe('the sports car', () => {
  const area8 = areas.areas.find((a) => a.n === 8)!;
  const rich = () => ({ ...newCareerState(bikes, story, 'yamamoto', () => 0.5), money: 300_000 * 100 });

  it('is sold in the Capital to a factory rider with the money', () => {
    expect(area8.motor?.design).toBe('motor-8');
    expect(area8.motor?.price).toBe(250_000);
    const van = { design: 'motor-6' };
    expect(motorProblem(vehicles, area8, rich(), van)).toMatch(/factory/);
    expect(motorProblem(vehicles, area8, rich(), van, FACTORY)).toBeNull();
    expect(motorProblem(vehicles, area8, { ...rich(), money: 1000 }, van, FACTORY)).toMatch(/short/);
    const career = rich();
    const r = buyMotor(vehicles, area8, career, van, FACTORY);
    expect(r.ok).toBe(true);
    expect(van.design).toBe('motor-8');
    expect(career.money).toBe(50_000 * 100);
  });

  it('is drawn with the Old Rusty Van sheets until its art exists', () => {
    const car = vehicles.designs.find((d) => d.id === 'motor-8')!;
    expect(car.artOf).toBe('motor-2');
    expect(sheetFor(manifest.vehicles, car)).toBe(manifest.vehicles?.['motor-2']);
  });
});
