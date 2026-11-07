import type { KeyValueStore } from './storage';

// Keeping careers safe from the browser losing them (Boss, 6 Nov 2026: "just the browsers losing
// the files"). A browser can clear a website's storage (low disk space, clearing site data,
// Safari after about a week without a visit), and the rotating backups live in the same storage,
// so the only copy that survives is a save file the player has downloaded. The game asks the
// browser to keep its storage, warns when it can't save at all, and every few race days offers
// to download a backup file. When the last backup was taken lives in the store, not in the save,
// so the save shape doesn't change.

/** Race days between backup reminders. */
export const BACKUP_EVERY = 5;

const KEY = 'backup:lastRaceDays';

/** The race-day count when the player last downloaded a backup file (0 when never). */
export function lastBackup(store: KeyValueStore): number {
  const n = Number(store.get(KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Records that a backup file was taken at this many race days. */
export function markBackup(store: KeyValueStore, raceDays: number): void {
  try {
    store.set(KEY, String(Math.max(0, Math.floor(raceDays))));
  } catch {
    // Storage blocked or full: the reminder simply comes again.
  }
}

/** True when the player has raced BACKUP_EVERY days or more since their last backup file. */
export function backupDue(raceDays: number, last: number, every = BACKUP_EVERY): boolean {
  if (raceDays < every) return false;
  // A career imported or restarted with fewer race days than the marker: count from the start again.
  const since = raceDays < last ? raceDays : raceDays - last;
  return since >= every;
}
