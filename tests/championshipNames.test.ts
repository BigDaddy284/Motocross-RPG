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

  it('runs the vets in class order: each opens with its class, and the 40+ and 50+ win the next class', () => {
    expect(champ('vets.40')).toMatchObject({ name: 'Old Guard SX Series', class: 'vets-40', needs: ['class.vets-40'], milestone: 'vets-50' });
    expect(champ('vets.50')).toMatchObject({ name: 'Silver Trail EN Championship', class: 'vets-50', needs: ['class.vets-50'], milestone: 'vets-60' });
    expect(champ('vets.60')).toMatchObject({ name: 'Evergreen MX Championship', class: 'vets-60', needs: ['class.vets-60'] });
    for (const id of ['vets.40', 'vets.50', 'vets.60']) expect(champ(id).rounds).toHaveLength(12);
  });

  it('opens the Ultimate Event at Rider Ability 99 (GDD 6.4)', () => {
    const u = champ('ultimate');
    expect(u.name).toBe('Road to Legend Ultimate Event');
    const flags = { 'trophy.area8.main': true, ...Object.fromEntries(content.tracks.venues.filter((v) => v.needs).map((v) => [v.needs!, true])) };
    expect(champProblem(content, u, flags, 'vets-60', 98)).toBe("Needs Rider Ability 99: you're level 98.");
    expect(champProblem(content, u, flags, 'vets-60', 99)).toBeNull();
    // Every other championship has no level to reach.
    expect(content.championships.championships.filter((c) => c.level).map((c) => c.id)).toEqual(['ultimate']);
  });
});
