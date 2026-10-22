import { describe, expect, it } from 'vitest';
import { BACKUP_COUNT, SaveManager, parseSave } from '../src/core/saves';
import { MemoryStore } from '../src/core/storage';

const sample = (x: number) => ({
  rider: { name: 'Rider', look: 'player-m-start-a' },
  position: { map: 'area1-home-town', x, y: 19, facing: 'down' as const },
  flags: {},
  stats: { playSeconds: x },
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

  it('lists career slots without backups', () => {
    const saves = new SaveManager(new MemoryStore());
    saves.write('career-1', sample(1));
    saves.write('career-1', sample(2));
    saves.write('career-2', sample(1));
    expect(saves.slots()).toEqual(['career-1', 'career-2']);
  });
});
