import { describe, expect, it } from 'vitest';
import { BACKUP_EVERY, backupDue, lastBackup, markBackup } from '../src/core/backup';
import { MemoryStore } from '../src/core/storage';

describe('backup reminders (Boss, 6 Nov 2026)', () => {
  it('comes every few race days after the last backup file', () => {
    expect(BACKUP_EVERY).toBe(5);
    expect(backupDue(0, 0)).toBe(false);
    expect(backupDue(4, 0)).toBe(false);
    expect(backupDue(5, 0)).toBe(true);
    expect(backupDue(7, 5)).toBe(false);
    expect(backupDue(10, 5)).toBe(true);
  });

  it('counts from the start again when the career has fewer race days than the marker', () => {
    expect(backupDue(3, 20)).toBe(false);
    expect(backupDue(6, 20)).toBe(true);
  });

  it('keeps the marker in the store, not the save', () => {
    const store = new MemoryStore();
    expect(lastBackup(store)).toBe(0);
    markBackup(store, 12);
    expect(lastBackup(store)).toBe(12);
    store.set('backup:lastRaceDays', 'junk');
    expect(lastBackup(store)).toBe(0);
  });
});
