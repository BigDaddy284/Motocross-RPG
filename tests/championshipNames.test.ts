import { describe, expect, it } from 'vitest';
import { champById, champProblem } from '../src/core/championship';
import { checkContent } from '../src/core/content';
import { loadManifest, loadMaps, rawContent } from './helpers';

// Championship names from Boss's planner (4 Nov 2026): the area cups keep their bike-part names, the
// Local Champions go by their area, and the type championships by where they race with the
// discipline last: MX, EN, SE and SCMX are Championships, SX and EX are Series.

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const champ = (id: string) => champById(content.championships, id)!;

describe('championship names and the vets (Boss, 4 Nov 2026)', () => {
  it('names every championship from the planner, with no default names left', () => {
    expect(champ('area1.local_champion').name).toBe('Home Town Local Champion');
    expect(champ('area7.local_champion').name).toBe('The City Local Champion');
    expect(champ('area3.sx').name).toBe('Seafront SX Series');
    expect(champ('area6.sidecar').name).toBe('Ben Mor SCMX Championship');
    expect(champ('area8.endurocross').name).toBe('Dome Gauntlet EX Series');
    for (const c of content.championships.championships) {
      expect(c.name, c.id).not.toMatch(/Local Champion Championship|^New /);
      if (/ (SX|EX) /.test(c.name)) expect(c.name, c.id).toMatch(/Series$/);
      if (/ (MX|EN|SE|SCMX) /.test(c.name)) expect(c.name, c.id).toMatch(/Championship$/);
    }
  });

  it('runs the vets on the 450cc F, opening at Rider Ability 80, 90 and 95 against riders of that level (Boss, 5 Nov 2026)', () => {
    expect(champ('vets.40')).toMatchObject({ name: 'Old Guard SX Series', class: '450f', level: 80, field: 'vets.40', buff: 0 });
    expect(champ('vets.50')).toMatchObject({ name: 'Silver Trail EN Championship', class: '450f', level: 90, field: 'vets.50', buff: 0 });
    expect(champ('vets.60')).toMatchObject({ name: 'Evergreen MX Championship', class: '450f', level: 95, field: 'vets.60', buff: 0 });
    for (const [id, level] of [['vets.40', 80], ['vets.50', 90], ['vets.60', 95]] as const) {
      const def = champ(id);
      expect(def.rounds).toHaveLength(12);
      expect(def.needs).toBeUndefined();
      expect(def.milestone).toBeUndefined();
      expect(content.riders.fieldLevel?.[def.field]).toBe(level);
      const open = Object.fromEntries(content.tracks.venues.filter((v) => v.needs).map((v) => [v.needs!, true]));
      expect(champProblem(content, def, open, '450f', level - 1)).toBe(`Needs Rider Ability ${level}: you're level ${level - 1}.`);
      expect(champProblem(content, def, open, '450f', level)).toBeNull();
    }
    expect(content.bikes.classes.some((c) => c.id.startsWith('vets'))).toBe(false);
  });

  it('opens Legends with the Crankshaft Cup and the Ultimate Event with Legends (Boss, 5 Nov 2026)', () => {
    expect(champ('area8.main').milestone).toBeUndefined();
    expect(champ('legends').needs).toEqual(['trophy.area8.main']);
    expect(champ('ultimate').needs).toEqual(['trophy.legends']);
  });

  it('opens the Ultimate Event by winning Legends, with no Rider Ability level (Boss, 5 Nov 2026)', () => {
    const u = champ('ultimate');
    expect(u.name).toBe('Road to Legend Ultimate Event');
    const venues = Object.fromEntries(content.tracks.venues.filter((v) => v.needs).map((v) => [v.needs!, true]));
    expect(champProblem(content, u, venues, '450f', 70)).toBe('Not open to you yet.');
    expect(champProblem(content, u, { ...venues, 'trophy.legends': true }, '450f', 70)).toBeNull();
    // Only the Vets have a level to reach.
    expect(content.championships.championships.filter((c) => c.level).map((c) => c.id)).toEqual(['vets.40', 'vets.50', 'vets.60']);
  });
});
