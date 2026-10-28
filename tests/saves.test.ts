import { describe, expect, it } from 'vitest';
import { BACKUP_COUNT, SAVE_FILE, SAVE_VERSION, SaveManager, parseSave, readSaveFile, saveFileName, saveFileText } from '../src/core/saves';
import { MemoryStore } from '../src/core/storage';

const sample = (x: number) => ({
  rider: { name: 'Rider', look: 'player-m-start-a' },
  position: { map: 'area1-home-town', x, y: 19, facing: 'down' as const },
  flags: {},
  stats: { playSeconds: x },
  career: {
    money: 15000,
    bike: { brand: 'yamamoto', class: '50cc', parts: { top_end: { grade: 1, condition: 0 } } },
    bag: [],
    story: { step: 0, used: [] },
    counters: {},
    skills: { xp: { starts: 120 }, bonus: {} },
  },
  van: null,
  driving: false,
});

describe('SaveManager', () => {
  it('writes and loads a versioned save', () => {
    const saves = new SaveManager(new MemoryStore());
    saves.write('career-1', sample(5));
    const r = saves.load('career-1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.data.position.x).toBe(5);
  });

  it(`keeps ${BACKUP_COUNT} rotating backups, newest first`, () => {
    const saves = new SaveManager(new MemoryStore());
    for (let i = 1; i <= 8; i++) saves.write('career-1', sample(i));
    const backups = saves.backups('career-1');
    expect(backups.map((b) => b.index)).toEqual([1, 2, 3, 4, 5]);
    expect(saves.restoreBackup('career-1', 1)?.position.x).toBe(7);
    expect(saves.restoreBackup('career-1', 5)?.position.x).toBe(3);
  });

  it('keeps a corrupted save and offers the newest good backup', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    saves.write('career-1', sample(1));
    saves.write('career-1', sample(2));
    store.set('save:career-1', '{"version":1,"broken');
    const r = saves.load('career-1');
    expect(r.status).toBe('corrupt');
    if (r.status !== 'corrupt') return;
    expect(store.get(r.keptAs)).toBe('{"version":1,"broken');
    expect(r.backup?.index).toBe(1);
    expect(r.backup?.data.position.x).toBe(1);
  });

  it('rejects saves from a newer build and malformed data', () => {
    expect(parseSave('{"version":99}')).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(1), version: 1, savedAt: 'x', position: { map: 'a', x: 1.5, y: 1, facing: 'down' } }))).toBeNull();
  });

  it('upgrades a test build 0.1 save to the start of the opening chain', () => {
    const { career: _, ...v1 } = sample(4);
    const data = parseSave(JSON.stringify({ ...v1, version: 1, savedAt: '2026-10-20T10:00:00.000Z' }));
    expect(data?.version).toBe(SAVE_VERSION);
    expect(data?.position.x).toBe(4);
    expect(data?.career.money).toBe(15000);
    expect(data?.career.story.step).toBe(0);
    expect(data?.career.bike.parts.top_end.condition).toBe(0);
    expect(data?.career.skills).toEqual({ xp: {}, bonus: {} });
  });

  it('upgrades a test build 0.2 save with every skill at level 1', () => {
    const { career, ...rest } = sample(5);
    const { skills: _, ...v2career } = career;
    const data = parseSave(JSON.stringify({ ...rest, career: v2career, version: 2, savedAt: '2026-10-23T10:00:00.000Z' }));
    expect(data?.version).toBe(SAVE_VERSION);
    expect(data?.career.money).toBe(15000);
    expect(data?.career.skills).toEqual({ xp: {}, bonus: {} });
  });

  it('upgrades an Alpha v1.1 save to the Riverside and Longmoor ids', () => {
    const s = sample(6);
    const v4 = {
      ...s,
      position: { ...s.position, map: 'area1-venue-quarry' },
      flags: { 'found.venue-farmland': true },
      van: { design: 'van-1', map: 'area1-venue-woodland', x: 14, y: 18, heading: 'north' },
      career: {
        ...s.career,
        counters: { 'races.venue-quarry': 2 },
      },
      version: 4,
      savedAt: '2026-10-27T10:00:00.000Z',
    };
    const data = parseSave(JSON.stringify(v4))!;
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.position.map).toBe('area1-venue-riverside');
    expect(data.van?.map).toBe('area1-venue-longmoor');
    expect(data.flags).toEqual({ 'found.venue-farmland': true });
    expect(data.career.counters).toEqual({ 'races.venue-riverside': 2 });
    // And the van is a motor now (Boss, 28 Oct 2026).
    expect(data.van?.design).toBe('motor-1');
  });

  it('a quick update keeps the rider\'s spot without pushing out backups', () => {
    const saves = new SaveManager(new MemoryStore());
    saves.write('career-1', sample(1));
    saves.write('career-1', sample(2));
    saves.update('career-1', sample(9));
    const r = saves.load('career-1');
    expect(r.status === 'ok' && r.data.position.x).toBe(9);
    expect(saves.backups('career-1').map((b) => b.index)).toEqual([1]);
  });

  it('lists career slots without backups', () => {
    const saves = new SaveManager(new MemoryStore());
    saves.write('career-1', sample(1));
    saves.write('career-1', sample(2));
    saves.write('career-2', sample(1));
    expect(saves.slots()).toEqual(['career-1', 'career-2']);
  });
});

describe('save files', () => {
  const at = (iso: string) => () => new Date(iso);

  it('round-trips a save through export and import into another browser', () => {
    const exported = new SaveManager(new MemoryStore(), at('2026-10-27T10:00:00Z')).write('career-1', sample(7));
    const text = saveFileText(exported);
    expect(JSON.parse(text).format).toBe(SAVE_FILE);
    const f = readSaveFile(text);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const other = new SaveManager(new MemoryStore(), at('2026-11-01T09:00:00Z'));
    other.importSave('career-1', f.data);
    const r = other.load('career-1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.data).toEqual(exported);
  });

  it('keeps the replaced career as backup 1', () => {
    const saves = new SaveManager(new MemoryStore());
    saves.write('career-1', sample(1));
    const f = readSaveFile(saveFileText(new SaveManager(new MemoryStore()).write('career-1', sample(9))));
    if (!f.ok) throw new Error(f.reason);
    saves.importSave('career-1', f.data);
    expect(saves.restoreBackup('career-1', 1)?.position.x).toBe(1);
  });

  it('reads a bare stored save and upgrades an old one', () => {
    const old = { version: 1, savedAt: '2026-01-01T00:00:00Z', rider: { name: 'Old', look: 'x' }, position: { map: 'm', x: 1, y: 2, facing: 'up' }, flags: {}, stats: { playSeconds: 3 } };
    const f = readSaveFile(JSON.stringify({ format: SAVE_FILE, save: old }));
    expect(f.ok).toBe(true);
    if (f.ok) expect(f.data.version).toBe(SAVE_VERSION);
    expect(readSaveFile(JSON.stringify({ ...sample(2), version: SAVE_VERSION, savedAt: 'x' })).ok).toBe(true);
  });

  it('says why a file cannot be imported', () => {
    const reason = (t: string) => { const f = readSaveFile(t); return f.ok ? '' : f.reason; };
    expect(reason('nope')).toMatch(/not valid JSON/);
    expect(reason('{"format":"mxrpg-track","track":{}}')).toMatch(/not a save file/);
    expect(reason(JSON.stringify({ format: SAVE_FILE, save: { ...sample(1), version: SAVE_VERSION + 1, savedAt: 'x' } }))).toMatch(/newer version/);
    expect(reason(JSON.stringify({ format: SAVE_FILE, save: { ...sample(1), version: SAVE_VERSION, savedAt: 'x', career: {} } }))).toMatch(/damaged/);
  });

  it('names the file after the rider and the day', () => {
    const d = new SaveManager(new MemoryStore(), at('2026-10-27T10:00:00Z')).write('career-1', { ...sample(1), rider: { name: 'Jo Smith!', look: 'x' } });
    expect(saveFileName(d)).toBe('mxrpg-jo-smith-2026-10-27.save.json');
  });
});
