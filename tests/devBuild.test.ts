import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newCareerState } from '../src/core/career';
import { applyDevMaxStart, DEV_START_MONEY } from '../src/core/devBuild';
import { childLevel, leadLevel, type SkillsData } from '../src/core/skills';

const load = (f: string) => JSON.parse(readFileSync(`public/data/${f}.json`, 'utf8'));
const skills = load('skills') as SkillsData;

describe('v2.1DevOnly max start', () => {
  it('puts every child and lead skill at the max level and gives the dev cash', () => {
    const career = newCareerState(load('bikes'), load('story'), 'hondmoto', () => 0.5);
    applyDevMaxStart(skills, career);
    for (const lead of skills.leads) {
      expect(leadLevel(skills, career.skills, lead)).toBe(skills.maxLevel);
      for (const c of lead.children) expect(childLevel(skills, career.skills, c.id)).toBe(skills.maxLevel);
    }
    expect(career.money).toBe(DEV_START_MONEY * 100);
  });
});
