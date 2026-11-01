import { describe, expect, it } from 'vitest';
import { advanceStory, catchUp, currentStep, earlyStep, hearEarly, matchStory, newCareerState, openChains } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { parseSave, SAVE_VERSION } from '../src/core/saves';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { story, bikes, items } = content;

// Boss, 1 Nov 2026: "if i speak to Area Champ and Local or Area champ while walking around during the tutorial,
// they say there bit there and then, can repeat if i go back but I shouldn't be sent back for the same lines."
describe('area tutorial lines heard early (Boss, 1 Nov 2026)', () => {
  const inArea3 = () => {
    const c = newCareerState(bikes, story, 'hondmoto', () => 0.5);
    c.story = { step: story.steps.length, used: [] };
    const flags: Record<string, boolean> = { 'area.3.open': true };
    openChains(story, c, flags);
    return { c, flags };
  };
  const talk = (c: ReturnType<typeof inArea3>['c'], flags: Record<string, boolean>, npc: string) => {
    const m = matchStory(story, c, { talk: npc });
    if (m?.kind === 'ready') {
      advanceStory(story, c, flags, items);
      return catchUp(story, c, flags, items).map((s) => s.id);
    }
    const e = earlyStep(story, c, { talk: npc });
    if (e) hearEarly(story, c, e);
    return e ? `early ${e.id}` : null;
  };

  it('lets the Local Champion say their bit before their turn, then skips them when the chain gets there', () => {
    const { c, flags } = inArea3();
    expect(currentStep(story, c)!.id).toBe('a3_news');
    expect(talk(c, flags, 'npc.a3.local_champion')).toBe('early a3_champion');
    expect(talk(c, flags, 'npc.a3.local_champion')).toBe('early a3_champion'); // again, as often as you like
    expect(flags['area3.intro_done']).toBeUndefined(); // the tracks still wait for the chain
    for (const npc of ['npc.a3.news', 'npc.a3.garage_mechanic', 'npc.a3.tyre_specialist', 'npc.a3.works_boss']) talk(c, flags, npc);
    expect(currentStep(story, c)!.id).toBe('a3_training');
    // Finishing the step before it plays the champion's step out: never sent back to them.
    expect(talk(c, flags, 'npc.a3.yard_coach')).toEqual(['a3_champion']);
    expect(currentStep(story, c)).toBeNull();
    expect(flags['area3.intro_done']).toBe(true);
    expect(flags.rider_trainer_tricks).toBe(true);
  });

  it('keeps the parts order errand in its order: a step that gives or takes something never plays early', () => {
    const { c } = inArea3();
    expect(earlyStep(story, c, { talk: 'npc.a3.garage_mechanic' })).toBeNull();
    expect(earlyStep(story, c, { talk: 'npc.a3.tyre_specialist' })).toBeNull();
    expect(earlyStep(story, c, { talk: 'npc.a3.works_boss' })!.id).toBe('a3_works');
  });

  it('never plays the opening chain out of order', () => {
    const c = newCareerState(bikes, story, 'hondmoto', () => 0.5);
    for (const s of story.steps.slice(1)) if (s.on.talk) expect(earlyStep(story, c, { talk: s.on.talk }), s.id).toBeNull();
  });

  it('keeps what was heard in the save', () => {
    const { c } = inArea3();
    hearEarly(story, c, earlyStep(story, c, { talk: 'npc.a3.local_champion' })!);
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area3-beach-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career: c, van: null, driving: false };
    expect(parseSave(JSON.stringify(save))!.career.chains!.area3.heard).toEqual(['a3_champion']);
  });
});
