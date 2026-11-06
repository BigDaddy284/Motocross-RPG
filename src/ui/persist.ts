import { LocalStore, type KeyValueStore } from '../core/storage';

// Asks the browser to keep the game's storage instead of clearing it when the disk runs low or
// after a spell without a visit (Boss, 6 Nov 2026). Chrome and Edge decide by how much the site
// is used, Firefox may ask the player, Safari counts it towards keeping a Home Screen app's data.
// Asking again is harmless, so it's asked at start and again when a career starts or continues.

let kept = false;

export function keepStorage(): void {
  if (kept) return;
  try {
    const s = navigator.storage;
    if (!s?.persist) return;
    void s.persisted().then((yes) => (yes ? true : s.persist())).then((yes) => {
      kept = yes;
    }).catch(() => undefined);
  } catch {
    // No storage manager: nothing to ask.
  }
}

/** False when saves only live in memory (a private window, or storage blocked), so they go when the tab closes. */
export function savesKept(store: KeyValueStore): boolean {
  return store instanceof LocalStore;
}
